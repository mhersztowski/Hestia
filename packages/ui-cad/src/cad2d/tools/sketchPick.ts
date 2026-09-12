import type { Entity, Point2D } from '../core';

export type Seg = { a: Point2D; b: Point2D };
/**
 * Wybrany pod-element szkicu: `ref` w formacie solvera (`id`, `id.p1`, `id.center`),
 * plus the geometry to highlight — `segs` for an edge, `vertex` for a vertex.
 */
export type SubPick = { ref: string; entityId: string; segs: Seg[]; vertex?: Point2D };

function dist(a: Point2D, b: Point2D): number { return Math.hypot(a.x - b.x, a.y - b.y); }

function distToSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** A square marker around a point, to highlight a vertex. */
export function vertexSquare(p: Point2D, h: number): Seg[] {
  return [
    { a: { x: p.x - h, y: p.y - h }, b: { x: p.x + h, y: p.y - h } },
    { a: { x: p.x + h, y: p.y - h }, b: { x: p.x + h, y: p.y + h } },
    { a: { x: p.x + h, y: p.y + h }, b: { x: p.x - h, y: p.y + h } },
    { a: { x: p.x - h, y: p.y + h }, b: { x: p.x - h, y: p.y - h } },
  ];
}

type Vtx = { p: Point2D; ref: string; id: string };
type Edg = { a: Point2D; b: Point2D; id: string };

function vertices(entities: Entity[]): Vtx[] {
  const out: Vtx[] = [];
  for (const e of entities) {
    if (!e.visible || e.type === 'dimension') continue;
    switch (e.type) {
      case 'line': out.push({ p: { x: e.x1, y: e.y1 }, ref: `${e.id}.p1`, id: e.id }, { p: { x: e.x2, y: e.y2 }, ref: `${e.id}.p2`, id: e.id }); break;
      case 'circle': out.push({ p: { x: e.cx, y: e.cy }, ref: `${e.id}.center`, id: e.id }); break;
      case 'arc': out.push({ p: { x: e.cx, y: e.cy }, ref: `${e.id}.center`, id: e.id }); break;
      case 'point': out.push({ p: { x: e.x, y: e.y }, ref: e.id, id: e.id }); break;
      case 'rect': out.push(
        { p: { x: e.x, y: e.y }, ref: e.id, id: e.id },
        { p: { x: e.x + e.width, y: e.y }, ref: e.id, id: e.id },
        { p: { x: e.x + e.width, y: e.y + e.height }, ref: e.id, id: e.id },
        { p: { x: e.x, y: e.y + e.height }, ref: e.id, id: e.id }); break;
      case 'polyline': for (const p of e.points) out.push({ p, ref: e.id, id: e.id }); break;
    }
  }
  return out;
}

function edges(entities: Entity[]): Edg[] {
  const out: Edg[] = [];
  for (const e of entities) {
    if (!e.visible || e.type === 'dimension') continue;
    switch (e.type) {
      case 'line': out.push({ a: { x: e.x1, y: e.y1 }, b: { x: e.x2, y: e.y2 }, id: e.id }); break;
      case 'rect': {
        const c = [{ x: e.x, y: e.y }, { x: e.x + e.width, y: e.y }, { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height }];
        for (let i = 0; i < 4; i++) out.push({ a: c[i], b: c[(i + 1) % 4], id: e.id });
        break;
      }
      case 'polyline': { const n = e.points.length; const last = e.closed ? n : n - 1; for (let i = 0; i < last; i++) out.push({ a: e.points[i], b: e.points[(i + 1) % n], id: e.id }); break; }
    }
  }
  return out;
}

/** Sub-elements inside a rubber-band rectangle: vertices, and edges that lie entirely within it. */
export function subElementsInRect(entities: Entity[], min: Point2D, max: Point2D, markerHalf: number): SubPick[] {
  const inside = (p: Point2D) => p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
  const out: SubPick[] = [];
  for (const v of vertices(entities)) if (inside(v.p)) out.push({ ref: v.ref, entityId: v.id, segs: vertexSquare(v.p, markerHalf), vertex: v.p });
  for (const s of edges(entities)) if (inside(s.a) && inside(s.b)) out.push({ ref: s.id, entityId: s.id, segs: [{ a: s.a, b: s.b }] });
  return out;
}

/** The nearest sub-element within `th` — a vertex wins over an edge. */
export function pickSub(point: Point2D, entities: Entity[], th: number): SubPick | null {
  const h = th * 0.42;
  let bv: Vtx | null = null, bvd = th;
  for (const v of vertices(entities)) { const d = dist(point, v.p); if (d < bvd) { bvd = d; bv = v; } }
  if (bv) return { ref: bv.ref, entityId: bv.id, segs: vertexSquare(bv.p, h), vertex: bv.p };

  let be: Edg | null = null, bed = th;
  for (const s of edges(entities)) { const d = distToSeg(point, s.a, s.b); if (d < bed) { bed = d; be = s; } }
  if (be) return { ref: be.id, entityId: be.id, segs: [{ a: be.a, b: be.b }] };

  // The axes come last — referred to as `#axisX` and `#axisY`.
  const L = th * 6;
  if (Math.abs(point.y) < th && Math.abs(point.y) <= Math.abs(point.x))
    return { ref: '#axisX', entityId: '#axisX', segs: [{ a: { x: point.x - L, y: 0 }, b: { x: point.x + L, y: 0 } }] };
  if (Math.abs(point.x) < th)
    return { ref: '#axisY', entityId: '#axisY', segs: [{ a: { x: 0, y: point.y - L }, b: { x: 0, y: point.y + L } }] };
  return null;
}
