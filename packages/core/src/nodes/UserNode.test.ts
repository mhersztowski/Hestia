import { describe, it, expect } from 'vitest';
import { UserNode } from './UserNode';
import type { UserModel } from '../models/UserModel';

const makeUser = (overrides?: Partial<UserModel>): UserModel => ({
  type: 'user',
  id: 'u1',
  name: 'Alice',
  password: 'secret',
  isAdmin: false,
  roles: ['viewer', 'editor'],
  ...overrides,
});

describe('UserNode', () => {
  describe('fromModel / fromModels', () => {
    it('creates node with all fields mapped', () => {
      const node = UserNode.fromModel(makeUser());
      expect(node.id).toBe('u1');
      expect(node.name).toBe('Alice');
      expect(node.password).toBe('secret');
      expect(node.isAdmin).toBe(false);
      expect(node.roles).toEqual(['viewer', 'editor']);
      expect(node.type).toBe('user');
    });

    it('fromModels creates array of nodes', () => {
      const nodes = UserNode.fromModels([
        makeUser({ id: 'u1' }),
        makeUser({ id: 'u2', name: 'Bob' }),
      ]);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('u1');
      expect(nodes[1].name).toBe('Bob');
    });
  });

  describe('getDisplayName', () => {
    it('returns name', () => {
      const node = UserNode.fromModel(makeUser({ name: 'Charlie' }));
      expect(node.getDisplayName()).toBe('Charlie');
    });
  });

  describe('hasRole', () => {
    it('returns true for existing role', () => {
      const node = UserNode.fromModel(makeUser({ roles: ['admin', 'editor'] }));
      expect(node.hasRole('admin')).toBe(true);
    });

    it('returns false for missing role', () => {
      const node = UserNode.fromModel(makeUser({ roles: ['viewer'] }));
      expect(node.hasRole('admin')).toBe(false);
    });
  });

  describe('matches', () => {
    it('matches by name (case-insensitive)', () => {
      const node = UserNode.fromModel(makeUser({ name: 'Alice' }));
      expect(node.matches('ali')).toBe(true);
      expect(node.matches('ALI')).toBe(true);
    });

    it('matches by id', () => {
      const node = UserNode.fromModel(makeUser({ id: 'user-123' }));
      expect(node.matches('user-123')).toBe(true);
    });

    it('matches by role', () => {
      const node = UserNode.fromModel(makeUser({ roles: ['SuperAdmin'] }));
      expect(node.matches('superadmin')).toBe(true);
    });

    it('returns false when no match', () => {
      const node = UserNode.fromModel(makeUser({ id: 'u1', name: 'Alice', roles: ['viewer'] }));
      expect(node.matches('xyz')).toBe(false);
    });
  });

  describe('toModel', () => {
    it('round-trips all fields', () => {
      const original = makeUser();
      const node = UserNode.fromModel(original);
      const model = node.toModel();
      expect(model).toEqual(original);
    });

    it('produces a deep copy of roles', () => {
      const node = UserNode.fromModel(makeUser({ roles: ['viewer'] }));
      const model = node.toModel();
      model.roles.push('hacker');
      expect(node.roles).toEqual(['viewer']);
    });
  });

  describe('clone', () => {
    it('creates independent copy with same data', () => {
      const node = UserNode.fromModel(makeUser());
      node.setSelected(true).markDirty();
      const cloned = node.clone();

      expect(cloned.id).toBe(node.id);
      expect(cloned.name).toBe(node.name);
      expect(cloned.isSelected).toBe(true);
      expect(cloned.isDirty).toBe(true);

      cloned.name = 'Modified';
      expect(node.name).toBe('Alice');
    });

    it('roles are independent from clone', () => {
      const node = UserNode.fromModel(makeUser({ roles: ['viewer'] }));
      const cloned = node.clone();
      cloned.roles.push('mutated');
      expect(node.roles).toEqual(['viewer']);
    });
  });

  describe('updateFrom', () => {
    it('updates fields and marks dirty', () => {
      const node = UserNode.fromModel(makeUser());
      const updated = makeUser({ name: 'Bob', isAdmin: true });
      node.updateFrom(updated);
      expect(node.name).toBe('Bob');
      expect(node.isAdmin).toBe(true);
      expect(node.isDirty).toBe(true);
    });
  });

  describe('equals', () => {
    it('compares by id', () => {
      const a = UserNode.fromModel(makeUser({ id: 'u1' }));
      const b = UserNode.fromModel(makeUser({ id: 'u1', name: 'Different' }));
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different id', () => {
      const a = UserNode.fromModel(makeUser({ id: 'u1' }));
      const b = UserNode.fromModel(makeUser({ id: 'u2' }));
      expect(a.equals(b)).toBe(false);
    });

    it('works with raw UserModel', () => {
      const node = UserNode.fromModel(makeUser({ id: 'u1' }));
      expect(node.equals(makeUser({ id: 'u1' }))).toBe(true);
    });
  });

  describe('constructor deep-copies roles', () => {
    it('mutation of source roles does not affect node', () => {
      const model = makeUser({ roles: ['viewer'] });
      const node = UserNode.fromModel(model);
      model.roles.push('hacker');
      expect(node.roles).toEqual(['viewer']);
    });
  });
});
