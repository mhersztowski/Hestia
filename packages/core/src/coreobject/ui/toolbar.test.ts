import { describe, expect, it, vi } from 'vitest';
import {
  Action,
  ActionCollection,
  ActionGroup,
  CustomItem,
  Menu,
  MenuBar,
  Separator,
  Toolbar,
  addModel,
} from './index';
import {
  custom,
  item,
  separator,
  submenu,
  toggle,
  type ToolbarNode,
} from '../../models/ui/toolbar';
import { menu, menuBar, menusOf } from '../../models/ui/menubar';
import { nodesInCategory } from '../../models/ui/toolbar';

/** The same tree the plain model's tests use, so both forms are held to one standard. */
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

describe('building from the plain model', () => {
  it('keeps the structure, the ids and the order', () => {
    const bar = Toolbar.fromModel(tree());

    expect(bar.items.map((i) => i.id)).toEqual(['file', 'view']);
    expect(bar.allItems().map((i) => i.id)).toEqual([
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
    expect(bar.itemById('svg')).toBeInstanceOf(Action);
    expect((bar.itemById('svg') as Action).text.value).toBe('SVG');
    expect(bar.pathTo('svg')?.map((i) => i.id)).toEqual(['file', 'export', 'svg']);
    expect(bar.itemById('nothing')).toBeNull();
  });

  it('a submenu is an action with items, not a kind of its own', () => {
    const bar = Toolbar.fromModel(tree());
    expect(bar.itemById('export')?.hasMenu).toBe(true);
    expect(bar.itemById('png')?.hasMenu).toBe(false);
    expect(bar.itemById('grid')).toBeInstanceOf(Action);
    expect(bar.itemById('s1')).toBeInstanceOf(Separator);
  });

  it('carries a toggle across as a checkable action', () => {
    const bar = Toolbar.fromModel(tree());
    const grid = bar.itemById('grid') as Action;
    expect(grid.checkable.value).toBe(true);
    expect(grid.checked.value).toBe(true);
    expect((bar.itemById('new') as Action).checkable.value).toBe(false);
  });

  it('a custom node keeps whatever it was given', () => {
    const payload = { anything: true };
    const bar = Toolbar.fromModel([custom('zoom', payload)]);
    expect(bar.itemById('zoom')).toBeInstanceOf(CustomItem);
    expect((bar.itemById('zoom') as CustomItem).render.value).toBe(payload);
  });
});

describe('what is drawn', () => {
  it('drops hidden items and the separators they strand', () => {
    const bar = Toolbar.fromModel([
      item('a', 'A'),
      separator('s1'),
      item('b', 'B', { hidden: true }),
      separator('s2'),
      item('c', 'C'),
    ]);
    expect(bar.visibleItems.map((i) => i.id)).toEqual(['a', 's1', 'c']);

    // Hiding at runtime applies the same rule — the point of holding objects.
    bar.itemById('c')!.visible.value = false;
    expect(bar.visibleItems.map((i) => i.id)).toEqual(['a']);
  });

  it('follows the variant when no display was asked for', () => {
    expect(new Toolbar({ variant: 'bar' }).effectiveDisplay).toBe('label');
    expect(new Toolbar({ variant: 'floating' }).effectiveDisplay).toBe('icon');
    expect(new Toolbar({ variant: 'floating', display: 'both' }).effectiveDisplay).toBe('both');
  });
});

describe('triggering', () => {
  it('calls the model callback and reports upwards', () => {
    const onSelect = vi.fn();
    const bar = Toolbar.fromModel([submenu('file', 'File', [item('new', 'New', { onSelect })])]);
    const heard: string[] = [];
    bar.actionTriggered.connect((a) => heard.push(a.id));

    expect(bar.triggerById('new')).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(heard).toEqual(['new']);
  });

  it('refuses when the action is disabled or hidden', () => {
    const onSelect = vi.fn();
    const bar = Toolbar.fromModel([item('save', 'Save', { onSelect })]);
    const save = bar.itemById('save') as Action;

    save.enabled.value = false;
    expect(save.trigger()).toBe(false);
    save.enabled.value = true;
    save.visible.value = false;
    expect(save.trigger()).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('flips a checkable action before telling anyone', () => {
    const onChange = vi.fn();
    const bar = Toolbar.fromModel([toggle('grid', 'Grid', false, { onChange })]);
    const grid = bar.itemById('grid') as Action;

    grid.trigger();
    expect(grid.checked.value).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
    grid.trigger();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe('groups', () => {
  it('behaves as radio buttons, one group per host', () => {
    const bar = Toolbar.fromModel(tree());
    const light = bar.itemById('light') as Action;
    const dark = bar.itemById('dark') as Action;

    expect(light.checked.value).toBe(true);
    dark.trigger();
    expect(dark.checked.value).toBe(true);
    expect(light.checked.value).toBe(false);

    // Turning the checked one off leaves the group with nothing checked.
    dark.trigger();
    expect(dark.checked.value).toBe(false);
    expect(light.checked.value).toBe(false);
    expect(dark.group?.groupName).toBe('theme');
  });

  it('calls onChange only for the action that was acted on', () => {
    // The regression this guards: a tool palette whose handlers ignore the
    // boolean and just say `onToolChange(mine)`. If unchecking the siblings
    // called their handlers too, the last sibling would win every click.
    const calls: string[] = [];
    const bar = Toolbar.fromModel([
      toggle('line', 'Line', true, { group: 'tool', onChange: () => calls.push('line') }),
      toggle('arc', 'Arc', false, { group: 'tool', onChange: () => calls.push('arc') }),
    ]);

    (bar.itemById('arc') as Action).trigger();
    expect(calls).toEqual(['arc']);
    expect((bar.itemById('line') as Action).checked.value).toBe(false);
  });

  it('keeps groups of the same name in different menus apart', () => {
    const bar = Toolbar.fromModel([
      toggle('a', 'A', true, { group: 'g' }),
      submenu('menu', 'Menu', [toggle('b', 'B', true, { group: 'g' })]),
    ]);
    (bar.itemById('b') as Action).setChecked(true);
    expect((bar.itemById('a') as Action).checked.value).toBe(true);
  });

  it('can refuse to be left with nothing checked', () => {
    // A set of pages: clicking the one that is open keeps it open, rather than
    // leaving the application showing no page at all.
    const bar = new Toolbar();
    const pages = new ActionGroup('page', bar);
    pages.allowNone.value = false;
    const notes = pages.add(bar.addAction({ id: 'notes', text: 'Notes' }));
    const cad = pages.add(bar.addAction({ id: 'cad', text: 'CAD' }));

    notes.trigger();
    notes.trigger();
    expect(notes.checked.value).toBe(true);
    cad.trigger();
    expect(cad.checked.value).toBe(true);
    expect(notes.checked.value).toBe(false);
  });

  it('can be built by hand, without any plain model', () => {
    const bar = new Toolbar({ objectName: 'tools' });
    const group = new ActionGroup('tool', bar);
    const line = group.add(bar.addAction({ id: 'line', text: 'Line' }));
    const arc = group.add(bar.addAction({ id: 'arc', text: 'Arc' }));
    const seen: (string | null)[] = [];
    group.checkedChanged.connect((a) => seen.push(a?.id ?? null));

    line.setChecked(true);
    arc.setChecked(true);
    expect(group.checkedAction).toBe(arc);
    expect(seen).toEqual(['line', 'arc']);
  });
});

describe('filling one branch from plain data', () => {
  it('rebuilds a submenu without touching the rest', () => {
    const bar = new Toolbar();
    const file = bar.addMenu({ id: 'file', text: 'File' });
    const open = file.addMenu({ id: 'open', text: 'Open' });
    const save = file.addAction({ id: 'save', text: 'Save' });

    addModel(open, [item('a.json', 'a.json'), item('b.json', 'b.json')]);
    expect(open.items.map((i) => i.id)).toEqual(['a.json', 'b.json']);

    open.clearItems();
    addModel(open, [item('c.json', 'c.json')]);
    expect(open.items.map((i) => i.id)).toEqual(['c.json']);
    expect(save.isDestroyed).toBe(false);
    expect(bar.actionById('save')).toBe(save);
    expect(bar.actionById('open')).toBe(open);
    expect(bar.actionById('nothing')).toBeNull();
  });
});

describe('changes', () => {
  it('reports every change below, once, with the source', () => {
    const bar = Toolbar.fromModel([submenu('file', 'File', [item('new', 'New')])]);
    const sources: string[] = [];
    bar.changed.connect((source) => sources.push(source.objectName || source.id));
    const before = bar.revision;

    (bar.itemById('new') as Action).text.value = 'New file';
    expect(sources).toHaveLength(1);
    expect(bar.revision).toBeGreaterThan(before);

    // Structure counts too.
    bar.addSeparator('s');
    expect(bar.revision).toBeGreaterThan(before + 1);
  });

  it('stops reporting once the item is gone', () => {
    const bar = Toolbar.fromModel([item('a', 'A')]);
    const a = bar.itemById('a') as Action;
    let count = 0;
    bar.changed.connect(() => {
      count += 1;
    });

    a.destroy();
    const afterRemoval = count;
    a.text.value = 'gone';
    expect(count).toBe(afterRemoval);
    expect(bar.items).toHaveLength(0);
  });
});

describe('back to the plain model', () => {
  it('round-trips the structure', () => {
    const bar = Toolbar.fromModel(tree());
    const back = bar.toModel();

    expect(back.map((n) => n.id)).toEqual(['file', 'view']);
    const view = back[1] as { children: ToolbarNode[] };
    expect(view.children.map((n) => n.kind)).toEqual(['toggle', 'separator', 'toggle', 'toggle']);
    const light = view.children[2] as { checked: boolean; group?: string };
    expect(light.checked).toBe(true);
    expect(light.group).toBe('theme');
  });

  it('gives back callbacks that drive the live objects', () => {
    const onSelect = vi.fn();
    const bar = Toolbar.fromModel([item('new', 'New', { onSelect })]);
    const node = bar.toModel()[0] as { onSelect?: () => void };

    node.onSelect?.();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('shortcuts', () => {
  it('finds an action however the shortcut was spelled', () => {
    const onSelect = vi.fn();
    const bar = Toolbar.fromModel([
      submenu('file', 'File', [item('save', 'Save', { shortcut: 'Ctrl+S', onSelect })]),
    ]);

    expect(bar.actionForShortcut('ctrl + s')?.id).toBe('save');
    expect(bar.triggerShortcut('CTRL+S')).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(bar.triggerShortcut('Ctrl+Q')).toBe(false);
  });
});

describe('rebuilding', () => {
  it('destroys what it replaces', () => {
    const bar = Toolbar.fromModel([item('old', 'Old')]);
    const old = bar.itemById('old') as Action;

    bar.setModel([item('fresh', 'Fresh')]);
    expect(old.isDestroyed).toBe(true);
    expect(bar.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('takes the whole toolbar down with it', () => {
    const bar = Toolbar.fromModel(tree());
    const svg = bar.itemById('svg') as Action;
    bar.destroy();
    expect(svg.isDestroyed).toBe(true);
    expect(bar.items).toHaveLength(0);
  });
});

describe('a menu bar', () => {
  const bar = () =>
    MenuBar.fromMenuBarModel(
      menuBar(
        [
          menu('file', 'File', [item('new', 'New', { onSelect: () => {} })]),
          menu('view', 'View', [toggle('grid', 'Grid', true)]),
          menu('help', 'Help', [item('about', 'About')]),
        ],
        'main'
      )
    );

  it('is a toolbar, drawn as a bar of labels', () => {
    const menus = bar();
    expect(menus).toBeInstanceOf(Toolbar);
    expect(menus.variant.value).toBe('bar');
    expect(menus.effectiveDisplay).toBe('label');
    expect(menus.menus.map((m) => m.id)).toEqual(['file', 'view', 'help']);
  });

  it('holds which menu is open, one at a time', () => {
    const menus = bar();
    const seen: (string | null)[] = [];
    menus.openChanged.connect((m) => seen.push(m?.id ?? null));

    expect(menus.isOpen).toBe(false);
    menus.openById('file');
    expect(menus.openMenu?.id).toBe('file');
    menus.openById('view');
    expect(menus.openMenu?.id).toBe('view');

    // Clicking the open one shuts it; clicking another moves the opening.
    menus.toggle(menus.actionById('view')!);
    expect(menus.isOpen).toBe(false);
    expect(seen).toEqual(['file', 'view', null]);
  });

  it('moves the opening along the bar, but only once something is open', () => {
    const menus = bar();
    menus.hover(menus.actionById('help')!);
    expect(menus.isOpen).toBe(false);

    menus.openById('file');
    menus.hover(menus.actionById('help')!);
    expect(menus.openMenu?.id).toBe('help');
  });

  it('does not shut the menu the pointer just opened', () => {
    // The bug this guards: with the bar open, moving onto the next menu opens
    // it, and the click that was on its way then arrived at a menu that was
    // already open and closed it again. From the outside it looked like the
    // menu appearing and vanishing in the same gesture.
    const menus = bar();
    menus.openById('file');
    const view = menus.actionById('view')!;

    menus.hover(view);
    expect(menus.openMenu).toBe(view);
    expect(menus.openedByHover).toBe(true);

    menus.toggle(view); // the click that followed the pointer
    expect(menus.openMenu).toBe(view);
    expect(menus.openedByHover).toBe(false);

    menus.toggle(view); // a second, deliberate click shuts it
    expect(menus.isOpen).toBe(false);
  });

  it('still shuts a menu opened by clicking it', () => {
    const menus = bar();
    const file = menus.actionById('file')!;
    menus.toggle(file);
    expect(menus.openMenu).toBe(file);
    menus.toggle(file);
    expect(menus.isOpen).toBe(false);
  });

  it('refuses to open what is not its own menu, or what is disabled', () => {
    const menus = bar();
    const strayBar = new Toolbar();
    const stray = strayBar.addMenu({ id: 'stray', text: 'Stray' });
    stray.addAction({ id: 'x', text: 'x' });
    menus.open(stray);
    expect(menus.isOpen).toBe(false);

    menus.actionById('view')!.enabled.value = false;
    expect(menus.openById('view')).toBe(false);
    expect(menus.isOpen).toBe(false);
  });

  it('shuts itself once something below has been performed, when asked to', () => {
    const menus = bar();
    menus.closeOnTrigger();
    menus.openById('file');
    menus.triggerById('new');
    expect(menus.isOpen).toBe(false);
  });

  it('goes back to its own model, menus only', () => {
    const menus = bar();
    menus.addAction({ id: 'stray', text: 'Not a menu' });
    const model = menus.toMenuBarModel();
    expect(model.id).toBe('main');
    expect(model.menus.map((m) => m.id)).toEqual(['file', 'view', 'help']);
    expect(menusOf(menus.toModel()).map((m) => m.id)).toEqual(['file', 'view', 'help']);
  });
});

describe('grouping commands by what they are', () => {
  const editor = () => {
    const bar = new MenuBar();
    const edit = bar.addMenu({ id: 'edit', text: 'Edit' });
    const clipboard = new ActionCollection('clipboard', bar, { title: 'Clipboard' });
    const run = () => {};
    clipboard.add(edit.addAction({ id: 'cut', text: 'Cut', shortcut: 'Ctrl+X', onTriggered: run }));
    clipboard.add(
      edit.addAction({ id: 'copy', text: 'Copy', shortcut: 'Ctrl+C', onTriggered: run })
    );
    // Drawn somewhere else entirely, and still of the same kind.
    clipboard.add(
      bar.addAction({ id: 'paste', text: 'Paste', shortcut: 'Ctrl+V', onTriggered: run })
    );
    return { bar, edit, clipboard };
  };

  it('greys the whole kind out at once, wherever each one is drawn', () => {
    const { bar, clipboard } = editor();
    clipboard.setEnabled(false);
    expect(clipboard.actions.every((a) => !a.enabled.value)).toBe(true);
    expect(bar.actionById('paste')!.enabled.value).toBe(false);
    expect(bar.actionById('edit')!.enabled.value).toBe(true);

    clipboard.setEnabled(true);
    expect(bar.actionById('cut')!.enabled.value).toBe(true);
  });

  it('leaves the tree alone — a collection is not a place', () => {
    const { bar, edit, clipboard } = editor();
    expect(edit.items.map((i) => i.id)).toEqual(['cut', 'copy']);
    expect(bar.items.map((i) => i.id)).toEqual(['edit', 'paste']);
    expect(bar.actionById('cut')!.collection).toBe(clipboard);
    expect(bar.actionById('cut')!.category.value).toBe('clipboard');
  });

  it('answers for the shortcuts of its kind', () => {
    const { clipboard } = editor();
    const done: string[] = [];
    clipboard.triggered.connect((a) => done.push(a.id));

    expect(clipboard.triggerShortcut('ctrl + c')).toBe(true);
    expect(clipboard.triggerShortcut('Ctrl+S')).toBe(false);
    expect(done).toEqual(['copy']);
  });

  it('can own a command that is not drawn yet, and hand it to a menu later', () => {
    const bar = new Toolbar();
    const io = new ActionCollection('io', bar, { title: 'File' });
    io.addAction({ id: 'save', text: 'Save', shortcut: 'Ctrl+S' });
    io.addAction({ id: 'open', text: 'Open' });
    // Owned but nowhere on the bar yet — and already answering to its shortcut.
    expect(bar.items).toEqual([]);
    expect(io.triggerShortcut('Ctrl+S')).toBe(false); // nothing connected to it
    expect(io.byId('save')!.parent).toBe(io); // owned by the collection until a list takes it

    const menu = io.buildMenu(bar);
    expect(bar.items.map((i) => i.id)).toEqual(['io']);
    // The entry is on the bar; the commands are in the list that entry opens.
    expect(menu.items.map((i) => i.id)).toEqual(['save', 'open']);
    expect(io.byId('save')!.parent).toBe(menu.menu);
    expect(bar.actionById('save')).toBe(io.byId('save'));
  });

  it('drops a member that is destroyed', () => {
    const { clipboard, bar } = editor();
    bar.actionById('paste')!.destroy();
    expect(clipboard.actions.map((a) => a.id)).toEqual(['cut', 'copy']);
  });

  it('carries the kind through the plain form', () => {
    const bar = Toolbar.fromModel([
      submenu('edit', 'Edit', [
        item('cut', 'Cut', { category: 'clipboard' }),
        item('undo', 'Undo', { category: 'history' }),
      ]),
    ]);
    expect(bar.actionById('cut')!.category.value).toBe('clipboard');
    expect(nodesInCategory(bar.toModel(), 'clipboard').map((n) => n.id)).toEqual(['cut']);
  });
});

describe('an action that opens a list', () => {
  it('owns the list rather than being one', () => {
    const bar = new Toolbar();
    const file = bar.addMenu({ id: 'file', text: 'File' });

    // Nothing yet: reading `hasMenu` must not bring a menu into being.
    expect(file.hasMenu).toBe(false);

    const save = file.addAction({ id: 'save', text: 'Save', onTriggered: () => {} });
    expect(file.hasMenu).toBe(true);
    expect(file.menu).toBeInstanceOf(Menu);
    // The entry is on the bar; the command is in the entry's list.
    expect(bar.items.map((i) => i.id)).toEqual(['file']);
    expect(save.parent).toBe(file.menu);
    expect(file.items).toEqual([save]);
    expect(bar.actionById('save')).toBe(save);
    expect(bar.pathTo('save')?.map((i) => i.id)).toEqual(['file', 'save']);
  });

  it('stays an entry: it can be greyed, checked and triggered', () => {
    const bar = new Toolbar();
    const file = bar.addMenu({ id: 'file', text: 'File' });
    file.addAction({ id: 'new', text: 'New' });

    file.enabled.value = false;
    expect(bar.openMenuOf(file)).toBe(false); // a greyed entry opens nothing
    file.enabled.value = true;
    expect(bar.openMenuOf(file)).toBe(true);
  });

  it('opens one list at a time, and the pointer moves the opening', () => {
    const bar = new Toolbar();
    const file = bar.addMenu({ id: 'file', text: 'File' });
    file.addAction({ id: 'new', text: 'New' });
    const edit = bar.addMenu({ id: 'edit', text: 'Edit' });
    edit.addAction({ id: 'copy', text: 'Copy' });
    const seen: (string | null)[] = [];
    bar.menuOpenChanged.connect((e) => seen.push(e?.id ?? null));

    bar.toggleMenuOf(file);
    expect(bar.openEntry).toBe(file);

    bar.hoverMenuOf(edit);
    expect(bar.openEntry).toBe(edit);
    expect(file.menu.isOpen).toBe(false);

    // The click that followed the pointer keeps it open; the next one shuts it.
    bar.toggleMenuOf(edit);
    expect(bar.openEntry).toBe(edit);
    bar.toggleMenuOf(edit);
    expect(bar.isOpen).toBe(false);
    expect(seen).toEqual(['file', 'edit', null]);
  });

  it('shuts the lists below it when it shuts', () => {
    const bar = new Toolbar();
    const file = bar.addMenu({ id: 'file', text: 'File' });
    const exports = file.addMenu({ id: 'export', text: 'Export' });
    exports.addAction({ id: 'png', text: 'PNG' });

    bar.openMenuOf(file);
    exports.menu.show();
    expect(exports.menu.isOpen).toBe(true);

    bar.closeMenus();
    expect(file.menu.isOpen).toBe(false);
    expect(exports.menu.isOpen).toBe(false);
  });

  it('carries submenus through the plain form both ways', () => {
    const bar = Toolbar.fromModel([
      submenu('file', 'File', [
        item('new', 'New'),
        submenu('export', 'Export', [item('png', 'PNG')]),
      ]),
    ]);
    const file = bar.actionById('file')!;
    expect(file.items.map((i) => i.id)).toEqual(['new', 'export']);
    expect(bar.actionById('export')!.items.map((i) => i.id)).toEqual(['png']);

    const back = bar.toModel()[0] as { children: { id: string; children?: { id: string }[] }[] };
    expect(back.children.map((c) => c.id)).toEqual(['new', 'export']);
    expect(back.children[1].children?.map((c) => c.id)).toEqual(['png']);
  });
});
