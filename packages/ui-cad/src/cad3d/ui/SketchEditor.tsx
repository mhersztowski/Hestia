import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Divider, Tooltip, Typography } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { IconButton } from '@mui/material';
import type { Project } from '../../cad2d/barrel';
import type { Point2D } from '../../cad2d/barrel';
import { ActionBar } from '../../cad2d/barrel';
import { CadCanvas } from '../../cad2d/barrel';
import { CommandLine } from '../../cad2d/barrel';
import { LayerPanel } from '../../cad2d/barrel';
import { PropertiesPanel } from '../../cad2d/barrel';
import { StatusBar } from '../../cad2d/barrel';
import { Toolbar } from '../../cad2d/barrel';
import { useProject } from '../../cad2d/barrel';
import type { SketchPlane } from '../model/types';
import type { ToolName } from '../../cad2d/barrel';
import { ConstraintsPanel, ElementsPanel } from './ConstraintsPanel';
import type { ConstraintType, SketchConstraint, SketchEntity } from '../model/sketchConstraints';
import { DimensionValueDialog } from './DimensionValueDialog';
import { applyDimensionValue, dimRefs } from '../../cad2d/barrel';
import { freecadIconUrl } from '../../cad2d/barrel';
import type { DimensionEntity } from '../../cad2d/barrel';
import { constraintTypeLabel, solveConstraints } from '../model/sketchConstraints';

interface Props {
  project: Project;
  plane: SketchPlane;
  onExit: () => void;
}

const PLANE_LABEL: Record<SketchPlane, string> = {
  XY: 'XY — front plane',
  XZ: 'XZ — top plane',
  YZ: 'YZ — right plane',
  face: 'Face plane',
};

/** The perpendicular projection of P onto the line through L0 with direction dir. */
function projectOnLine(
  P: { x: number; y: number },
  L0: { x: number; y: number },
  dir: { x: number; y: number }
): { x: number; y: number } {
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dlen,
    uy = dir.y / dlen;
  const t = (P.x - L0.x) * ux + (P.y - L0.y) * uy;
  return { x: L0.x + t * ux, y: L0.y + t * uy };
}

/** P mirrored about the line through L0 with direction dir. */
function reflectAcrossLine(
  P: { x: number; y: number },
  L0: { x: number; y: number },
  dir: { x: number; y: number }
): { x: number; y: number } {
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dlen,
    uy = dir.y / dlen;
  const t = (P.x - L0.x) * ux + (P.y - L0.y) * uy;
  const footx = L0.x + t * ux,
    footy = L0.y + t * uy;
  return { x: 2 * footx - P.x, y: 2 * footy - P.y };
}

type PointHandle = { id: string; xKey: string; yKey: string; x: number; y: number };

/** Resolves a sub-element ref (`id`, `id.p1/p2`, `id.center`) to the entity's coordinates. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveRefPoint(project: any, ref: string): PointHandle | null {
  const [id, part] = ref.split('.');
  const e = project.entityRegistry.get(id);
  if (!e) return null;
  if (e.type === 'line')
    return part === 'p2'
      ? { id, xKey: 'x2', yKey: 'y2', x: e.x2, y: e.y2 }
      : { id, xKey: 'x1', yKey: 'y1', x: e.x1, y: e.y1 };
  if (e.type === 'circle' || e.type === 'arc')
    return { id, xKey: 'cx', yKey: 'cy', x: e.cx, y: e.cy };
  if (e.type === 'point') return { id, xKey: 'x', yKey: 'y', x: e.x, y: e.y };
  return null;
}

/**
 * Keeps a coincident constraint while editing: point-on-edge (the point is
 * projected onto the edge's line) or point-point (the one that did not move follows the one that did). `movedId` is the entity that changed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enforceCoincident(project: any, refs: string[], movedId: string): void {
  const edgeRef = refs.find(
    (r) => !r.includes('.') && !r.startsWith('#') && project.entityRegistry.get(r)?.type === 'line'
  );
  const ptRefs = refs.filter(
    (r) => r.includes('.') || project.entityRegistry.get(r)?.type === 'point'
  );
  if (edgeRef && ptRefs.length >= 1) {
    const A = resolveRefPoint(project, ptRefs[0]);
    const L = project.entityRegistry.get(edgeRef);
    if (!A || !L) return;
    const proj = projectOnLine(
      { x: A.x, y: A.y },
      { x: L.x1, y: L.y1 },
      { x: L.x2 - L.x1, y: L.y2 - L.y1 }
    );
    project.updateEntity(A.id, { [A.xKey]: proj.x, [A.yKey]: proj.y });
  } else if (ptRefs.length >= 2) {
    const A = resolveRefPoint(project, ptRefs[0]);
    const B = resolveRefPoint(project, ptRefs[1]);
    if (!A || !B) return;
    // The point that did not move follows the one that did.
    if (A.id === movedId) project.updateEntity(B.id, { [B.xKey]: A.x, [B.yKey]: A.y });
    else project.updateEntity(A.id, { [A.xKey]: B.x, [A.yKey]: B.y });
  }
}

export function SketchEditor({ project, plane, onExit }: Props) {
  const { version } = useProject(project);
  // 'select' by default — elements have to be clicked in the scene before a
  // constraint can be applied. Switching to 'line', 'circle' and so on starts drawing.
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [rightTab, setRightTab] = useState<'layers' | 'properties' | 'constraints' | 'elements'>(
    'constraints'
  );
  const [panelOpen, setPanelOpen] = useState(true);
  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);

  // The constraints live in the editor and are written into SketchFeature.constraints on Exit Sketch.
  const [constraints, setConstraints] = useState<SketchConstraint[]>([]);
  const constraintsRef = useRef<SketchConstraint[]>([]);
  constraintsRef.current = constraints;
  const coincEnforcingRef = useRef(false);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);
  // The open dimension-value dialog, by the dimension entity's id.
  const [dimDialogId, setDimDialogId] = useState<string | null>(null);
  // The refs of the sub-elements (vertices, edges) picked for a constraint.
  const [subRefs, setSubRefs] = useState<string[]>([]);
  const [subSelClear, setSubSelClear] = useState(0);

  const handleToolChange = useCallback((tool: ToolName) => {
    setActiveTool(tool);
    setInjectedPoint(null);
    setInjectedAngle(null);
  }, []);

  // Subscribe do event bus — CadCanvas.select tool emituje 'selection:changed'
  // with the ids of the selected entities. Kept in step with the local UI state.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    const handler = (ids: string[]) => {
      setSelectedElementIds(Array.isArray(ids) ? [...ids] : []);
    };
    const unsub = eventBus.on('selection:changed', handler);
    // Init z aktualnym stanem
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (project as any).selectionManager?.getSelected?.() ?? [];
    if (current.length > 0) setSelectedElementIds([...current]);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [project]);

  // A new dimension (DimensionTool) becomes an entry in the constraint list. What
  // it dimensions is read from its disabled anchors (anchor1/anchor2.entityId).
  const processedDimsRef = useRef<Set<string>>(new Set());
  const processedRectsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onAdded = (e: any) => {
      // A new rectangle gets its 8 constraints automatically, as in FreeCAD:
      // 4× coincident (rogi), 2× vertical (boki pionowe), 2× horizontal (boki poziome).
      // W naszym modelu rect to pojedyncza encja (rogi z natury coincydentne, boki
      // axis-aligned), so these are display-only entries — their refs point at the rect.
      if (e && e.type === 'rect' && !processedRectsRef.current.has(e.id)) {
        processedRectsRef.current.add(e.id);
        const mk = (type: ConstraintType, i: number): SketchConstraint => ({
          id: `rect-${e.id}-${type}-${i}`,
          type,
          refs: [e.id],
          visible: true,
        });
        const adds: SketchConstraint[] = [
          mk('coincident', 0),
          mk('coincident', 1),
          mk('coincident', 2),
          mk('coincident', 3),
          mk('vertical', 0),
          mk('vertical', 1),
          mk('horizontal', 0),
          mk('horizontal', 1),
        ];
        setConstraints((prev) => [...prev, ...adds]);
        return;
      }
      if (!e || e.type !== 'dimension' || processedDimsRef.current.has(e.id)) return;
      processedDimsRef.current.add(e.id);
      const value = Math.hypot((e.x2 ?? 0) - (e.x1 ?? 0), (e.y2 ?? 0) - (e.y1 ?? 0));
      const refs = [e.anchor1?.entityId, e.anchor2?.entityId].filter(
        (x: unknown, i: number, arr: unknown[]) => !!x && arr.indexOf(x) === i
      ) as string[];
      // A diameter: both anchors on the same entity, a circle or an arc.
      const sameEnt = e.anchor1?.entityId && e.anchor1.entityId === e.anchor2?.entityId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refEnt = sameEnt ? (project as any).entityRegistry?.get?.(e.anchor1.entityId) : null;
      const isDia = !!refEnt && (refEnt.type === 'circle' || refEnt.type === 'arc');
      const type: ConstraintType = isDia ? 'diameter' : 'distance';
      setConstraints((prev) => [
        ...prev,
        {
          id: `dim-${e.id}`,
          type,
          refs,
          value: Number(value.toFixed(3)),
          visible: true,
          name: `${constraintTypeLabel(type)}${prev.length + 1}`,
        },
      ]);
    };
    const unsub = eventBus.on('entity:added', onAdded);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [project]);

  // Driving dimensions are held to their value: on every change to an entity
  // their value is enforced again, so a dimensioned distance stays put while the
  // remaining degrees of freedom (the rectangle's other vertices) still move freely.
  const enforcingRef = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onUpd = (e: any) => {
      if (enforcingRef.current || !e || e.type === 'dimension') return;
      const dims = (project.entityRegistry.getByType('dimension') as DimensionEntity[]).filter(
        (d) => d.driving && d.value && dimRefs(d).includes(e.id)
      );
      if (!dims.length) return;
      enforcingRef.current = true;
      try {
        for (const d of dims) applyDimensionValue(project, d, d.value as number);
      } finally {
        enforcingRef.current = false;
      }
    };
    const unsub = eventBus.on('entity:updated', onUpd);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [project]);

  // Removing an entity removes the constraints that refer to it.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onRemoved = (payload: any) => {
      const id = typeof payload === 'string' ? payload : payload?.id;
      if (!id) return;
      setConstraints((prev) => prev.filter((c) => !c.refs.some((r) => r.split('.')[0] === id)));
    };
    const unsub = eventBus.on('entity:removed', onRemoved);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [project]);

  // Keeping coincident constraints (point-on-edge, point-point) while geometry moves.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onUpd = (e: any) => {
      if (coincEnforcingRef.current || !e || e.type === 'dimension') return;
      const cons = constraintsRef.current.filter(
        (c) => c.type === 'coincident' && c.refs.some((r) => r.split('.')[0] === e.id)
      );
      if (!cons.length) return;
      coincEnforcingRef.current = true;
      try {
        for (const c of cons) enforceCoincident(project, c.refs, e.id);
      } finally {
        coincEnforcingRef.current = false;
      }
    };
    const unsub = eventBus.on('entity:updated', onUpd);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [project]);

  // The project's entities — what the Elements panel lists and the solver works on
  const entities = useMemo(() => {
    const raw = project.entityRegistry.getAll() as unknown as Array<
      { id: string; type: string; name?: string } & Record<string, unknown>
    >;
    void version; // deps na re-render
    return raw;
  }, [project, version]);

  const addConstraint = (type: ConstraintType, refs: string[], value?: number) => {
    if (refs.length === 0) return;
    const newConstraint: SketchConstraint = {
      id: `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      refs,
      value,
      visible: true,
      name: `${constraintTypeLabel(type)}${constraints.length + 1}`,
    };
    const nextConstraints = [...constraints, newConstraint];
    setConstraints(nextConstraints);
    // Uruchom solver z aktualnymi entities
    runSolver(nextConstraints);
    setSelectedElementIds([]);
  };

  const runSolver = (currConstraints: SketchConstraint[]) => {
    const sketchEntities: SketchEntity[] = entities
      .filter(
        (e) => e.type === 'line' || e.type === 'circle' || e.type === 'rect' || e.type === 'point'
      )
      .map((e) => ({ ...e }) as unknown as SketchEntity);
    const result = solveConstraints(sketchEntities, currConstraints);
    console.log('[solver]', {
      converged: result.converged,
      iter: result.iterations,
      res: result.residual,
    });
    if (result.converged) {
      // Aplikuj wyniki przez project.updateEntity() — emituje 'entity:updated'
      // which bumps useProject.version → CadCanvas redraws.
      for (const e of result.entities) {
        try {
          const changes: Record<string, unknown> = {};
          for (const key of Object.keys(e)) {
            if (key === 'id' || key === 'type') continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            changes[key] = (e as unknown as any)[key];
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project.updateEntity(e.id, changes as any);
        } catch (err) {
          console.warn('[solver] updateEntity failed', e.id, err);
        }
      }
    }
  };

  // Toolbar handlers dla constraints
  const constraintHandlers: Array<{
    type: ConstraintType;
    label: string;
    refsRequired: number;
    needsValue?: boolean;
  }> = [
    { type: 'coincident', label: 'Coincident (2 punkty)', refsRequired: 2 },
    { type: 'horizontal', label: 'Horizontal (linia)', refsRequired: 1 },
    { type: 'vertical', label: 'Vertical (linia)', refsRequired: 1 },
    { type: 'parallel', label: 'Parallel (2 linie)', refsRequired: 2 },
    { type: 'perpendicular', label: 'Perpendicular (2 linie)', refsRequired: 2 },
    { type: 'equal', label: 'Equal (two lines of the same length)', refsRequired: 2 },
    { type: 'symmetric', label: 'Symmetric (two points and an axis or line)', refsRequired: 3 },
    { type: 'distance', label: 'Distance', refsRequired: 2, needsValue: true },
    { type: 'fixed', label: 'Fixed (zablokuj punkt)', refsRequired: 1 },
  ];

  // Resolves a sub-element ref (`id`, `id.p1/p2`, `id.center`) to the entity's coordinates.
  const resolvePoint = (ref: string) => resolveRefPoint(project, ref);

  const applyConstraintFromToolbar = (
    type: ConstraintType,
    refsRequired: number,
    needsValue: boolean = false
  ) => {
    // Prefer the sub-element refs (vertices, edges); fall back to whole entities.
    const refsPool = subRefs.length ? subRefs : selectedElementIds;

    // Horizontal and vertical are applied to the geometry directly — no solver, no doubt:
    //  • every selected LINE edge becomes horizontal or vertical,
    //  • several selected POINTS line up (a common Y or X).
    if (type === 'horizontal' || type === 'vertical') {
      const horiz = type === 'horizontal';
      const edgeLines: string[] = [];
      const pointRefs: string[] = [];
      for (const ref of refsPool) {
        const [id, part] = ref.split('.');
        const e = project.entityRegistry.get(id);
        if (!e) continue;
        if (!part && e.type === 'line') edgeLines.push(id);
        else pointRefs.push(ref);
      }
      const additions: SketchConstraint[] = [];
      // Every selected line becomes horizontal or vertical, and gets an entry.
      for (const id of edgeLines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = project.entityRegistry.get(id) as any;
        if (horiz) {
          const ty = (e.y1 + e.y2) / 2;
          project.updateEntity(id, { y1: ty, y2: ty } as never);
        } else {
          const tx = (e.x1 + e.x2) / 2;
          project.updateEntity(id, { x1: tx, x2: tx } as never);
        }
        additions.push({
          id: `hv-${Date.now()}-${additions.length}`,
          type,
          refs: [id],
          visible: true,
        });
      }
      // Several points share a Y or an X, with an entry between each pair, as in FreeCAD.
      const resolvedRefs = pointRefs.filter((r) => !!resolvePoint(r));
      if (resolvedRefs.length >= 2) {
        const pts = resolvedRefs.map((r) => resolvePoint(r)!);
        const target = pts.reduce((s, p) => s + (horiz ? p.y : p.x), 0) / pts.length;
        for (const p of pts)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project.updateEntity(p.id, { [horiz ? p.yKey : p.xKey]: target } as any);
        for (let i = 0; i < resolvedRefs.length - 1; i++) {
          additions.push({
            id: `hv-${Date.now()}-${additions.length}-p`,
            type,
            refs: [resolvedRefs[i], resolvedRefs[i + 1]],
            visible: true,
          });
        }
      }
      if (additions.length) {
        setConstraints((prev) => [...prev, ...additions]); // entries in the Constraints list (unnamed → "ConstraintN")
        setSubRefs([]);
        setSubSelClear((v) => v + 1);
        return;
      }
      alert(`${constraintTypeLabel(type)}: select a line or edge, or at least two points.`);
      return;
    }

    // Parallel, perpendicular and equal are applied to N lines directly, each against the first.
    if (type === 'parallel' || type === 'perpendicular' || type === 'equal') {
      const lineIds = [
        ...new Set(
          refsPool.filter((r) => !r.includes('.') && project.entityRegistry.get(r)?.type === 'line')
        ),
      ];
      if (lineIds.length < 2) {
        alert(`${constraintTypeLabel(type)}: select at least two edges (lines).`);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const A = project.entityRegistry.get(lineIds[0]) as any;
      const angA = Math.atan2(A.y2 - A.y1, A.x2 - A.x1);
      const lenA = Math.hypot(A.x2 - A.x1, A.y2 - A.y1);
      const additions: SketchConstraint[] = [];
      for (let i = 1; i < lineIds.length; i++) {
        const id = lineIds[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const B = project.entityRegistry.get(id) as any;
        const angB = Math.atan2(B.y2 - B.y1, B.x2 - B.x1);
        const lenB = Math.hypot(B.x2 - B.x1, B.y2 - B.y1);
        const mx = (B.x1 + B.x2) / 2,
          my = (B.y1 + B.y2) / 2;
        const setB = (dir: number, len: number) => {
          const hx = (Math.cos(dir) * len) / 2,
            hy = (Math.sin(dir) * len) / 2;
          project.updateEntity(id, { x1: mx - hx, y1: my - hy, x2: mx + hx, y2: my + hy } as never);
        };
        if (type === 'parallel') {
          let dir = angA;
          if (Math.cos(angB - angA) < 0) dir = angA + Math.PI; // keep B's orientation
          setB(dir, lenB);
        } else if (type === 'perpendicular') {
          let dir = angA + Math.PI / 2;
          if (Math.cos(angB - dir) < 0) dir += Math.PI;
          setB(dir, lenB);
        } else {
          // equal — the length becomes the first one's
          setB(angB, lenA);
        }
        additions.push({
          id: `pp-${Date.now()}-${i}`,
          type,
          refs: [lineIds[0], id],
          visible: true,
        });
      }
      setConstraints((prev) => [...prev, ...additions]);
      setSubRefs([]);
      setSubSelClear((v) => v + 1);
      return;
    }

    // Fixed locks the selected entities, so they cannot be moved, with an entry each.
    if (type === 'fixed') {
      const ids = [...new Set(refsPool.map((r) => r.split('.')[0]))].filter(
        (id) => !!project.entityRegistry.get(id)
      );
      if (!ids.length) {
        alert('Fixed: zaznacz element(y).');
        return;
      }
      const additions: SketchConstraint[] = [];
      for (const id of ids) {
        project.updateEntity(id, { locked: true } as never);
        additions.push({
          id: `fx-${Date.now()}-${additions.length}`,
          type: 'fixed',
          refs: [id],
          visible: true,
        });
      }
      setConstraints((prev) => [...prev, ...additions]);
      setSubRefs([]);
      setSubSelClear((v) => v + 1);
      return;
    }

    // Symmetric — two points mirrored about an axis (#axisX/#axisY) or a line.
    if (type === 'symmetric') {
      // A point is a ref with a dot (`id.p1`, `id.center`) or a point entity. A bare line is the EDGE to mirror about, not a point.
      const isPointRef = (r: string) =>
        r.includes('.') || project.entityRegistry.get(r)?.type === 'point';
      const pointRefs = refsPool.filter(isPointRef);
      const axisRef = refsPool.find((r) => r === '#axisX' || r === '#axisY');
      const lineRef = refsPool.find(
        (r) =>
          !r.includes('.') && !r.startsWith('#') && project.entityRegistry.get(r)?.type === 'line'
      );
      const mirror = axisRef ?? lineRef;
      if (pointRefs.length < 2 || !mirror) {
        alert('Symmetric: select two points and an axis or a line.');
        return;
      }
      const A = resolvePoint(pointRefs[0])!;
      const B = resolvePoint(pointRefs[1])!;
      let refl: { x: number; y: number };
      if (axisRef === '#axisX') refl = { x: A.x, y: -A.y };
      else if (axisRef === '#axisY') refl = { x: -A.x, y: A.y };
      else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = project.entityRegistry.get(lineRef as string) as any;
        refl = reflectAcrossLine(
          { x: A.x, y: A.y },
          { x: L.x1, y: L.y1 },
          { x: L.x2 - L.x1, y: L.y2 - L.y1 }
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project.updateEntity(B.id, { [B.xKey]: refl.x, [B.yKey]: refl.y } as any);
      setConstraints((prev) => [
        ...prev,
        {
          id: `sym-${Date.now()}`,
          type: 'symmetric',
          refs: [pointRefs[0], pointRefs[1], mirror],
          visible: true,
        },
      ]);
      setSubRefs([]);
      setSubSelClear((v) => v + 1);
      return;
    }

    // Coincident — two points in the same place, or a point on an edge.
    // Held by the enforceCoincident effect as things move.
    if (type === 'coincident') {
      const isPointRef = (r: string) =>
        r.includes('.') || project.entityRegistry.get(r)?.type === 'point';
      const pointRefs = refsPool.filter(isPointRef);
      const edgeRef = refsPool.find(
        (r) =>
          !r.includes('.') && !r.startsWith('#') && project.entityRegistry.get(r)?.type === 'line'
      );
      if (pointRefs.length >= 2) {
        const A = resolvePoint(pointRefs[0]);
        const B = resolvePoint(pointRefs[1]);
        if (A && B) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project.updateEntity(B.id, { [B.xKey]: A.x, [B.yKey]: A.y } as any);
          setConstraints((prev) => [
            ...prev,
            {
              id: `co-${Date.now()}`,
              type: 'coincident',
              refs: [pointRefs[0], pointRefs[1]],
              visible: true,
            },
          ]);
        }
      } else if (pointRefs.length === 1 && edgeRef) {
        const A = resolvePoint(pointRefs[0]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = project.entityRegistry.get(edgeRef) as any;
        if (A && L) {
          const proj = projectOnLine(
            { x: A.x, y: A.y },
            { x: L.x1, y: L.y1 },
            { x: L.x2 - L.x1, y: L.y2 - L.y1 }
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project.updateEntity(A.id, { [A.xKey]: proj.x, [A.yKey]: proj.y } as any);
          setConstraints((prev) => [
            ...prev,
            {
              id: `co-${Date.now()}`,
              type: 'coincident',
              refs: [pointRefs[0], edgeRef],
              visible: true,
            },
          ]);
        }
      } else {
        alert('Coincident: select two points, or a point and an edge.');
        return;
      }
      setSubRefs([]);
      setSubSelClear((v) => v + 1);
      return;
    }

    if (refsPool.length < refsRequired) {
      alert(
        `${constraintTypeLabel(type)} needs ${refsRequired} elements selected. Selected: ${refsPool.length}`
      );
      return;
    }
    let value: number | undefined = undefined;
    if (needsValue) {
      const input = prompt('Value:');
      if (!input) return;
      value = parseFloat(input);
      if (isNaN(value)) return;
    }
    addConstraint(type, refsPool.slice(0, refsRequired), value);
    setSubRefs([]);
    setSubSelClear((v) => v + 1);
  };

  // ── Dimension dropdown (FreeCAD-style) ────────────────────────────────────────
  type DimKey =
    | 'auto'
    | 'horizontal_distance'
    | 'vertical_distance'
    | 'distance'
    | 'auto_radius_diameter'
    | 'radius'
    | 'diameter'
    | 'angle'
    | 'lock';
  const dimensionOptions: Array<{ key: DimKey; label: string; sc: string; icon: string }> = [
    { key: 'auto', label: 'Dimension', sc: 'D', icon: 'c_dimension' },
    {
      key: 'horizontal_distance',
      label: 'Constrain horizontal distance',
      sc: 'L',
      icon: 'c_horizontal_distance',
    },
    {
      key: 'vertical_distance',
      label: 'Constrain vertical distance',
      sc: 'I',
      icon: 'c_vertical_distance',
    },
    { key: 'distance', label: 'Constrain distance', sc: 'K, D', icon: 'c_distance' },
    {
      key: 'auto_radius_diameter',
      label: 'Constrain auto radius/diameter',
      sc: 'K, S',
      icon: 'c_radius',
    },
    { key: 'radius', label: 'Constrain radius', sc: 'K, R', icon: 'c_radius' },
    { key: 'diameter', label: 'Constrain diameter', sc: 'K, O', icon: 'c_diameter' },
    { key: 'angle', label: 'Constrain angle', sc: 'K, A', icon: 'c_angle' },
    { key: 'lock', label: 'Constrain lock', sc: 'K, L', icon: 'c_fixed' },
  ];

  const askValue = (msg = 'Value (mm):'): number => {
    const v = prompt(msg);
    return v == null ? NaN : parseFloat(v);
  };

  const applyDimension = (key: DimKey) => {
    const refs = subRefs.length ? subRefs : selectedElementIds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = (id: string) => project.entityRegistry.get(id) as any;
    const addDim = (type: ConstraintType, r: string[], val: number) =>
      setConstraints((prev) => [
        ...prev,
        { id: `dim-${Date.now()}`, type, refs: r, value: val, visible: true },
      ]);
    const done = () => {
      setSubRefs([]);
      setSubSelClear((v) => v + 1);
    };

    if (key === 'lock') {
      applyConstraintFromToolbar('fixed', 1);
      return;
    }

    // radius / diameter / auto
    if (key === 'radius' || key === 'diameter' || key === 'auto_radius_diameter') {
      const cid = refs
        .map((r) => r.split('.')[0])
        .find((id) => ['circle', 'arc'].includes(get(id)?.type));
      if (!cid) {
        alert('Select a circle or an arc.');
        return;
      }
      const e = get(cid);
      const v = askValue();
      if (!isFinite(v) || v <= 0) return;
      const isDia = key === 'diameter' || (key === 'auto_radius_diameter' && e.type === 'circle');
      project.updateEntity(cid, { radius: isDia ? v / 2 : v } as never);
      addDim(isDia ? 'diameter' : 'radius', [cid], v);
      done();
      return;
    }

    // horizontal_distance / vertical_distance / distance — 2 punkty
    if (key === 'horizontal_distance' || key === 'vertical_distance' || key === 'distance') {
      const pr = refs.filter((r) => r.includes('.') || get(r)?.type === 'point');
      const A = resolvePoint(pr[0]);
      const B = resolvePoint(pr[1]);
      if (!A || !B) {
        alert('Zaznacz 2 punkty.');
        return;
      }
      const v = askValue();
      if (!isFinite(v) || v <= 0) return;
      if (key === 'horizontal_distance')
        project.updateEntity(B.id, { [B.xKey]: A.x + (B.x >= A.x ? v : -v) } as never);
      else if (key === 'vertical_distance')
        project.updateEntity(B.id, { [B.yKey]: A.y + (B.y >= A.y ? v : -v) } as never);
      else {
        const dx = B.x - A.x,
          dy = B.y - A.y,
          len = Math.hypot(dx, dy) || 1;
        project.updateEntity(B.id, {
          [B.xKey]: A.x + (dx / len) * v,
          [B.yKey]: A.y + (dy / len) * v,
        } as never);
      }
      addDim(key, [pr[0], pr[1]], v);
      done();
      return;
    }

    // angle — 2 linie
    if (key === 'angle') {
      const lids = [...new Set(refs.filter((r) => !r.includes('.') && get(r)?.type === 'line'))];
      if (lids.length < 2) {
        alert('Zaznacz 2 linie.');
        return;
      }
      const v = askValue('Angle (°):');
      if (!isFinite(v)) return;
      const A = get(lids[0]);
      const B = get(lids[1]);
      const angA = Math.atan2(A.y2 - A.y1, A.x2 - A.x1);
      const target = angA + (v * Math.PI) / 180;
      const lenB = Math.hypot(B.x2 - B.x1, B.y2 - B.y1);
      const mx = (B.x1 + B.x2) / 2,
        my = (B.y1 + B.y2) / 2;
      const hx = (Math.cos(target) * lenB) / 2,
        hy = (Math.sin(target) * lenB) / 2;
      project.updateEntity(lids[1], {
        x1: mx - hx,
        y1: my - hy,
        x2: mx + hx,
        y2: my + hy,
      } as never);
      addDim('angle', [lids[0], lids[1]], v);
      done();
      return;
    }

    // auto — chosen from what is selected
    if (key === 'auto') {
      const cid = refs
        .map((r) => r.split('.')[0])
        .find((id) => ['circle', 'arc'].includes(get(id)?.type));
      if (cid) {
        applyDimension(get(cid).type === 'circle' ? 'diameter' : 'radius');
        return;
      }
      const lids = [...new Set(refs.filter((r) => !r.includes('.') && get(r)?.type === 'line'))];
      if (lids.length >= 2) {
        applyDimension('angle');
        return;
      }
      applyDimension('distance');
      return;
    }
  };

  // A light theme, local to the sketch editor, to match the 3D page.
  // The application's own theme stays dark; only this component is wrapped.
  const globalTheme = useTheme();
  const lightTheme = createTheme({
    ...globalTheme,
    palette: {
      ...globalTheme.palette,
      mode: 'light',
      primary: globalTheme.palette.primary,
      background: { default: '#fafafa', paper: '#ffffff' },
      text: { primary: '#212121', secondary: '#616161' },
      divider: 'rgba(0,0,0,0.12)',
    },
  });

  return (
    <ThemeProvider theme={lightTheme}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        {/* Sketch header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1.5,
            py: 0.5,
            bgcolor: 'primary.dark',
            borderBottom: '1px solid',
            borderColor: 'primary.main',
            flexShrink: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'primary.contrastText', letterSpacing: 0.5 }}
          >
            SKETCH EDITOR
          </Typography>
          <Chip
            label={PLANE_LABEL[plane]}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 20, fontSize: 10 }}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<CheckIcon />}
            onClick={onExit}
          >
            Exit Sketch
          </Button>
        </Box>

        <ActionBar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          project={project}
          dimensionOptions={dimensionOptions}
          onDimensionOption={(key) =>
            applyDimension(key as (typeof dimensionOptions)[number]['key'])
          }
        >
          {/* Constraints — in the same row as Move, Copy and the rest */}
          {constraintHandlers.map((h) => (
            <Tooltip key={h.type} title={h.label}>
              <Box
                onClick={() => applyConstraintFromToolbar(h.type, h.refsRequired, !!h.needsValue)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  borderRadius: 0.5,
                  flexShrink: 0,
                  '&:hover': { bgcolor: 'action.selected' },
                }}
              >
                <ConstraintToolbarIcon type={h.type} />
              </Box>
            </Tooltip>
          ))}
          <Box sx={{ flex: 1, minWidth: 8 }} />
          <Tooltip title={panelOpen ? 'Hide panel' : 'Show panel'}>
            <IconButton
              size="small"
              sx={{ width: 30, height: 30, flexShrink: 0 }}
              onClick={() => setPanelOpen((o) => !o)}
            >
              {panelOpen ? (
                <ChevronRightIcon fontSize="small" />
              ) : (
                <ChevronLeftIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </ActionBar>

        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Toolbar activeTool={activeTool} onToolChange={handleToolChange} viewMode="2d" />

          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CadCanvas
              project={project}
              activeTool={activeTool}
              version={version}
              viewMode="2d"
              injectedPoint={injectedPoint}
              injectedAngle={injectedAngle}
              onLastPoint={(p) => {
                lastPointRef.current = p;
              }}
              subSelect
              onSubSelect={setSubRefs}
              subSelectClear={subSelClear}
              onDimensionClick={setDimDialogId}
              constraints={constraints}
              onToolChange={handleToolChange}
            />
          </Box>

          {panelOpen && (
            <Box
              sx={{
                width: 260,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.paper',
                borderLeft: '1px solid rgba(0,0,0,0.12)',
              }}
            >
              {/* Tabs (four of them) */}
              <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                {(['constraints', 'elements', 'layers', 'properties'] as const).map((tab) => (
                  <Box
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    sx={{
                      flex: 1,
                      py: 0.5,
                      textAlign: 'center',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: rightTab === tab ? 'primary.main' : 'text.secondary',
                      borderBottom: rightTab === tab ? '2px solid' : '2px solid transparent',
                      borderColor: rightTab === tab ? 'primary.main' : 'transparent',
                      textTransform: 'capitalize',
                    }}
                  >
                    {tab}
                  </Box>
                ))}
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {rightTab === 'constraints' && (
                  <ConstraintsPanel
                    constraints={constraints}
                    onToggleVisibility={(id, visible) =>
                      setConstraints(constraints.map((c) => (c.id === id ? { ...c, visible } : c)))
                    }
                    onDelete={(id) => {
                      const removed = constraints.find((c) => c.id === id);
                      // Removing Fixed unlocks the entity.
                      if (removed?.type === 'fixed') {
                        for (const ref of removed.refs) {
                          const eid = ref.split('.')[0];
                          if (project.entityRegistry.get(eid))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            project.updateEntity(eid, { locked: false } as any);
                        }
                      }
                      const next = constraints.filter((c) => c.id !== id);
                      setConstraints(next);
                      runSolver(next);
                    }}
                    onSelect={setSelectedConstraintId}
                    selectedId={selectedConstraintId}
                  />
                )}
                {rightTab === 'elements' && (
                  <ElementsPanel
                    entities={entities}
                    onSelect={(id) => {
                      // Toggle through selectionManager, so the change reaches the canvas too
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const sm = (project as any).selectionManager;
                      if (sm) {
                        const isSelected = selectedElementIds.includes(id);
                        if (isSelected) sm.deselect?.(id);
                        else sm.select?.(id, true); // multi-select mode (jak shift)
                        // Emit, so the subscription in useEffect updates setSelectedElementIds
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (project as any).eventBus?.emit?.(
                          'selection:changed',
                          sm.getSelected?.() ?? []
                        );
                      } else {
                        // Fallback bez selectionManager
                        setSelectedElementIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                        );
                      }
                    }}
                    selectedId={selectedElementIds[0] ?? null}
                  />
                )}
                {rightTab === 'layers' && <LayerPanel project={project} version={version} />}
                {rightTab === 'properties' && (
                  <PropertiesPanel project={project} version={version} />
                )}
              </Box>

              {/* Info: selected elements count */}
              {(subRefs.length || selectedElementIds.length) > 0 && (
                <Box
                  sx={{ p: 0.5, borderTop: '1px solid rgba(0,0,0,0.12)', bgcolor: 'primary.dark' }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: 'primary.contrastText', fontSize: 10 }}
                  >
                    {subRefs.length || selectedElementIds.length} elements selected
                    {subRefs.length ? ` (${subRefs.join(', ')})` : ''}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Divider />
        <StatusBar project={project} activeTool={activeTool} viewMode="2d" />
        <CommandLine
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onCoordinate={(p) => setInjectedPoint({ ...p })}
          onAngle={(deg) => setInjectedAngle(deg + Math.random() * 1e-10)}
          lastPoint={lastPointRef.current}
        />
        {dimDialogId && (
          <DimensionValueDialog
            project={project}
            dimId={dimDialogId}
            onClose={() => setDimDialogId(null)}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}

/** Ikony constraint toolbar w stylu FreeCAD (czerwone SVG). */
function ConstraintToolbarIcon({ type }: { type: ConstraintType }) {
  const url = freecadIconUrl(`c_${type}`);
  if (url)
    return (
      <Box
        component="img"
        src={url}
        alt={type}
        sx={{ width: 20, height: 20, objectFit: 'contain' }}
      />
    );
  const c = '#c62828';
  const s = { width: 20, height: 20, viewBox: '0 0 20 20', xmlns: 'http://www.w3.org/2000/svg' };
  switch (type) {
    case 'coincident':
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="3.5" fill={c} />
          <line x1="2" y1="18" x2="18" y2="2" stroke={c} strokeWidth="2" />
        </svg>
      );
    case 'horizontal':
      return (
        <svg {...s}>
          <line x1="2" y1="10" x2="18" y2="10" stroke={c} strokeWidth="3" />
        </svg>
      );
    case 'vertical':
      return (
        <svg {...s}>
          <line x1="10" y1="2" x2="10" y2="18" stroke={c} strokeWidth="3" />
        </svg>
      );
    case 'parallel':
      return (
        <svg {...s}>
          <line x1="4" y1="3" x2="12" y2="17" stroke={c} strokeWidth="2" />
          <line x1="9" y1="3" x2="17" y2="17" stroke={c} strokeWidth="2" />
        </svg>
      );
    case 'perpendicular':
      return (
        <svg {...s}>
          <line x1="3" y1="3" x2="17" y2="17" stroke={c} strokeWidth="2" />
          <line x1="17" y1="3" x2="3" y2="17" stroke={c} strokeWidth="2" />
        </svg>
      );
    case 'equal':
      return (
        <svg {...s}>
          <line x1="3" y1="7" x2="17" y2="7" stroke={c} strokeWidth="2" />
          <line x1="3" y1="13" x2="17" y2="13" stroke={c} strokeWidth="2" />
        </svg>
      );
    case 'distance':
      return (
        <svg {...s}>
          <line x1="3" y1="10" x2="17" y2="10" stroke={c} strokeWidth="1.5" />
          <line x1="3" y1="7" x2="3" y2="13" stroke={c} strokeWidth="2" />
          <line x1="17" y1="7" x2="17" y2="13" stroke={c} strokeWidth="2" />
        </svg>
      );
    case 'fixed':
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="5" fill="none" stroke={c} strokeWidth="2" />
          <line x1="10" y1="4" x2="10" y2="16" stroke={c} strokeWidth="1" />
          <line x1="4" y1="10" x2="16" y2="10" stroke={c} strokeWidth="1" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <rect x="4" y="4" width="12" height="12" fill="none" stroke={c} strokeWidth="1.5" />
        </svg>
      );
  }
}
