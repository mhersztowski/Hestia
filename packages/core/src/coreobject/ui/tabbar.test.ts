import { describe, expect, it, vi } from 'vitest';
import { Menu, TabBar } from './index';
import { tab, tabBar } from '../../models/ui/tabbar';

const bar = (): TabBar =>
  TabBar.fromModel(
    tabBar(
      [
        tab('a.ts', 'a.ts'),
        tab('b.ts', 'b.ts', { modified: true }),
        tab('README', 'README', { closable: false }),
      ],
      'b.ts',
      'editor'
    )
  );

describe('a tab bar', () => {
  it('carries the tabs and knows which one is current', () => {
    const tabs = bar();
    expect(tabs.tabs.map((t) => t.id)).toEqual(['a.ts', 'b.ts', 'README']);
    expect(tabs.current.value?.id).toBe('b.ts');
    expect(tabs.tabById('b.ts')!.isCurrent).toBe(true);
    expect(tabs.tabById('b.ts')!.modified.value).toBe(true);
  });

  it('makes the first tab current when nothing says otherwise', () => {
    const tabs = new TabBar();
    const first = tabs.addTab({ id: 'one', title: 'One' });
    tabs.addTab({ id: 'two', title: 'Two' });
    expect(tabs.current.value).toBe(first);
  });

  it('reports the change, and only when there is one', () => {
    const tabs = bar();
    const seen: (string | null)[] = [];
    tabs.currentChanged.connect((t) => seen.push(t?.id ?? null));

    tabs.setCurrentById('a.ts');
    tabs.setCurrentById('a.ts');
    expect(seen).toEqual(['a.ts']);
  });

  it('steps along, wrapping round — which is what Ctrl+Tab means', () => {
    const tabs = bar();
    tabs.setCurrentById('a.ts');
    expect(tabs.next()?.id).toBe('b.ts');
    expect(tabs.next()?.id).toBe('README');
    expect(tabs.next()?.id).toBe('a.ts');
    expect(tabs.previous()?.id).toBe('README');
  });

  it('moves to the neighbour when the current tab is shut', () => {
    const tabs = bar();
    const closed = vi.fn();
    tabs.tabClosed.connect(closed);

    expect(tabs.current.value?.id).toBe('b.ts');
    tabs.tabById('b.ts')!.close();
    expect(closed).toHaveBeenCalled();
    // Not left pointing at a tab that is gone.
    expect(tabs.current.value?.id).toBe('README');
    expect(tabs.visibleTabs.map((t) => t.id)).toEqual(['a.ts', 'README']);
  });

  it('refuses to shut a tab that says it may not be shut', () => {
    const tabs = bar();
    const readme = tabs.tabById('README')!;
    expect(readme.close()).toBe(false);
    expect(readme.visible.value).toBe(true);
    expect(readme.menu.actionById('close')!.enabled.value).toBe(false);
  });

  it('gives every tab its own commands', () => {
    const tabs = bar();
    const a = tabs.tabById('a.ts')!;
    expect(a.menu).toBeInstanceOf(Menu);
    expect(a.menu.items.map((i) => i.id)).toEqual(['close', 'closeOthers', 'closeAll']);

    a.menu.actionById('closeOthers')!.trigger();
    // README refuses, so it stays; the rest go.
    expect(tabs.visibleTabs.map((t) => t.id)).toEqual(['a.ts', 'README']);
  });

  it('opens the tab\u2019s own list on a click, but only once it is current', () => {
    const tabs = bar();
    const a = tabs.tabById('a.ts')!;
    a.menu.addAction({ id: 'reveal', text: 'Reveal in files', onTriggered: () => {} });
    tabs.setCurrentById('b.ts');

    // Not current: the click is about looking at what is in it.
    a.click();
    expect(a.isCurrent).toBe(true);
    expect(a.menu.isOpen).toBe(false);

    // Current: the click opens what the tab holds.
    a.click();
    expect(a.menu.isOpen).toBe(true);
    a.click();
    expect(a.menu.isOpen).toBe(false);
  });

  it('shows one tab\u2019s list at a time', () => {
    const tabs = bar();
    const a = tabs.tabById('a.ts')!;
    const b = tabs.tabById('b.ts')!;

    a.menu.show();
    b.menu.show();
    expect(a.menu.isOpen).toBe(false);
    expect(b.menu.isOpen).toBe(true);

    tabs.closeTabMenus();
    expect(b.menu.isOpen).toBe(false);
  });

  it('keeps the overflow menu in step with the tabs', () => {
    const tabs = bar();
    expect(tabs.menu.items.map((i) => i.id)).toEqual(['tab:a.ts', 'tab:b.ts', 'tab:README']);
    expect(tabs.menu.actionById('tab:b.ts')!.checked.value).toBe(true);

    // Choosing from the menu is choosing the tab.
    tabs.menu.actionById('tab:a.ts')!.trigger();
    expect(tabs.current.value?.id).toBe('a.ts');
    expect(tabs.menu.actionById('tab:b.ts')!.checked.value).toBe(false);

    const later = tabs.addTab({ id: 'c.ts', title: 'c.ts' });
    expect(tabs.menu.actionById('tab:c.ts')!.text.value).toBe('c.ts');
    later.title.value = 'renamed.ts';
    expect(tabs.menu.actionById('tab:c.ts')!.text.value).toBe('renamed.ts');

    tabs.removeTab(later);
    expect(tabs.menu.actionById('tab:c.ts')).toBeNull();
  });

  it('goes back to the plain form, current tab and all', () => {
    const tabs = bar();
    tabs.setCurrentById('a.ts');
    tabs.tabById('b.ts')!.close();

    const model = tabs.toModel();
    expect(model.id).toBe('editor');
    expect(model.currentId).toBe('a.ts');
    expect(model.tabs.find((t) => t.id === 'b.ts')?.hidden).toBe(true);
    expect(model.tabs.find((t) => t.id === 'README')?.closable).toBe(false);

    const again = TabBar.fromModel(model);
    expect(again.visibleTabs.map((t) => t.id)).toEqual(['a.ts', 'README']);
    expect(again.current.value?.id).toBe('a.ts');
  });

  it('takes the tabs down with it', () => {
    const tabs = bar();
    const a = tabs.tabById('a.ts')!;
    tabs.destroy();
    expect(a.isDestroyed).toBe(true);
  });
});
