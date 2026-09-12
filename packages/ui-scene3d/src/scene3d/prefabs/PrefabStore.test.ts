import { describe, it, expect } from 'vitest';
import { PrefabStore } from './PrefabStore';
import { SceneNode } from '../scene/SceneNode';
import { MeshNode } from '../nodes/MeshNode';

describe('PrefabStore.create', () => {
  it('creates a prefab entry from a node', () => {
    const node = new MeshNode({ id: 'm1', name: 'Box' });
    const entry = PrefabStore.create('MyPrefab', node);
    expect(entry.name).toBe('MyPrefab');
    expect(entry.version).toBe('1.0.0');
    expect(entry.author).toBe('');
    expect(entry.rootType).toBe('mesh');
    expect(entry.nodeCount).toBe(1);
    expect(entry.nodeData.id).toBe('m1');
    expect(entry.id).toBeTruthy();
    expect(typeof entry.createdAt).toBe('number');
  });

  it('counts nodes in a subtree', () => {
    const root = new SceneNode({ type: 'group', id: 'r' });
    const a = new SceneNode({ type: 'group', id: 'a' });
    const b = new SceneNode({ type: 'group', id: 'b' });
    root.addChild(a);
    a.addChild(b);
    const entry = PrefabStore.create('Tree', root);
    expect(entry.nodeCount).toBe(3);
  });

  it('honors version and author options (trimmed)', () => {
    const entry = PrefabStore.create('P', new MeshNode(), { version: ' 2.1.0 ', author: '  Jane  ' });
    expect(entry.version).toBe('2.1.0');
    expect(entry.author).toBe('Jane');
  });

  it('falls back to defaults for blank options', () => {
    const entry = PrefabStore.create('P', new MeshNode(), { version: '   ', author: '   ' });
    expect(entry.version).toBe('1.0.0');
    expect(entry.author).toBe('');
  });

  it('does not mutate the source node', () => {
    const node = new MeshNode({ id: 'src' });
    PrefabStore.create('P', node);
    expect(node.id).toBe('src');
  });
});

describe('PrefabStore.instantiate', () => {
  it('returns a fresh node with a new id', () => {
    const node = new MeshNode({ id: 'orig' });
    const entry = PrefabStore.create('P', node);
    const instance = PrefabStore.instantiate(entry);
    expect(instance.id).not.toBe('orig');
    expect(instance.type).toBe('mesh');
  });

  it('re-ids the whole subtree', () => {
    const root = new SceneNode({ type: 'group', id: 'root' });
    const child = new MeshNode({ id: 'child' });
    root.addChild(child);
    const entry = PrefabStore.create('P', root);

    const instance = PrefabStore.instantiate(entry);
    const ids: string[] = [];
    instance.traverse((n) => ids.push(n.id));
    expect(ids).not.toContain('root');
    expect(ids).not.toContain('child');
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it('tags instance metadata with prefab id and name', () => {
    const entry = PrefabStore.create('Widget', new MeshNode({ id: 'm' }));
    const instance = PrefabStore.instantiate(entry);
    expect(instance.metadata.prefabId).toBe(entry.id);
    expect(instance.metadata.prefabName).toBe('Widget');
  });

  it('produces a MeshNode instance for mesh prefabs', () => {
    const entry = PrefabStore.create('P', new MeshNode({ id: 'm', geometry: { type: 'sphere', params: { radius: 2 } } }));
    const instance = PrefabStore.instantiate(entry);
    expect(instance).toBeInstanceOf(MeshNode);
    expect((instance as MeshNode).geometry.type).toBe('sphere');
  });

  it('does not mutate the stored prefab entry ids', () => {
    const entry = PrefabStore.create('P', new MeshNode({ id: 'stored' }));
    PrefabStore.instantiate(entry);
    expect(entry.nodeData.id).toBe('stored');
  });
});
