import {
  lineLineIntersection,
  signedDistPointToLine,
  closestPointOnSegment,
  distPointToSegment,
  lineSegmentCircleIntersections,
  circumscribedCircle,
  normalizeAngle,
  offsetLineCoords,
  dist2d,
} from './geometry';

describe('geometry utils', () => {
  describe('lineLineIntersection', () => {
    it('finds the intersection of two crossing segments', () => {
      const r = lineLineIntersection(0, 0, 10, 10, 0, 10, 10, 0);
      expect(r).not.toBeNull();
      expect(r!.x).toBeCloseTo(5);
      expect(r!.y).toBeCloseTo(5);
      expect(r!.t).toBeCloseTo(0.5);
      expect(r!.u).toBeCloseTo(0.5);
    });

    it('returns null for parallel lines', () => {
      expect(lineLineIntersection(0, 0, 10, 0, 0, 5, 10, 5)).toBeNull();
    });

    it('returns null for coincident (zero direction) lines', () => {
      expect(lineLineIntersection(0, 0, 0, 0, 0, 0, 0, 0)).toBeNull();
    });
  });

  describe('signedDistPointToLine', () => {
    it('is positive to the left and negative to the right', () => {
      expect(signedDistPointToLine(0, 1, 0, 0, 10, 0)).toBeCloseTo(1);
      expect(signedDistPointToLine(0, -1, 0, 0, 10, 0)).toBeCloseTo(-1);
    });

    it('returns 0 for a degenerate line', () => {
      expect(signedDistPointToLine(5, 5, 2, 2, 2, 2)).toBe(0);
    });
  });

  describe('closestPointOnSegment', () => {
    it('projects onto the middle of the segment', () => {
      const c = closestPointOnSegment(5, 5, 0, 0, 10, 0);
      expect(c.x).toBeCloseTo(5);
      expect(c.y).toBeCloseTo(0);
      expect(c.t).toBeCloseTo(0.5);
    });

    it('clamps to the start endpoint', () => {
      const c = closestPointOnSegment(-5, 0, 0, 0, 10, 0);
      expect(c.t).toBe(0);
      expect(c.x).toBe(0);
    });

    it('clamps to the end endpoint', () => {
      const c = closestPointOnSegment(20, 0, 0, 0, 10, 0);
      expect(c.t).toBe(1);
      expect(c.x).toBe(10);
    });

    it('returns start for a zero-length segment', () => {
      const c = closestPointOnSegment(5, 5, 3, 3, 3, 3);
      expect(c).toEqual({ x: 3, y: 3, t: 0 });
    });
  });

  describe('distPointToSegment', () => {
    it('measures perpendicular distance', () => {
      expect(distPointToSegment(5, 4, 0, 0, 10, 0)).toBeCloseTo(4);
    });
  });

  describe('lineSegmentCircleIntersections', () => {
    it('finds two intersection points through a circle', () => {
      const hits = lineSegmentCircleIntersections(-10, 0, 10, 0, 0, 0, 5);
      expect(hits).toHaveLength(2);
      const xs = hits.map(h => h.point.x).sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(-5);
      expect(xs[1]).toBeCloseTo(5);
    });

    it('returns empty when the segment misses the circle', () => {
      expect(lineSegmentCircleIntersections(-10, 20, 10, 20, 0, 0, 5)).toHaveLength(0);
    });

    it('returns empty for a zero-length segment', () => {
      expect(lineSegmentCircleIntersections(1, 1, 1, 1, 0, 0, 5)).toHaveLength(0);
    });

    it('only returns hits within the segment bounds', () => {
      // Segment starts inside and exits: only one t in [0,1]
      const hits = lineSegmentCircleIntersections(0, 0, 10, 0, 0, 0, 5);
      expect(hits).toHaveLength(1);
      expect(hits[0].point.x).toBeCloseTo(5);
    });
  });

  describe('circumscribedCircle', () => {
    it('computes the circle through 3 points', () => {
      const c = circumscribedCircle({ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 });
      expect(c).not.toBeNull();
      expect(c!.cx).toBeCloseTo(0);
      expect(c!.cy).toBeCloseTo(0);
      expect(c!.radius).toBeCloseTo(1);
    });

    it('returns null for collinear points', () => {
      expect(circumscribedCircle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
    });
  });

  describe('normalizeAngle', () => {
    it('wraps negative angles into [0, 2π)', () => {
      expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    });
    it('wraps angles above 2π', () => {
      expect(normalizeAngle(2 * Math.PI + 1)).toBeCloseTo(1);
    });
    it('keeps in-range angles', () => {
      expect(normalizeAngle(1)).toBeCloseTo(1);
    });
  });

  describe('offsetLineCoords', () => {
    it('offsets left by the perpendicular distance', () => {
      const o = offsetLineCoords(0, 0, 10, 0, 2);
      expect(o.y1).toBeCloseTo(2);
      expect(o.y2).toBeCloseTo(2);
      expect(o.x1).toBeCloseTo(0);
      expect(o.x2).toBeCloseTo(10);
    });

    it('returns input for a zero-length line', () => {
      const o = offsetLineCoords(3, 3, 3, 3, 5);
      expect(o).toEqual({ x1: 3, y1: 3, x2: 3, y2: 3 });
    });
  });

  describe('dist2d', () => {
    it('computes euclidean distance', () => {
      expect(dist2d({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
  });
});
