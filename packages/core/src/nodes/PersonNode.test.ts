import { describe, it, expect } from 'vitest';
import { PersonNode } from './PersonNode';
import type { PersonModel } from '../models/PersonModel';

const make = (o?: Partial<PersonModel>): PersonModel => ({
  type: 'person',
  id: 'p1',
  nick: 'ally',
  ...o,
});

describe('PersonNode', () => {
  it('constructs from a model and round-trips via toModel', () => {
    const model = make({ firstName: 'Alice', secondName: 'Smith', description: 'friend' });
    const node = new PersonNode(model);
    expect(node.toModel()).toEqual(model);
  });

  describe('getDisplayName', () => {
    it('uses full name parts when present', () => {
      expect(new PersonNode(make({ firstName: 'Alice', secondName: 'Smith' })).getDisplayName()).toBe('Alice Smith');
    });
    it('uses just first name when only one part', () => {
      expect(new PersonNode(make({ firstName: 'Alice' })).getDisplayName()).toBe('Alice');
    });
    it('falls back to nick', () => {
      expect(new PersonNode(make()).getDisplayName()).toBe('ally');
    });
  });

  describe('getFullName', () => {
    it('joins both names', () => {
      expect(new PersonNode(make({ firstName: 'Alice', secondName: 'Smith' })).getFullName()).toBe('Alice Smith');
    });
    it('returns single name when only one', () => {
      expect(new PersonNode(make({ secondName: 'Smith' })).getFullName()).toBe('Smith');
    });
    it('returns null when no names', () => {
      expect(new PersonNode(make()).getFullName()).toBeNull();
    });
  });

  describe('getInitials', () => {
    it('combines first letters of both names', () => {
      expect(new PersonNode(make({ firstName: 'Alice', secondName: 'Smith' })).getInitials()).toBe('AS');
    });
    it('uses two letters of first name only', () => {
      expect(new PersonNode(make({ firstName: 'Bob' })).getInitials()).toBe('BO');
    });
    it('falls back to nick', () => {
      expect(new PersonNode(make({ nick: 'zed' })).getInitials()).toBe('ZE');
    });
  });

  it('hasFullName reflects presence of name parts', () => {
    expect(new PersonNode(make()).hasFullName()).toBe(false);
    expect(new PersonNode(make({ firstName: 'A' })).hasFullName()).toBe(true);
  });

  describe('matches', () => {
    const node = new PersonNode(make({ firstName: 'Alice', secondName: 'Smith', description: 'best friend' }));
    it('matches across fields, case-insensitive', () => {
      expect(node.matches('ALICE')).toBe(true);
      expect(node.matches('smith')).toBe(true);
      expect(node.matches('friend')).toBe(true);
      expect(node.matches('ally')).toBe(true);
    });
    it('returns false for non-matches', () => {
      expect(node.matches('zzz')).toBe(false);
    });
  });

  it('updateFrom applies changes and marks dirty', () => {
    const node = new PersonNode(make());
    node.updateFrom(make({ nick: 'ally', firstName: 'Alice' }));
    expect(node.firstName).toBe('Alice');
    expect(node.isDirty).toBe(true);
  });

  it('equals compares by id', () => {
    const a = new PersonNode(make({ id: 'x' }));
    expect(a.equals(make({ id: 'x', nick: 'other' }))).toBe(true);
    expect(a.equals(make({ id: 'y' }))).toBe(false);
  });

  it('clone produces an independent copy preserving UI state', () => {
    const node = new PersonNode(make({ firstName: 'Alice' })).setSelected(true).markDirty();
    const cloned = node.clone();
    expect(cloned.firstName).toBe('Alice');
    expect(cloned.isSelected).toBe(true);
    expect(cloned.isDirty).toBe(true);
    cloned.firstName = 'Bob';
    expect(node.firstName).toBe('Alice');
  });

  it('fromModels maps an array', () => {
    const nodes = PersonNode.fromModels([make({ id: 'a' }), make({ id: 'b' })]);
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
