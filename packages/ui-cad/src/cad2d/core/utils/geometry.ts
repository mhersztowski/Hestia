import type { Point2D } from '../types';

/**
 * Intersection of two infinite lines through (ax1,ay1)→(ax2,ay2) and (bx1,by1)→(bx2,by2).
 * Returns null if parallel/coincident.
 * t ∈ [0,1] means intersection is within segment a; u ∈ [0,1] within segment b.
 */
export function lineLineIntersection(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): { x: number; y: number; t: number; u: number } | null {
  const d1x = ax2 - ax1, d1y = ay2 - ay1;
  const d2x = bx2 - bx1, d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = bx1 - ax1, dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  return { x: ax1 + t * d1x, y: ay1 + t * d1y, t, u };
}

/**
 * Signed perpendicular distance of point (px,py) to directed line (ax,ay)→(bx,by).
 * Positive = left of direction, negative = right.
 */
export function signedDistPointToLine(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return 0;
  return ((py - ay) * dx - (px - ax) * dy) / len;
}

/** Closest point on segment (ax,ay)→(bx,by) to point (px,py). Returns t∈[0,1] and projected point. */
export function closestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; t: number } {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

/** Distance from point to segment. */
export function distPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const c = closestPointOnSegment(px, py, ax, ay, bx, by);
  return Math.sqrt((px - c.x) ** 2 + (py - c.y) ** 2);
}

/**
 * Intersection points of a line segment (x1,y1)→(x2,y2) with a circle (cx,cy,r).
 * Only returns points where the parameter t is within [0,1] (on the segment).
 */
export function lineSegmentCircleIntersections(
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number,
  r: number,
): Array<{ point: Point2D; t: number }> {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sqrtDisc = Math.sqrt(disc);
  const results: Array<{ point: Point2D; t: number }> = [];
  for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
    if (t >= -1e-6 && t <= 1 + 1e-6) {
      const tc = Math.max(0, Math.min(1, t));
      results.push({ point: { x: x1 + tc * dx, y: y1 + tc * dy }, t: tc });
    }
  }
  return results;
}

/**
 * Circumscribed circle (center + radius) from 3 points. Returns null if collinear.
 */
export function circumscribedCircle(
  p1: Point2D, p2: Point2D, p3: Point2D,
): { cx: number; cy: number; radius: number } | null {
  const ax = p2.x - p1.x, ay = p2.y - p1.y;
  const bx = p3.x - p1.x, by = p3.y - p1.y;
  const D = 2 * (ax * by - ay * bx);
  if (Math.abs(D) < 1e-9) return null;
  const ux = (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / D;
  const uy = (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / D;
  const cx = p1.x + ux, cy = p1.y + uy;
  return { cx, cy, radius: Math.sqrt(ux * ux + uy * uy) };
}

/** Normalize angle to [0, 2π). */
export function normalizeAngle(a: number): number {
  const TWO_PI = Math.PI * 2;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Offset line segment by signed perpendicular distance d.
 * Positive d = offset to the left of the line direction.
 */
export function offsetLineCoords(
  x1: number, y1: number,
  x2: number, y2: number,
  d: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { x1, y1, x2, y2 };
  const nx = -dy / len, ny = dx / len; // unit left-normal
  return { x1: x1 + nx * d, y1: y1 + ny * d, x2: x2 + nx * d, y2: y2 + ny * d };
}

/** Euclidean distance between two points. */
export function dist2d(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
