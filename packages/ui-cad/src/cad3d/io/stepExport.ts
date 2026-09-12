/**
 * STEP export — the 2D drawing's solids as a STEP file.
 *
 * This lived in `cad-app`'s `CadExporter`, next to the other exporters. It sits
 * here because it is the only one that needs OpenCascade: pulling in a WASM
 * kernel of several megabytes to save a DXF would be a poor trade, and
 * `cad2d/` stays free of it.
 *
 * The entities it can export are those with a shape in three dimensions: boxes,
 * cylinders and spheres, and any 2D shape with an extrude height. A drawing with
 * none of those has nothing to write, and saying so is better than writing an
 * empty file.
 */
import type { Entity, Project } from '../../cad2d/barrel';
import { getOcc } from '../occ/occLoader';
import { OccScope, entitiesToWires, wiresToFace } from '../occ/occConvert';

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function projectName(project: Project): string {
  return project.settings.name?.trim() || 'project';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityToOccShape(oc: any, entity: Entity, sc: OccScope): unknown | null {
  try {
    if (entity.type === 'box3d') {
      const { cx, cy, width: w, depth: d, height: h } = entity;
      const box = sc.track(new oc.BRepPrimAPI_MakeBox_3(
        sc.track(new oc.gp_Pnt_3(cx - w / 2, cy - d / 2, 0)), w, d, h,
      ));
      box.Build(sc.track(new oc.Message_ProgressRange_1()));
      return box.IsDone() ? box.Shape() : null;
    }

    if (entity.type === 'cylinder3d') {
      const { cx, cy, radius, height } = entity;
      const cyl = sc.track(new oc.BRepPrimAPI_MakeCylinder_3(
        sc.track(new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(cx, cy, 0)),
          sc.track(new oc.gp_Dir_4(0, 0, 1)),
        )),
        radius, height,
      ));
      cyl.Build(sc.track(new oc.Message_ProgressRange_1()));
      return cyl.IsDone() ? cyl.Solid() : null;
    }

    if (entity.type === 'sphere3d') {
      const { cx, cy, radius } = entity;
      const sph = sc.track(new oc.BRepPrimAPI_MakeSphere_5(
        sc.track(new oc.gp_Pnt_3(cx, cy, 0)), radius,
      ));
      sph.Build(sc.track(new oc.Message_ProgressRange_1()));
      return sph.IsDone() ? sph.Solid() : null;
    }

    // 2D entities with extrusion height → extruded solid
    if (entity.extrudeHeight > 0 && (
      entity.type === 'line' || entity.type === 'circle' || entity.type === 'arc' ||
      entity.type === 'rect' || entity.type === 'polyline'
    )) {
      const wires = entitiesToWires(oc, [entity as unknown as Record<string, unknown>], sc);
      const face = wiresToFace(oc, wires, sc);
      if (!face) return null;
      const prism = sc.track(new oc.BRepPrimAPI_MakePrism_1(
        face as object,
        sc.track(new oc.gp_Vec_4(0, 0, entity.extrudeHeight)),
        false, true,
      ));
      prism.Build(sc.track(new oc.Message_ProgressRange_1()));
      return prism.IsDone() ? prism.Shape() : null;
    }

    // Flat 2D entities → edges / wires
    if (entity.type === 'line') {
      return sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
        sc.track(new oc.gp_Pnt_3(entity.x1, entity.y1, 0)),
        sc.track(new oc.gp_Pnt_3(entity.x2, entity.y2, 0)),
      )).Edge();
    }

    if (entity.type === 'circle') {
      const ax2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(entity.cx, entity.cy, 0)),
        sc.track(new oc.gp_Dir_4(0, 0, 1)),
      ));
      const circ = sc.track(new oc.gp_Circ_2(ax2, entity.radius));
      const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_8(circ)).Edge();
      return sc.track(new oc.BRepBuilderAPI_MakeWire_2(edge)).Wire();
    }

    if (entity.type === 'arc') {
      const ax2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(entity.cx, entity.cy, 0)),
        sc.track(new oc.gp_Dir_4(0, 0, 1)),
      ));
      const circ = sc.track(new oc.gp_Circ_2(ax2, entity.radius));
      return sc.track(new oc.BRepBuilderAPI_MakeEdge_9(circ, entity.startAngle, entity.endAngle)).Edge();
    }

    // rect, polyline (flat) → closed wire via entitiesToWires
    const wires = entitiesToWires(oc, [entity as unknown as Record<string, unknown>], sc);
    return wires.length > 0 ? wires[0] : null;

  } catch {
    return null;
  }
}

export async function exportSTEP(project: Project): Promise<void> {
  const oc = await getOcc();
  const name = projectName(project);
  const sc = new OccScope();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer: any = new oc.STEPControl_Writer_1();
  try {
    const compound = sc.track(new oc.TopoDS_Compound());
    const builder = sc.track(new oc.BRep_Builder());
    builder.MakeCompound(compound);
    let hasShapes = false;

    for (const entity of project.entityRegistry.getAll()) {
      if (!entity.visible) continue;
      const layer = project.layerSystem.get(entity.layerId);
      if (layer && !layer.visible) continue;
      const shape = entityToOccShape(oc, entity, sc);
      if (shape) {
        builder.Add(compound, shape);
        hasShapes = true;
      }
    }

    if (!hasShapes) throw new Error('No exportable entities — add 3D objects or set extrude height on 2D shapes');

    writer.Transfer(
      compound,
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      sc.track(new oc.Message_ProgressRange_1()),
    );
    writer.Write('/export.step');
    const content: string = oc.FS.readFile('/export.step', { encoding: 'utf8' });
    downloadBlob(content, `${name}.step`, 'model/step');
  } finally {
    writer.delete();
    sc.dispose();
  }
}
