import { describe, expect, it } from 'vitest';
import {
  applyToggle,
  custom,
  findNode,
  findPath,
  hasSubmenu,
  isActionable,
  item,
  separator,
  splitToggle,
  submenu,
  titleOf,
  toggle,
  visibleNodes,
  walk,
  type ToolbarNode,
} from './toolbar';

const tree = (): ToolbarNode[] => [
  submenu('file', 'File', [
    item('new', 'New', { onSelect: () => {} }),
    separator('s1'),
    submenu('export', 'Export', [
      item('png', 'PNG', { onSelect: () => {} }),
      item('svg', 'SVG', { onSelect: () => {} }),
    ]),
  ]),
  submenu('view', 'View', [
    toggle('grid', 'Grid', true),
    separator('s2'),
    toggle('light', 'Light', true, { group: 'theme' }),
    toggle('dark', 'Dark', false, { group: 'theme' }),
  ]),
];

describe('reading the tree', () => {
  it('finds a node however deep it is, and the way to it', () => {
    expect(findNode(tree(), 'svg')?.label).toBe('SVG');
    expect(findPath(tree(), 'svg')?.map((n) => n.id)).toEqual(['file', 'export', 'svg']);
    expect(findNode(tree(), 'nothing')).toBeNull();
  });

  it('a submenu is an item with children, not a kind of its own', () => {
    expect(hasSubmenu(findNode(tree(), 'export')!)).toBe(true);
    expect(hasSubmenu(findNode(tree(), 'png')!)).toBe(false);
    // An item with an empty list opens nothing — there would be nothing in it.
    expect(hasSubmenu(submenu('empty', 'Empty', []))).toBe(false);
  });

  it('walks every node once', () => {
    expect(walk(tree()).map((n) => n.id)).toEqual([
      'file',
      'new',
      's1',
      'export',
      'png',
      'svg',
      'view',
      'grid',
      's2',
      'light',
      'dark',
    ]);
  });

  it('knows what can be interacted with', () => {
    expect(isActionable(findNode(tree(), 'new')!)).toBe(true);
    expect(isActionable(findNode(tree(), 'export')!)).toBe(true); // it opens
    expect(isActionable(separator('s'))).toBe(false);
    expect(isActionable(item('dead', 'Dead'))).toBe(false); // does nothing, opens nothing
    expect(isActionable(item('off', 'Off', { onSelect: () => {}, disabled: true }))).toBe(false);
    expect(isActionable(custom('slot', null))).toBe(true);
  });

  it('falls back to the label for hover text', () => {
    expect(titleOf(item('a', 'Add'))).toBe('Add');
    expect(titleOf(item('a', 'Add', { title: 'Add a page (Ctrl+N)' }))).toBe('Add a page (Ctrl+N)');
    expect(titleOf(separator('s'))).toBeUndefined();
  });
});

describe('what gets drawn', () => {
  it('drops hidden nodes', () => {
    const nodes = [item('a', 'A'), item('b', 'B', { hidden: true }), item('c', 'C')];
    expect(visibleNodes(nodes).map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('drops separators that would leave a stray line', () => {
    // Hiding the only item between two separators is how a menu that adapts
    // ends up with two rules against each other.
    const nodes = [
      separator('lead'),
      item('a', 'A'),
      separator('s1'),
      item('hidden', 'H', { hidden: true }),
      separator('s2'),
      item('b', 'B'),
      separator('trail'),
    ];
    expect(visibleNodes(nodes).map((n) => n.id)).toEqual(['a', 's1', 'b']);
  });

  it('a menu of nothing but separators draws as nothing', () => {
    expect(visibleNodes([separator('a'), separator('b')])).toEqual([]);
  });
});

describe('toggles', () => {
  it('sets the one that changed, and leaves the rest alone', () => {
    const next = applyToggle(tree(), 'grid', false);
    expect((findNode(next, 'grid') as { checked: boolean }).checked).toBe(false);
    expect((findNode(next, 'light') as { checked: boolean }).checked).toBe(true);
  });

  it('turns off the others in the same group when one goes on', () => {
    const next = applyToggle(tree(), 'dark', true);
    expect((findNode(next, 'dark') as { checked: boolean }).checked).toBe(true);
    expect((findNode(next, 'light') as { checked: boolean }).checked).toBe(false);
    expect((findNode(next, 'grid') as { checked: boolean }).checked).toBe(true); // no group — untouched
  });

  it('lets a group end up with nothing chosen', () => {
    // Turning the chosen one off is a thing a person can do; forcing another
    // on in its place would be the toolbar deciding for them.
    const next = applyToggle(tree(), 'light', false);
    expect((findNode(next, 'light') as { checked: boolean }).checked).toBe(false);
    expect((findNode(next, 'dark') as { checked: boolean }).checked).toBe(false);
  });

  it('returns a new tree rather than changing the old one', () => {
    const before = tree();
    const next = applyToggle(before, 'grid', false);
    expect(next).not.toBe(before);
    expect((findNode(before, 'grid') as { checked: boolean }).checked).toBe(true);
  });

  it('ignores an id that is not a toggle', () => {
    const before = tree();
    expect(applyToggle(before, 'new', true)).toBe(before);
    expect(applyToggle(before, 'nothing', true)).toBe(before);
  });
});

describe('a split button', () => {
  const palette = (): ToolbarNode[] => [
    toggle('select', 'Select', true, { group: 'tool' }),
    splitToggle(
      'circle',
      'Circle',
      false,
      [item('circle-c', 'By centre'), item('circle-3p', 'By three points')],
      { group: 'tool' }
    ),
  ];

  it('is a toggle that opens a submenu', () => {
    const node = findNode(palette(), 'circle')!;
    expect(node.kind).toBe('toggle');
    expect(hasSubmenu(node)).toBe(true);
  });

  it('takes part in its group like any other toggle', () => {
    const next = applyToggle(palette(), 'circle', true);
    expect((findNode(next, 'circle') as { checked: boolean }).checked).toBe(true);
    expect((findNode(next, 'select') as { checked: boolean }).checked).toBe(false);
  });

  it('has its variants walked and found like any other children', () => {
    expect(findPath(palette(), 'circle-3p')?.map((n) => n.id)).toEqual(['circle', 'circle-3p']);
    expect(walk(palette()).map((n) => n.id)).toEqual(['select', 'circle', 'circle-c', 'circle-3p']);
  });
});
