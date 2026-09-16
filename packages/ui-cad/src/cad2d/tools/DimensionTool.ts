import type { Entity, Point2D } from '../core';
import { makeDimAnchor } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

const PICK_PX = 12;

type Seg = { a: Point2D; b: Point2D };

/** Element wybieralny do wymiarowania. */
type DimElement =
  | { kind: 'vertex'; p: Point2D; id?: string }
  | { kind: 'origin'; p: Point2D }
  | { kind: 'edge'; a: Point2D; b: Point2D; id?: string }
  | { kind: 'circle'; c: Point2D; r: number; id: string }
  | { kind: 'arc'; c: Point2D; r: number; a0: number; a1: number; id: string }
  | { kind: 'axisX' }
  | { kind: 'axisY' };

type Measured = {
  p1: Point2D;
  p2: Point2D;
  refs: string[];
  kind: 'distance' | 'diameter';
  axis?: 'x' | 'y';
};

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function projOnLine(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return { ...a };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function distToSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function enumVertices(entities: Entity[]): { p: Point2D; id: string }[] {
  const out: { p: Point2D; id: string }[] = [];
  const add = (p: Point2D, id: string) => out.push({ p, id });
  for (const e of entities) {
    if (!e.visible) continue;
    switch (e.type) {
      case 'line':
        add({ x: e.x1, y: e.y1 }, e.id);
        add({ x: e.x2, y: e.y2 }, e.id);
        break;
      case 'rect':
        add({ x: e.x, y: e.y }, e.id);
        add({ x: e.x + e.width, y: e.y }, e.id);
        add({ x: e.x + e.width, y: e.y + e.height }, e.id);
        add({ x: e.x, y: e.y + e.height }, e.id);
        break;
      case 'polyline':
        for (const p of e.points) add(p, e.id);
        break;
      case 'freehand':
        if (e.points.length) {
          add(e.points[0], e.id);
          add(e.points[e.points.length - 1], e.id);
        }
        break;
      case 'circle':
        add({ x: e.cx, y: e.cy }, e.id);
        break;
      case 'arc':
        add({ x: e.cx, y: e.cy }, e.id);
        add(
          {
            x: e.cx + e.radius * Math.cos(e.startAngle),
            y: e.cy + e.radius * Math.sin(e.startAngle),
          },
          e.id
        );
        add(
          { x: e.cx + e.radius * Math.cos(e.endAngle), y: e.cy + e.radius * Math.sin(e.endAngle) },
          e.id
        );
        break;
      case 'point':
        add({ x: e.x, y: e.y }, e.id);
        break;
    }
  }
  return out;
}

function enumEdges(entities: Entity[]): { a: Point2D; b: Point2D; id: string }[] {
  const out: { a: Point2D; b: Point2D; id: string }[] = [];
  for (const e of entities) {
    if (!e.visible) continue;
    switch (e.type) {
      case 'line':
        out.push({ a: { x: e.x1, y: e.y1 }, b: { x: e.x2, y: e.y2 }, id: e.id });
        break;
      case 'rect': {
        const c = [
          { x: e.x, y: e.y },
          { x: e.x + e.width, y: e.y },
          { x: e.x + e.width, y: e.y + e.height },
          { x: e.x, y: e.y + e.height },
        ];
        for (let i = 0; i < 4; i++) out.push({ a: c[i], b: c[(i + 1) % 4], id: e.id });
        break;
      }
      case 'polyline': {
        const n = e.points.length;
        const last = e.closed ? n : n - 1;
        for (let i = 0; i < last; i++)
          out.push({ a: e.points[i], b: e.points[(i + 1) % n], id: e.id });
        break;
      }
    }
  }
  return out;
}

/**
 * The dimension tool picks what to measure the way FreeCAD does:
 *  • click an edge → its length is dimensioned straight away,
 *  • click an arc or a circle → its diameter,
 *  • click a vertex, the origin or an axis → the first of a pair, and the
 *    distance between the two is dimensioned.
 * Hovering highlights what would be picked. What has been dimensioned is locked.
 */
export class DimensionTool implements Tool {
  name = 'dimension' as const;
  private state: 'select' | 'offset' = 'select';
  private selected: DimElement[] = [];
  private hover: DimElement | null = null;
  private measured: Measured | null = null;
  private offset = 20;
  private cursor: Point2D = { x: 0, y: 0 };
  private pxw = 1;

  private pickElement(point: Point2D, ctx: ToolContext): DimElement | null {
    const th = (ctx.pixelToWorld ?? 1) * PICK_PX;
    const entities = ctx.project.entityRegistry.getAll();

    // 1) Vertices, the origin (0,0,0) among them
    let bestV: { p: Point2D; id: string } | null = null;
    let bestVD = th;
    for (const v of enumVertices(entities)) {
      const d = dist(point, v.p);
      if (d < bestVD) {
        bestVD = d;
        bestV = v;
      }
    }
    const dOrigin = dist(point, { x: 0, y: 0 });
    if (dOrigin < bestVD && dOrigin < th) return { kind: 'origin', p: { x: 0, y: 0 } };
    if (bestV) return { kind: 'vertex', p: bestV.p, id: bestV.id };

    // 2) The rim of a circle or an arc → its diameter
    let bestC: DimElement | null = null;
    let bestCD = th;
    for (const e of entities) {
      if (!e.visible) continue;
      if (e.type === 'circle') {
        const d = Math.abs(dist(point, { x: e.cx, y: e.cy }) - e.radius);
        if (d < bestCD) {
          bestCD = d;
          bestC = { kind: 'circle', c: { x: e.cx, y: e.cy }, r: e.radius, id: e.id };
        }
      } else if (e.type === 'arc') {
        const d = Math.abs(dist(point, { x: e.cx, y: e.cy }) - e.radius);
        if (d < bestCD) {
          bestCD = d;
          bestC = {
            kind: 'arc',
            c: { x: e.cx, y: e.cy },
            r: e.radius,
            a0: e.startAngle,
            a1: e.endAngle,
            id: e.id,
          };
        }
      }
    }
    if (bestC) return bestC;

    // 3) Edges
    let bestE: { a: Point2D; b: Point2D; id: string } | null = null;
    let bestED = th;
    for (const s of enumEdges(entities)) {
      const d = distToSeg(point, s.a, s.b);
      if (d < bestED) {
        bestED = d;
        bestE = s;
      }
    }
    if (bestE) return { kind: 'edge', a: bestE.a, b: bestE.b, id: bestE.id };

    // 4) Osie (x=0 / y=0)
    const dx0 = Math.abs(point.x),
      dy0 = Math.abs(point.y);
    if (dy0 < th && dy0 <= dx0) return { kind: 'axisX' };
    if (dx0 < th) return { kind: 'axisY' };
    return null;
  }

  /** The diameter of a circle or arc, along the direction of the cursor. */
  private diameterOf(el: { c: Point2D; r: number; id: string }): Measured {
    const ang = Math.atan2(this.cursor.y - el.c.y, this.cursor.x - el.c.x) || 0;
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    return {
      p1: { x: el.c.x + d.x * el.r, y: el.c.y + d.y * el.r },
      p2: { x: el.c.x - d.x * el.r, y: el.c.y - d.y * el.r },
      refs: [el.id],
      kind: 'diameter',
    };
  }

  /** Reduces a pair of picks to the segment being measured, and what it refers to. */
  private measurePair(a: DimElement, b: DimElement): Measured | null {
    const refs = ['id' in a ? a.id : undefined, 'id' in b ? b.id : undefined].filter(
      (x): x is string => !!x
    );
    const pOf = (e: DimElement): Point2D | null =>
      e.kind === 'vertex' || e.kind === 'origin' ? e.p : null;
    const refPt = (e: DimElement): Point2D | null => (e.kind === 'edge' ? mid(e.a, e.b) : null);
    const geomPt = (e: DimElement): Point2D | null => pOf(e) ?? refPt(e);
    const axisOf = (e: DimElement): 'x' | 'y' | null =>
      e.kind === 'axisX' ? 'x' : e.kind === 'axisY' ? 'y' : null;

    // A dimension to an axis: the geometry is always p1 and the foot of the perpendicular is p2, which follows p1.
    const axA = axisOf(a),
      axB = axisOf(b);
    if (axA || axB) {
      const axis = (axA ?? axB) as 'x' | 'y';
      const gp = geomPt(axA ? b : a); // whichever of the two is not the axis
      if (!gp) return null;
      const foot = axis === 'x' ? { x: gp.x, y: 0 } : { x: 0, y: gp.y };
      return { p1: gp, p2: foot, refs, kind: 'distance', axis };
    }

    const pa = pOf(a),
      pb = pOf(b);
    const seg = (p1: Point2D, p2: Point2D): Measured => ({ p1, p2, refs, kind: 'distance' });
    if (pa && pb) return seg(pa, pb);
    const pointVsEdge = (p: Point2D, e: DimElement): Measured | null =>
      e.kind === 'edge' ? seg(p, projOnLine(p, e.a, e.b)) : null;
    if (pa && !pb) return pointVsEdge(pa, b);
    if (pb && !pa) {
      const r = pointVsEdge(pb, a);
      return r ? seg(r.p2, r.p1) : null;
    }

    const ra = refPt(a);
    if (a.kind === 'edge' && b.kind === 'edge' && ra) return seg(ra, projOnLine(ra, b.a, b.b));
    return null;
  }

  private ringSegs(c: Point2D, r: number, a0: number, a1: number): Seg[] {
    const N = 40;
    let sweep = a1 - a0;
    if (Math.abs(sweep) < 1e-6) sweep = Math.PI * 2;
    const segs: Seg[] = [];
    let prev = { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r };
    for (let i = 1; i <= N; i++) {
      const a = a0 + (i / N) * sweep;
      const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
      segs.push({ a: prev, b: p });
      prev = p;
    }
    return segs;
  }

  private highlightSegs(el: DimElement): Seg[] {
    const h = this.pxw * 5;
    if (el.kind === 'vertex' || el.kind === 'origin') {
      const p = el.p;
      return [
        { a: { x: p.x - h, y: p.y - h }, b: { x: p.x + h, y: p.y - h } },
        { a: { x: p.x + h, y: p.y - h }, b: { x: p.x + h, y: p.y + h } },
        { a: { x: p.x + h, y: p.y + h }, b: { x: p.x - h, y: p.y + h } },
        { a: { x: p.x - h, y: p.y + h }, b: { x: p.x - h, y: p.y - h } },
      ];
    }
    if (el.kind === 'edge') return [{ a: el.a, b: el.b }];
    if (el.kind === 'circle') return this.ringSegs(el.c, el.r, 0, Math.PI * 2);
    if (el.kind === 'arc') return this.ringSegs(el.c, el.r, el.a0, el.a1);
    const L = this.pxw * 60;
    if (el.kind === 'axisX')
      return [{ a: { x: this.cursor.x - L, y: 0 }, b: { x: this.cursor.x + L, y: 0 } }];
    return [{ a: { x: 0, y: this.cursor.y - L }, b: { x: 0, y: this.cursor.y + L } }];
  }

  private dimSegs(p1: Point2D, p2: Point2D, offset: number): Seg[] {
    const dx = p2.x - p1.x,
      dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset,
      ny = (dx / len) * offset;
    const d1 = { x: p1.x + nx, y: p1.y + ny },
      d2 = { x: p2.x + nx, y: p2.y + ny };
    return [
      { a: p1, b: d1 },
      { a: p2, b: d2 },
      { a: d1, b: d2 },
    ];
  }

  getPreview(): PreviewGeometry | null {
    const segs: Seg[] = [];
    for (const el of this.selected) segs.push(...this.highlightSegs(el));
    if (this.state === 'select' && this.hover) segs.push(...this.highlightSegs(this.hover));
    if (this.state === 'offset' && this.measured)
      segs.push(...this.dimSegs(this.measured.p1, this.measured.p2, this.offset));
    if (segs.length === 0) return null;
    return { type: 'ghost', points: [], ghostSegments: segs };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.state !== 'offset' || !this.measured) return [];
    const { p1, p2, kind } = this.measured;
    const dx = p2.x - p1.x,
      dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * this.offset,
      ny = (dx / len) * this.offset;
    return [
      {
        worldX: (p1.x + p2.x) / 2 + nx,
        worldY: (p1.y + p2.y) / 2 + ny,
        text: `${kind === 'diameter' ? '⌀ ' : ''}${dist(p1, p2).toFixed(2)}`,
        offsetY: -12,
        variant: 'primary',
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    this.cursor = point;
    this.pxw = ctx.pixelToWorld ?? 1;
    if (this.state === 'select') {
      const el = this.pickElement(point, ctx);
      if (!el) return;
      if (el.kind === 'edge') {
        this.measured = { p1: el.a, p2: el.b, refs: el.id ? [el.id] : [], kind: 'distance' };
        this.enterOffset();
        return;
      }
      if (el.kind === 'circle' || el.kind === 'arc') {
        this.measured = this.diameterOf(el);
        this.enterOffset();
        return;
      }
      // a vertex, the origin or an axis → the first of a pair
      this.selected.push(el);
      if (this.selected.length === 2) {
        const m = this.measurePair(this.selected[0], this.selected[1]);
        if (!m) {
          this.selected = [];
          return;
        }
        this.measured = m;
        this.enterOffset();
      }
    } else {
      this.commit(ctx);
    }
  }

  private enterOffset(): void {
    this.offset = 20;
    this.state = 'offset';
    this.selected = [];
    this.hover = null;
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    this.cursor = point;
    this.pxw = ctx.pixelToWorld ?? 1;
    if (this.state === 'select') {
      this.hover = this.pickElement(point, ctx);
    } else if (this.measured) {
      const { p1, p2 } = this.measured;
      const dx = p2.x - p1.x,
        dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      this.offset = (point.x - p1.x) * (-dy / len) + (point.y - p1.y) * (dx / len);
    }
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  commitDraft(ctx: ToolContext): boolean {
    if (this.state === 'offset') {
      this.commit(ctx);
      return true;
    }
    return false;
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    else if ((key === 'Enter' || key === 'Return') && this.state === 'offset') this.commit(ctx);
  }

  private commit(ctx: ToolContext): void {
    if (!this.measured) {
      this.resetSelection();
      return;
    }
    const { p1, p2, axis, kind } = this.measured;
    const isDiameter = kind === 'diameter';
    // Live anchors (not disabled ones) make the dimension follow the geometry:
    // `Project.refreshAnchoredDimensions` re-solves them whenever an entity
    // changes. `makeDimAnchor` picks the right feature — point-on (a parameter
    // or an angle) for edges and circles, an endpoint for vertices. For a
    // dimension to an axis only p1 is anchored; the refresh computes the foot
    // p2 from `axis`.
    const entities = ctx.project.entityRegistry.getAll();
    const th = this.pxw * 6;
    const anchor1 = makeDimAnchor(p1, entities, th);
    const anchor2 = axis ? null : makeDimAnchor(p2, entities, th);

    ctx.project.addEntity({
      type: 'dimension',
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      offset: this.offset || 20,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
      ...(anchor1 ? { anchor1 } : {}),
      ...(anchor2 ? { anchor2 } : {}),
      ...(axis ? { axis } : {}),
      // A diameter is drawn inside the circle, as a double-headed arrow through
      // the centre. The label starts just outside the circle and is then moved
      // by dragging the dimension.
      ...(isDiameter ? { dimType: 'diameter' as const, labelDist: (dist(p1, p2) / 2) * 1.35 } : {}),
    });

    this.resetSelection();
  }

  private resetSelection(): void {
    this.state = 'select';
    this.selected = [];
    this.measured = null;
    this.hover = null;
    this.offset = 20;
  }

  reset(): void {
    this.resetSelection();
  }
}
