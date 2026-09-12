import type { Point2D } from '../core';
import { sampleSpline } from './spline';

const ARC_SEGS = 24;
const TWO_PI = Math.PI * 2;
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

/** The outline of a straight slot — two centres and a radius. */
export function slotOutline(a: Point2D, b: Point2D, r: number): Point2D[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const baseAngle = Math.atan2(dy / len, dx / len);
  const pts: Point2D[] = [];
  for (let i = 0; i <= ARC_SEGS; i++) { const ang = baseAngle + Math.PI / 2 - (i / ARC_SEGS) * Math.PI; pts.push({ x: b.x + Math.cos(ang) * r, y: b.y + Math.sin(ang) * r }); }
  for (let i = 0; i <= ARC_SEGS; i++) { const ang = baseAngle - Math.PI / 2 - (i / ARC_SEGS) * Math.PI; pts.push({ x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r }); }
  return pts;
}

/** The outline of an arc slot: centre C, a start and an end point on the arc's axis, and width w. */
export function arcSlotOutline(center: Point2D, startPt: Point2D, endPt: Point2D, w: number): Point2D[] {
  const rc = Math.hypot(startPt.x - center.x, startPt.y - center.y);
  const a1 = Math.atan2(startPt.y - center.y, startPt.x - center.x);
  const a2 = Math.atan2(endPt.y - center.y, endPt.x - center.x);
  const sweep = norm(a2 - a1) || 0.0001;
  const rOut = rc + w, rIn = Math.max(0.001, rc - w);
  const pt = (ang: number, r: number): Point2D => ({ x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r });
  const arcPts = (from: number, sw: number, r: number): Point2D[] => {
    const n = Math.max(ARC_SEGS, Math.ceil((Math.abs(sw) / TWO_PI) * ARC_SEGS * 4));
    const out: Point2D[] = [];
    for (let i = 0; i <= n; i++) out.push(pt(from + (i / n) * sw, r));
    return out;
  };
  const pts: Point2D[] = [];
  pts.push(...arcPts(a1, sweep, rOut));
  const eC = pt(a2, rc);
  for (let i = 0; i <= ARC_SEGS; i++) { const ang = a2 + (i / ARC_SEGS) * Math.PI; pts.push({ x: eC.x + Math.cos(ang) * w, y: eC.y + Math.sin(ang) * w }); }
  pts.push(...arcPts(a2, -sweep, rIn));
  const sC = pt(a1, rc);
  for (let i = 0; i <= ARC_SEGS; i++) { const ang = a1 + Math.PI + (i / ARC_SEGS) * Math.PI; pts.push({ x: sC.x + Math.cos(ang) * w, y: sC.y + Math.sin(ang) * w }); }
  return pts;
}

export interface Construction {
  kind: 'slot' | 'arcSlot' | 'bspline';
  ctrl: Point2D[];
  radius?: number;
  interpolating?: boolean;
  periodic?: boolean;
}

/** Rebuilds a polyline's points from the shape's parameters, after a control point has been dragged. */
export function rebuildConstruction(c: Construction): Point2D[] {
  if (c.kind === 'slot' && c.ctrl.length >= 2) return slotOutline(c.ctrl[0], c.ctrl[1], Math.max(0.01, c.radius ?? 1));
  if (c.kind === 'arcSlot' && c.ctrl.length >= 3) return arcSlotOutline(c.ctrl[0], c.ctrl[1], c.ctrl[2], Math.max(0.01, c.radius ?? 1));
  if (c.kind === 'bspline' && c.ctrl.length >= 2) return sampleSpline(c.ctrl, { interpolating: !!c.interpolating, periodic: !!c.periodic });
  return c.ctrl;
}
