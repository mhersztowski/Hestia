/**
 * "Intelligent" dimension anchors: resolve a dimension endpoint to a live point
 * on another entity so it follows the shape as it moves / is reshaped.
 */
import type { Point2D } from '../types';
import type { DimAnchor, Entity } from './types';
import { closestPointOnSegment } from '../utils/geometry';

// ── feature point extractors (mirror SnapEngine) ────────────────────────────────

function endpoints(e: Entity): Point2D[] {
  switch (e.type) {
    case 'line':
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ];
    case 'polyline':
    case 'freehand':
      return e.points.length ? [e.points[0], e.points[e.points.length - 1]] : [];
    case 'rect':
      return [
        { x: e.x, y: e.y },
        { x: e.x + e.width, y: e.y },
        { x: e.x + e.width, y: e.y + e.height },
        { x: e.x, y: e.y + e.height },
      ];
    case 'arc':
      return [
        {
          x: e.cx + e.radius * Math.cos(e.startAngle),
          y: e.cy + e.radius * Math.sin(e.startAngle),
        },
        { x: e.cx + e.radius * Math.cos(e.endAngle), y: e.cy + e.radius * Math.sin(e.endAngle) },
      ];
    case 'point':
      return [{ x: e.x, y: e.y }];
    default:
      return [];
  }
}

function midpoints(e: Entity): Point2D[] {
  switch (e.type) {
    case 'line':
      return [{ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }];
    case 'polyline': {
      const m: Point2D[] = [];
      for (let i = 0; i < e.points.length - 1; i++)
        m.push({
          x: (e.points[i].x + e.points[i + 1].x) / 2,
          y: (e.points[i].y + e.points[i + 1].y) / 2,
        });
      return m;
    }
    default:
      return [];
  }
}

function center(e: Entity): Point2D | null {
  switch (e.type) {
    case 'circle':
    case 'arc':
      return { x: e.cx, y: e.cy };
    case 'rect':
      return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
    case 'cylinder3d':
    case 'sphere3d':
      return { x: e.cx, y: e.cy };
    case 'box3d':
      return { x: e.cx, y: e.cy };
    default:
      return null;
  }
}

// Edges of a rect as [a, b] segments, indexed 0..3.
function rectEdge(e: Extract<Entity, { type: 'rect' }>, edge: number): [Point2D, Point2D] {
  const c = [
    { x: e.x, y: e.y },
    { x: e.x + e.width, y: e.y },
    { x: e.x + e.width, y: e.y + e.height },
    { x: e.x, y: e.y + e.height },
  ];
  return [c[edge % 4], c[(edge + 1) % 4]];
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── closest point on an entity's outline → a point-on anchor ─────────────────────

function closestPointOn(
  e: Entity,
  p: Point2D
): { point: Point2D; dist: number; anchor: DimAnchor } | null {
  switch (e.type) {
    case 'line': {
      const c = closestPointOnSegment(p.x, p.y, e.x1, e.y1, e.x2, e.y2);
      return { point: c, dist: dist(p, c), anchor: { entityId: e.id, kind: 'point-on', t: c.t } };
    }
    case 'polyline':
    case 'freehand': {
      const pts = e.points;
      let best: { point: Point2D; dist: number; anchor: DimAnchor } | null = null;
      const segCount = e.type === 'polyline' && e.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i],
          b = pts[(i + 1) % pts.length];
        const c = closestPointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y);
        const d = dist(p, c);
        if (!best || d < best.dist)
          best = {
            point: c,
            dist: d,
            anchor: { entityId: e.id, kind: 'point-on', index: i, t: c.t },
          };
      }
      return best;
    }
    case 'rect': {
      let best: { point: Point2D; dist: number; anchor: DimAnchor } | null = null;
      for (let edge = 0; edge < 4; edge++) {
        const [a, b] = rectEdge(e, edge);
        const c = closestPointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y);
        const d = dist(p, c);
        if (!best || d < best.dist)
          best = {
            point: c,
            dist: d,
            anchor: { entityId: e.id, kind: 'point-on', index: edge, t: c.t },
          };
      }
      return best;
    }
    case 'circle': {
      const ang = Math.atan2(p.y - e.cy, p.x - e.cx);
      const point = { x: e.cx + e.radius * Math.cos(ang), y: e.cy + e.radius * Math.sin(ang) };
      return {
        point,
        dist: Math.abs(dist(p, { x: e.cx, y: e.cy }) - e.radius),
        anchor: { entityId: e.id, kind: 'point-on', angle: ang },
      };
    }
    case 'arc': {
      const ang = Math.atan2(p.y - e.cy, p.x - e.cx);
      const point = { x: e.cx + e.radius * Math.cos(ang), y: e.cy + e.radius * Math.sin(ang) };
      return {
        point,
        dist: Math.abs(dist(p, { x: e.cx, y: e.cy }) - e.radius),
        anchor: { entityId: e.id, kind: 'point-on', angle: ang },
      };
    }
    case 'point': {
      const q = { x: e.x, y: e.y };
      return { point: q, dist: dist(p, q), anchor: { entityId: e.id, kind: 'endpoint', index: 0 } };
    }
    default:
      return null;
  }
}

// ── public API ──────────────────────────────────────────────────────────────────

/**
 * Build the best anchor for a clicked point. Prefers a snapped feature
 * (endpoint/midpoint/center) when the SnapResult reports one; otherwise rides
 * the nearest entity outline (point-on) within `threshold`. Returns null when
 * nothing is close enough — the caller then uses a literal coordinate.
 */
export function makeDimAnchor(
  point: Point2D,
  entities: Entity[],
  threshold: number,
  snap?: { entityId?: string; mode?: string }
): DimAnchor | null {
  if (
    snap?.entityId &&
    (snap.mode === 'endpoint' || snap.mode === 'midpoint' || snap.mode === 'center')
  ) {
    const e = entities.find((en) => en.id === snap.entityId);
    if (e) {
      if (snap.mode === 'center' && center(e)) return { entityId: e.id, kind: 'center' };
      if (snap.mode === 'endpoint') {
        const idx = nearestIndex(endpoints(e), point);
        if (idx >= 0) return { entityId: e.id, kind: 'endpoint', index: idx };
      }
      if (snap.mode === 'midpoint') {
        const idx = nearestIndex(midpoints(e), point);
        if (idx >= 0) return { entityId: e.id, kind: 'midpoint', index: idx };
      }
    }
  }

  // The nearest feature within `threshold`: an endpoint or a centre wins over a
  // point-on-the-shape (they are steadier, and they let a circle's or an arc's centre be anchored
  // oraz encje typu point).
  const cands: Array<{ dist: number; anchor: DimAnchor }> = [];
  for (const e of entities) {
    const eps = endpoints(e);
    for (let i = 0; i < eps.length; i++) {
      const d = dist(eps[i], point);
      if (d <= threshold)
        cands.push({ dist: d, anchor: { entityId: e.id, kind: 'endpoint', index: i } });
    }
    const c = center(e);
    if (c) {
      const d = dist(c, point);
      if (d <= threshold) cands.push({ dist: d, anchor: { entityId: e.id, kind: 'center' } });
    }
    const po = closestPointOn(e, point);
    if (po && po.dist <= threshold) cands.push({ dist: po.dist, anchor: po.anchor });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.dist - b.dist);
  return cands[0].anchor;
}

function nearestIndex(pts: Point2D[], p: Point2D): number {
  let bi = -1,
    bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], p);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

/** Resolve an anchor to a live coordinate using the referenced entity (or null). */
export function resolveDimAnchor(anchor: DimAnchor, entity: Entity | undefined): Point2D | null {
  if (!entity) return null;
  switch (anchor.kind) {
    case 'endpoint':
      return endpoints(entity)[anchor.index ?? 0] ?? null;
    case 'midpoint':
      return midpoints(entity)[anchor.index ?? 0] ?? null;
    case 'center':
      return center(entity);
    case 'point-on': {
      const t = anchor.t ?? 0.5;
      switch (entity.type) {
        case 'line':
          return {
            x: entity.x1 + t * (entity.x2 - entity.x1),
            y: entity.y1 + t * (entity.y2 - entity.y1),
          };
        case 'polyline':
        case 'freehand': {
          const pts = entity.points;
          const i = anchor.index ?? 0;
          const a = pts[i],
            b = pts[(i + 1) % pts.length];
          if (!a || !b) return null;
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        }
        case 'rect': {
          const [a, b] = rectEdge(entity, anchor.index ?? 0);
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        }
        case 'circle':
        case 'arc': {
          const ang = anchor.angle ?? 0;
          return {
            x: entity.cx + entity.radius * Math.cos(ang),
            y: entity.cy + entity.radius * Math.sin(ang),
          };
        }
        default:
          return null;
      }
    }
    default:
      return null;
  }
}
