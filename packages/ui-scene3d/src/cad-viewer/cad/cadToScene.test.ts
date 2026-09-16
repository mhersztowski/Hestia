import { Project } from '@hestia/ui-cad/cad2d';
import type { EntityInput } from '@hestia/ui-cad/cad2d';
import { cadProjectToSceneGraph } from './cadToScene';

const base = {
  layerId: '',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
};

function countNodes(graph: ReturnType<typeof cadProjectToSceneGraph>): number {
  let n = 0;
  graph.traverse(() => n++);
  return n;
}

describe('cadProjectToSceneGraph', () => {
  it('always adds two lights (root + ambient + sun => 3 nodes counting root)', () => {
    const graph = cadProjectToSceneGraph(new Project());
    // root Scene node + ambient + sun
    expect(countNodes(graph)).toBe(3);
  });

  it('adds a cylinder mesh for a circle', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'circle', cx: 0, cy: 0, radius: 4 } as EntityInput);
    const graph = cadProjectToSceneGraph(p);
    let found = false;
    graph.traverse((n) => {
      if (n.name.startsWith('Circle')) found = true;
    });
    expect(found).toBe(true);
  });

  it('adds a box mesh for a rect and a line', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'rect', x: 0, y: 0, width: 2, height: 3 } as EntityInput);
    p.addEntity({ ...base, type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 } as EntityInput);
    const graph = cadProjectToSceneGraph(p);
    const names: string[] = [];
    graph.traverse((n) => names.push(n.name));
    expect(names.some((s) => s.startsWith('Rect'))).toBe(true);
    expect(names.some((s) => s.startsWith('Line'))).toBe(true);
  });

  it('creates one segment per polyline edge', () => {
    const p = new Project();
    p.addEntity({
      ...base,
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      closed: false,
    } as EntityInput);
    const graph = cadProjectToSceneGraph(p);
    let segs = 0;
    graph.traverse((n) => {
      if (n.name.startsWith('Polyline seg')) segs++;
    });
    expect(segs).toBe(2);
  });

  it('skips zero-length lines', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'line', x1: 1, y1: 1, x2: 1, y2: 1 } as EntityInput);
    const graph = cadProjectToSceneGraph(p);
    // only root + 2 lights, no line mesh
    expect(countNodes(graph)).toBe(3);
  });

  it('skips invisible entities', () => {
    const p = new Project();
    const e = p.addEntity({ ...base, type: 'circle', cx: 0, cy: 0, radius: 1 } as EntityInput);
    p.updateEntity(e.id, { visible: false });
    const graph = cadProjectToSceneGraph(p);
    expect(countNodes(graph)).toBe(3);
  });
});
