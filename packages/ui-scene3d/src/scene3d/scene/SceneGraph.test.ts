import { describe, it, expect, vi } from 'vitest';
import { SceneGraph } from './SceneGraph';
import { SceneNode } from './SceneNode';
import { MeshNode } from '../nodes/MeshNode';
import { GroupNode } from '../nodes/GroupNode';
import { LightNode } from '../nodes/LightNode';
import { CameraNode } from '../nodes/CameraNode';

describe('SceneGraph', () => {
  // ─── Constructor ──────────────────────────────────────────

  it('creates a root node of type group named "Scene"', () => {
    const graph = new SceneGraph();
    expect(graph.root.type).toBe('group');
    expect(graph.root.name).toBe('Scene');
  });

  // ─── addNode ──────────────────────────────────────────────

  it('addNode adds to root when no parentId is given', () => {
    const graph = new SceneGraph();
    const node = new SceneNode({ type: 'group', id: 'n1' });
    graph.addNode(node);

    expect(graph.root.children).toContain(node);
    expect(node.parent).toBe(graph.root);
  });

  it('addNode adds to a specific parent by parentId', () => {
    const graph = new SceneGraph();
    const parent = new SceneNode({ type: 'group', id: 'p1' });
    graph.addNode(parent);

    const child = new SceneNode({ type: 'group', id: 'c1' });
    graph.addNode(child, 'p1');

    expect(parent.children).toContain(child);
    expect(child.parent).toBe(parent);
  });

  it('addNode falls back to root when parentId is not found', () => {
    const graph = new SceneGraph();
    const node = new SceneNode({ type: 'group', id: 'n1' });
    graph.addNode(node, 'nonexistent-parent');

    expect(graph.root.children).toContain(node);
  });

  // ─── removeNode ───────────────────────────────────────────

  it('removeNode removes a node from the graph', () => {
    const graph = new SceneGraph();
    const node = new SceneNode({ type: 'group', id: 'n1' });
    graph.addNode(node);

    graph.removeNode('n1');
    expect(graph.root.children).toHaveLength(0);
    expect(graph.findNode('n1')).toBeNull();
  });

  // ─── findNode ─────────────────────────────────────────────

  it('findNode locates a deeply nested node', () => {
    const graph = new SceneGraph();
    const parent = new SceneNode({ type: 'group', id: 'p1' });
    const child = new SceneNode({ type: 'group', id: 'c1' });
    graph.addNode(parent);
    graph.addNode(child, 'p1');

    expect(graph.findNode('c1')).toBe(child);
  });

  it('findNode returns null for missing id', () => {
    const graph = new SceneGraph();
    expect(graph.findNode('missing')).toBeNull();
  });

  // ─── traverse ─────────────────────────────────────────────

  it('traverse visits all nodes in the graph', () => {
    const graph = new SceneGraph();
    graph.addNode(new SceneNode({ type: 'group', id: 'a' }));
    graph.addNode(new SceneNode({ type: 'group', id: 'b' }));

    const visited: string[] = [];
    graph.traverse((n) => visited.push(n.id));

    expect(visited).toContain(graph.root.id);
    expect(visited).toContain('a');
    expect(visited).toContain('b');
    expect(visited).toHaveLength(3);
  });

  // ─── Serialization round-trip ─────────────────────────────

  it('toData produces version and root', () => {
    const graph = new SceneGraph();
    const data = graph.toData();
    expect(data.version).toBe('1.0.0');
    expect(data.root.type).toBe('group');
    expect(data.root.name).toBe('Scene');
  });

  it('round-trip toData -> fromData -> toData produces identical data', () => {
    const graph = new SceneGraph();
    graph.addNode(new MeshNode({ id: 'mesh-1', name: 'Box' }));
    graph.addNode(new LightNode({ id: 'light-1', lightType: 'point', color: '#ff0000', intensity: 2 }));
    graph.addNode(new CameraNode({ id: 'cam-1', fov: 60, near: 0.5, far: 500 }));

    const data1 = graph.toData();
    const restored = SceneGraph.fromData(data1);
    const data2 = restored.toData();

    expect(data2).toEqual(data1);
  });

  it('fromData preserves MeshNode geometry and material', () => {
    const graph = new SceneGraph();
    graph.addNode(
      new MeshNode({
        id: 'm1',
        geometry: { type: 'sphere', params: { radius: 2 } },
        material: { color: '#ff0000', opacity: 0.5, wireframe: true },
      }),
    );

    const restored = SceneGraph.fromData(graph.toData());
    const mesh = restored.findNode('m1') as MeshNode;

    expect(mesh).toBeInstanceOf(MeshNode);
    expect(mesh.geometry.type).toBe('sphere');
    expect(mesh.geometry.params).toEqual({ radius: 2 });
    expect(mesh.material.color).toBe('#ff0000');
    expect(mesh.material.opacity).toBe(0.5);
    expect(mesh.material.wireframe).toBe(true);
  });

  it('fromData preserves LightNode type, color, and intensity', () => {
    const graph = new SceneGraph();
    graph.addNode(
      new LightNode({ id: 'l1', lightType: 'spot', color: '#00ff00', intensity: 3 }),
    );

    const restored = SceneGraph.fromData(graph.toData());
    const light = restored.findNode('l1') as LightNode;

    expect(light).toBeInstanceOf(LightNode);
    expect(light.lightType).toBe('spot');
    expect(light.color).toBe('#00ff00');
    expect(light.intensity).toBe(3);
  });

  it('fromData preserves CameraNode fov, near, far', () => {
    const graph = new SceneGraph();
    graph.addNode(
      new CameraNode({ id: 'c1', fov: 90, near: 0.01, far: 5000 }),
    );

    const restored = SceneGraph.fromData(graph.toData());
    const cam = restored.findNode('c1') as CameraNode;

    expect(cam).toBeInstanceOf(CameraNode);
    expect(cam.fov).toBe(90);
    expect(cam.near).toBe(0.01);
    expect(cam.far).toBe(5000);
  });

  it('fromData restores hierarchy with nested children', () => {
    const graph = new SceneGraph();
    const parent = new SceneNode({ type: 'group', id: 'parent' });
    const child = new MeshNode({ id: 'child' });
    graph.addNode(parent);
    graph.addNode(child, 'parent');

    const restored = SceneGraph.fromData(graph.toData());
    const restoredParent = restored.findNode('parent')!;
    const restoredChild = restored.findNode('child')!;

    expect(restoredParent.children).toHaveLength(1);
    expect(restoredChild.parent).toBe(restoredParent);
    expect(restoredChild).toBeInstanceOf(MeshNode);
  });

  // ─── onChange batching ────────────────────────────────────

  it('batches onChange notifications via queueMicrotask', async () => {
    const graph = new SceneGraph();
    const spy = vi.fn();
    graph.onChange = spy;

    const node = new SceneNode({ type: 'group' });
    graph.addNode(node);

    // Multiple synchronous changes should batch into a single notification
    node.setPosition([1, 0, 0]);
    node.setPosition([2, 0, 0]);
    node.setPosition([3, 0, 0]);

    // Not yet fired synchronously (beyond the initial addNode microtask)
    expect(spy).not.toHaveBeenCalled();

    // Wait for microtask to flush
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Should have been called (batched)
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('propagates onChange through fromData restored graph', async () => {
    const graph = new SceneGraph();
    graph.addNode(new MeshNode({ id: 'm1' }));

    const restored = SceneGraph.fromData(graph.toData());
    const spy = vi.fn();
    restored.onChange = spy;

    const mesh = restored.findNode('m1') as MeshNode;
    mesh.setMaterialColor('#000000');

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(spy).toHaveBeenCalled();
  });
});

/**
 * Skrypt sceny — ścieżka VFS do pliku `.ts` uruchamianego przyciskiem „Run".
 *
 * Powiązanie musi jechać razem z plikiem sceny: bez tego wybór skryptu ginął po
 * ponownym otwarciu projektu z serwera.
 */
describe('SceneGraph.script', () => {
  it('domyślnie nie ma skryptu i nie zaśmieca serializacji', () => {
    const graph = new SceneGraph();
    expect(graph.script).toBeNull();
    expect(graph.toData().script).toBeUndefined();
  });

  it('przechodzi round-trip przez toData/fromData', () => {
    const graph = new SceneGraph();
    graph.script = '/users/marcin/projects/silnik.ts';

    const restored = SceneGraph.fromData(graph.toData());

    expect(restored.script).toBe('/users/marcin/projects/silnik.ts');
  });

  it('pusta ścieżka znaczy „brak skryptu"', () => {
    const graph = new SceneGraph();
    graph.script = '';
    expect(graph.toData().script).toBeUndefined();
    expect(SceneGraph.fromData(graph.toData()).script).toBeNull();
  });
});

describe('przenoszenie węzłów', () => {
  it('węzeł zmienia rodzica razem z poddrzewem', () => {
    const graph = new SceneGraph();
    const a = new GroupNode({ id: 'a', name: 'A' });
    const b = new GroupNode({ id: 'b', name: 'B' });
    const dziecko = new GroupNode({ id: 'd', name: 'D' });
    graph.addNode(a);
    graph.addNode(b);
    graph.addNode(dziecko, 'a');

    expect(graph.moveNode('a', 'b')).toBe(true);
    expect(graph.findNode('a')?.parent?.id).toBe('b');
    expect(graph.findNode('d')?.parent?.id).toBe('a');
  });

  it('bez rodzica wraca pod korzeń', () => {
    const graph = new SceneGraph();
    graph.addNode(new GroupNode({ id: 'a', name: 'A' }));
    graph.addNode(new GroupNode({ id: 'b', name: 'B' }), 'a');

    expect(graph.moveNode('b')).toBe(true);
    expect(graph.findNode('b')?.parent?.id).toBe(graph.root.id);
  });

  it('nie da się przenieść węzła pod własne dziecko — drzewo by się rozpadło', () => {
    const graph = new SceneGraph();
    graph.addNode(new GroupNode({ id: 'a', name: 'A' }));
    graph.addNode(new GroupNode({ id: 'b', name: 'B' }), 'a');

    expect(graph.moveNode('a', 'b')).toBe(false);
    expect(graph.findNode('a')?.parent?.id).toBe(graph.root.id);
  });

  it('nieznany węzeł albo nieznany rodzic to „nie", a nie wyjątek', () => {
    const graph = new SceneGraph();
    graph.addNode(new GroupNode({ id: 'a', name: 'A' }));

    expect(graph.moveNode('nie-ma')).toBe(false);
    expect(graph.moveNode('a', 'nie-ma-rodzica')).toBe(false);
  });
});
