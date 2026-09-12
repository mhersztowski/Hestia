import * as THREE from 'three';
import { Project } from '../../cad2d/barrel';
import { getOcc, type OCC } from './occLoader';
import {
  OccScope, sketchToWorldTrsf, entitiesToWires, entitiesToOpenPathWire, wiresToFace,
  shapeToGroup,
} from './occConvert';
import type {
  ChamferFeature, ExtrudeFeature, FaceRef, FeatureTree, FilletFeature, GrooveFeature, HelixFeature,
  HoleFeature, LinearPatternFeature, LoftCutFeature, LoftFeature, MirrorFeature, PatternDirection, PocketFeature,
  PolarPatternFeature, RevolveFeature, ShellFeature, SketchFeature, SweepCutFeature, SweepFeature,
} from '../model/types';

const SOLID_COLOR = new THREE.Color('#4fc3f7');

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadSketchProject(sketch: SketchFeature): Project | null {
  if (!sketch.projectData) return null;
  try { return Project.fromJSON(JSON.parse(sketch.projectData)); } catch { return null; }
}

function sketchEntities(sketch: SketchFeature): Record<string, unknown>[] {
  const p = loadSketchProject(sketch);
  if (!p) return [];
  return p.entityRegistry.getAll() as unknown as Record<string, unknown>[];
}

function resolveEntities(entityIds: string[], project: Project): Record<string, unknown>[] {
  if (entityIds.length === 0) return project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  return entityIds
    .map(id => project.entityRegistry.get(id) as unknown as Record<string, unknown> | undefined)
    .filter((e): e is Record<string, unknown> => !!e);
}

/** Applies a gp_Trsf to a shape and returns the transformed shape.
 * Copy=true makes sure every transformShape gets geometry of its own. Without
 * it, transforms do not accumulate (symmetric-to-plane followed by
 * sketchToWorldTrsf, say), because Copy=false only changes the shape's
 * `TopLoc_Location` instead of producing new geometry. */
function transformShape(oc: OCC, shape: unknown, trsf: unknown, sc: OccScope): unknown {
  const builder = sc.track(new oc.BRepBuilderAPI_Transform_2(shape as object, trsf as object, true));
  return builder.Shape();
}

/**
 * The extrude's direction as a vector in the sketch's OWN coordinates.
 * 'normal' → perpendicular to the sketch plane (local +Z).
 * 'X'/'Y'/'Z' → a world axis mapped into the sketch's orientation.
 */
function pickExtrudeDirection(
  d: 'normal' | 'X' | 'Y' | 'Z' | undefined,
  plane: 'XY' | 'XZ' | 'YZ' | 'face',
): { x: number; y: number; z: number } {
  if (!d || d === 'normal') return { x: 0, y: 0, z: 1 };
  // Sketch → world mapping (patrz sketchToWorldTrsf):
  //   XY: (localX, localY, localZ) = (X, Y, Z world)  → normal = +Z world
  //   XZ: (localX, localY, localZ) = (X, Z, Y world)  → normal = +Y world
  //   YZ: (localX, localY, localZ) = (Y, Z, X world)  → normal = +X world
  // So the world axis, in the sketch's coordinates:
  //   XY: worldX=(1,0,0) worldY=(0,1,0) worldZ=(0,0,1)
  //   XZ: worldX=(1,0,0) worldY=(0,0,1) worldZ=(0,1,0)
  //   YZ: worldX=(0,0,1) worldY=(1,0,0) worldZ=(0,1,0)
  const map: Record<string, Record<'X' | 'Y' | 'Z', [number, number, number]>> = {
    XY:   { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] },
    XZ:   { X: [1, 0, 0], Y: [0, 0, 1], Z: [0, 1, 0] },
    YZ:   { X: [0, 0, 1], Y: [1, 0, 0], Z: [0, 1, 0] },
    face: { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }, // a fallback — sketchToWorldTrsf does the exact transform
  };
  const v = map[plane][d];
  return { x: v[0], y: v[1], z: v[2] };
}

/**
 * Builds a solid with a draft angle, by ThruSections between the lower profile
 * and an upper one scaled uniformly about the bounding box's centroid. It is
 * right for rectangles, circles and compact shapes; for long thin outlines the
 * uniform scale is an approximation rather than a true draft.
 * offsetu planarnego.
 */
/**
 * Bounding box XY policzony po stronie JS z surowych entities (bez OCC).
 * Handles rect, circle, closed polyline and line. Other types are skipped.
 */
function entitiesBBoxXY(entities: Record<string, unknown>[]): { cx: number; cy: number; halfDiag: number } | null {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  };
  for (const e of entities) {
    const t = e['type'] as string;
    if (t === 'rect') {
      const x = e['x'] as number, y = e['y'] as number;
      const w = e['width'] as number, h = e['height'] as number;
      acc(x, y); acc(x + w, y + h);
    } else if (t === 'circle') {
      const cx = e['cx'] as number, cy = e['cy'] as number, r = e['radius'] as number;
      acc(cx - r, cy - r); acc(cx + r, cy + r);
    } else if (t === 'polyline') {
      const pts = (e['points'] as Array<{ x: number; y: number }>) ?? [];
      for (const p of pts) acc(p.x, p.y);
    } else if (t === 'line') {
      acc(e['x1'] as number, e['y1'] as number);
      acc(e['x2'] as number, e['y2'] as number);
    }
  }
  if (!isFinite(xMin) || !isFinite(yMin) || !isFinite(xMax) || !isFinite(yMax)) return null;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const halfDiag = Math.hypot((xMax - xMin) / 2, (yMax - yMin) / 2);
  return { cx, cy, halfDiag };
}

/**
 * Builds a solid with a draft angle, by ThruSections between the lower wire and
 * an upper one scaled uniformly about a bounding-box centroid computed in JS.
 * It does not use Bnd_Box, whose constructor opencascade.js does not expose.
 */
function extrudeToSolidWithTaper(
  oc: OCC,
  wires: unknown[],
  entities: Record<string, unknown>[],
  dx: number, dy: number, dz: number,
  taperDeg: number,
  sc: OccScope,
): unknown | null {
  try {
    const depth = Math.hypot(dx, dy, dz);
    if (depth <= 0) return null;
    const alphaRad = (taperDeg * Math.PI) / 180;
    const offsetLateral = depth * Math.tan(alphaRad);

    const wireBottom = wires[0];

    const bbox = entitiesBBoxXY(entities);
    if (!bbox) return null;
    const { cx, cy, halfDiag } = bbox;
    if (halfDiag <= 1e-9) return null;
    const scaleFactor = 1 + offsetLateral / halfDiag;
    if (scaleFactor <= 0.05) return null; // zbyt agresywny negative taper → self-intersecting

    // The upper wire: 1) a uniform scale about the centroid (at z=0), 2) a translation by (dx,dy,dz).
    // transformShape returns a TopoDS_Shape — downcast to TopoDS_Wire with TopoDS.Wire_1.
    const trsfScale = sc.track(new oc.gp_Trsf_1());
    trsfScale.SetScale(sc.track(new oc.gp_Pnt_3(cx, cy, 0)), scaleFactor);
    const wireScaledShape = transformShape(oc, wireBottom, trsfScale, sc);

    const trsfTrans = sc.track(new oc.gp_Trsf_1());
    trsfTrans.SetTranslation_1(sc.track(new oc.gp_Vec_4(dx, dy, dz)));
    const wireTopShape = transformShape(oc, wireScaledShape, trsfTrans, sc);
    const wireTop = oc.TopoDS.Wire_1(wireTopShape as object);

    // ThruSections: solid between two wires
    const thru = sc.track(new oc.BRepOffsetAPI_ThruSections(true, false, 1.0e-6));
    thru.AddWire(wireBottom as object);
    thru.AddWire(wireTop as object);
    thru.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!thru.IsDone()) return null;
    return thru.Shape();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const stack = (err as Error)?.stack;
    console.warn('[extrudeToSolidWithTaper] failed:', msg, stack);
    return null;
  }
}

/** Builds an extruded solid from a face + direction vector. */
function extrudeToSolid(oc: OCC, face: unknown, dx: number, dy: number, dz: number, sc: OccScope): unknown | null {
  try {
    const vec = sc.track(new oc.gp_Vec_4(dx, dy, dz));
    const prism = sc.track(new oc.BRepPrimAPI_MakePrism_1(face as object, vec, false, true));
    prism.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!prism.IsDone()) return null;
    return prism.Shape();
  } catch { return null; }
}

/** CSG subtract: base - tool. Returns new shape or null on failure. */
/** Counts the TopoDS_Face in a shape — how a CSG cut is told to have changed the geometry at all. */
function countFaces(oc: OCC, shape: unknown): number {
  try {
    const exp = new oc.TopExp_Explorer_2(
      shape as object,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    let n = 0;
    while (exp.More()) { n++; exp.Next(); }
    return n;
  } catch { return -1; }
}

/**
 * Takes the single TopoDS_SOLID out of a shape when there is only one. When the
 * compound holds **several** (a mirror of disjoint solids, a cut that split one
 * into pieces), the whole compound is returned — otherwise the mirrored solids
 * or the pieces would be lost. BRepAlgoAPI_Cut and Fuse always return a
 * compound, even with one solid inside.
 */
function extractFirstSolid(oc: OCC, shape: unknown): unknown {
  try {
    const exp = new oc.TopExp_Explorer_2(
      shape as object,
      oc.TopAbs_ShapeEnum.TopAbs_SOLID,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    let first: unknown = null;
    let count = 0;
    while (exp.More()) {
      if (count === 0) first = exp.Current();
      count++;
      exp.Next();
    }
    if (count === 0) return shape;
    if (count === 1) return first;
    // Wiele solids → zachowaj compound. Renderer (shapeToThreeMesh) iteruje po
    // faces in the whole shape, so every solid gets tessellated. That matters for
    // a mirror (two disjoint solids) and for a cut that split one into pieces.
    return shape;
  } catch {
    return shape;
  }
}

function csgCut(oc: OCC, base: unknown, tool: unknown, sc: OccScope): unknown | null {
  try {
    const cutter = sc.track(new oc.BRepAlgoAPI_Cut_3(
      base as object, tool as object, sc.track(new oc.Message_ProgressRange_1()),
    ));
    cutter.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!cutter.IsDone()) return null;
    const shape = extractFirstSolid(oc, cutter.Shape());
    // Sanity check — an empty compound from Cut (IsDone=true but no solids) is a
    // failure. Returning it would break everything after it — accumulated would
    // become an empty compound and the whole model would disappear.
    if (countSolids(oc, shape) === 0) return null;
    return shape;
  } catch { return null; }
}

/** CSG fuse: A + B. Returns a compound when the result holds several disjoint solids
 *  (a solid mirrored about a plane outside it, say). */
function csgFuse(oc: OCC, a: unknown, b: unknown, sc: OccScope): unknown | null {
  try {
    const fuser = sc.track(new oc.BRepAlgoAPI_Fuse_3(
      a as object, b as object, sc.track(new oc.Message_ProgressRange_1()),
    ));
    fuser.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!fuser.IsDone()) return null;
    const shape = extractFirstSolid(oc, fuser.Shape());
    // Sanity check — Fuse can return an EMPTY compound (IsDone=true, no solids)
    // for geometry with bad normals or self-intersections (a Sweep cutting into
    // an Extrude without tolerance). Treat it as a failure — the main loop then
    // falls back to FUSE FAILED, which adds the sweep as a separate solid.
    if (countSolids(oc, shape) === 0) return null;
    return shape;
  } catch { return null; }
}

// ── Feature evaluators ─────────────────────────────────────────────────────────

function reportEvalError(featureName: string, reason: string, extra?: Record<string, unknown>): void {
  // The console for whoever is developing, and a CustomEvent for the interface (the 3D page shows a snackbar).
  console.warn(`[cad3d/evaluate] ${featureName} failed: ${reason}`, extra ?? '');
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('cad3d:eval-error', {
      detail: { feature: featureName, reason, extra },
    }));
  }
}

function evalExtrude(oc: OCC, feature: ExtrudeFeature, project: Project, tree: FeatureTree): unknown | null {
  console.log('[evalExtrude] START', {
    id: feature.id, sketchId: feature.sketchId, entityIds: feature.entityIds,
    extrudeType: feature.extrudeType, height: feature.height,
    symmetric: feature.symmetric, reversed: feature.reversed,
    direction: feature.direction, taper: feature.taper,
  });
  const sc = new OccScope();
  try {
    let entities: Record<string, unknown>[];
    let sketchRef: SketchFeature | undefined;

    if (feature.sketchId) {
      sketchRef = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      if (!sketchRef) {
        reportEvalError(feature.name || 'Extrude', 'sketch not found', { sketchId: feature.sketchId });
        return null;
      }
      if (!sketchRef.projectData) {
        reportEvalError(feature.name || 'Extrude', 'the sketch is empty — go into Edit Sketch, draw a rectangle and click Exit Sketch', { sketchId: feature.sketchId });
        return null;
      }
      entities = sketchEntities(sketchRef);
      console.log('[evalExtrude] entities from sketch', { sketchId: feature.sketchId, count: entities.length, types: entities.map(e => e.type) });
    } else {
      entities = resolveEntities(feature.entityIds, project);
      console.log('[evalExtrude] entities from project', { count: entities.length, types: entities.map(e => e.type) });
    }

    if (entities.length === 0) {
      reportEvalError(feature.name || 'Extrude', 'the sketch holds no elements');
      return null;
    }

    const wires = entitiesToWires(oc, entities, sc);
    if (wires.length === 0) {
      reportEvalError(
        feature.name || 'Extrude',
        'the sketch does not close — draw a rectangle, a circle or a closed polyline',
        { entityCount: entities.length },
      );
      return null;
    }

    const face = wiresToFace(oc, wires, sc);
    if (!face) {
      reportEvalError(feature.name || 'Extrude', 'could not build a face from the outline');
      return null;
    }

    const depth = feature.extrudeType === 'through_all' ? 10000 : Math.abs(feature.height);
    if (depth <= 0) {
      reportEvalError(feature.name || 'Extrude', 'the height has to be greater than 0', { height: feature.height });
      return null;
    }

    // ── The direction vector (in the sketch's own coordinates, +Z = its normal) ─
    // 'normal' → (0, 0, 1)  |  'X' / 'Y' / 'Z' → a world axis IN THE SKETCH'S coordinates.
    // For the XY plane the normal is world +Z; for XZ it is +Y; for YZ it is +X.
    // The vector is normalised to unit length, and `depth` sets how far it goes.
    const dir = pickExtrudeDirection(feature.direction, sketchRef?.plane ?? 'XY');
    // Reversed turns the prism the other way
    const sign = feature.reversed ? -1 : 1;
    const dx = dir.x * depth * sign;
    const dy = dir.y * depth * sign;
    const dz = dir.z * depth * sign;

    // A taper greater than 0 needs the solid built by ThruSections, not a plain prism.
    // If that fails (a shape it does not handle, an OCC binding), fall back to a
    // plain prism with NO taper — a solid and a warning, rather than nothing.
    const taperDeg = feature.taper ?? 0;
    let solid: unknown | null = null;
    if (Math.abs(taperDeg) > 0.001) {
      solid = extrudeToSolidWithTaper(oc, wires, entities, dx, dy, dz, taperDeg, sc);
      if (!solid) {
        reportEvalError(feature.name || 'Extrude', 'could not apply the taper — a plain extrude was used instead');
        solid = extrudeToSolid(oc, face, dx, dy, dz, sc);
      }
    } else {
      solid = extrudeToSolid(oc, face, dx, dy, dz, sc);
    }
    if (!solid) {
      reportEvalError(feature.name || 'Extrude', 'the OCC operation BRepPrimAPI_MakePrism failed');
      return null;
    }

    // Symmetric (or dimension+symmetric) centres the solid on the sketch plane,
    // by moving it −depth/2 along the prism.
    const symmetric = feature.extrudeType === 'symmetric'
      || (feature.extrudeType === 'dimension' && feature.symmetric);
    console.log('[evalExtrude] symmetric flag =', symmetric, {
      'feature.extrudeType': feature.extrudeType,
      'feature.symmetric': feature.symmetric,
    });
    if (symmetric) {
      const tvec = { x: -dx / 2, y: -dy / 2, z: -dz / 2 };
      console.log('[evalExtrude] APPLYING symmetric translation', tvec);
      const t = sc.track(new oc.gp_Trsf_1());
      t.SetTranslation_1(sc.track(new oc.gp_Vec_4(tvec.x, tvec.y, tvec.z)));
      solid = transformShape(oc, solid, t, sc);
    }

    // Apply sketch plane transform
    const trsf = sketchToWorldTrsf(oc, sketchRef ?? { plane: 'XY', offset: 0 });
    const finalShape = transformShape(oc, solid, trsf, sc);
    console.log('[evalExtrude] SUCCESS', {
      id: feature.id, height: feature.height, extrudeType: feature.extrudeType,
      direction: feature.direction, reversed: feature.reversed, taper: taperDeg, symmetric,
    });
    return finalShape;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const stack = (err as Error)?.stack;
    console.warn('[evalExtrude] EXCEPTION:', msg, stack);
    reportEvalError(feature.name || 'Extrude', `OCC threw: ${msg.slice(0, 200)}`);
    return null;
  } finally {
    sc.dispose();
  }
}

function evalRevolve(oc: OCC, feature: RevolveFeature, project: Project, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    let entities: Record<string, unknown>[];
    let sketchRef: SketchFeature | undefined;

    if (feature.sketchId) {
      sketchRef = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      entities = sketchRef ? sketchEntities(sketchRef) : [];
    } else {
      entities = resolveEntities(feature.entityIds, project);
    }

    if (entities.length === 0) {
      reportEvalError(feature.name || 'Revolve', 'the sketch holds no elements');
      return null;
    }

    // A closed wire becomes a face, as in extrude. BRepPrimAPI_MakeRevol on a
    // face gives a SOLID; on a wire it gave only a shell (a surface), which is
    // why revolve used to look as though it did nothing.
    const wires = entitiesToWires(oc, entities, sc);
    if (wires.length === 0) {
      reportEvalError(feature.name || 'Revolve',
        'the sketch does not close — draw a rectangle, a circle or a closed polyline');
      return null;
    }
    const face = wiresToFace(oc, wires, sc);
    if (!face) {
      reportEvalError(feature.name || 'Revolve', 'could not build a face from the outline');
      return null;
    }

    // ── A check first: does the axis cross the profile? ───────────────────────
    // BRepPrimAPI_MakeRevol fails when the axis runs INSIDE the profile's bounding
    // box (it self-intersects). Better to say so than to pass on OCC's own error.
    const bbox2d = entitiesBBoxXY(entities);
    if (bbox2d) {
      // The bounding box in the sketch's own space (Z=0): the distance from the Y or X axis to it.
      // W local:
      //   axis Y = linia x=0 (perpendicular do X)
      //   axis X = linia y=0 (perpendicular do Y)
      //   axis Z = out-of-plane (nie przecina profile w plane XY)
      const axisIsY = feature.axis === 'sketch_vertical' || feature.axis === 'Y';
      const axisIsX = feature.axis === 'sketch_horizontal' || feature.axis === 'X';
      const cx = bbox2d.cx, halfDiag = bbox2d.halfDiag;
      // halfDiag is only an approximate size — what is needed here are the exact
      // min and max in X and Y, and the raw entities are at hand, so they are
      // measured directly:
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const e of entities) {
        const t = e['type'] as string;
        if (t === 'rect') {
          const x = e['x'] as number, y = e['y'] as number;
          const w = e['width'] as number, h = e['height'] as number;
          xMin = Math.min(xMin, x); xMax = Math.max(xMax, x + w);
          yMin = Math.min(yMin, y); yMax = Math.max(yMax, y + h);
        } else if (t === 'circle') {
          const cxc = e['cx'] as number, cyc = e['cy'] as number, r = e['radius'] as number;
          xMin = Math.min(xMin, cxc - r); xMax = Math.max(xMax, cxc + r);
          yMin = Math.min(yMin, cyc - r); yMax = Math.max(yMax, cyc + r);
        } else if (t === 'polyline') {
          const pts = (e['points'] as Array<{ x: number; y: number }>) ?? [];
          for (const p of pts) {
            xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
            yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
          }
        } else if (t === 'line') {
          xMin = Math.min(xMin, e['x1'] as number, e['x2'] as number);
          xMax = Math.max(xMax, e['x1'] as number, e['x2'] as number);
          yMin = Math.min(yMin, e['y1'] as number, e['y2'] as number);
          yMax = Math.max(yMax, e['y1'] as number, e['y2'] as number);
        }
      }
      const tol = 1e-4;
      if (axisIsY && xMin < -tol && xMax > tol) {
        reportEvalError(feature.name || 'Revolve',
          `The Y axis crosses the profile (x=${xMin.toFixed(1)}..${xMax.toFixed(1)}). Move the sketch so that all of it is on one side of the axis (x>0 or x<0).`);
        return null;
      }
      if (axisIsX && yMin < -tol && yMax > tol) {
        reportEvalError(feature.name || 'Revolve',
          `The X axis crosses the profile (y=${yMin.toFixed(1)}..${yMax.toFixed(1)}). Move the sketch so that all of it is on one side of the axis (y>0 or y<0).`);
        return null;
      }
      console.log('[evalRevolve] bbox check OK', { xMin, xMax, yMin, yMax, axis: feature.axis });
      void cx; void halfDiag; // suppress unused
    }

    const revolveType = feature.revolveType ?? 'dimension';
    // The FreeCAD-style typeExt wins — it is what handles 'two_angles' and 'to_last'.
    const typeExt = feature.revolveTypeExt;
    const isTwoAngles = typeExt === 'two_angles';
    const isToLast = typeExt === 'to_last' || revolveType === 'through_all';
    const angle1 = Math.max(1, Math.min(360, feature.angle));
    const angle2 = Math.max(0, Math.min(360, feature.angle2 ?? 0));
    // For two_angles the whole range is angle1 + angle2 (the wire is pre-rotated by −angle2, then revolved by the total).
    // For to_last it is 360°. For a plain angle, angle1 alone.
    const rawTotal = isToLast ? 360 : (isTwoAngles ? angle1 + angle2 : angle1);
    if (isTwoAngles && rawTotal > 360) {
      reportEvalError(feature.name || 'Revolve',
        `Angle (${angle1}°) + Angle 2 (${angle2}°) = ${rawTotal}°, which is over 360°. Lower one of them — this renders as a full turn.`);
      // NOT a return null — carry on capped at 360°, so at least a full circle appears
    }
    const totalAngleDeg = Math.min(360, rawTotal);
    const angleRad = (totalAngleDeg * Math.PI) / 180;
    const isSymmetric = revolveType === 'symmetric' || (revolveType === 'dimension' && feature.symmetric && !isTwoAngles);
    const reversed = feature.reversed;
    console.log('[evalRevolve] angle setup', { revolveType, typeExt, angle1, angle2, totalAngleDeg, isSymmetric, isTwoAngles, isToLast, reversed });

    // Axis in local sketch space (Y axis by default for 'sketch_vertical')
    let axDir: [number, number, number] = [0, 1, 0];
    if (feature.axis === 'sketch_horizontal' || feature.axis === 'X') axDir = [1, 0, 0];
    else if (feature.axis === 'Z') axDir = [0, 0, 1];

    // Reversed turns the axis around (a right-hand rotation becomes left-hand).
    // It works the same for every type (Angle, Two angles, Symmetric).
    if (reversed) {
      axDir = [-axDir[0], -axDir[1], -axDir[2]];
    }

    let phiStart = 0;
    if (isTwoAngles) {
      // Two angles = revolve od -angle2 do +angle1 (razem angle1+angle2)
      phiStart = -(angle2 * Math.PI) / 180;
    } else if (isSymmetric) {
      phiStart = -angleRad / 2;
    }
    console.log('[evalRevolve] revol setup', { axDir, phiStart: (phiStart * 180 / Math.PI).toFixed(1) + '°', angleRad: (angleRad * 180 / Math.PI).toFixed(1) + '°' });

    // If symmetric or reversed, pre-rotate face so revol starts at correct angle
    let workFace: unknown = face;
    if (phiStart !== 0) {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(
          sc.track(new oc.gp_Pnt_3(0, 0, 0)),
          sc.track(new oc.gp_Dir_4(...axDir)),
        )),
        phiStart,
      );
      workFace = transformShape(oc, face, rt, sc);
    }

    const revol = sc.track(new oc.BRepPrimAPI_MakeRevol_1(
      workFace as object,
      sc.track(new oc.gp_Ax1_2(
        sc.track(new oc.gp_Pnt_3(0, 0, 0)),
        sc.track(new oc.gp_Dir_4(...axDir)),
      )),
      angleRad,
      true,
    ));
    revol.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!revol.IsDone()) {
      reportEvalError(feature.name || 'Revolve',
        'BRepPrimAPI_MakeRevol failed — check whether the axis of revolution crosses the profile');
      return null;
    }

    const solid = revol.Shape();
    const trsf = sketchToWorldTrsf(oc, sketchRef ?? { plane: 'XY', offset: 0 });
    return transformShape(oc, solid, trsf, sc);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalRevolve] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Revolve', `OCC threw: ${msg.slice(0, 200)}`);
    return null;
  } finally {
    sc.dispose();
  }
}

function evalLoft(oc: OCC, feature: LoftFeature, tree: FeatureTree): unknown | null {
  console.log('[evalLoft] START', { id: feature.id, sectionCount: feature.sections.length, ruled: feature.ruled, closed: feature.closed });
  const sc = new OccScope();
  try {
    const sections = feature.sections;
    if (sections.length < 2) {
      reportEvalError(feature.name || 'Loft', `wymaga co najmniej 2 sekcji (masz ${sections.length})`);
      return null;
    }

    // BRepOffsetAPI_ThruSections: isSolid=true → generuje SOLID (nie shell),
    // ruled=false → smooth interpolation, tolerance 1e-6.
    const loftBuilder = sc.track(new oc.BRepOffsetAPI_ThruSections(true, feature.ruled, 1e-6));

    let addedWires = 0;
    for (const sec of sections) {
      const sketch = tree.features.find(f => f.id === sec.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      if (!sketch) {
        console.warn('[evalLoft] sketch not found for section', sec.sketchId);
        continue;
      }

      const entities = sketchEntities(sketch);
      if (entities.length === 0) {
        console.warn('[evalLoft] sketch has no entities', sec.sketchId);
        continue;
      }

      const wires = entitiesToWires(oc, entities, sc);
      if (wires.length === 0) {
        console.warn('[evalLoft] no wires generated for sketch (empty or not closed?)', sec.sketchId);
        continue;
      }

      // Transform wire to world space + downcast bezpieczny (fallback do raw shape
      // when Wire_1 throws a BindingError).
      const trsf = sketchToWorldTrsf(oc, sketch);
      const worldShape = transformShape(oc, wires[0] as unknown, trsf, sc);
      let worldWire: unknown = worldShape;
      try { worldWire = oc.TopoDS.Wire_1(worldShape as object); } catch { /* fallback */ }
      loftBuilder.AddWire(worldWire as object);
      addedWires++;
    }

    console.log('[evalLoft] added wires:', addedWires);
    if (addedWires < 2) {
      reportEvalError(feature.name || 'Loft', `only ${addedWires} wires were added — check that the sketches close (a rect, a circle, a closed polyline)`);
      return null;
    }

    if (feature.closed) loftBuilder.SetClosing(true);
    loftBuilder.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!loftBuilder.IsDone()) {
      reportEvalError(feature.name || 'Loft', 'BRepOffsetAPI_ThruSections failed — check the order of the sections, how the wires are oriented, and that they are not coplanar');
      return null;
    }

    const result = loftBuilder.Shape();
    console.log('[evalLoft] SUCCESS', { id: feature.id });
    return result;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalLoft] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Loft', `OCC threw: ${msg.slice(0, 200)}`);
    return null;
  } finally {
    sc.dispose();
  }
}

function evalSweep(oc: OCC, feature: SweepFeature, tree: FeatureTree): unknown | null {
  console.log('[evalSweep] START', { id: feature.id, profileSketchId: feature.profileSketchId, pathSketchId: feature.pathSketchId });
  const sc = new OccScope();
  try {
    const profileSketch = feature.profileSketchId
      ? tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    const pathSketch = feature.pathSketchId
      ? tree.features.find(f => f.id === feature.pathSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    if (!profileSketch) {
      reportEvalError(feature.name || 'Sweep', 'brak Profile sketch — wybierz szkic w properties');
      return null;
    }
    if (!pathSketch) {
      reportEvalError(feature.name || 'Sweep', 'brak Path sketch — wybierz szkic w properties');
      return null;
    }
    if (profileSketch.id === pathSketch.id) {
      reportEvalError(feature.name || 'Sweep', 'the Profile and the Path cannot be the same sketch');
      return null;
    }

    // ── Profile face ──────────────────────────────────────────────────────────
    const profEntities = sketchEntities(profileSketch);
    if (profEntities.length === 0) {
      reportEvalError(feature.name || 'Sweep', 'Profile sketch jest pusty');
      return null;
    }
    const profWires = entitiesToWires(oc, profEntities, sc);
    if (profWires.length === 0) {
      reportEvalError(feature.name || 'Sweep', 'the Profile sketch does not close');
      return null;
    }
    const profFace = wiresToFace(oc, profWires, sc);
    if (!profFace) {
      reportEvalError(feature.name || 'Sweep', 'could not build a face from the Profile');
      return null;
    }

    const profTrsf = sketchToWorldTrsf(oc, profileSketch);
    const worldProfShape = transformShape(oc, profFace, profTrsf, sc);

    // ── Path wire ─────────────────────────────────────────────────────────────
    const pathEntities = sketchEntities(pathSketch);
    if (pathEntities.length === 0) {
      reportEvalError(feature.name || 'Sweep', 'Path sketch jest pusty');
      return null;
    }
    // For the Path an OPEN curve is what is wanted — entitiesToOpenPathWire takes
    // ONLY lines and open polylines, ignoring rects and circles. A sketch holding
    // both a rect and a line gives the wire of the line, which is what was meant.
    const openPathWire = entitiesToOpenPathWire(oc, pathEntities, sc);
    if (!openPathWire) {
      // A fallback — the sketch may hold only closed shapes, so try the usual way
      const pathWires = entitiesToWires(oc, pathEntities, sc);
      if (pathWires.length === 0) {
        reportEvalError(feature.name || 'Sweep',
          'the Path sketch gives no wire — draw a line or a polyline');
        return null;
      }
      console.warn('[evalSweep] no open curve in the Path — using the first closed wire (the result will be a torus)');
      reportEvalError(feature.name || 'Sweep',
        'Note: the Path holds only closed shapes, so the result is toroidal. Add a line to the Path sketch.');
    }
    const pathWireToUse = openPathWire ?? entitiesToWires(oc, pathEntities, sc)[0];

    const pathTrsf = sketchToWorldTrsf(oc, pathSketch);
    const worldPathShape = transformShape(oc, pathWireToUse as unknown, pathTrsf, sc);

    // Downcast SAFELY — when TopoDS.Wire_1 or Face_1 throws a BindingError
    // (transformShape returns a generic TopoDS_Shape, which is not directly a
    // Wire or a Face), use the raw shape: OCC's MakePipe may cast it itself.
    let worldPathWire: unknown = worldPathShape;
    let worldProfFace: unknown = worldProfShape;
    try { worldPathWire = oc.TopoDS.Wire_1(worldPathShape as object); } catch { /* fallback do raw shape */ }
    try { worldProfFace = oc.TopoDS.Face_1(worldProfShape as object); } catch { /* fallback do raw shape */ }

    const pipe = sc.track(new oc.BRepOffsetAPI_MakePipe_1(worldPathWire as object, worldProfFace as object));
    pipe.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!pipe.IsDone()) {
      reportEvalError(feature.name || 'Sweep',
        'BRepOffsetAPI_MakePipe failed — check that the Path is an OPEN curve (not a closed rectangle) and that the Profile sits AT THE START of it');
      return null;
    }

    let result = pipe.Shape();
    const solids = countSolids(oc, result);
    const faces = countFaces(oc, result);
    console.log('[evalSweep] pipe shape', { solids, faces });

    // When pipe.Shape() returns a SHELL (no solids, only faces), wrap it in MakeSolid.
    // BRepOffsetAPI_MakePipe returns a shell for an open profile or a closed path,
    // which then crashes csgFuse or renders as nothing at all.
    if (solids === 0 && faces > 0) {
      console.log('[evalSweep] the pipe returned a SHELL with no solids — trying MakeSolid');
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shellShape = result as any;
        // Try a TopoDS.Shell_1 downcast and MakeSolid
        let shell: unknown;
        try { shell = oc.TopoDS.Shell_1(shellShape); } catch { shell = shellShape; }
        const solidBuilder = sc.track(new oc.BRepBuilderAPI_MakeSolid_1());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (solidBuilder as any).Add(shell);
        solidBuilder.Build(sc.track(new oc.Message_ProgressRange_1()));
        if (solidBuilder.IsDone()) {
          result = solidBuilder.Solid();
          console.log('[evalSweep] MakeSolid succeeded — solids now:', countSolids(oc, result));
        } else {
          console.warn('[evalSweep] MakeSolid failed — returning the raw shell');
        }
      } catch (err) {
        console.warn('[evalSweep] MakeSolid EXCEPTION:', err);
      }
    }

    console.log('[evalSweep] SUCCESS', { id: feature.id, finalSolids: countSolids(oc, result), finalFaces: countFaces(oc, result) });
    return result;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalSweep] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Sweep', `OCC threw: ${msg.slice(0, 200)}`);
    return null;
  } finally {
    sc.dispose();
  }
}

function evalHelix(oc: OCC, feature: HelixFeature, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    const { mode, pitch, height, turns, radius, taper, leftHanded, reversed } = feature;

    let h: number, t: number;
    if (mode === 'pitch_height') { h = height; t = h / Math.max(0.001, pitch); }
    else if (mode === 'pitch_turns') { t = Math.max(0.25, turns); h = Math.max(0.001, pitch) * t; }
    else { t = Math.max(0.25, turns); h = height; }

    const steps = Math.max(16, Math.round(t * 32));
    const taperRad = (taper * Math.PI) / 180;
    const dir = leftHanded ? -1 : 1;

    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const angle = frac * t * Math.PI * 2 * dir;
      const y = frac * h;
      const r = Math.max(0.001, radius + y * Math.tan(taperRad));
      pts.push({ x: Math.cos(angle) * r, y, z: Math.sin(angle) * r });
    }
    if (reversed) pts.reverse();

    // Build BSpline wire through helix points
    const ptArr = sc.track(new oc.TColgp_Array1OfPnt_2(1, pts.length));
    for (let i = 0; i < pts.length; i++) {
      ptArr.SetValue(i + 1, sc.track(new oc.gp_Pnt_3(pts[i].x, pts[i].y, pts[i].z)));
    }
    const interp = sc.track(new oc.GeomAPI_PointsToBSpline_2(ptArr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-3));
    if (!interp.IsDone()) return null;
    const helixCurve = interp.Curve();

    const helixEdge = sc.track(new oc.BRepBuilderAPI_MakeEdge_24(helixCurve)).Edge();
    const spineWire = sc.track(new oc.BRepBuilderAPI_MakeWire_2(helixEdge)).Wire();

    // Profile
    const profileSketch = feature.profileSketchId
      ? tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;

    if (!profileSketch) {
      // Fallback: thin tube
      const tube = sc.track(new oc.BRepOffsetAPI_MakePipe_1(spineWire, spineWire));
      if (!tube.IsDone()) return null;
      return tube.Shape();
    }

    const profEntities = sketchEntities(profileSketch);
    const profWires = entitiesToWires(oc, profEntities, sc);
    const profFace = wiresToFace(oc, profWires, sc);
    if (!profFace) return null;

    const pipe = sc.track(new oc.BRepOffsetAPI_MakePipe_1(spineWire, profFace as object));
    pipe.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!pipe.IsDone()) return null;

    // Axis rotation
    let solid: unknown = pipe.Shape();
    const axis = feature.axis ?? 'Y';
    if (axis === 'sketch_horizontal' || axis === 'X') {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(0,0,0)), sc.track(new oc.gp_Dir_4(0,0,1)))),
        -Math.PI / 2,
      );
      solid = transformShape(oc, solid, rt, sc);
    } else if (axis === 'Z') {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(0,0,0)), sc.track(new oc.gp_Dir_4(1,0,0)))),
        Math.PI / 2,
      );
      solid = transformShape(oc, solid, rt, sc);
    }

    return solid;
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalPocket(oc: OCC, feature: PocketFeature, project: Project, tree: FeatureTree, accumulated: unknown): unknown | null {
  console.log('[evalPocket] START', {
    id: feature.id, sketchId: feature.sketchId, extrudeType: feature.extrudeType,
    height: feature.height, symmetric: feature.symmetric, reversed: feature.reversed,
    direction: feature.direction, taper: feature.taper,
  });
  const sc = new OccScope();
  try {
    // Reuse extrude geometry builder — pocket to identyczna geometria + CSG cut.
    const asExtrude: ExtrudeFeature = { ...feature, type: 'extrude' };
    const tool = evalExtrude(oc, asExtrude, project, tree);
    if (!tool) {
      reportEvalError(feature.name || 'Pocket', 'could not build the cutting solid for the pocket');
      return null;
    }
    const result = csgCut(oc, accumulated, tool, sc);
    if (!result) {
      reportEvalError(feature.name || 'Pocket', 'the CSG cut failed — check whether the pocket crosses the solid');
      return null;
    }
    // Compare the face count before and after the cut. Unchanged means the tool
    // does not reach the solid at all (OCC reports success, but the result is the base).
    const baseFaces = countFaces(oc, accumulated);
    const resultFaces = countFaces(oc, result);
    console.log('[evalPocket] SUCCESS', {
      id: feature.id,
      baseFaces, resultFaces,
      changed: resultFaces !== baseFaces,
    });
    if (resultFaces === baseFaces) {
      reportEvalError(
        feature.name || 'Pocket',
        'the CSG cut changed nothing — the pocket\'s sketch probably does NOT cross the solid. Check the direction (Reversed), the depth (Length) and where the sketch sits.',
      );
    }
    return result;
  } catch (err) {
    reportEvalError(feature.name || 'Pocket', 'OCC threw', { message: (err as Error)?.message });
    return null;
  } finally {
    sc.dispose();
  }
}

function evalHole(oc: OCC, feature: HoleFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  console.log('[evalHole] START', { id: feature.id, sketchId: feature.sketchId, diameter: feature.diameter, depth: feature.depth, reversed: feature.reversed });
  const sc = new OccScope();
  try {
    const sketch = feature.sketchId
      ? tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    if (!sketch) {
      reportEvalError(feature.name || 'Hole', 'no sketch — choose one holding circles in the properties');
      return null;
    }

    const sketchTrsf = sketchToWorldTrsf(oc, sketch);
    const r = Math.max(0.1, feature.diameter / 2);
    const through = feature.depthType === 'through_all';
    const depth = through ? 10000 : Math.max(0.1, feature.depth);

    // Get hole centers from sketch circles
    const entities = sketchEntities(sketch);
    const centers: Array<{ x: number; y: number }> = [];
    for (const e of entities) {
      if (e['type'] === 'circle') centers.push({ x: e['cx'] as number, y: e['cy'] as number });
    }
    if (centers.length === 0) {
      reportEvalError(feature.name || 'Hole', 'the sketch holds no circles — draw one where each hole belongs');
      return null;
    }
    console.log('[evalHole] centers:', centers.length);

    const holeGeos: unknown[] = [];

    // Which way to drill depends on what the sketch sits on:
    //  - a sketch on a face of the solid → the face's outward normal is the sketch's +Z → drill along −Z, into the solid,
    //  - a sketch on a preset plane (XY/XZ/YZ) → the solid usually stands along +normal from it →
    //    drill along +Z, towards the solid on that side of the sketch plane.
    // The Reversed toggle turns this around.
    const isOnFace = sketch.plane === 'face';
    const defaultZDir = isOnFace ? -1 : 1;
    const zDir = feature.reversed ? -defaultZDir : defaultZDir;
    console.log('[evalHole] direction', { sketchPlane: sketch.plane, isOnFace, defaultZDir, reversed: feature.reversed, finalZDir: zDir });

    console.log('[evalHole] sketch.planeMatrix:', sketch.planeMatrix?.slice(0, 4), '...');

    for (const center of centers) {
      console.log('[evalHole] processing center:', center);
      // Build bore cylinder w sketch-local space
      const ax2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
        sc.track(new oc.gp_Dir_4(0, 0, zDir)),
      ));

      let rTop = r, rBot = r;
      if (!through && feature.tapered && feature.taperAngle > 0) {
        const half = ((feature.taperAngle / 2) * Math.PI) / 180;
        rBot = r + depth * Math.tan(half);
      }

      // The drill point angle — the angle at the tip of the bit (118° for a steel one by default).
      // With drillPoint='angled' the bottom of the hole is conical (a V); 'flat' leaves it flat.
      // The cone sits WITHIN `depth` — it replaces the bottom rather than going deeper.
      const drillPoint = feature.drillPoint ?? 'angled';
      const drillPointAngle = feature.drillPointAngle ?? 118;
      let coneHeight = 0;
      if (drillPoint === 'angled' && !through) {
        const halfRad = ((drillPointAngle) / 2) * Math.PI / 180;
        // The cone's height: r / tan(half the tip angle). For 118°: half = 59°, tan(59°) ≈ 1.66 → coneH ≈ r*0.6
        coneHeight = Math.min(r / Math.tan(halfRad), depth * 0.5);
      }
      const cylinderHeight = depth - coneHeight;

      // BRepPrimAPI_MakeCone REQUIRES two different radii (R1 != R2). With no taper
      // rTop === rBot, and OCC throws — so a plain cylinder uses MakeCylinder.
      let holeShape: unknown;
      if (Math.abs(rTop - rBot) < 1e-6) {
        // Cylinder od plane szkicu do (depth - coneHeight)
        const cyl = sc.track(new oc.BRepPrimAPI_MakeCylinder_3(ax2, r, cylinderHeight));
        cyl.Build(sc.track(new oc.Message_ProgressRange_1()));
        holeShape = cyl.Shape();
        console.log('[evalHole] bore CYLINDER OK, faces:', countFaces(oc, holeShape));
      } else {
        // A taper from rTop to rBot, over the whole depth, ignoring the drill point
        const cone = sc.track(new oc.BRepPrimAPI_MakeCone_4(ax2, rTop, rBot, cylinderHeight, 2 * Math.PI));
        cone.Build(sc.track(new oc.Message_ProgressRange_1()));
        holeShape = cone.Shape();
        console.log('[evalHole] bore CONE OK, faces:', countFaces(oc, holeShape));
      }

      // Add the drill point — a cone at the bottom of the hole — when it is angled
      if (coneHeight > 0.001) {
        const tipAx2 = sc.track(new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(center.x, center.y, cylinderHeight * zDir)),
          sc.track(new oc.gp_Dir_4(0, 0, zDir)),
        ));
      // A cone from r (its base at the bottom of the cylinder) to 0 (the tip of the bit)
        const tip = sc.track(new oc.BRepPrimAPI_MakeCone_4(tipAx2, r, 0.001, coneHeight, 2 * Math.PI));
        tip.Build(sc.track(new oc.Message_ProgressRange_1()));
        const fused = csgFuse(oc, holeShape, tip.Shape(), sc);
        if (fused) {
          holeShape = fused;
          console.log('[evalHole] drill point CONE fused, faces:', countFaces(oc, holeShape));
        }
      }

      // Counterbore — along the same zDir as the bore.
      if (feature.counterType === 'counterbore' && feature.counterDepth > 0) {
        const cbR = Math.max(r + 0.01, feature.counterDiameter / 2);
        const cbD = feature.counterDepth;
        const cbAx2 = sc.track(new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
          sc.track(new oc.gp_Dir_4(0, 0, zDir)),
        ));
        const cbCyl = sc.track(new oc.BRepPrimAPI_MakeCylinder_3(cbAx2, cbR, cbD));
        cbCyl.Build(sc.track(new oc.Message_ProgressRange_1()));
        const fused = csgFuse(oc, holeShape, cbCyl.Shape(), sc);
        if (fused) holeShape = fused;
      }

      // Countersink
      if (feature.counterType === 'countersink') {
        const csR = Math.max(r + 0.01, feature.counterDiameter / 2);
        const csHalf = ((feature.counterAngle / 2) * Math.PI) / 180;
        const csD = (csR - r) / Math.tan(csHalf);
        if (csD > 0.001) {
          const csAx2 = sc.track(new oc.gp_Ax2_3(
            sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
            sc.track(new oc.gp_Dir_4(0, 0, zDir)),
          ));
          const cone = sc.track(new oc.BRepPrimAPI_MakeCone_4(csAx2, csR, r, csD, 2 * Math.PI));
          cone.Build(sc.track(new oc.Message_ProgressRange_1()));
          const fused = csgFuse(oc, holeShape, cone.Shape(), sc);
          if (fused) holeShape = fused;
        }
      }
      // Note: the 180° rotation for reversed was removed — the direction is
      // already in zDir above, so the cylinder drills the right way from the start.

      // Apply sketch plane transform
      try {
        const transformed = transformShape(oc, holeShape, sketchTrsf, sc);
        const tf = countFaces(oc, transformed);
        console.log('[evalHole] transformed OK, faces:', tf);
        holeGeos.push(transformed);
      } catch (err) {
        console.warn('[evalHole] transformShape FAIL:', err);
        throw err;
      }
    }

    // Fuse all hole geometries together, then subtract from accumulated
    let allHoles = holeGeos[0];
    for (let i = 1; i < holeGeos.length; i++) {
      const f = csgFuse(oc, allHoles, holeGeos[i], sc);
      if (f) allHoles = f;
    }
    console.log('[evalHole] allHoles faces:', countFaces(oc, allHoles), 'solids:', countSolids(oc, allHoles));

    const baseFaces = countFaces(oc, accumulated);
    const result = csgCut(oc, accumulated, allHoles, sc);
    if (!result) {
      reportEvalError(feature.name || 'Hole',
        'the CSG cut failed — check that the sketch\'s circles are above the solid and that Reversed is set the right way');
      return null;
    }
    const resultFaces = countFaces(oc, result);
    console.log('[evalHole] SUCCESS', { baseFaces, resultFaces, changed: resultFaces !== baseFaces });
    if (resultFaces === baseFaces) {
      reportEvalError(feature.name || 'Hole',
        'no holes were cut — the sketch\'s circles probably do not reach the solid. Check the direction (Reversed) and where the sketch sits.');
    }
    return result;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalHole] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Hole', `OCC threw: ${msg.slice(0, 200)}`);
    return null;
  } finally {
    sc.dispose();
  }
}

function evalGroove(oc: OCC, feature: GrooveFeature, project: Project, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asRevolve: RevolveFeature = { ...feature, type: 'revolve' };
  const sc = new OccScope();
  try {
    const tool = evalRevolve(oc, asRevolve, project, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalLoftCut(oc: OCC, feature: LoftCutFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asLoft: LoftFeature = { ...feature, type: 'loft' };
  const sc = new OccScope();
  try {
    const tool = evalLoft(oc, asLoft, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalSweepCut(oc: OCC, feature: SweepCutFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asSweep: SweepFeature = { ...feature, type: 'sweep' };
  const sc = new OccScope();
  try {
    const tool = evalSweep(oc, asSweep, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

/**
 * Builds the gp_Ax2 (the mirror plane) from planeMode:
 * - XY/XZ/YZ: preset world plane w origin
 * - datum_plane: pozycja + normalna z DatumPlaneFeature w tree
 */
function buildMirrorAx2(
  oc: OCC,
  feature: MirrorFeature,
  tree: FeatureTree,
  sc: OccScope,
): unknown {
  const mode = feature.planeMode ?? feature.plane;

  if (mode === 'datum_plane' && feature.datumPlaneId) {
    const dp = tree.features.find(f => f.id === feature.datumPlaneId && f.type === 'datum_plane') as
      { position: [number, number, number]; normal: [number, number, number] } | undefined;
    if (dp) {
      const [px, py, pz] = dp.position;
      const [nx, ny, nz] = dp.normal;
      return sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(px, py, pz)),
        sc.track(new oc.gp_Dir_4(nx || 1e-9, ny, nz)),
      ));
    }
    // fallback → YZ world
  }

  // Preset world planes
  if (mode === 'XY') {
    return sc.track(new oc.gp_Ax2_3(
      sc.track(new oc.gp_Pnt_3(0, 0, 0)),
      sc.track(new oc.gp_Dir_4(0, 0, 1)),
    ));
  }
  if (mode === 'XZ') {
    return sc.track(new oc.gp_Ax2_3(
      sc.track(new oc.gp_Pnt_3(0, 0, 0)),
      sc.track(new oc.gp_Dir_4(0, 1, 0)),
    ));
  }
  // YZ (the default)
  return sc.track(new oc.gp_Ax2_3(
    sc.track(new oc.gp_Pnt_3(0, 0, 0)),
    sc.track(new oc.gp_Dir_4(1, 0, 0)),
  ));
}

function evalMirror(oc: OCC, feature: MirrorFeature, tree: FeatureTree, project: Project, accumulated: unknown): unknown | null {
  console.log('[evalMirror] START', {
    id: feature.id,
    mode: feature.mode ?? 'content',
    planeMode: feature.planeMode ?? feature.plane,
    datumPlaneId: feature.datumPlaneId,
    hasAccumulated: !!accumulated,
  });
  const sc = new OccScope();
  try {
    const trsf = sc.track(new oc.gp_Trsf_1());
    const mirrorAx2 = buildMirrorAx2(oc, feature, tree, sc);

    // Debug — what datum_plane is in the tree?
    if ((feature.planeMode ?? feature.plane) === 'datum_plane') {
      const dp = tree.features.find(f => f.id === feature.datumPlaneId);
      console.log('[evalMirror] datum_plane lookup', {
        datumPlaneId: feature.datumPlaneId,
        found: !!dp,
        type: dp?.type,
        position: dp && 'position' in dp ? (dp as unknown as { position: unknown }).position : undefined,
        normal: dp && 'normal' in dp ? (dp as unknown as { normal: unknown }).normal : undefined,
      });
    }

    // SetMirror_3(gp_Ax2) mirrors about a PLANE — a reflection.
    // NB the opencascade.js bindings: SetMirror_1(gp_Pnt), SetMirror_2(gp_Ax1 = about an axis = a 180° turn),
    // SetMirror_3(gp_Ax2 = about a plane). SetMirror_2, used before, threw a BindingError.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trsf as any).SetMirror_3(mirrorAx2);

    const mode = feature.mode ?? 'content';

    if (mode === 'tool_shapes' && feature.featureIds && feature.featureIds.length > 0) {
      // Build only the chosen features as "tools", mirror those and fuse with the accumulation
      let toolsResult: unknown | null = null;
      for (const fid of feature.featureIds) {
        const target = tree.features.find(f => f.id === fid);
        if (!target || !target.enabled) continue;

        let toolShape: unknown | null = null;
        if (target.type === 'extrude')      toolShape = evalExtrude(oc, target as ExtrudeFeature, project, tree);
        else if (target.type === 'revolve') toolShape = evalRevolve(oc, target as RevolveFeature, project, tree);
        else if (target.type === 'loft')    toolShape = evalLoft(oc, target as LoftFeature, tree);
        else if (target.type === 'sweep')   toolShape = evalSweep(oc, target as SweepFeature, tree);
        else if (target.type === 'helix')   toolShape = evalHelix(oc, target as HelixFeature, tree);
        // pocket, hole, groove — for tool_shapes the subtractive modifiers are not accumulated
        if (!toolShape) continue;

        const mirrored = transformShape(oc, toolShape, trsf, sc);
        toolsResult = toolsResult ? csgFuse(oc, toolsResult, mirrored, sc) : mirrored;
      }
      if (!toolsResult) return accumulated; // nothing to mirror → nothing changes
      return accumulated ? csgFuse(oc, accumulated, toolsResult, sc) : toolsResult;
    }

    // The default: mirror the whole accumulation (content mode)
    if (!accumulated) return null;
    const mirrored = transformShape(oc, accumulated, trsf, sc);
    const result = csgFuse(oc, accumulated, mirrored, sc);
    console.log('[evalMirror] content mode result', {
      hasResult: !!result,
      solidCountBefore: countSolids(oc, accumulated),
      solidCountMirrored: countSolids(oc, mirrored),
      solidCountAfterFuse: result ? countSolids(oc, result) : 0,
    });
    return result;
  } catch (err) {
    console.warn('[evalMirror] EXCEPTION', err);
    return null;
  } finally {
    sc.dispose();
  }
}

function countSolids(oc: OCC, shape: unknown): number {
  try {
    const exp = new oc.TopExp_Explorer_2(
      shape as object,
      oc.TopAbs_ShapeEnum.TopAbs_SOLID,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    let n = 0;
    while (exp.More()) { n++; exp.Next(); }
    return n;
  } catch { return -1; }
}

/**
 * Finds the face of the solid nearest a FaceRef hint and returns the TopoDS_Face
 * (do przekazania do BRepOffsetAPI_MakeThickSolid.RemoveFacesList).
 * Analogiczna do resolveFaceRef ale zwraca face zamiast planeMatrix.
 */
function findFaceByRef(oc: OCC, shape: unknown, hint: FaceRef): unknown | null {
  try {
    const mesher = new oc.BRepMesh_IncrementalMesh_2(shape as object, 0.5, false, 0.3, false);
    mesher.Perform_1(new oc.Message_ProgressRange_1());
    mesher.delete();
  } catch { /* it may already be triangulated */ }

  const hintNormalVec = new THREE.Vector3(hint.hintNormal[0], hint.hintNormal[1], hint.hintNormal[2]).normalize();
  const hintPointVec = new THREE.Vector3(hint.hintPoint[0], hint.hintPoint[1], hint.hintPoint[2]);

  let bestScore = Infinity;
  let bestFace: unknown | null = null;

  const exp = new oc.TopExp_Explorer_2(
    shape as object,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );

  while (exp.More()) {
    const face = oc.TopoDS.Face_1(exp.Current());
    const aLoc = new oc.TopLoc_Location_1();
    const poly = oc.BRep_Tool.Triangulation(face, aLoc, 0);
    if (poly.IsNull()) { exp.Next(); continue; }

    const p = poly.get();
    const nn = p.NbNodes();
    if (nn < 3) { exp.Next(); continue; }

    // Location transformation
    let locMat: THREE.Matrix4 | null = null;
    if (!aLoc.IsIdentity()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trsf = (aLoc as any).Transformation() as {
        TranslationPart: () => { X: () => number; Y: () => number; Z: () => number };
        VectorialPart: () => { Value: (r: number, c: number) => number };
      };
      const t = trsf.TranslationPart();
      const m = trsf.VectorialPart();
      locMat = new THREE.Matrix4().set(
        m.Value(1, 1), m.Value(1, 2), m.Value(1, 3), t.X(),
        m.Value(2, 1), m.Value(2, 2), m.Value(2, 3), t.Y(),
        m.Value(3, 1), m.Value(3, 2), m.Value(3, 3), t.Z(),
        0, 0, 0, 1,
      );
    }

    const centroid = new THREE.Vector3();
    for (let i = 1; i <= nn; i++) {
      const node = p.Node(i);
      const v = new THREE.Vector3(node.X(), node.Y(), node.Z());
      if (locMat) v.applyMatrix4(locMat);
      centroid.add(v);
    }
    centroid.divideScalar(nn);

    const n1 = p.Node(1), n2 = p.Node(2), n3 = p.Node(3);
    const va = new THREE.Vector3(n1.X(), n1.Y(), n1.Z());
    const vb = new THREE.Vector3(n2.X(), n2.Y(), n2.Z());
    const vc = new THREE.Vector3(n3.X(), n3.Y(), n3.Z());
    if (locMat) { va.applyMatrix4(locMat); vb.applyMatrix4(locMat); vc.applyMatrix4(locMat); }
    const normal = new THREE.Vector3()
      .crossVectors(vb.clone().sub(va), vc.clone().sub(va))
      .normalize();
    const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    if (isReversed) normal.multiplyScalar(-1);

    const dot = normal.dot(hintNormalVec);
    if (dot > 0.85) {
      const dist = centroid.distanceTo(hintPointVec);
      const score = dist + (1 - dot) * 1000;
      if (score < bestScore) {
        bestScore = score;
        bestFace = face;
      }
    }

    exp.Next();
  }
  exp.delete();
  return bestFace;
}

/**
 * Fillet — rounding a solid's edges to a radius.
 * For now only `useAllEdges` is handled. Choosing edges by ref is still to come:
 * it needs the full edge matching by midpoint hint.
 */
/**
 * Finds the edges of the solid that match a hint (midpoint and tangent).
 * Returns a list, because a hint may be ambiguous.
 */
/**
 * The (midpoint, tangent) of an edge — from its Polygon3D when it is tessellated,
 * or from its vertices (for straight edges without one, the FIRST and LAST vertex).
 */
function edgeMidAndTangent(oc: OCC, edge: unknown): { mid: THREE.Vector3; tan: THREE.Vector3 } | null {
  try {
    const aLoc = new oc.TopLoc_Location_1();
    const poly = oc.BRep_Tool.Polygon3D(edge as object, aLoc);
    if (!poly.IsNull()) {
      const ep = poly.get();
      const n = ep.NbNodes();
      if (n >= 2) {
        const nodes = ep.Nodes();
        const first = nodes.Value(1);
        const last = nodes.Value(n);
        const mid = new THREE.Vector3(
          (first.X() + last.X()) / 2,
          (first.Y() + last.Y()) / 2,
          (first.Z() + last.Z()) / 2,
        );
        const tan = new THREE.Vector3(
          last.X() - first.X(),
          last.Y() - first.Y(),
          last.Z() - first.Z(),
        ).normalize();
        return { mid, tan };
      }
    }
  } catch { /* fallback do vertices */ }

  // Fallback: take the edge's vertices (start and end) from TopExp
  try {
    const vExp = new oc.TopExp_Explorer_2(
      edge as object,
      oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    const vertices: THREE.Vector3[] = [];
    while (vExp.More() && vertices.length < 2) {
      const vShape = oc.TopoDS.Vertex_1(vExp.Current());
      const pnt = oc.BRep_Tool.Pnt(vShape);
      vertices.push(new THREE.Vector3(pnt.X(), pnt.Y(), pnt.Z()));
      vExp.Next();
    }
    vExp.delete();
    if (vertices.length >= 2) {
      const mid = new THREE.Vector3().addVectors(vertices[0], vertices[1]).multiplyScalar(0.5);
      const tan = new THREE.Vector3().subVectors(vertices[1], vertices[0]).normalize();
      return { mid, tan };
    }
  } catch { /* pass */ }
  return null;
}

function findEdgesByRefs(oc: OCC, shape: unknown, hints: FaceRef[]): unknown[] {
  if (hints.length === 0) return [];
  // Make sure the edges are tessellated — without it Polygon3D is null for most of them
  try {
    const mesher = new oc.BRepMesh_IncrementalMesh_2(shape as object, 0.5, false, 0.3, false);
    mesher.Perform_1(new oc.Message_ProgressRange_1());
    mesher.delete();
  } catch { /* it may already have been */ }

  const found: unknown[] = [];
  for (const hint of hints) {
    const hintMid = new THREE.Vector3(hint.hintPoint[0], hint.hintPoint[1], hint.hintPoint[2]);
    const hintTan = new THREE.Vector3(hint.hintNormal[0], hint.hintNormal[1], hint.hintNormal[2]).normalize();

    let bestScore = Infinity;
    let bestEdge: unknown | null = null;

    const exp = new oc.TopExp_Explorer_2(
      shape as object,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    while (exp.More()) {
      const edge = oc.TopoDS.Edge_1(exp.Current());
      const mt = edgeMidAndTangent(oc, edge);
      if (mt) {
        const dot = Math.abs(mt.tan.dot(hintTan));
        const dist = mt.mid.distanceTo(hintMid);
        const score = dist + (1 - dot) * 100;
        if (score < bestScore) {
          bestScore = score;
          bestEdge = edge;
        }
      }
      exp.Next();
    }
    exp.delete();
    // A more forgiving threshold (200 rather than 100), for large solids
    if (bestEdge && bestScore < 200) found.push(bestEdge);
    console.log('[findEdgesByRefs] hint', hint.hintPoint, '→ bestScore:', bestScore.toFixed(1), 'found:', !!bestEdge);
  }
  return found;
}

function evalFillet(oc: OCC, feature: FilletFeature, accumulated: unknown): unknown | null {
  console.log('[evalFillet] START', { id: feature.id, radius: feature.radius, useAllEdges: feature.useAllEdges, edges: feature.edges?.length ?? 0 });
  const sc = new OccScope();
  try {
    const radius = Math.max(0.01, feature.radius);
    const filletBuilder = sc.track(new oc.BRepFilletAPI_MakeFillet(accumulated as object, oc.ChFi3d_FilletShape.ChFi3d_Rational));

    const useAll = feature.useAllEdges ?? true;
    let edgeCount = 0;

    if (!useAll && (feature.edges ?? []).length > 0) {
      // Use ONLY the chosen edges
      const selectedEdges = findEdgesByRefs(oc, accumulated, feature.edges ?? []);
      console.log('[evalFillet] selected edges found:', selectedEdges.length, '/', feature.edges?.length ?? 0);
      for (const edge of selectedEdges) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (filletBuilder as any).Add_2(radius, edge);
        edgeCount++;
      }
    } else {
      // Wszystkie edges (default useAllEdges=true)
      const exp = new oc.TopExp_Explorer_2(
        accumulated as object,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
      );
      while (exp.More()) {
        const edge = oc.TopoDS.Edge_1(exp.Current());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (filletBuilder as any).Add_2(radius, edge);
        edgeCount++;
        exp.Next();
      }
      exp.delete();
    }
    console.log('[evalFillet] added edges:', edgeCount);
    if (edgeCount === 0) {
      const useAll = feature.useAllEdges ?? true;
      const msg = useAll
        ? 'The solid has no edges to round'
        : 'No edges chosen. Tick "Use all edges", or switch to Edge select mode and add some.';
      reportEvalError(feature.name || 'Fillet', msg);
      return accumulated;
    }

    filletBuilder.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!filletBuilder.IsDone()) {
      reportEvalError(feature.name || 'Fillet',
        `BRepFilletAPI_MakeFillet failed — try a smaller Radius (it is ${radius})`);
      return accumulated;
    }
    console.log('[evalFillet] SUCCESS');
    return filletBuilder.Shape();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalFillet] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Fillet', `OCC threw: ${msg.slice(0, 200)}`);
    return accumulated;
  } finally {
    sc.dispose();
  }
}

/**
 * Chamfer — bevelling a solid's edges. For now only `useAllEdges` is handled.
 * Type 'equal' is a symmetric distance; 'two_distances' differs on each side.
 */
function evalChamfer(oc: OCC, feature: ChamferFeature, accumulated: unknown): unknown | null {
  console.log('[evalChamfer] START', { id: feature.id, size: feature.size, size2: feature.size2, type: feature.chamferType, useAllEdges: feature.useAllEdges, edges: feature.edges?.length ?? 0 });
  const sc = new OccScope();
  try {
    const size = Math.max(0.01, feature.size);
    const size2 = Math.max(0.01, feature.size2 ?? size);
    void size2;
    const chamferBuilder = sc.track(new oc.BRepFilletAPI_MakeChamfer(accumulated as object));

    const useAll = feature.useAllEdges ?? true;
    let edgeCount = 0;

    if (!useAll && (feature.edges ?? []).length > 0) {
      const selectedEdges = findEdgesByRefs(oc, accumulated, feature.edges ?? []);
      console.log('[evalChamfer] selected edges found:', selectedEdges.length, '/', feature.edges?.length ?? 0);
      for (const edge of selectedEdges) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chamferBuilder as any).Add_2(size, edge);
        edgeCount++;
      }
    } else {
      const exp = new oc.TopExp_Explorer_2(
        accumulated as object,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
      );
      while (exp.More()) {
        const edge = oc.TopoDS.Edge_1(exp.Current());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chamferBuilder as any).Add_2(size, edge);
        edgeCount++;
        exp.Next();
      }
      exp.delete();
    }
    console.log('[evalChamfer] added edges:', edgeCount);
    if (edgeCount === 0) {
      const useAll = feature.useAllEdges ?? true;
      const msg = useAll
        ? 'The solid has no edges to chamfer'
        : 'No edges chosen. Tick "Use all edges", or switch to Edge select mode and add some.';
      reportEvalError(feature.name || 'Chamfer', msg);
      return accumulated;
    }

    chamferBuilder.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!chamferBuilder.IsDone()) {
      reportEvalError(feature.name || 'Chamfer',
        `BRepFilletAPI_MakeChamfer failed — try a smaller Size (it is ${size})`);
      return accumulated;
    }
    console.log('[evalChamfer] SUCCESS');
    return chamferBuilder.Shape();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalChamfer] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Chamfer', `OCC threw: ${msg.slice(0, 200)}`);
    return accumulated;
  } finally {
    sc.dispose();
  }
}

/** The direction vector, in the sketch's own space (for the sketch_* directions) or in the world's (for X/Y/Z). */
function directionToVec3(dir: PatternDirection): [number, number, number] {
  switch (dir) {
    case 'X': return [1, 0, 0];
    case 'Y': return [0, 1, 0];
    case 'Z': return [0, 0, 1];
    case 'sketch_horizontal': return [1, 0, 0];
    case 'sketch_vertical': return [0, 1, 0];
    case 'sketch_normal': return [0, 0, 1];
    default: return [1, 0, 0];
  }
}

/**
 * Buduje shape z jednego wybranego feature (dla mode='tool_shapes').
 * Calls evalX and returns the raw shape, for transforming.
 */
function buildToolShape(oc: OCC, targetId: string, tree: FeatureTree, project: Project): unknown | null {
  const target = tree.features.find(f => f.id === targetId);
  if (!target || !target.enabled) return null;
  if (target.type === 'extrude')      return evalExtrude(oc, target as ExtrudeFeature, project, tree);
  if (target.type === 'revolve')      return evalRevolve(oc, target as RevolveFeature, project, tree);
  if (target.type === 'loft')         return evalLoft(oc, target as LoftFeature, tree);
  if (target.type === 'sweep')        return evalSweep(oc, target as SweepFeature, tree);
  if (target.type === 'helix')        return evalHelix(oc, target as HelixFeature, tree);
  return null;
}

/**
 * Linear Pattern — repeats a solid along a line.
 * - mode='content': transforms the WHOLE accumulation (as Mirror's content does)
 * - mode='tool_shapes': buduje wybrane features i replikuje je, fuse z accumulated
 */
function evalLinearPattern(oc: OCC, feature: LinearPatternFeature, tree: FeatureTree, project: Project, accumulated: unknown): unknown | null {
  console.log('[evalLinearPattern] START', {
    id: feature.id, mode: feature.mode, direction: feature.direction,
    length: feature.length, occurrences: feature.occurrences,
    d2: feature.direction2Enabled ? { dir: feature.direction2, len: feature.length2, n: feature.occurrences2 } : null,
  });
  const sc = new OccScope();
  try {
    const occ = Math.max(2, feature.occurrences | 0);
    const len = feature.length;
    const sign = feature.reversed ? -1 : 1;
    const dir = directionToVec3(feature.direction);
    // The steps along direction 1: 0, len/(occ−1), 2·len/(occ−1), …, len
    const step = (occ > 1) ? (len * sign) / (occ - 1) : 0;

    // Direction 2 (opcjonalne)
    const d2Enabled = feature.direction2Enabled && (feature.occurrences2 ?? 2) >= 2;
    const occ2 = d2Enabled ? Math.max(2, (feature.occurrences2 ?? 2) | 0) : 1;
    const len2 = feature.length2 ?? 100;
    const dir2 = directionToVec3(feature.direction2 ?? 'sketch_vertical');
    const step2 = (occ2 > 1) ? len2 / (occ2 - 1) : 0;

    // Build the list of base shapes (content mode: the accumulation, as one shape; tool_shapes: the chosen features)
    const baseShapes: unknown[] = [];
    if ((feature.mode ?? 'tool_shapes') === 'content') {
      if (accumulated) baseShapes.push(accumulated);
    } else {
      for (const fid of feature.featureIds ?? []) {
        const s = buildToolShape(oc, fid, tree, project);
        if (s) baseShapes.push(s);
      }
    }
    if (baseShapes.length === 0) {
      reportEvalError(feature.name || 'LinearPattern', 'nothing to repeat — add a feature in the properties');
      return accumulated;
    }

    // Wygeneruj wszystkie kopie
    let result: unknown | null = accumulated;
    for (let i = 0; i < occ; i++) {
      for (let j = 0; j < occ2; j++) {
        if (i === 0 && j === 0 && (feature.mode ?? 'tool_shapes') === 'content') continue; // pomijamy original w content
        const tx = i * step * dir[0] + j * step2 * dir2[0];
        const ty = i * step * dir[1] + j * step2 * dir2[1];
        const tz = i * step * dir[2] + j * step2 * dir2[2];
        const trsf = sc.track(new oc.gp_Trsf_1());
        trsf.SetTranslation_1(sc.track(new oc.gp_Vec_4(tx, ty, tz)));
        for (const base of baseShapes) {
          const copy = transformShape(oc, base, trsf, sc);
          result = result ? (csgFuse(oc, result, copy, sc) ?? result) : copy;
        }
      }
    }
    console.log('[evalLinearPattern] SUCCESS');
    return result;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalLinearPattern] EXCEPTION:', msg);
    reportEvalError(feature.name || 'LinearPattern', `OCC threw: ${msg.slice(0, 200)}`);
    return accumulated;
  } finally {
    sc.dispose();
  }
}

/**
 * Polar Pattern — repeats a solid about an axis.
 */
function evalPolarPattern(oc: OCC, feature: PolarPatternFeature, tree: FeatureTree, project: Project, accumulated: unknown): unknown | null {
  console.log('[evalPolarPattern] START', {
    id: feature.id, mode: feature.mode, axis: feature.axis,
    angle: feature.angle, occurrences: feature.occurrences,
  });
  const sc = new OccScope();
  try {
    const occ = Math.max(2, feature.occurrences | 0);
    const angleDeg = feature.angle;
    const sign = feature.reversed ? -1 : 1;
    let axDir = directionToVec3(feature.axis);
    if (sign < 0) axDir = [-axDir[0], -axDir[1], -axDir[2]];
    // The step: 360° over 4 occurrences gives 90° each; 180° over 3 also gives 90°
    const isFullRotation = Math.abs(angleDeg - 360) < 0.01;
    const stepRad = isFullRotation
      ? (2 * Math.PI) / occ                    // a full turn: steps of 360/occ, not 360/(occ−1)
      : ((angleDeg * Math.PI) / 180) / (occ - 1);

    const baseShapes: unknown[] = [];
    if ((feature.mode ?? 'tool_shapes') === 'content') {
      if (accumulated) baseShapes.push(accumulated);
    } else {
      for (const fid of feature.featureIds ?? []) {
        const s = buildToolShape(oc, fid, tree, project);
        if (s) baseShapes.push(s);
      }
    }
    if (baseShapes.length === 0) {
      reportEvalError(feature.name || 'PolarPattern', 'nothing to repeat — add a feature in the properties');
      return accumulated;
    }

    const startIdx = (feature.mode ?? 'tool_shapes') === 'content' ? 1 : 0;
    let result: unknown | null = accumulated;
    for (let i = startIdx; i < occ; i++) {
      const phi = i * stepRad;
      const trsf = sc.track(new oc.gp_Trsf_1());
      trsf.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(
          sc.track(new oc.gp_Pnt_3(0, 0, 0)),
          sc.track(new oc.gp_Dir_4(...axDir)),
        )),
        phi,
      );
      for (const base of baseShapes) {
        const copy = transformShape(oc, base, trsf, sc);
        result = result ? (csgFuse(oc, result, copy, sc) ?? result) : copy;
      }
    }
    console.log('[evalPolarPattern] SUCCESS');
    return result;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalPolarPattern] EXCEPTION:', msg);
    reportEvalError(feature.name || 'PolarPattern', `OCC threw: ${msg.slice(0, 200)}`);
    return accumulated;
  } finally {
    sc.dispose();
  }
}

function evalShell(oc: OCC, feature: ShellFeature, accumulated: unknown): unknown | null {
  console.log('[evalShell] START', {
    id: feature.id, thickness: feature.thickness,
    facesToRemove: (feature.facesToRemove ?? []).length,
    mode: feature.mode, joinType: feature.joinType, inwards: feature.inwards,
  });
  const sc = new OccScope();
  try {
    const thickness = Math.abs(feature.thickness);
    // The sign — inwards means a negative offset, outwards a positive one
    const inwards = feature.inwards ?? true;
    const offset = inwards ? -thickness : thickness;

    // Join type mapping
    const joinType = feature.joinType === 'intersection'
      ? oc.GeomAbs_JoinType.GeomAbs_Intersection
      : oc.GeomAbs_JoinType.GeomAbs_Arc;

    // Mode mapping (FreeCAD → OCC BRepOffset_Mode)
    const modeMap = {
      skin: oc.BRepOffset_Mode.BRepOffset_Skin,
      pipe: oc.BRepOffset_Mode.BRepOffset_Pipe,
      recto_verso: oc.BRepOffset_Mode.BRepOffset_RectoVerso,
    };
    const modeEnum = modeMap[feature.mode ?? 'skin'] ?? oc.BRepOffset_Mode.BRepOffset_Skin;

    const facesToRemove = feature.facesToRemove ?? [];

    if (facesToRemove.length === 0) {
      // With no faces listed — the plain BRepOffsetAPI_MakeOffsetShape (a closed cavity)
      const os = sc.track(new oc.BRepOffsetAPI_MakeOffsetShape());
      os.PerformByJoin(
        accumulated as object, offset, 1e-3, modeEnum,
        false, false, joinType, feature.intersection ?? false,
        sc.track(new oc.Message_ProgressRange_1()),
      );
      if (!os.IsDone()) {
      reportEvalError(feature.name || 'Shell', 'BRepOffsetAPI_MakeOffsetShape failed');
        return accumulated;
      }
      console.log('[evalShell] SUCCESS (closed cavity)');
      return os.Shape();
    }

    // With faces listed — BRepOffsetAPI_MakeThickSolid and MakeThickSolidByJoin
    // Find the faces in the accumulation that match the hints
    const removeFacesList = sc.track(new oc.TopTools_ListOfShape_1());
    let foundCount = 0;
    for (const ref of facesToRemove) {
      const face = findFaceByRef(oc, accumulated, ref);
      if (face) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (removeFacesList as any).Append_1(face);
        foundCount++;
      }
    }
    console.log('[evalShell] found faces:', foundCount, '/', facesToRemove.length);
    if (foundCount === 0) {
      reportEvalError(feature.name || 'Shell',
        `None of the ${facesToRemove.length} faces to remove were found — the solid may have changed since the face refs were stored. Add the faces again.`);
      return accumulated;
    }

    const thickSolid = sc.track(new oc.BRepOffsetAPI_MakeThickSolid());
    // MakeThickSolidByJoin(S, ClosingFaces, Offset, Tol, Mode, Intersection, SelfInter, Join, RemoveIntEdges, ProgressRange)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (thickSolid as any).MakeThickSolidByJoin(
      accumulated as object,
      removeFacesList as object,
      offset,
      1e-3,
      modeEnum,
      feature.intersection ?? false,
      false,
      joinType,
      false,
      sc.track(new oc.Message_ProgressRange_1()),
    );
    if (!thickSolid.IsDone()) {
      reportEvalError(feature.name || 'Shell',
        'BRepOffsetAPI_MakeThickSolid failed — try a smaller Thickness, or another Join type');
      return accumulated;
    }
    console.log('[evalShell] SUCCESS (open shell)');
    return thickSolid.Shape();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.warn('[evalShell] EXCEPTION:', msg);
    reportEvalError(feature.name || 'Shell', `OCC threw: ${msg.slice(0, 200)}`);
    return accumulated;
  } finally {
    sc.dispose();
  }
}

// ── A sketch's parametric reference to a face of the solid ─────────────────────

/**
 * Finds the face of `shape` nearest to (hintNormal, hintPoint) and returns
 * dla niej 16-element column-major Matrix4 (basis U/V/N + centroid) — sketch on
 * face uses it as its `planeMatrix`, so the sketch follows the face when the
 * extrude or pocket it sits on changes (the solid's height, say, moves its top
 * w Z → sketch odzyskuje aktualny planeMatrix).
 *
 * Returns null when nothing matches — the sketch then keeps its cached planeMatrix
 * (zachowanie takie samo jak przed dodaniem faceRef).
 */
function resolveFaceRef(oc: OCC, shape: unknown, hint: FaceRef): number[] | null {
  // Make sure there is a triangulation: BRep_Tool.Triangulation returns null for
  // a face that has not been tessellated. The mesher is called explicitly, so
  // resolveFaceRef works whether or not shapeToGroup has run.
  try {
    const mesher = new oc.BRepMesh_IncrementalMesh_2(shape as object, 0.5, false, 0.3, false);
    mesher.Perform_1(new oc.Message_ProgressRange_1());
    mesher.delete();
  } catch { /* it may already be triangulated */ }

  const hintNormalVec = new THREE.Vector3(hint.hintNormal[0], hint.hintNormal[1], hint.hintNormal[2]).normalize();
  const hintPointVec = new THREE.Vector3(hint.hintPoint[0], hint.hintPoint[1], hint.hintPoint[2]);

  let bestScore = Infinity;
  let bestCentroid: THREE.Vector3 | null = null;
  let bestNormal: THREE.Vector3 | null = null;

  const exp = new oc.TopExp_Explorer_2(
    shape as object,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );

  while (exp.More()) {
    const face = oc.TopoDS.Face_1(exp.Current());
    const aLoc = new oc.TopLoc_Location_1();
    const poly = oc.BRep_Tool.Triangulation(face, aLoc, 0);
    if (poly.IsNull()) { exp.Next(); continue; }

    const p = poly.get();
    const nn = p.NbNodes();
    if (nn < 3) { exp.Next(); continue; }

    // The TopLoc_Location transform (for the inner faces a CSG cut leaves)
    let locMat: THREE.Matrix4 | null = null;
    if (!aLoc.IsIdentity()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trsf = (aLoc as any).Transformation() as {
        TranslationPart: () => { X: () => number; Y: () => number; Z: () => number };
        VectorialPart: () => { Value: (r: number, c: number) => number };
      };
      const t = trsf.TranslationPart();
      const m = trsf.VectorialPart();
      locMat = new THREE.Matrix4().set(
        m.Value(1, 1), m.Value(1, 2), m.Value(1, 3), t.X(),
        m.Value(2, 1), m.Value(2, 2), m.Value(2, 3), t.Y(),
        m.Value(3, 1), m.Value(3, 2), m.Value(3, 3), t.Z(),
        0, 0, 0, 1,
      );
    }

    // The centroid — the average of the face's vertices
    const centroid = new THREE.Vector3();
    for (let i = 1; i <= nn; i++) {
      const node = p.Node(i);
      const v = new THREE.Vector3(node.X(), node.Y(), node.Z());
      if (locMat) v.applyMatrix4(locMat);
      centroid.add(v);
    }
    centroid.divideScalar(nn);

    // The normal from the first triangle (on a planar face every triangle has the same one)
    const n1 = p.Node(1), n2 = p.Node(2), n3 = p.Node(3);
    const va = new THREE.Vector3(n1.X(), n1.Y(), n1.Z());
    const vb = new THREE.Vector3(n2.X(), n2.Y(), n2.Z());
    const vc = new THREE.Vector3(n3.X(), n3.Y(), n3.Z());
    if (locMat) { va.applyMatrix4(locMat); vb.applyMatrix4(locMat); vc.applyMatrix4(locMat); }
    const normal = new THREE.Vector3()
      .crossVectors(vb.clone().sub(va), vc.clone().sub(va))
      .normalize();

    // Flip it when the face is REVERSED in the solid (its natural normal points inwards)
    const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    if (isReversed) normal.multiplyScalar(-1);

    // Score = the angle (weighted 1000) + the distance (weighted 1)
    const dot = normal.dot(hintNormalVec);
    if (dot > 0.85) {
      const dist = centroid.distanceTo(hintPointVec);
      const score = dist + (1 - dot) * 1000;
      if (score < bestScore) {
        bestScore = score;
        bestCentroid = centroid.clone();
        bestNormal = normal.clone();
      }
    }

    exp.Next();
  }
  exp.delete();

  if (!bestCentroid || !bestNormal) return null;

  // Zbuduj planeMatrix (basis + centroid) — identycznie jak w subSelect.planeFromFace
  const n = bestNormal.normalize();
  const helper = Math.abs(n.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = helper.clone().sub(n.clone().multiplyScalar(n.dot(helper))).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const mat = new THREE.Matrix4().makeBasis(u, v, n);
  mat.setPosition(bestCentroid);
  return mat.toArray();
}

// ── Main async evaluator ───────────────────────────────────────────────────────

export async function evaluateFeatureTreeOcc(
  tree: FeatureTree,
  project: Project,
  sketchWireframeRoot: THREE.Object3D,
): Promise<THREE.Object3D> {
  const oc = await getOcc();
  const root = new THREE.Group();
  root.name = 'cad3d-occ-root';

  // Add sketch wireframes (kept from existing Three.js code)
  root.add(sketchWireframeRoot);

  let accumulated: unknown | null = null;

  for (const feature of tree.features) {
    if (!feature.enabled) continue;

    // CRITICAL: every feature is wrapped in try/catch. Without it an uncaught
    // exception from evalX (a BindingError in sweep or loft) breaks the whole
    // loop, and every solid built before it disappears from the scene.
    try {

    if (feature.type === 'sketch') {
      // A sketch on a face — its planeMatrix is recomputed from the current solid
      // (that is what makes the reference parametric). Without it, a sketch
      // whose parent changed hung in mid-air where the parent used to be.
      const sk = feature as SketchFeature;
      if (sk.plane === 'face' && sk.faceRef && accumulated) {
        const newMatrix = resolveFaceRef(oc, accumulated, sk.faceRef);
        if (newMatrix) {
          sk.planeMatrix = newMatrix;
          // The hint point is updated to the new centroid, so the next evaluation
          // finds the same face after another change to the parent. hintNormal
          // stays as it was — a face may move along Z, but its normal does not
          // turn as long as it is topologically the same face.
          sk.faceRef = {
            hintNormal: sk.faceRef.hintNormal,
            hintPoint: [newMatrix[12], newMatrix[13], newMatrix[14]],
          };
        }
      }
      continue; // handled by sketchWireframeRoot
    }

    let result: unknown | null = null;
    let isModifier = false;

    switch (feature.type) {
      case 'extrude':
        result = evalExtrude(oc, feature as ExtrudeFeature, project, tree);
        break;
      case 'revolve':
        result = evalRevolve(oc, feature as RevolveFeature, project, tree);
        break;
      case 'loft':
        result = evalLoft(oc, feature as LoftFeature, tree);
        break;
      case 'sweep':
        result = evalSweep(oc, feature as SweepFeature, tree);
        break;
      case 'helix':
        result = evalHelix(oc, feature as HelixFeature, tree);
        break;

      // Subtractive / modifier operations
      case 'pocket':
        isModifier = true;
        if (accumulated) {
          const next = evalPocket(oc, feature as PocketFeature, project, tree, accumulated);
          if (next) accumulated = next;
          else reportEvalError(feature.name || 'Pocket', 'the pocket failed — check whether the sketch crosses the solid');
        } else {
          reportEvalError(feature.name || 'Pocket', 'a pocket needs a solid to cut into — add an extrude first');
        }
        break;
      case 'hole':
        isModifier = true;
        if (accumulated) {
          const next = evalHole(oc, feature as HoleFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'groove':
        isModifier = true;
        if (accumulated) {
          const next = evalGroove(oc, feature as GrooveFeature, project, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'loft_cut':
        isModifier = true;
        if (accumulated) {
          const next = evalLoftCut(oc, feature as LoftCutFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'sweep_cut':
        isModifier = true;
        if (accumulated) {
          const next = evalSweepCut(oc, feature as SweepCutFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'mirror':
        isModifier = true;
        // Mirror wspiera dwa tryby:
        // - 'content' (the default): needs the accumulation, mirrors the whole solid and fuses
        // - 'tool_shapes': works without one (it builds from featureIds), and fuses with the accumulation when there is one
        {
          const mf = feature as MirrorFeature;
          const isToolMode = (mf.mode ?? 'content') === 'tool_shapes';
          if (accumulated || isToolMode) {
            const next = evalMirror(oc, mf, tree, project, accumulated);
            if (next) accumulated = next;
          }
        }
        break;
      case 'shell':
        isModifier = true;
        if (accumulated) {
          const next = evalShell(oc, feature as ShellFeature, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'fillet':
        isModifier = true;
        if (accumulated) {
          const next = evalFillet(oc, feature as FilletFeature, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'chamfer':
        isModifier = true;
        if (accumulated) {
          const next = evalChamfer(oc, feature as ChamferFeature, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'linear_pattern':
        isModifier = true;
        {
          const next = evalLinearPattern(oc, feature as LinearPatternFeature, tree, project, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'polar_pattern':
        isModifier = true;
        {
          const next = evalPolarPattern(oc, feature as PolarPatternFeature, tree, project, accumulated);
          if (next) accumulated = next;
        }
        break;
    }

    if (!isModifier && result) {
      const resultSolids = countSolids(oc, result);
      const resultFaces = countFaces(oc, result);
      console.log(`[loop] ${feature.type} additive result:`, { solids: resultSolids, faces: resultFaces, hasAccumulated: !!accumulated });

      if (accumulated) {
        // Fuse additive features
        const sc = new OccScope();
        try {
          const fused = csgFuse(oc, accumulated, result, sc);
          if (fused) {
            const fusedSolids = countSolids(oc, fused);
            const fusedFaces = countFaces(oc, fused);
            console.log(`[loop] ${feature.type} FUSED:`, { fusedSolids, fusedFaces });
            accumulated = fused;
          } else {
            // Fuse failed — add as separate solid
            console.log(`[loop] ${feature.type} FUSE FAILED — adding it as a separate solid`);
            root.add(shapeToGroup(oc, result, SOLID_COLOR, feature.id));
          }
        } finally {
          sc.dispose();
        }
      } else {
        console.log(`[loop] ${feature.type} — brak accumulated, ustawiam result jako accumulated`);
        accumulated = result;
      }
    }

    } catch (err) {
      // An uncaught exception from evalX must not break the loop: log it and
      // carry on with the accumulation so far. The feature (a Sweep with bad
      // sketches, say) simply adds nothing, and what was built before stays.
      console.warn(`[evaluateFeatureTreeOcc] uncaught exception w feature ${feature.type} (${feature.id}):`, err);
      reportEvalError(feature.name || feature.type,
        `unhandled exception: ${((err as Error)?.message ?? String(err)).slice(0, 200)}`);
    }
  }

  if (accumulated) {
    const accSolids = countSolids(oc, accumulated);
    const accFaces = countFaces(oc, accumulated);
    console.log('[final] accumulated dla tessellation:', { solids: accSolids, faces: accFaces });
    try {
      root.add(shapeToGroup(oc, accumulated, SOLID_COLOR, 'solid'));
      console.log('[final] shapeToGroup OK, root children:', root.children.length);
    } catch (err) {
      console.warn('[final] OCC tessellation failed:', err);
    }
  } else {
    console.log('[final] accumulated === null — nic do renderowania');
  }

  return root;
}
