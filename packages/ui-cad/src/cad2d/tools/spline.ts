import type { Point2D } from '../core';

export interface SplineOpts {
  /** true = interpolating (through the points, "by knots"); false = approximating ("by control points"). */
  interpolating: boolean;
  /** true = closed (periodic). */
  periodic: boolean;
  /** samples per segment */
  samples?: number;
}

/** Cubic Catmull-Rom (interpolating) at t ∈ [0,1], over four points. */
function catmullRom(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** Uniform cubic B-spline (approximating) at t ∈ [0,1], over four points. */
function bsplineSeg(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t, t3 = t2 * t;
  const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
  const b1 = (3 * t3 - 6 * t2 + 4) / 6;
  const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  const b3 = t3 / 6;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
}

/**
 * Samples the spline over `pts` into a dense list of points, which is what gets
 * stored as a polyline. An open spline is pinned to its ends by doubling the
 * outermost points.
 */
export function sampleSpline(pts: Point2D[], opts: SplineOpts): Point2D[] {
  const n = pts.length;
  if (n < 2) return [...pts];
  if (n === 2 && !opts.periodic) return [...pts];

  const samples = opts.samples ?? 16;
  const seg = opts.interpolating ? catmullRom : bsplineSeg;

  // The control list, closed or pinned as the mode requires.
  const cps: Point2D[] = opts.periodic
    ? [pts[n - 1], ...pts, pts[0], pts[1]]        // wrapped around, for a loop
    : [pts[0], ...pts, pts[n - 1]];               // pinned to the ends

  const out: Point2D[] = [];
  const last = cps.length - 3;                     // ostatni indeks p0 segmentu
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [cps[i], cps[i + 1], cps[i + 2], cps[i + 3]];
    for (let s = 0; s < samples; s++) out.push(seg(p0, p1, p2, p3, s / samples));
  }
  // Domknij ostatni punkt
  if (opts.periodic) out.push(out[0]);
  else out.push(pts[n - 1]);
  return out;
}
