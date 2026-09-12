import { EntityRegistry } from './EntityRegistry';
import { computeBoundingBox } from './computeBoundingBox';
import type { Entity, EntityInput } from './types';

const base = {
  layerId: '0',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
};

function lineInput(over: Partial<EntityInput> = {}): EntityInput {
  return { ...base, type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, ...over } as EntityInput;
}

describe('EntityRegistry', () => {
  let reg: EntityRegistry;
  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('add() assigns an id and computes the bounding box', () => {
    const e = reg.add(lineInput());
    expect(e.id).toBeTruthy();
    expect(e.boundingBox).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(reg.get(e.id)).toBe(e);
  });

  it('addWithId() inserts an entity and recomputes the bounding box', () => {
    const e = { ...base, id: 'fixed', type: 'circle', cx: 0, cy: 0, radius: 5, boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } } as Entity;
    reg.addWithId(e);
    const stored = reg.get('fixed')!;
    expect(stored.boundingBox).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
  });

  it('get() returns undefined for unknown id', () => {
    expect(reg.get('nope')).toBeUndefined();
  });

  it('remove() deletes and returns the entity', () => {
    const e = reg.add(lineInput());
    expect(reg.remove(e.id)).toBe(e);
    expect(reg.get(e.id)).toBeUndefined();
  });

  it('remove() returns undefined for unknown id', () => {
    expect(reg.remove('nope')).toBeUndefined();
  });

  it('update() applies changes and recomputes bounding box', () => {
    const e = reg.add(lineInput());
    const updated = reg.update(e.id, { x2: 20 } as Partial<Entity>);
    expect(updated!.boundingBox.maxX).toBe(20);
    expect((reg.get(e.id) as any).x2).toBe(20);
  });

  it('update() returns undefined for unknown id', () => {
    expect(reg.update('nope', {})).toBeUndefined();
  });

  it('getAll() returns every entity', () => {
    reg.add(lineInput());
    reg.add(lineInput());
    expect(reg.getAll()).toHaveLength(2);
  });

  it('getByLayer() filters by layerId', () => {
    reg.add(lineInput({ layerId: 'a' }));
    reg.add(lineInput({ layerId: 'b' }));
    expect(reg.getByLayer('a')).toHaveLength(1);
    expect(reg.getByLayer('b')).toHaveLength(1);
    expect(reg.getByLayer('c')).toHaveLength(0);
  });

  it('getByType() filters by type', () => {
    reg.add(lineInput());
    reg.add({ ...base, type: 'circle', cx: 0, cy: 0, radius: 5 } as EntityInput);
    expect(reg.getByType('line')).toHaveLength(1);
    expect(reg.getByType('circle')).toHaveLength(1);
  });

  it('getInBoundingBox() returns overlapping entities only', () => {
    reg.add(lineInput()); // bbox 0..10
    reg.add(lineInput({ x1: 100, y1: 100, x2: 110, y2: 110 })); // bbox 100..110
    const hit = reg.getInBoundingBox({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
    expect(hit).toHaveLength(1);
    expect(hit[0].boundingBox.maxX).toBe(10);
  });

  it('clear() empties the registry', () => {
    reg.add(lineInput());
    reg.clear();
    expect(reg.getAll()).toHaveLength(0);
  });

  it('toData()/fromData() round-trips entities', () => {
    reg.add(lineInput());
    const data = reg.toData();
    const reg2 = new EntityRegistry();
    reg2.add(lineInput()); // seed with something to be cleared
    reg2.fromData(data);
    expect(reg2.getAll()).toHaveLength(1);
    expect(reg2.get(data[0].id)).toEqual(data[0]);
  });
});

describe('computeBoundingBox — all entity types', () => {
  const b = (over: Partial<Entity>): Entity => ({ ...base, id: 'x', boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ...over } as Entity);

  it('line', () => {
    expect(computeBoundingBox(b({ type: 'line', x1: 1, y1: 2, x2: 4, y2: 6 } as any)))
      .toEqual({ minX: 1, minY: 2, maxX: 4, maxY: 6 });
  });

  it('circle', () => {
    expect(computeBoundingBox(b({ type: 'circle', cx: 0, cy: 0, radius: 3 } as any)))
      .toEqual({ minX: -3, minY: -3, maxX: 3, maxY: 3 });
  });

  it('polyline', () => {
    expect(computeBoundingBox(b({ type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 8 }] } as any)))
      .toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 8 });
  });

  it('rect', () => {
    expect(computeBoundingBox(b({ type: 'rect', x: 2, y: 3, width: 4, height: 5 } as any)))
      .toEqual({ minX: 2, minY: 3, maxX: 6, maxY: 8 });
  });

  it('arc', () => {
    expect(computeBoundingBox(b({ type: 'arc', cx: 0, cy: 0, radius: 2, startAngle: 0, endAngle: Math.PI } as any)))
      .toEqual({ minX: -2, minY: -2, maxX: 2, maxY: 2 });
  });

  it('text', () => {
    const bb = computeBoundingBox(b({ type: 'text', x: 0, y: 0, content: 'abc', fontSize: 10, fontFamily: 'Arial', angle: 0 } as any));
    expect(bb.minX).toBe(0);
    expect(bb.maxX).toBeCloseTo(3 * 10 * 0.6);
    expect(bb.maxY).toBeCloseTo(14);
  });

  it('image', () => {
    expect(computeBoundingBox(b({ type: 'image', x: 1, y: 1, width: 10, height: 20, src: 'x' } as any)))
      .toEqual({ minX: 1, minY: 1, maxX: 11, maxY: 21 });
  });

  it('freehand with points', () => {
    expect(computeBoundingBox(b({ type: 'freehand', strokeWidth: 1, smooth: false, points: [{ x: -1, y: -2 }, { x: 3, y: 4 }] } as any)))
      .toEqual({ minX: -1, minY: -2, maxX: 3, maxY: 4 });
  });

  it('freehand empty returns zero box', () => {
    expect(computeBoundingBox(b({ type: 'freehand', strokeWidth: 1, smooth: false, points: [] } as any)))
      .toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('dimension accounts for the offset', () => {
    const bb = computeBoundingBox(b({ type: 'dimension', x1: 0, y1: 0, x2: 10, y2: 0, offset: 5 } as any));
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it('dimension with zero-length uses len fallback', () => {
    const bb = computeBoundingBox(b({ type: 'dimension', x1: 0, y1: 0, x2: 0, y2: 0, offset: 4 } as any));
    // len falls back to 1; nx = -0*4, ny = 0*4 → all points at origin
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('box3d', () => {
    expect(computeBoundingBox(b({ type: 'box3d', cx: 0, cy: 0, width: 4, depth: 6, height: 2 } as any)))
      .toEqual({ minX: -2, minY: -3, maxX: 2, maxY: 3 });
  });

  it('cylinder3d', () => {
    expect(computeBoundingBox(b({ type: 'cylinder3d', cx: 0, cy: 0, radius: 3, height: 5 } as any)))
      .toEqual({ minX: -3, minY: -3, maxX: 3, maxY: 3 });
  });

  it('sphere3d', () => {
    expect(computeBoundingBox(b({ type: 'sphere3d', cx: 1, cy: 1, radius: 2 } as any)))
      .toEqual({ minX: -1, minY: -1, maxX: 3, maxY: 3 });
  });
});
