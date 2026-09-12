import { describe, it, expect } from 'vitest';
import { GroupNode } from './GroupNode';
import { SceneNode } from '../scene/SceneNode';

describe('GroupNode', () => {
  it('has type "group"', () => {
    const group = new GroupNode();
    expect(group.type).toBe('group');
  });

  it('is a SceneNode', () => {
    expect(new GroupNode()).toBeInstanceOf(SceneNode);
  });

  it('applies base data (name, position)', () => {
    const group = new GroupNode({ name: 'MyGroup', position: [1, 2, 3] });
    expect(group.name).toBe('MyGroup');
    expect(group.position).toEqual([1, 2, 3]);
  });

  it('can contain children', () => {
    const group = new GroupNode({ id: 'g' });
    const child = new SceneNode({ type: 'group', id: 'c' });
    group.addChild(child);
    expect(group.findById('c')).toBe(child);
  });

  it('toData reports type group', () => {
    const group = new GroupNode({ id: 'g1' });
    const data = group.toData();
    expect(data.type).toBe('group');
    expect(data.id).toBe('g1');
  });
});
