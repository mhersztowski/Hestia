import { describe, it, expect, vi } from 'vitest';
import { Matrix4, Vector3, Euler, Quaternion } from 'three';
import { SceneNode } from './SceneNode';

describe('SceneNode', () => {
  // ─── Constructor ──────────────────────────────────────────

  describe('constructor', () => {
    it('generates a unique id when none is provided', () => {
      const a = new SceneNode({ type: 'group' });
      const b = new SceneNode({ type: 'group' });
      expect(a.id).toBeDefined();
      expect(b.id).toBeDefined();
      expect(a.id).not.toBe(b.id);
    });

    it('uses the provided id', () => {
      const node = new SceneNode({ type: 'group', id: 'custom-id' });
      expect(node.id).toBe('custom-id');
    });

    it('defaults visible to true', () => {
      const node = new SceneNode({ type: 'group' });
      expect(node.visible).toBe(true);
    });

    it('defaults position to [0, 0, 0]', () => {
      const node = new SceneNode({ type: 'group' });
      expect(node.position).toEqual([0, 0, 0]);
    });

    it('defaults rotation to [0, 0, 0]', () => {
      const node = new SceneNode({ type: 'group' });
      expect(node.rotation).toEqual([0, 0, 0]);
    });

    it('defaults scale to [1, 1, 1]', () => {
      const node = new SceneNode({ type: 'group' });
      expect(node.scale).toEqual([1, 1, 1]);
    });

    it('generates a name from type and id prefix when none is provided', () => {
      const node = new SceneNode({ type: 'mesh', id: 'abcdef-rest' });
      expect(node.name).toBe('mesh-abcdef');
    });

    it('uses the provided name', () => {
      const node = new SceneNode({ type: 'group', name: 'My Node' });
      expect(node.name).toBe('My Node');
    });
  });

  // ─── Hierarchy ────────────────────────────────────────────

  describe('hierarchy', () => {
    it('addChild sets parent reference on the child', () => {
      const parent = new SceneNode({ type: 'group' });
      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);

      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
    });

    it('removeChild returns the removed node and clears its parent', () => {
      const parent = new SceneNode({ type: 'group' });
      const child = new SceneNode({ type: 'group', id: 'child-1' });
      parent.addChild(child);

      const removed = parent.removeChild('child-1');
      expect(removed).toBe(child);
      expect(removed!.parent).toBeNull();
      expect(parent.children).toHaveLength(0);
    });

    it('removeChild returns null for a non-existent id', () => {
      const parent = new SceneNode({ type: 'group' });
      expect(parent.removeChild('nonexistent')).toBeNull();
    });

    it('findById locates self by id', () => {
      const node = new SceneNode({ type: 'group', id: 'self' });
      expect(node.findById('self')).toBe(node);
    });

    it('findById locates a deeply nested descendant', () => {
      const root = new SceneNode({ type: 'group', id: 'root' });
      const mid = new SceneNode({ type: 'group', id: 'mid' });
      const leaf = new SceneNode({ type: 'group', id: 'leaf' });
      root.addChild(mid);
      mid.addChild(leaf);

      expect(root.findById('leaf')).toBe(leaf);
    });

    it('findById returns null when not found', () => {
      const root = new SceneNode({ type: 'group' });
      expect(root.findById('missing')).toBeNull();
    });

    it('traverse visits nodes in DFS order', () => {
      const root = new SceneNode({ type: 'group', id: 'root' });
      const a = new SceneNode({ type: 'group', id: 'a' });
      const b = new SceneNode({ type: 'group', id: 'b' });
      const a1 = new SceneNode({ type: 'group', id: 'a1' });
      root.addChild(a);
      root.addChild(b);
      a.addChild(a1);

      const visited: string[] = [];
      root.traverse((n) => visited.push(n.id));

      expect(visited).toEqual(['root', 'a', 'a1', 'b']);
    });
  });

  // ─── Transforms ───────────────────────────────────────────

  describe('transforms', () => {
    it('setPosition updates position array', () => {
      const node = new SceneNode({ type: 'group' });
      node.setPosition([1, 2, 3]);
      expect(node.position).toEqual([1, 2, 3]);
    });

    it('setRotation updates rotation array', () => {
      const node = new SceneNode({ type: 'group' });
      node.setRotation([0.1, 0.2, 0.3]);
      expect(node.rotation).toEqual([0.1, 0.2, 0.3]);
    });

    it('setScale updates scale array', () => {
      const node = new SceneNode({ type: 'group' });
      node.setScale([2, 3, 4]);
      expect(node.scale).toEqual([2, 3, 4]);
    });
  });

  // ─── Matrix operations ────────────────────────────────────

  describe('matrix operations', () => {
    it('getLocalMatrix composes position, rotation, and scale', () => {
      const node = new SceneNode({ type: 'group' });
      node.setPosition([5, 0, 0]);
      node.setScale([2, 2, 2]);

      const mat = node.getLocalMatrix();
      const pos = new Vector3();
      const quat = new Quaternion();
      const scl = new Vector3();
      mat.decompose(pos, quat, scl);

      expect(pos.x).toBeCloseTo(5);
      expect(pos.y).toBeCloseTo(0);
      expect(pos.z).toBeCloseTo(0);
      expect(scl.x).toBeCloseTo(2);
      expect(scl.y).toBeCloseTo(2);
      expect(scl.z).toBeCloseTo(2);
    });

    it('getWorldMatrix accumulates parent transforms', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setPosition([10, 0, 0]);
      const child = new SceneNode({ type: 'group' });
      child.setPosition([5, 0, 0]);
      parent.addChild(child);

      const worldMat = child.getWorldMatrix();
      const worldPos = new Vector3().setFromMatrixPosition(worldMat);

      expect(worldPos.x).toBeCloseTo(15);
      expect(worldPos.y).toBeCloseTo(0);
      expect(worldPos.z).toBeCloseTo(0);
    });

    it('setLocalMatrix decomposes and stores position/rotation/scale', () => {
      const node = new SceneNode({ type: 'group' });
      const mat = new Matrix4().compose(
        new Vector3(3, 4, 5),
        new Quaternion(),
        new Vector3(1, 1, 1),
      );
      node.setLocalMatrix(mat);

      expect(node.position[0]).toBeCloseTo(3);
      expect(node.position[1]).toBeCloseTo(4);
      expect(node.position[2]).toBeCloseTo(5);
    });

    it('setWorldMatrix with parent computes local from parent inverse', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setPosition([10, 0, 0]);
      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);

      const desiredWorld = new Matrix4().compose(
        new Vector3(15, 0, 0),
        new Quaternion(),
        new Vector3(1, 1, 1),
      );
      child.setWorldMatrix(desiredWorld);

      expect(child.position[0]).toBeCloseTo(5);
      expect(child.position[1]).toBeCloseTo(0);
      expect(child.position[2]).toBeCloseTo(0);
    });
  });

  // ─── World-space getters / setters ────────────────────────

  describe('world-space transforms', () => {
    it('getWorldPosition accumulates parent position', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setPosition([10, 20, 30]);
      const child = new SceneNode({ type: 'group' });
      child.setPosition([1, 2, 3]);
      parent.addChild(child);

      const worldPos = child.getWorldPosition();
      expect(worldPos[0]).toBeCloseTo(11);
      expect(worldPos[1]).toBeCloseTo(22);
      expect(worldPos[2]).toBeCloseTo(33);
    });

    it('setWorldPosition computes correct local position under parent', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setPosition([10, 0, 0]);
      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);

      child.setWorldPosition([25, 0, 0]);

      expect(child.position[0]).toBeCloseTo(15);
      expect(child.position[1]).toBeCloseTo(0);
    });

    it('setWorldPosition without parent sets position directly', () => {
      const node = new SceneNode({ type: 'group' });
      node.setWorldPosition([7, 8, 9]);
      expect(node.position).toEqual([7, 8, 9]);
    });

    it('getWorldScale accumulates parent scale', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setScale([2, 2, 2]);
      const child = new SceneNode({ type: 'group' });
      child.setScale([3, 3, 3]);
      parent.addChild(child);

      const worldScale = child.getWorldScale();
      expect(worldScale[0]).toBeCloseTo(6);
      expect(worldScale[1]).toBeCloseTo(6);
      expect(worldScale[2]).toBeCloseTo(6);
    });

    it('setWorldScale computes correct local scale under parent', () => {
      const parent = new SceneNode({ type: 'group' });
      parent.setScale([2, 2, 2]);
      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);

      child.setWorldScale([6, 6, 6]);

      expect(child.scale[0]).toBeCloseTo(3);
      expect(child.scale[1]).toBeCloseTo(3);
      expect(child.scale[2]).toBeCloseTo(3);
    });
  });

  // ─── setProperty ──────────────────────────────────────────

  describe('setProperty', () => {
    it('dispatches name property', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('name', 'new-name');
      expect(result).toBe(true);
      expect(node.name).toBe('new-name');
    });

    it('dispatches visible property', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('visible', false);
      expect(result).toBe(true);
      expect(node.visible).toBe(false);
    });

    it('dispatches position property', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('position', [1, 2, 3] as [number, number, number]);
      expect(result).toBe(true);
      expect(node.position).toEqual([1, 2, 3]);
    });

    it('dispatches rotation property', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('rotation', [0.1, 0.2, 0.3] as [number, number, number]);
      expect(result).toBe(true);
      expect(node.rotation).toEqual([0.1, 0.2, 0.3]);
    });

    it('dispatches scale property', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('scale', [2, 3, 4] as [number, number, number]);
      expect(result).toBe(true);
      expect(node.scale).toEqual([2, 3, 4]);
    });

    it('returns false for unknown properties', () => {
      const node = new SceneNode({ type: 'group' });
      const result = node.setProperty('unknown', 42);
      expect(result).toBe(false);
    });
  });

  // ─── onChange notification ────────────────────────────────

  describe('onChange notification', () => {
    it('calls _onChange on hierarchy changes (addChild)', () => {
      const parent = new SceneNode({ type: 'group' });
      const spy = vi.fn();
      parent._onChange = spy;

      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);

      expect(spy).toHaveBeenCalled();
    });

    it('calls _onChange on hierarchy changes (removeChild)', () => {
      const parent = new SceneNode({ type: 'group' });
      const child = new SceneNode({ type: 'group', id: 'c' });
      parent.addChild(child);

      const spy = vi.fn();
      parent._onChange = spy;
      parent.removeChild('c');

      expect(spy).toHaveBeenCalled();
    });

    it('calls _onChange on transform changes', () => {
      const node = new SceneNode({ type: 'group' });
      const spy = vi.fn();
      node._onChange = spy;

      node.setPosition([1, 0, 0]);
      expect(spy).toHaveBeenCalledTimes(1);

      node.setRotation([0, 1, 0]);
      expect(spy).toHaveBeenCalledTimes(2);

      node.setScale([2, 2, 2]);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('propagates _onChange to children added after callback is set', () => {
      const parent = new SceneNode({ type: 'group' });
      const spy = vi.fn();
      parent._onChange = spy;

      const child = new SceneNode({ type: 'group' });
      parent.addChild(child);
      spy.mockClear();

      child.setPosition([1, 1, 1]);
      expect(spy).toHaveBeenCalled();
    });

    it('clears _onChange on removed children', () => {
      const parent = new SceneNode({ type: 'group' });
      const spy = vi.fn();
      parent._onChange = spy;

      const child = new SceneNode({ type: 'group', id: 'c' });
      parent.addChild(child);
      parent.removeChild('c');
      spy.mockClear();

      child.setPosition([1, 1, 1]);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── Serialization ────────────────────────────────────────

  describe('toData', () => {
    it('serializes all base fields', () => {
      const node = new SceneNode({
        type: 'group',
        id: 'test-id',
        name: 'Test',
        visible: false,
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
        metadata: { key: 'value' },
      });
      const data = node.toData();

      expect(data.id).toBe('test-id');
      expect(data.name).toBe('Test');
      expect(data.type).toBe('group');
      expect(data.visible).toBe(false);
      expect(data.position).toEqual([1, 2, 3]);
      expect(data.rotation).toEqual([0.1, 0.2, 0.3]);
      expect(data.scale).toEqual([2, 2, 2]);
      expect(data.metadata).toEqual({ key: 'value' });
    });

    it('recursively serializes children', () => {
      const parent = new SceneNode({ type: 'group', id: 'parent' });
      const child = new SceneNode({ type: 'group', id: 'child' });
      parent.addChild(child);

      const data = parent.toData();
      expect(data.children).toHaveLength(1);
      expect(data.children![0].id).toBe('child');
    });

    it('returns a detached copy (no reference sharing)', () => {
      const node = new SceneNode({ type: 'group', position: [1, 2, 3] });
      const data = node.toData();
      data.position[0] = 999;

      expect(node.position[0]).toBe(1);
    });
  });
});
