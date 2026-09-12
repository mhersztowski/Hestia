import { describe, it, expect, vi } from 'vitest';
import {
  GeometryPointNode,
  GeometrySegmentNode,
  GeometryLineNode,
  GeometryAngleNode,
  GEOMETRY_PRIMITIVE_TYPES,
  isGeometryPrimitiveNode,
} from './GeometryNodes';
import { SceneNode } from '../scene/SceneNode';

describe('GeometryPointNode', () => {
  it('has type and defaults', () => {
    const p = new GeometryPointNode();
    expect(p.type).toBe('geometry-point');
    expect(p.color).toBe('#ffd54f');
    expect(p.pixelSize).toBe(9);
    expect(p.showLabel).toBe(true);
    expect(p.label).toBe('');
  });

  it('getEditableFields returns color/pixelSize/showLabel/label', () => {
    const fields = new GeometryPointNode().getEditableFields();
    expect(fields.map((f) => f.key)).toEqual(['color', 'pixelSize', 'showLabel', 'label']);
  });

  it('getMetrics is empty', () => {
    expect(new GeometryPointNode().getMetrics()).toEqual([]);
  });

  it('setProperty handles geo.* keys and notifies', () => {
    const p = new GeometryPointNode();
    const spy = vi.fn();
    p._onChange = spy;
    expect(p.setProperty('geo.color', '#000')).toBe(true);
    expect(p.color).toBe('#000');
    expect(p.setProperty('geo.pixelSize', 3)).toBe(true);
    expect(p.pixelSize).toBe(3);
    expect(p.setProperty('geo.showLabel', false)).toBe(true);
    expect(p.showLabel).toBe(false);
    expect(p.setProperty('geo.label', 'A')).toBe(true);
    expect(p.label).toBe('A');
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('setProperty delegates unknown to base', () => {
    const p = new GeometryPointNode();
    expect(p.setProperty('name', 'pt')).toBe(true);
    expect(p.name).toBe('pt');
    expect(p.setProperty('geo.unknown', 1)).toBe(false);
  });

  it('toData serializes fields', () => {
    const p = new GeometryPointNode({ id: 'p1', color: '#abc', pixelSize: 12, label: 'X' });
    const d = p.toData();
    expect(d.type).toBe('geometry-point');
    expect(d.color).toBe('#abc');
    expect(d.pixelSize).toBe(12);
    expect(d.label).toBe('X');
  });
});

describe('GeometrySegmentNode', () => {
  it('has defaults', () => {
    const s = new GeometrySegmentNode();
    expect(s.type).toBe('geometry-segment');
    expect(s.start).toEqual([0, 0, 0]);
    expect(s.end).toEqual([1, 0, 0]);
    expect(s.color).toBe('#4fc3f7');
    expect(s.pixelSize).toBe(7);
    expect(s.showLength).toBe(true);
    expect(s.startBinding).toBeNull();
    expect(s.endBinding).toBeNull();
  });

  it('getMetrics computes length', () => {
    const s = new GeometrySegmentNode({ start: [0, 0, 0], end: [3, 4, 0] });
    expect(s.getMetrics()).toEqual([{ label: 'Length', value: '5.000' }]);
  });

  it('setProperty handles start/end/bindings', () => {
    const s = new GeometrySegmentNode();
    expect(s.setProperty('geo.start', [1, 1, 1])).toBe(true);
    expect(s.start).toEqual([1, 1, 1]);
    expect(s.setProperty('geo.end', [2, 2, 2])).toBe(true);
    expect(s.end).toEqual([2, 2, 2]);
    expect(s.setProperty('geo.bindStart', 'node-1')).toBe(true);
    expect(s.startBinding).toBe('node-1');
    expect(s.setProperty('geo.bindEnd', '')).toBe(true);
    expect(s.endBinding).toBeNull();
  });

  it('toVec3 falls back to previous value on bad input', () => {
    const s = new GeometrySegmentNode({ start: [5, 5, 5] });
    expect(s.setProperty('geo.start', 'not-a-vec')).toBe(true);
    expect(s.start).toEqual([5, 5, 5]);
  });

  it('toData serializes and round-trips', () => {
    const s = new GeometrySegmentNode({ id: 's1', start: [1, 2, 3], end: [4, 5, 6], startBinding: 'x' });
    const d = s.toData();
    expect(d.start).toEqual([1, 2, 3]);
    expect(d.end).toEqual([4, 5, 6]);
    expect(d.startBinding).toBe('x');
    expect(new GeometrySegmentNode(d).toData()).toEqual(d);
  });
});

describe('GeometryLineNode', () => {
  it('has defaults', () => {
    const l = new GeometryLineNode();
    expect(l.type).toBe('geometry-line');
    expect(l.origin).toEqual([0, 0, 0]);
    expect(l.direction).toEqual([1, 0, 0]);
    expect(l.color).toBe('#81c784');
    expect(l.showLabel).toBe(false);
    expect(l.originBinding).toBeNull();
  });

  it('getMetrics returns normalized direction', () => {
    const l = new GeometryLineNode({ direction: [0, 5, 0] });
    expect(l.getMetrics()).toEqual([{ label: 'Direction', value: '0.00, 1.00, 0.00' }]);
  });

  it('getMetrics empty for zero-length direction', () => {
    const l = new GeometryLineNode({ direction: [0, 0, 0] });
    expect(l.getMetrics()).toEqual([]);
  });

  it('setProperty handles origin/direction/label/binding', () => {
    const l = new GeometryLineNode();
    expect(l.setProperty('geo.origin', [1, 0, 0])).toBe(true);
    expect(l.origin).toEqual([1, 0, 0]);
    expect(l.setProperty('geo.direction', [0, 0, 1])).toBe(true);
    expect(l.direction).toEqual([0, 0, 1]);
    expect(l.setProperty('geo.showLabel', true)).toBe(true);
    expect(l.showLabel).toBe(true);
    expect(l.setProperty('geo.label', 'L')).toBe(true);
    expect(l.label).toBe('L');
    expect(l.setProperty('geo.bindOrigin', 'n2')).toBe(true);
    expect(l.originBinding).toBe('n2');
  });

  it('toData round-trips', () => {
    const l = new GeometryLineNode({ id: 'l1', origin: [1, 1, 1], direction: [0, 1, 0], label: 'z' });
    expect(new GeometryLineNode(l.toData()).toData()).toEqual(l.toData());
  });
});

describe('GeometryAngleNode', () => {
  it('has defaults', () => {
    const a = new GeometryAngleNode();
    expect(a.type).toBe('geometry-angle');
    expect(a.vertex).toEqual([0, 0, 0]);
    expect(a.p1).toEqual([1, 0, 0]);
    expect(a.p2).toEqual([0, 1, 0]);
    expect(a.arcPixelRadius).toBe(44);
  });

  it('getDegrees computes a right angle', () => {
    const a = new GeometryAngleNode({ vertex: [0, 0, 0], p1: [1, 0, 0], p2: [0, 1, 0] });
    expect(a.getDegrees()).toBeCloseTo(90);
  });

  it('getDegrees computes 180 for opposite arms', () => {
    const a = new GeometryAngleNode({ vertex: [0, 0, 0], p1: [1, 0, 0], p2: [-1, 0, 0] });
    expect(a.getDegrees()).toBeCloseTo(180);
  });

  it('getDegrees returns 0 for degenerate arm', () => {
    const a = new GeometryAngleNode({ vertex: [0, 0, 0], p1: [0, 0, 0], p2: [0, 1, 0] });
    expect(a.getDegrees()).toBe(0);
  });

  it('getMetrics formats angle', () => {
    const a = new GeometryAngleNode({ vertex: [0, 0, 0], p1: [1, 0, 0], p2: [0, 1, 0] });
    expect(a.getMetrics()).toEqual([{ label: 'Angle', value: '90.0°' }]);
  });

  it('setProperty handles vertex/p1/p2/bindings', () => {
    const a = new GeometryAngleNode();
    expect(a.setProperty('geo.vertex', [1, 1, 1])).toBe(true);
    expect(a.vertex).toEqual([1, 1, 1]);
    expect(a.setProperty('geo.p1', [2, 0, 0])).toBe(true);
    expect(a.p1).toEqual([2, 0, 0]);
    expect(a.setProperty('geo.p2', [0, 2, 0])).toBe(true);
    expect(a.p2).toEqual([0, 2, 0]);
    expect(a.setProperty('geo.arcPixelRadius', 20)).toBe(true);
    expect(a.arcPixelRadius).toBe(20);
    expect(a.setProperty('geo.bindVertex', 'v')).toBe(true);
    expect(a.vertexBinding).toBe('v');
    expect(a.setProperty('geo.bindP1', 'a')).toBe(true);
    expect(a.p1Binding).toBe('a');
    expect(a.setProperty('geo.bindP2', 'b')).toBe(true);
    expect(a.p2Binding).toBe('b');
  });

  it('toData round-trips', () => {
    const a = new GeometryAngleNode({ id: 'a1', vertex: [0, 0, 0], p1: [1, 0, 0], p2: [0, 1, 0] });
    expect(new GeometryAngleNode(a.toData()).toData()).toEqual(a.toData());
  });
});

describe('isGeometryPrimitiveNode', () => {
  it('lists the four primitive types', () => {
    expect(GEOMETRY_PRIMITIVE_TYPES).toEqual([
      'geometry-point',
      'geometry-segment',
      'geometry-line',
      'geometry-angle',
    ]);
  });

  it('returns true for geometry primitives', () => {
    expect(isGeometryPrimitiveNode(new GeometryPointNode())).toBe(true);
    expect(isGeometryPrimitiveNode(new GeometrySegmentNode())).toBe(true);
    expect(isGeometryPrimitiveNode(new GeometryLineNode())).toBe(true);
    expect(isGeometryPrimitiveNode(new GeometryAngleNode())).toBe(true);
  });

  it('returns false for a plain group node', () => {
    expect(isGeometryPrimitiveNode(new SceneNode({ type: 'group' }))).toBe(false);
  });
});
