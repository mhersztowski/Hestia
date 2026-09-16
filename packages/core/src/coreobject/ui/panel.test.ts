import { describe, expect, it, vi } from 'vitest';
import { Action, Menu, Panel, Workspace } from './index';
import { PANEL_AREAS, panel, workspace, type WorkspaceModel } from '../../models/ui/panel';

const built = (): Workspace =>
  Workspace.fromModel(
    workspace(
      [
        panel('files', 'Files', { area: 'left', size: 220 }),
        panel('console', 'Console', { area: 'bottom', size: 160 }),
        panel('props', 'Properties', { area: 'right', closed: true }),
      ],
      'main'
    )
  );

describe('a panel', () => {
  it('carries its own commands as actions', () => {
    const p = new Panel({ id: 'files', title: 'Files' });
    expect(p.menu).toBeInstanceOf(Menu);
    expect(p.actionById('close')).toBeInstanceOf(Action);
    expect(p.actionById('move:bottom')).toBeInstanceOf(Action);
    expect(p.titleBarActions.map((a) => a.id)).toEqual(['expand', 'float', 'close']);
    // The menu is a menu, not an entry of something: a panel holds no entries
    // itself, its commands are the list in `panel.menu`.
    expect(p.menu.items.map((i) => i.id)).toEqual([
      'move',
      's1',
      'float',
      'expand',
      'header',
      's2',
      'close',
    ]);
    // And "Move to" is an entry that owns a list of its own.
    expect(p.actionById('move')!.items.map((i) => i.id)).toEqual([
      'move:left',
      'move:right',
      'move:top',
      'move:bottom',
      'move:centre',
    ]);
  });

  it('moves when its action is triggered, and ticks where it went', () => {
    const p = new Panel({ id: 'files', area: 'left' });
    p.actionById('move:bottom')!.trigger();
    expect(p.area.value).toBe('bottom');
    expect(p.actionById('move:bottom')!.checked.value).toBe(true);
    expect(p.actionById('move:left')!.checked.value).toBe(false);

    // And the other way: moved by code, the menu still shows where it is.
    p.moveTo('right');
    expect(p.actionById('move:right')!.checked.value).toBe(true);
  });

  it('floats and docks again, remembering where it came from', () => {
    const p = new Panel({ id: 'files', area: 'left' });
    p.actionById('float')!.trigger();
    expect(p.floating.value).toBe(true);
    expect(p.area.value).toBe('left');

    p.dock();
    expect(p.floating.value).toBe(false);
    expect(p.actionById('float')!.checked.value).toBe(false);
  });

  it('expands and shuts through its actions', () => {
    const p = new Panel({ id: 'files' });
    p.actionById('expand')!.trigger();
    expect(p.expanded.value).toBe(true);

    p.actionById('close')!.trigger();
    expect(p.visible.value).toBe(false);
    // Shut is not expanded: coming back to a panel filling the screen would
    // hide the page it was shut to get out of.
    expect(p.expanded.value).toBe(false);
  });

  it('hides its title bar through an action of its own', () => {
    const p = new Panel({ id: 'preview', title: 'Preview' });
    const header = p.actionById('header')!;

    expect(p.headerVisible.value).toBe(true);
    expect(header.checked.value).toBe(true);

    header.trigger();
    expect(p.headerVisible.value).toBe(false);

    // And back, whichever way it is turned: the menu follows the property.
    p.setHeaderVisible(true);
    expect(header.checked.value).toBe(true);
  });

  it('remembers the title bar in the layout', () => {
    const ws = built();
    const files = ws.panelById('files')!;
    files.setHeaderVisible(false);

    const saved = ws.toModel();
    expect(saved.panels.find((n) => n.id === 'files')?.header).toBe(false);

    files.setHeaderVisible(true);
    ws.applyModel(saved);
    expect(files.headerVisible.value).toBe(false);
  });

  it('refuses what it was told it may not do, and the menu shows that', () => {
    const p = new Panel({ id: 'page', closable: false, movable: false, floatable: false });
    expect(p.actionById('close')!.enabled.value).toBe(false);
    expect(p.actionById('move')!.enabled.value).toBe(false);
    expect(p.actionById('float')!.enabled.value).toBe(false);

    expect(p.close()).toBe(false);
    expect(p.moveTo('bottom')).toBe(false);
    expect(p.setFloating(true)).toBe(false);
    expect(p.visible.value).toBe(true);
  });

  it('has an action for every area there is', () => {
    const p = new Panel({ id: 'files' });
    for (const area of PANEL_AREAS) expect(p.actionById(`move:${area}`)).toBeInstanceOf(Action);
  });
});

describe('a workspace', () => {
  it('sorts its panels by area, leaving the shut ones out', () => {
    const ws = built();
    expect(ws.panels.map((p) => p.id)).toEqual(['files', 'console', 'props']);
    expect(ws.panelsIn('left').map((p) => p.id)).toEqual(['files']);
    expect(ws.panelsIn('right')).toEqual([]);
    expect(ws.visiblePanels.map((p) => p.id)).toEqual(['files', 'console']);
    expect(ws.sizeOf('left')).toBe(220);
    expect(ws.sizeOf('right')).toBe(0);
    expect(ws.isHorizontal('bottom')).toBe(true);
  });

  it('takes a floating panel out of its area', () => {
    const ws = built();
    const files = ws.panelById('files')!;
    const moved = vi.fn();
    ws.panelMoved.connect(moved);

    files.setFloating(true);
    expect(ws.panelsIn('left')).toEqual([]);
    expect(ws.floatingPanels.map((p) => p.id)).toEqual(['files']);
    expect(moved).toHaveBeenCalled();
  });

  it('lets only one panel fill it at a time', () => {
    const ws = built();
    const files = ws.panelById('files')!;
    const console_ = ws.panelById('console')!;

    files.setExpanded(true);
    console_.setExpanded(true);
    expect(files.expanded.value).toBe(false);
    expect(ws.expandedPanel).toBe(console_);
  });

  it('resizes a whole area at once', () => {
    const ws = built();
    ws.addPanel({ id: 'outline', title: 'Outline', area: 'left', size: 200 });
    ws.resize('left', 300);
    expect(ws.panelsIn('left').map((p) => p.size.value)).toEqual([300, 300]);
    expect(ws.sizeOf('left')).toBe(300);
  });

  it('builds a View menu wired both ways', () => {
    const ws = built();
    const view = ws.viewMenu();
    const entry = view.actionById('view:console')!;

    expect(view.items.map((i) => i.id)).toEqual(['view:files', 'view:console', 'view:props']);
    expect(entry.checked.value).toBe(true);

    entry.trigger();
    expect(ws.panelById('console')!.visible.value).toBe(false);

    // Brought back by its own means, the menu follows.
    ws.panelById('console')!.show();
    expect(entry.checked.value).toBe(true);

    // The menu is an action, not a panel.
    expect(ws.panels.map((p) => p.id)).not.toContain('view');
  });

  it('keeps the View menu in step with panels that come and go', () => {
    const ws = built();
    const view = ws.viewMenu();

    const later = ws.addPanel({ id: 'outline', title: 'Outline', area: 'left' });
    expect(view.items.map((i) => i.id)).toContain('view:outline');
    expect(view.actionById('view:outline')!.checked.value).toBe(true);

    later.destroy();
    expect(view.items.map((i) => i.id)).not.toContain('view:outline');
  });

  it('offers the title bar from the menu too, so hiding it is not one-way', () => {
    const ws = built();
    const view = ws.viewMenu();
    const entry = view.actionById('view:files')!;
    const files = ws.panelById('files')!;

    // The entry both shows the panel and opens onto what else can be done to it.
    expect(entry.checkable.value).toBe(true);
    expect(entry.items.map((i) => i.id)).toEqual(['view:files:header', 'view:files:floating']);

    // Turn the title bar off from the panel's own menu…
    files.actionById('header')!.trigger();
    expect(files.headerVisible.value).toBe(false);
    expect(entry.actionById('view:files:header')!.checked.value).toBe(false);

    // …and back on from the menu bar, which is the whole point.
    entry.actionById('view:files:header')!.trigger();
    expect(files.headerVisible.value).toBe(true);
  });

  it('floats a panel from the menu as well', () => {
    const ws = built();
    const entry = ws.viewMenu().actionById('view:files')!;
    entry.actionById('view:files:floating')!.trigger();
    expect(ws.panelById('files')!.floating.value).toBe(true);
  });

  it('writes the layout out and puts it back without rebuilding anything', () => {
    const ws = built();
    const files = ws.panelById('files')!;
    files.moveTo('bottom');
    files.size.value = 300;

    const saved: WorkspaceModel = ws.toModel();
    expect(saved.id).toBe('main');
    expect(saved.panels.find((p) => p.id === 'files')?.area).toBe('bottom');
    expect(saved.panels.find((p) => p.id === 'props')?.closed).toBe(true);

    files.moveTo('right');
    ws.applyModel(saved);
    expect(files.area.value).toBe('bottom');
    expect(files.size.value).toBe(300);
    // The same object throughout: restoring a layout must not throw away what
    // the panel was showing.
    expect(ws.panelById('files')).toBe(files);
  });

  it('reports every change below, so one subscription redraws the lot', () => {
    const ws = built();
    let count = 0;
    ws.changed.connect(() => {
      count += 1;
    });

    ws.panelById('files')!.title.value = 'Project files';
    ws.panelById('console')!.moveTo('right');
    expect(count).toBeGreaterThan(1);
    expect(ws.revision).toBeGreaterThan(0);
  });
});

describe('a popup menu of its own', () => {
  it('opens and shuts itself, and refuses to open onto nothing', () => {
    const menu = new Menu({ id: 'ctx', title: 'Context' });
    const seen: boolean[] = [];
    menu.openChanged.connect((on) => seen.push(on));

    menu.show();
    expect(menu.isOpen).toBe(false); // nothing in it yet

    menu.addAction({ id: 'copy', text: 'Copy', onTriggered: () => {} });
    menu.show();
    expect(menu.isOpen).toBe(true);
    menu.toggle();
    expect(menu.isOpen).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it('shuts when something in it is chosen', () => {
    const menu = new Menu({ id: 'ctx' }).closeOnTrigger();
    const copy = menu.addAction({ id: 'copy', text: 'Copy', onTriggered: () => {} });
    menu.show();
    copy.trigger();
    expect(menu.isOpen).toBe(false);
  });

  it('is what a panel\u2019s \u22ee is', () => {
    const p = new Panel({ id: 'files', title: 'Files' });
    p.menu.show();
    expect(p.menu.isOpen).toBe(true);
    p.actionById('float')!.trigger();
    expect(p.floating.value).toBe(true);
    // Choosing an entry shuts the popup — the panel wires that up itself.
    expect(p.menu.isOpen).toBe(false);
  });
});
