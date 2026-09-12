import { makeDimAnchor, resolveDimAnchor } from './dimensionAnchor';
import type { Entity } from './types';

const base = {
  layerId: '0',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
  boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
};

const line: Entity = { ...base, id: 'L', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 } as Entity;
const rect: Entity = { ...base, id: 'R', type: 'rect', x: 0, y: 0, width: 10, height: 10 } as Entity;
const circle: Entity = { ...base, id: 'C', type: 'circle', cx: 0, cy: 0, radius: 5 } as Entity;
const arc: Entity = { ...base, id: 'A', type: 'arc', cx: 0, cy: 0, radius: 5, startAngle: 0, endAngle: Math.PI } as Entity;
const poly: Entity = { ...base, id: 'P', type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] } as Entity;
const closedPoly: Entity = { ...base, id: 'PC', type: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] } as Entity;
const freehand: Entity = { ...base, id: 'F', type: 'freehand', strokeWidth: 1, smooth: false, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] } as Entity;

describe('makeDimAnchor', () => {
  it('returns a center anchor when snap reports center', () => {
    const a = makeDimAnchor({ x: 0, y: 0 }, [circle], 1, { entityId: 'C', mode: 'center' });
    expect(a).toEqual({ entityId: 'C', kind: 'center' });
  });

  it('returns an endpoint anchor with nearest index', () => {
    const a = makeDimAnchor({ x: 10, y: 0 }, [line], 1, { entityId: 'L', mode: 'endpoint' });
    expect(a).toEqual({ entityId: 'L', kind: 'endpoint', index: 1 });
  });

  it('returns a midpoint anchor', () => {
    const a = makeDimAnchor({ x: 5, y: 0 }, [line], 1, { entityId: 'L', mode: 'midpoint' });
    expect(a).toEqual({ entityId: 'L', kind: 'midpoint', index: 0 });
  });

  it('ignores snap when entity is missing and falls back to point-on', () => {
    const a = makeDimAnchor({ x: 5, y: 0.5 }, [line], 2, { entityId: 'MISSING', mode: 'endpoint' });
    expect(a?.kind).toBe('point-on');
    expect(a?.entityId).toBe('L');
  });

  it('rides the nearest line outline as point-on within threshold', () => {
    const a = makeDimAnchor({ x: 5, y: 1 }, [line], 2);
    expect(a).toMatchObject({ entityId: 'L', kind: 'point-on' });
    expect(a?.t).toBeCloseTo(0.5);
  });

  it('rides a rect edge as point-on', () => {
    const a = makeDimAnchor({ x: 5, y: -0.5 }, [rect], 2);
    expect(a).toMatchObject({ entityId: 'R', kind: 'point-on' });
    expect(typeof a?.index).toBe('number');
  });

  it('rides a circle outline as point-on with an angle', () => {
    const a = makeDimAnchor({ x: 6, y: 0 }, [circle], 2);
    expect(a).toMatchObject({ entityId: 'C', kind: 'point-on' });
    expect(a?.angle).toBeCloseTo(0);
  });

  it('rides an arc outline as point-on', () => {
    const a = makeDimAnchor({ x: 0, y: 6 }, [arc], 2);
    expect(a).toMatchObject({ entityId: 'A', kind: 'point-on' });
  });

  it('rides a polyline segment as point-on with an index', () => {
    const a = makeDimAnchor({ x: 5, y: 0.5 }, [poly], 2);
    expect(a).toMatchObject({ entityId: 'P', kind: 'point-on', index: 0 });
  });

  it('handles closed polyline (extra closing segment)', () => {
    const a = makeDimAnchor({ x: 5, y: 5 }, [closedPoly], 2);
    expect(a?.entityId).toBe('PC');
  });

  it('rides a freehand outline', () => {
    const a = makeDimAnchor({ x: 2, y: 0.5 }, [freehand], 2);
    expect(a).toMatchObject({ entityId: 'F', kind: 'point-on' });
  });

  it('returns null when nothing is within threshold', () => {
    expect(makeDimAnchor({ x: 100, y: 100 }, [line], 1)).toBeNull();
  });

  it('picks the closest of multiple candidates', () => {
    // Point sits on the line but far from the (radius-5) circle's outline.
    const bigCircle: Entity = { ...base, id: 'BC', type: 'circle', cx: 0, cy: 0, radius: 20 } as Entity;
    const a = makeDimAnchor({ x: 5, y: 0.2 }, [line, bigCircle], 3);
    expect(a?.entityId).toBe('L');
  });

  it('center snap without a center-capable entity falls through to point-on', () => {
    // line has no center → the center branch is skipped, then point-on runs
    const a = makeDimAnchor({ x: 5, y: 0.5 }, [line], 2, { entityId: 'L', mode: 'center' });
    expect(a?.kind).toBe('point-on');
  });
});

describe('resolveDimAnchor', () => {
  it('returns null when entity is undefined', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'endpoint', index: 0 }, undefined)).toBeNull();
  });

  it('resolves endpoint anchor', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'endpoint', index: 1 }, line)).toEqual({ x: 10, y: 0 });
  });

  it('resolves endpoint anchor with default index 0', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'endpoint' }, line)).toEqual({ x: 0, y: 0 });
  });

  it('returns null for out-of-range endpoint index', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'endpoint', index: 9 }, line)).toBeNull();
  });

  it('resolves midpoint anchor', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'midpoint', index: 0 }, line)).toEqual({ x: 5, y: 0 });
  });

  it('resolves center anchor', () => {
    expect(resolveDimAnchor({ entityId: 'C', kind: 'center' }, circle)).toEqual({ x: 0, y: 0 });
  });

  it('resolves point-on for a line using t', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'point-on', t: 0.5 }, line)).toEqual({ x: 5, y: 0 });
  });

  it('point-on line uses default t=0.5', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'point-on' }, line)).toEqual({ x: 5, y: 0 });
  });

  it('resolves point-on for a polyline segment', () => {
    expect(resolveDimAnchor({ entityId: 'P', kind: 'point-on', index: 0, t: 0.5 }, poly)).toEqual({ x: 5, y: 0 });
  });

  it('returns null for point-on polyline with bad index', () => {
    expect(resolveDimAnchor({ entityId: 'P', kind: 'point-on', index: 99, t: 0.5 }, poly)).toBeNull();
  });

  it('resolves point-on for a rect edge', () => {
    const p = resolveDimAnchor({ entityId: 'R', kind: 'point-on', index: 0, t: 0.5 }, rect);
    expect(p).toEqual({ x: 5, y: 0 });
  });

  it('resolves point-on for a circle using angle', () => {
    const p = resolveDimAnchor({ entityId: 'C', kind: 'point-on', angle: 0 }, circle);
    expect(p!.x).toBeCloseTo(5);
    expect(p!.y).toBeCloseTo(0);
  });

  it('resolves point-on for an arc using angle', () => {
    const p = resolveDimAnchor({ entityId: 'A', kind: 'point-on', angle: Math.PI / 2 }, arc);
    expect(p!.x).toBeCloseTo(0);
    expect(p!.y).toBeCloseTo(5);
  });

  it('point-on circle uses default angle 0', () => {
    const p = resolveDimAnchor({ entityId: 'C', kind: 'point-on' }, circle);
    expect(p!.x).toBeCloseTo(5);
  });

  it('returns null for point-on on an unsupported entity type', () => {
    const text = { ...base, id: 'T', type: 'text', x: 0, y: 0, content: 'a', fontSize: 10, fontFamily: 'Arial', angle: 0 } as Entity;
    expect(resolveDimAnchor({ entityId: 'T', kind: 'point-on' }, text)).toBeNull();
  });

  it('returns null for an unknown anchor kind', () => {
    expect(resolveDimAnchor({ entityId: 'L', kind: 'bogus' as any }, line)).toBeNull();
  });

  it('midpoint on entity without midpoints returns null', () => {
    expect(resolveDimAnchor({ entityId: 'C', kind: 'midpoint', index: 0 }, circle)).toBeNull();
  });

  it('resolves endpoints for a rect', () => {
    expect(resolveDimAnchor({ entityId: 'R', kind: 'endpoint', index: 2 }, rect)).toEqual({ x: 10, y: 10 });
  });

  it('resolves endpoints for an arc', () => {
    const p = resolveDimAnchor({ entityId: 'A', kind: 'endpoint', index: 0 }, arc);
    expect(p!.x).toBeCloseTo(5);
    expect(p!.y).toBeCloseTo(0);
  });

  it('resolves a midpoint on a polyline', () => {
    // polyline P: (0,0)-(10,0)-(10,10); midpoint of segment 1 = (10,5)
    expect(resolveDimAnchor({ entityId: 'P', kind: 'midpoint', index: 1 }, poly)).toEqual({ x: 10, y: 5 });
  });

  it('resolves center for 3D primitives (cylinder/sphere/box)', () => {
    const cyl: Entity = { ...base, id: 'CY', type: 'cylinder3d', cx: 3, cy: 4, radius: 2, height: 5 } as Entity;
    const sph: Entity = { ...base, id: 'SP', type: 'sphere3d', cx: 7, cy: 8, radius: 2 } as Entity;
    const box: Entity = { ...base, id: 'BX', type: 'box3d', cx: 1, cy: 2, width: 4, depth: 6, height: 3 } as Entity;
    expect(resolveDimAnchor({ entityId: 'CY', kind: 'center' }, cyl)).toEqual({ x: 3, y: 4 });
    expect(resolveDimAnchor({ entityId: 'SP', kind: 'center' }, sph)).toEqual({ x: 7, y: 8 });
    expect(resolveDimAnchor({ entityId: 'BX', kind: 'center' }, box)).toEqual({ x: 1, y: 2 });
  });
});

describe('makeDimAnchor — unsupported outline types', () => {
  it('ignores entities with no closest-point support (text)', () => {
    const text: Entity = { ...base, id: 'T', type: 'text', x: 0, y: 0, content: 'hi', fontSize: 10, fontFamily: 'Arial', angle: 0 } as Entity;
    // Only a text entity nearby → closestPointOn returns null → overall null.
    expect(makeDimAnchor({ x: 0, y: 0 }, [text], 5)).toBeNull();
  });

  it('snap midpoint anchor on a polyline picks nearest midpoint index', () => {
    // midpoints of P are (5,0) and (10,5); click near (10,5)
    const a = makeDimAnchor({ x: 10, y: 5 }, [poly], 1, { entityId: 'P', mode: 'midpoint' });
    expect(a).toEqual({ entityId: 'P', kind: 'midpoint', index: 1 });
  });

  it('snap endpoint on an empty polyline yields no endpoint anchor, falls through', () => {
    const emptyPoly: Entity = { ...base, id: 'EP', type: 'polyline', closed: false, points: [] } as Entity;
    // endpoints([]) → [] → nearestIndex returns -1 → no endpoint anchor; nothing else near.
    const a = makeDimAnchor({ x: 100, y: 100 }, [emptyPoly], 1, { entityId: 'EP', mode: 'endpoint' });
    expect(a).toBeNull();
  });

  it('snap endpoint on a circle (no endpoints) falls through to point-on', () => {
    // circle has no endpoint features → nearestIndex over [] returns -1 → point-on outline instead.
    const a = makeDimAnchor({ x: 5, y: 0 }, [circle], 2, { entityId: 'C', mode: 'endpoint' });
    expect(a?.kind).toBe('point-on');
  });

  it('snap midpoint on a circle (no midpoints) falls through to point-on', () => {
    const a = makeDimAnchor({ x: 5, y: 0 }, [circle], 2, { entityId: 'C', mode: 'midpoint' });
    expect(a?.kind).toBe('point-on');
  });
});
