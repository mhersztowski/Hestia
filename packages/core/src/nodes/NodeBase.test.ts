import { describe, it, expect } from 'vitest';
import { UserNode } from './UserNode';
import type { UserModel } from '../models/UserModel';

const makeUser = (overrides?: Partial<UserModel>): UserModel => ({
  type: 'user',
  id: 'u1',
  name: 'Alice',
  password: 'pw',
  isAdmin: false,
  roles: ['viewer'],
  ...overrides,
});

describe('NodeBase (via UserNode)', () => {
  it('has default UI state all false', () => {
    const node = new UserNode(makeUser());
    expect(node.isSelected).toBe(false);
    expect(node.isExpanded).toBe(false);
    expect(node.isEditing).toBe(false);
    expect(node.isDirty).toBe(false);
  });

  describe('selection', () => {
    it('setSelected sets and returns this', () => {
      const node = new UserNode(makeUser());
      const result = node.setSelected(true);
      expect(result).toBe(node);
      expect(node.isSelected).toBe(true);
    });

    it('toggleSelected flips the value', () => {
      const node = new UserNode(makeUser());
      node.toggleSelected();
      expect(node.isSelected).toBe(true);
      node.toggleSelected();
      expect(node.isSelected).toBe(false);
    });
  });

  describe('expansion', () => {
    it('setExpanded sets and returns this', () => {
      const node = new UserNode(makeUser());
      const result = node.setExpanded(true);
      expect(result).toBe(node);
      expect(node.isExpanded).toBe(true);
    });

    it('toggleExpanded flips the value', () => {
      const node = new UserNode(makeUser());
      node.toggleExpanded();
      expect(node.isExpanded).toBe(true);
    });
  });

  describe('editing', () => {
    it('setEditing sets and returns this', () => {
      const node = new UserNode(makeUser());
      const result = node.setEditing(true);
      expect(result).toBe(node);
      expect(node.isEditing).toBe(true);
    });
  });

  describe('dirty', () => {
    it('setDirty sets the flag', () => {
      const node = new UserNode(makeUser());
      node.setDirty(true);
      expect(node.isDirty).toBe(true);
    });

    it('markDirty / markClean toggle dirty', () => {
      const node = new UserNode(makeUser());
      node.markDirty();
      expect(node.isDirty).toBe(true);
      node.markClean();
      expect(node.isDirty).toBe(false);
    });
  });

  describe('resetState', () => {
    it('resets all four flags to false', () => {
      const node = new UserNode(makeUser());
      node.setSelected(true).setExpanded(true).setEditing(true).markDirty();
      node.resetState();
      expect(node.isSelected).toBe(false);
      expect(node.isExpanded).toBe(false);
      expect(node.isEditing).toBe(false);
      expect(node.isDirty).toBe(false);
    });

    it('returns this for chaining', () => {
      const node = new UserNode(makeUser());
      expect(node.resetState()).toBe(node);
    });
  });

  describe('copyBaseStateTo (via clone)', () => {
    it('clone preserves UI state', () => {
      const node = new UserNode(makeUser());
      node.setSelected(true).setExpanded(true).setEditing(true).markDirty();
      const cloned = node.clone();
      expect(cloned.isSelected).toBe(true);
      expect(cloned.isExpanded).toBe(true);
      expect(cloned.isEditing).toBe(true);
      expect(cloned.isDirty).toBe(true);
    });

    it('clone creates independent copy', () => {
      const node = new UserNode(makeUser());
      node.setSelected(true);
      const cloned = node.clone();
      cloned.setSelected(false);
      expect(node.isSelected).toBe(true);
    });
  });
});
