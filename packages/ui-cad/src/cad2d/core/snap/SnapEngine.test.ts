import { SnapEngine } from './SnapEngine';
import type { Entity } from '../entity/types';

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

function ent(over: Partial<Entity>): Entity {
  return { ...base, id: over.id ?? 'e', ...over } as Entity;
}

const hLine = ent({ id: 'L', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 } as Partial<Entity>);

describe('SnapEngine mode management', () => {
  it('has the expected default enabled modes', () => {
    const s = new SnapEngine();
    expect(s.isEnabled('grid')).toBe(true);
    expect(s.isEnabled('endpoint')).toBe(true);
    expect(s.isEnabled('midpoint')).toBe(true);
    expect(s.isEnabled('center')).toBe(true);
    expect(s.isEnabled('intersection')).toBe(true);
    expect(s.isEnabled('nearest')).toBe(false);
    expect(new Set(s.getEnabledModes())).toEqual(new Set(['grid', 'endpoint', 'midpoint', 'center', 'intersection']));
  });

  it('enable/disable/isEnabled work', () => {
    const s = new SnapEngine();
    s.disableMode('grid');
    expect(s.isEnabled('grid')).toBe(false);
    s.enableMode('perpendicular');
    expect(s.isEnabled('perpendicular')).toBe(true);
  });

  it('get/setGridSize', () => {
    const s = new SnapEngine();
    expect(s.getGridSize()).toBe(10);
    s.setGridSize(25);
    expect(s.getGridSize()).toBe(25);
  });
});

describe('SnapEngine.snap', () => {
  it('snaps to a line endpoint', () => {
    const s = new SnapEngine();
    const r = s.snap({ x: 2, y: 0 }, [hLine]);
    expect(r.mode).toBe('endpoint');
    expect(r.entityId).toBe('L');
    expect(r.point).toEqual({ x: 0, y: 0 });
  });

  it('snaps to a line midpoint', () => {
    const s = new SnapEngine();
    const r = s.snap({ x: 50, y: 1 }, [hLine]);
    expect(r.mode).toBe('midpoint');
    expect(r.point).toEqual({ x: 50, y: 0 });
  });

  it('snaps to a circle center', () => {
    const s = new SnapEngine();
    const circle = ent({ id: 'C', type: 'circle', cx: 0, cy: 0, radius: 30 } as Partial<Entity>);
    const r = s.snap({ x: 1, y: 0 }, [circle]);
    expect(r.mode).toBe('center');
    expect(r.point).toEqual({ x: 0, y: 0 });
  });

  it('snaps to an arc center', () => {
    const s = new SnapEngine();
    s.disableMode('endpoint');
    const arc = ent({ id: 'A', type: 'arc', cx: 5, cy: 5, radius: 30, startAngle: 0, endAngle: Math.PI } as Partial<Entity>);
    const r = s.snap({ x: 6, y: 5 }, [arc]);
    expect(r.mode).toBe('center');
    expect(r.point).toEqual({ x: 5, y: 5 });
  });

  it('snaps to a rect center', () => {
    const s = new SnapEngine();
    s.disableMode('endpoint');
    const rect = ent({ id: 'R', type: 'rect', x: 0, y: 0, width: 20, height: 20 } as Partial<Entity>);
    const r = s.snap({ x: 10, y: 11 }, [rect]);
    expect(r.mode).toBe('center');
    expect(r.point).toEqual({ x: 10, y: 10 });
  });

  it('snaps to rect endpoints/corners', () => {
    const s = new SnapEngine();
    const rect = ent({ id: 'R', type: 'rect', x: 0, y: 0, width: 20, height: 20 } as Partial<Entity>);
    const r = s.snap({ x: 20, y: 2 }, [rect]);
    expect(r.mode).toBe('endpoint');
    expect(r.point).toEqual({ x: 20, y: 0 });
  });

  it('snaps to arc endpoints', () => {
    const s = new SnapEngine();
    s.disableMode('center');
    const arc = ent({ id: 'A', type: 'arc', cx: 0, cy: 0, radius: 10, startAngle: 0, endAngle: Math.PI } as Partial<Entity>);
    const r = s.snap({ x: 10, y: 1 }, [arc]);
    expect(r.mode).toBe('endpoint');
    expect(r.point.x).toBeCloseTo(10);
    expect(r.point.y).toBeCloseTo(0);
  });

  it('snaps to polyline endpoints and midpoints', () => {
    const s = new SnapEngine();
    const poly = ent({ id: 'P', type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }] } as Partial<Entity>);
    const endHit = s.snap({ x: 40, y: 39 }, [poly]);
    expect(endHit.mode).toBe('endpoint');
    expect(endHit.point).toEqual({ x: 40, y: 40 });
    const midHit = s.snap({ x: 20, y: 1 }, [poly]);
    expect(midHit.mode).toBe('midpoint');
    expect(midHit.point).toEqual({ x: 20, y: 0 });
  });

  it('snaps to freehand endpoints', () => {
    const s = new SnapEngine();
    const fh = ent({ id: 'F', type: 'freehand', strokeWidth: 1, smooth: false, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 50, y: 50 }] } as Partial<Entity>);
    const r = s.snap({ x: 1, y: 0 }, [fh]);
    expect(r.mode).toBe('endpoint');
    expect(r.point).toEqual({ x: 0, y: 0 });
  });

  it('handles empty polyline (no endpoints)', () => {
    const s = new SnapEngine();
    s.disableMode('grid');
    const poly = ent({ id: 'P', type: 'polyline', closed: false, points: [] } as Partial<Entity>);
    const r = s.snap({ x: 5, y: 5 }, [poly]);
    expect(r.mode).toBe('nearest');
  });

  it('finds a line-line intersection', () => {
    const s = new SnapEngine();
    // isolate intersection so midpoints/endpoints do not win
    s.disableMode('endpoint');
    s.disableMode('midpoint');
    s.disableMode('center');
    const a = ent({ id: 'A', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 } as Partial<Entity>);
    const b = ent({ id: 'B', type: 'line', x1: 0, y1: 10, x2: 10, y2: 0 } as Partial<Entity>);
    const r = s.snap({ x: 5, y: 5 }, [a, b]);
    expect(r.mode).toBe('intersection');
    expect(r.point.x).toBeCloseTo(5);
    expect(r.point.y).toBeCloseTo(5);
    expect(r.entityId).toBeUndefined();
  });

  it('finds a line-circle intersection (line, circle order)', () => {
    const s = new SnapEngine();
    s.disableMode('endpoint');
    s.disableMode('midpoint');
    s.disableMode('center');
    const line = ent({ id: 'L', type: 'line', x1: -10, y1: 0, x2: 10, y2: 0 } as Partial<Entity>);
    const circle = ent({ id: 'C', type: 'circle', cx: 0, cy: 0, radius: 5 } as Partial<Entity>);
    const r = s.snap({ x: 5, y: 1 }, [line, circle]);
    expect(r.mode).toBe('intersection');
    expect(r.point.x).toBeCloseTo(5);
    expect(r.point.y).toBeCloseTo(0);
  });

  it('finds a line-circle intersection (circle, line order)', () => {
    const s = new SnapEngine();
    s.disableMode('endpoint');
    s.disableMode('midpoint');
    s.disableMode('center');
    const circle = ent({ id: 'C', type: 'circle', cx: 0, cy: 0, radius: 5 } as Partial<Entity>);
    const line = ent({ id: 'L', type: 'line', x1: -10, y1: 0, x2: 10, y2: 0 } as Partial<Entity>);
    const r = s.snap({ x: -5, y: 1 }, [circle, line]);
    expect(r.mode).toBe('intersection');
    expect(r.point.x).toBeCloseTo(-5);
  });

  it('non-intersecting parallel lines give no intersection (falls to grid)', () => {
    const s = new SnapEngine();
    s.disableMode('endpoint');
    s.disableMode('midpoint');
    s.disableMode('center');
    const a = ent({ id: 'A', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 } as Partial<Entity>);
    const b = ent({ id: 'B', type: 'line', x1: 0, y1: 5, x2: 10, y2: 5 } as Partial<Entity>);
    const r = s.snap({ x: 3, y: 2 }, [a, b]);
    expect(r.mode).toBe('grid');
  });

  it('falls back to grid snap when no feature is near', () => {
    const s = new SnapEngine();
    const r = s.snap({ x: 12, y: 13 }, []);
    expect(r.mode).toBe('grid');
    expect(r.point).toEqual({ x: 10, y: 10 });
  });

  it('grid snap honors a custom grid size', () => {
    const s = new SnapEngine();
    s.setGridSize(25);
    const r = s.snap({ x: 12, y: 40 }, []);
    expect(r.point).toEqual({ x: 0, y: 50 });
  });

  it('returns nearest (cursor) when everything is disabled and nothing snaps', () => {
    const s = new SnapEngine();
    s.disableMode('grid');
    s.disableMode('endpoint');
    s.disableMode('midpoint');
    s.disableMode('center');
    s.disableMode('intersection');
    const r = s.snap({ x: 3, y: 7 }, [hLine]);
    expect(r.mode).toBe('nearest');
    expect(r.point).toEqual({ x: 3, y: 7 });
  });

  it('does not snap when the feature is outside the threshold', () => {
    const s = new SnapEngine();
    s.disableMode('grid');
    s.disableMode('midpoint');
    s.disableMode('center');
    s.disableMode('intersection');
    // 20 units from nearest endpoint > 12 threshold
    const r = s.snap({ x: 20, y: 0 }, [hLine]);
    expect(r.mode).toBe('nearest');
  });

  it('pixelToWorld scales the snap threshold', () => {
    const s = new SnapEngine();
    s.disableMode('grid');
    s.disableMode('midpoint');
    s.disableMode('center');
    s.disableMode('intersection');
    // 20 units away: no snap at scale 1, snaps at scale 2 (threshold 24)
    expect(s.snap({ x: 20, y: 0 }, [hLine], 1).mode).toBe('nearest');
    expect(s.snap({ x: 20, y: 0 }, [hLine], 2).mode).toBe('endpoint');
  });

  it('picks the closest of several candidate features', () => {
    const s = new SnapEngine();
    // endpoint at 0,0 (d=3) vs midpoint at 50,0 (far): endpoint wins
    const r = s.snap({ x: 3, y: 0 }, [hLine]);
    expect(r.point).toEqual({ x: 0, y: 0 });
  });
});
