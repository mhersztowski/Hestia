import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { evaluateGeoNodeGraph } from './evaluate';
import { DEFAULT_GEO_NODE_GRAPH } from './types';
import type { GeoNodeGraph } from './types';

function positionCount(geo: THREE.BufferGeometry): number {
  return (geo.attributes['position'] as THREE.BufferAttribute).count;
}

describe('evaluateGeoNodeGraph', () => {
  it('evaluates the default graph (box -> output) to a box geometry', () => {
    const geo = evaluateGeoNodeGraph(DEFAULT_GEO_NODE_GRAPH);
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    // A 1-segment box has 24 unique vertices.
    expect(positionCount(geo)).toBe(24);
  });

  it('returns a box when there is no output node', () => {
    const graph: GeoNodeGraph = { nodes: [{ id: 'n1', type: 'box', x: 0, y: 0, params: {} }], edges: [] };
    const geo = evaluateGeoNodeGraph(graph);
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(positionCount(geo)).toBe(24);
  });

  it('respects box params', () => {
    const graph: GeoNodeGraph = {
      nodes: [
        { id: 'b', type: 'box', x: 0, y: 0, params: { width: 4, height: 2, depth: 6 } },
        { id: 'out', type: 'output', x: 200, y: 0, params: {} },
      ],
      edges: [{ id: 'e', source: 'b', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' }],
    };
    const geo = evaluateGeoNodeGraph(graph);
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    expect(size.x).toBeCloseTo(4);
    expect(size.y).toBeCloseTo(2);
    expect(size.z).toBeCloseTo(6);
  });

  it('evaluates a sphere primitive', () => {
    const graph: GeoNodeGraph = {
      nodes: [
        { id: 's', type: 'sphere', x: 0, y: 0, params: { radius: 3, wSeg: 8, hSeg: 6 } },
        { id: 'out', type: 'output', x: 200, y: 0, params: {} },
      ],
      edges: [{ id: 'e', source: 's', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' }],
    };
    const geo = evaluateGeoNodeGraph(graph);
    geo.computeBoundingSphere();
    expect(geo.boundingSphere!.radius).toBeCloseTo(3, 1);
  });

  it('applies a transform node (translation shifts bounds)', () => {
    const graph: GeoNodeGraph = {
      nodes: [
        { id: 'b', type: 'box', x: 0, y: 0, params: { width: 2, height: 2, depth: 2 } },
        { id: 't', type: 'transform', x: 100, y: 0, params: { tx: 10 } },
        { id: 'out', type: 'output', x: 200, y: 0, params: {} },
      ],
      edges: [
        { id: 'e1', source: 'b', sourceHandle: 'geo-out', target: 't', targetHandle: 'geo-in' },
        { id: 'e2', source: 't', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' },
      ],
    };
    const geo = evaluateGeoNodeGraph(graph);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    expect(center.x).toBeCloseTo(10);
  });

  it('merges two inputs (vertex counts add up)', () => {
    const graph: GeoNodeGraph = {
      nodes: [
        { id: 'b1', type: 'box', x: 0, y: 0, params: {} },
        { id: 'b2', type: 'box', x: 0, y: 100, params: {} },
        { id: 'm', type: 'merge', x: 150, y: 50, params: {} },
        { id: 'out', type: 'output', x: 300, y: 50, params: {} },
      ],
      edges: [
        { id: 'e1', source: 'b1', sourceHandle: 'geo-out', target: 'm', targetHandle: 'geo-in-0' },
        { id: 'e2', source: 'b2', sourceHandle: 'geo-out', target: 'm', targetHandle: 'geo-in-1' },
        { id: 'e3', source: 'm', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' },
      ],
    };
    const geo = evaluateGeoNodeGraph(graph);
    // Two boxes non-indexed: 36 triangleverts each = 72.
    expect(positionCount(geo)).toBe(72);
  });

  it('falls back to a box when output has no input', () => {
    const graph: GeoNodeGraph = { nodes: [{ id: 'out', type: 'output', x: 0, y: 0, params: {} }], edges: [] };
    const geo = evaluateGeoNodeGraph(graph);
    expect(positionCount(geo)).toBe(24);
  });
});
