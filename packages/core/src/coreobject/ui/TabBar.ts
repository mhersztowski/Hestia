import { CoreObject } from '../CoreObject';
import { Property } from '../Property';
import { Signal } from '../Signal';
import { type TabBarModel, type TabNode } from '../../models/ui/tabbar';
import { Menu, UiObject } from './items';

export interface TabInit {
  id?: string;
  title?: string;
  icon?: unknown;
  tooltip?: string;
  closable?: boolean;
  modified?: boolean;
  content?: unknown;
  visible?: boolean;
}

/**
 * One tab.
 *
 * It carries what is drawn (a title, an icon, a dot for unsaved changes) and its
 * own commands as `Action`s — closing this one, closing the others, closing them
 * all. They live in `tab.menu`, which is what a right-click shows, so the same
 * objects answer for the × on the tab, for the context menu and for a shortcut.
 */
export class Tab extends UiObject {
  readonly title = new Property<string>('');
  readonly icon = new Property<unknown>(undefined);
  readonly tooltip = new Property<string | undefined>(undefined);
  readonly closable = new Property<boolean>(true);
  /** Unsaved changes. The bar carries it; what counts as modified is the host's business. */
  readonly modified = new Property<boolean>(false);
  readonly content = new Property<unknown>(undefined);
  readonly visible = new Property<boolean>(true);

  /**
   * The tab's own list: what a right-click shows, and what a click on the tab
   * opens once the tab is already current — the same bargain a toolbar entry
   * makes, where the first click chooses and the second opens what it holds.
   *
   * It comes with the three commands every tab has; a host adds its own with
   * `tab.menu.addAction(...)`.
   */
  readonly menu = new Menu({ id: 'tab-menu', title: 'Tab' });

  /** The tab was chosen — by a click, by a shortcut, by the host. */
  readonly activated = new Signal<[tab: Tab]>();
  /** The tab was shut. It is not destroyed by this; the bar decides that. */
  readonly closed = new Signal<[tab: Tab]>();

  constructor(init: TabInit = {}) {
    super(undefined, init.id ?? init.title ?? 'Tab');
    if (init.id !== undefined) this.id = init.id;
    if (init.title !== undefined) this.title.setSilent(init.title);
    if (init.icon !== undefined) this.icon.setSilent(init.icon);
    if (init.tooltip !== undefined) this.tooltip.setSilent(init.tooltip);
    if (init.closable !== undefined) this.closable.setSilent(init.closable);
    if (init.modified !== undefined) this.modified.setSilent(init.modified);
    if (init.content !== undefined) this.content.setSilent(init.content);
    if (init.visible !== undefined) this.visible.setSilent(init.visible);

    this.watch(
      this.title,
      this.icon,
      this.tooltip,
      this.closable,
      this.modified,
      this.content,
      this.visible
    );

    this.menu.setParent(this);
    this.menu.closeOnTrigger();
    this.#buildActions();
  }

  /** The bar this tab belongs to, when it is in one. */
  get bar(): TabBar | null {
    return this.parent instanceof TabBar ? this.parent : null;
  }

  get isCurrent(): boolean {
    return this.bar?.current.value === this;
  }

  /** What to show on hover: the explicit tooltip, or the title. */
  get label(): string {
    return this.title.value || this.id;
  }

  /**
   * Whether clicking the tab should open its list rather than choose it.
   *
   * Only once it is current: the first click on a tab is always about looking
   * at what is in it, and a menu appearing instead would be the wrong answer
   * to the wrong question.
   */
  get opensOnClick(): boolean {
    return this.isCurrent && this.menu.visibleItems.length > 0;
  }

  /** A click on the tab: choose it, or open its list when it is already chosen. */
  click(): void {
    if (this.opensOnClick) this.menu.toggle();
    else this.activate();
  }

  /** Make this the current tab. */
  activate(): void {
    this.bar?.setCurrent(this);
  }

  /** Shut it. Refused when the tab is not closable — some tabs are the application. */
  close(): boolean {
    if (!this.closable.value) return false;
    this.visible.value = false;
    this.closed.emit(this);
    this.bar?._tabClosed(this);
    return true;
  }

  show(): void {
    this.visible.value = true;
  }

  #buildActions(): void {
    const close = this.menu.addAction({ id: 'close', text: 'Close' });
    close.enabled.setSilent(this.closable.value);
    close.triggered.connect(() => this.close(), this);
    this.closable.changed.connect((on) => {
      close.enabled.value = on;
    }, this);

    const others = this.menu.addAction({ id: 'closeOthers', text: 'Close others' });
    others.triggered.connect(() => {
      for (const other of this.bar?.tabs ?? []) if (other !== this) other.close();
    }, this);

    const all = this.menu.addAction({ id: 'closeAll', text: 'Close all' });
    all.triggered.connect(() => {
      for (const other of [...(this.bar?.tabs ?? [])]) other.close();
    }, this);
  }

  static fromModel(node: TabNode): Tab {
    return new Tab({
      id: node.id,
      title: node.title,
      icon: node.icon,
      tooltip: node.tooltip,
      closable: node.closable,
      modified: node.modified,
      content: node.content,
      visible: node.hidden === undefined ? undefined : !node.hidden,
    });
  }

  toModel(): TabNode {
    return {
      id: this.id,
      title: this.title.value || undefined,
      icon: this.icon.value,
      tooltip: this.tooltip.value,
      closable: this.closable.value,
      modified: this.modified.value ? true : undefined,
      content: this.content.value,
      hidden: this.visible.value ? undefined : true,
    };
  }
}

export interface TabBarInit {
  objectName?: string;
  /** Whether a bar too long for its space scrolls. On by default. */
  scrollable?: boolean;
}

/**
 * A row of tabs, one of them current.
 *
 * The bar holds the tabs (as children, so the tree and the cascade destroy come
 * from `CoreObject`) and which one is current. Everything that is a rule rather
 * than a drawing is here: what happens to the current tab when it is shut, which
 * tab is next, what the overflow menu contains.
 *
 * `menu` is that overflow menu — every tab, including the ones scrolled out of
 * sight, so a bar of thirty files is still navigable. It keeps itself in step
 * with the tabs, which is the one thing a list of this kind always gets wrong.
 */
export class TabBar extends UiObject {
  readonly current = new Property<Tab | null>(null);
  readonly scrollable = new Property<boolean>(true);

  /** The current tab changed. */
  readonly currentChanged = new Signal<[tab: Tab | null, previous: Tab | null]>();
  /** A tab was shut. */
  readonly tabClosed = new Signal<[tab: Tab]>();

  /** Every tab, as a menu — for what did not fit on the bar. */
  readonly menu = new Menu({ id: 'tabs', title: 'Tabs' });

  constructor(init: TabBarInit = {}, parent?: CoreObject) {
    super(undefined, init.objectName ?? 'TabBar');
    if (init.scrollable !== undefined) this.scrollable.setSilent(init.scrollable);
    this.watch(this.current, this.scrollable);

    this.current.changed.connect(
      (next, previous) => this.currentChanged.emit(next, previous),
      this
    );
    this.menu.setParent(this);
    this.menu.closeOnTrigger();

    if (parent) this.setParent(parent);
  }

  // ── Its tabs ───────────────────────────────────────────────────────────────

  get tabs(): Tab[] {
    return this.children.filter((c): c is Tab => c instanceof Tab);
  }

  /** The tabs on screen. A shut tab keeps its place but takes no room. */
  get visibleTabs(): Tab[] {
    return this.tabs.filter((t) => t.visible.value);
  }

  tabById(id: string): Tab | null {
    return this.tabs.find((t) => t.id === id) ?? null;
  }

  addTab(init: TabInit = {}): Tab {
    return this.attach(new Tab(init));
  }

  /** Shut every tab's list. */
  closeTabMenus(): void {
    for (const tab of this.tabs) tab.menu.close();
  }

  /** Take an existing tab into this bar, making it current when there is none. */
  attach(tab: Tab): Tab {
    tab.setParent(this);
    // One list at a time, as everywhere else.
    tab.menu.open.changed.connect((on) => {
      if (!on) return;
      for (const other of this.tabs) if (other !== tab) other.menu.close();
    }, this);
    this.#addMenuEntry(tab);
    if (this.current.value === null && tab.visible.value) this.setCurrent(tab);
    return tab;
  }

  removeTab(tab: Tab): void {
    if (tab.parent !== this) return;
    const next = this.#neighbourOf(tab);
    tab.destroy();
    if (this.current.value === tab || this.current.value?.isDestroyed) this.setCurrent(next);
  }

  // ── Which one is current ───────────────────────────────────────────────────

  setCurrent(tab: Tab | null): boolean {
    if (tab !== null && (tab.parent !== this || !tab.visible.value)) return false;
    if (this.current.value === tab) return true;
    this.current.value = tab;
    tab?.activated.emit(tab);
    return true;
  }

  setCurrentById(id: string): boolean {
    const tab = this.tabById(id);
    return tab !== null && this.setCurrent(tab);
  }

  /** The next tab along, wrapping round — what Ctrl+Tab means. */
  next(): Tab | null {
    return this.#step(1);
  }

  previous(): Tab | null {
    return this.#step(-1);
  }

  #step(by: number): Tab | null {
    const showing = this.visibleTabs;
    if (showing.length === 0) return null;
    const at = this.current.value ? showing.indexOf(this.current.value) : -1;
    const next = showing[(at + by + showing.length) % showing.length];
    this.setCurrent(next);
    return next;
  }

  /**
   * The tab to fall back on when `tab` goes: the one after it, or failing
   * that the one before.
   *
   * Walks the full list rather than the visible one, because by the time a tab
   * reports itself shut it is already invisible — and looking for its position
   * among the tabs that are left finds nothing.
   */
  #neighbourOf(tab: Tab): Tab | null {
    const all = this.tabs;
    const at = all.indexOf(tab);
    for (let i = at + 1; i < all.length; i += 1) {
      if (all[i] !== tab && all[i].visible.value) return all[i];
    }
    for (let i = at - 1; i >= 0; i -= 1) {
      if (all[i] !== tab && all[i].visible.value) return all[i];
    }
    return null;
  }

  /** @internal Called by `Tab.close()`. */
  _tabClosed(tab: Tab): void {
    this.tabClosed.emit(tab);
    // The current tab going leaves the bar pointing at nothing, so it moves
    // to the neighbour — which is what every editor does and what nobody
    // notices until it does not happen.
    if (this.current.value === tab) this.setCurrent(this.#neighbourOf(tab));
  }

  // ── The overflow menu ──────────────────────────────────────────────────────

  #addMenuEntry(tab: Tab): void {
    const entry = this.menu.addAction({
      id: `tab:${tab.id}`,
      text: tab.label,
      checkable: true,
      checked: tab.isCurrent,
    });
    entry.triggered.connect(() => {
      this.setCurrent(tab);
      entry.setChecked(true);
    }, this);
    tab.title.changed.connect((title) => {
      entry.text.value = title || tab.id;
    }, this);
    tab.visible.changed.connect((on) => {
      entry.visible.value = on;
    }, this);
    tab.destroyed.connect(() => entry.destroy(), this);
    this.currentChanged.connect(() => entry.setChecked(tab.isCurrent), this);
  }

  // ── The plain model ────────────────────────────────────────────────────────

  static fromModel(model: TabBarModel, init: TabBarInit = {}): TabBar {
    const bar = new TabBar({ objectName: model.id, ...init });
    for (const node of model.tabs) bar.attach(Tab.fromModel(node));
    if (model.currentId !== undefined) bar.setCurrentById(model.currentId);
    return bar;
  }

  toModel(): TabBarModel {
    return {
      id: this.objectName || undefined,
      tabs: this.tabs.map((t) => t.toModel()),
      currentId: this.current.value?.id,
    };
  }
}
