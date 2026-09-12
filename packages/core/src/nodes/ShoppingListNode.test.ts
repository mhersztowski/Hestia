import { describe, it, expect } from 'vitest';
import { ShoppingListNode } from './ShoppingListNode';
import type { ShoppingListModel, ShoppingItemModel } from '../models/ShoppingModel';

const item = (o: Partial<ShoppingItemModel> & { id: string; name: string }): ShoppingItemModel => ({
  type: 'shopping_item',
  checked: false,
  ...o,
});

const make = (o?: Partial<ShoppingListModel>): ShoppingListModel => ({
  type: 'shopping_list',
  id: 'l1',
  name: 'Groceries',
  status: 'active',
  createdAt: '2024-01-01',
  items: [],
  ...o,
});

describe('ShoppingListNode', () => {
  it('round-trips via toModel', () => {
    const m = make({ store: 'Lidl', budget: 100, items: [item({ id: 'i1', name: 'Milk' })] });
    expect(new ShoppingListNode(m).toModel()).toEqual(m);
  });

  it('defaults items to empty array', () => {
    const node = new ShoppingListNode(make({ items: undefined as any }));
    expect(node.items).toEqual([]);
  });

  describe('status', () => {
    it('reflects status flags', () => {
      expect(new ShoppingListNode(make({ status: 'active' })).isActive()).toBe(true);
      expect(new ShoppingListNode(make({ status: 'completed' })).isCompleted()).toBe(true);
      expect(new ShoppingListNode(make({ status: 'archived' })).isArchived()).toBe(true);
    });
  });

  describe('item queries', () => {
    const node = new ShoppingListNode(make({
      items: [
        item({ id: 'i1', name: 'Milk', checked: true, category: 'dairy', assignedPersonId: 'p1' }),
        item({ id: 'i2', name: 'Bread', category: 'bakery' }),
        item({ id: 'i3', name: 'Cheese', checked: true, category: 'dairy' }),
      ],
    }));

    it('checked/unchecked splits', () => {
      expect(node.getCheckedItems().map((i) => i.id)).toEqual(['i1', 'i3']);
      expect(node.getUncheckedItems().map((i) => i.id)).toEqual(['i2']);
    });
    it('getItemById', () => {
      expect(node.getItemById('i2')?.name).toBe('Bread');
      expect(node.getItemById('x')).toBeUndefined();
    });
    it('getItemsByCategory', () => {
      expect(node.getItemsByCategory('dairy')).toHaveLength(2);
    });
    it('getItemsByPerson', () => {
      expect(node.getItemsByPerson('p1')).toHaveLength(1);
    });
    it('getCategories sorted unique', () => {
      expect(node.getCategories()).toEqual(['bakery', 'dairy']);
    });
    it('getItemsGroupedByCategory', () => {
      const groups = node.getItemsGroupedByCategory();
      expect(groups.get('dairy')).toHaveLength(2);
      expect(groups.get('bakery')).toHaveLength(1);
    });
    it('groups uncategorized under "inne"', () => {
      const n = new ShoppingListNode(make({ items: [item({ id: 'x', name: 'X' })] }));
      expect(n.getItemsGroupedByCategory().get('inne')).toHaveLength(1);
    });
  });

  describe('progress', () => {
    it('computes percentage and text', () => {
      const node = new ShoppingListNode(make({
        items: [item({ id: '1', name: 'a', checked: true }), item({ id: '2', name: 'b' })],
      }));
      expect(node.getProgress()).toBe(50);
      expect(node.getProgressText()).toBe('1/2');
    });
    it('is 0 for empty list', () => {
      expect(new ShoppingListNode(make()).getProgress()).toBe(0);
    });
  });

  describe('budget totals', () => {
    const node = new ShoppingListNode(make({
      budget: 30,
      items: [
        item({ id: '1', name: 'a', estimatedPrice: 10, actualPrice: 12, checked: true }),
        item({ id: '2', name: 'b', estimatedPrice: 5 }),
      ],
    }));
    it('estimated total sums all items', () => {
      expect(node.getEstimatedTotal()).toBe(15);
    });
    it('actual total sums checked items using actual then estimated', () => {
      expect(node.getActualTotal()).toBe(12);
    });
    it('budget status', () => {
      expect(node.getBudgetStatus()).toBe('on_track');
    });
    it('reports over budget', () => {
      const over = new ShoppingListNode(make({
        budget: 5,
        items: [item({ id: '1', name: 'a', estimatedPrice: 10, checked: true, actualPrice: 10 })],
      }));
      expect(over.getBudgetStatus()).toBe('over');
    });
    it('no_budget when unset or zero', () => {
      expect(new ShoppingListNode(make()).getBudgetStatus()).toBe('no_budget');
      expect(new ShoppingListNode(make({ budget: 0 })).getBudgetStatus()).toBe('no_budget');
    });
    it('formats currency totals', () => {
      expect(node.getEstimatedTotalFormatted()).toContain('15');
      expect(node.getActualTotalFormatted()).toContain('12');
      expect(node.getBudgetFormatted()).toContain('30');
      expect(new ShoppingListNode(make()).getBudgetFormatted()).toBeNull();
    });
  });

  it('matches name, store, description and item names', () => {
    const node = new ShoppingListNode(make({
      store: 'Biedronka',
      description: 'weekend',
      items: [item({ id: '1', name: 'Yogurt' })],
    }));
    expect(node.matches('grocer')).toBe(true);
    expect(node.matches('biedronka')).toBe(true);
    expect(node.matches('weekend')).toBe(true);
    expect(node.matches('yogurt')).toBe(true);
    expect(node.matches('nope')).toBe(false);
  });

  it('updateFrom applies and marks dirty', () => {
    const node = new ShoppingListNode(make());
    node.updateFrom(make({ name: 'New', status: 'completed' }));
    expect(node.name).toBe('New');
    expect(node.status).toBe('completed');
    expect(node.isDirty).toBe(true);
  });

  it('clone preserves base state; equals compares by id', () => {
    const node = new ShoppingListNode(make()).setExpanded(true);
    expect(node.clone().isExpanded).toBe(true);
    expect(node.equals(make({ id: 'l1', name: 'x' }))).toBe(true);
    expect(node.equals(make({ id: 'other' }))).toBe(false);
  });
});
