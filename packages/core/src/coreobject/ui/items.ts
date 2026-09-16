/**
 * The pieces every bar and every menu is made of.
 *
 * ── How the parts fit together ───────────────────────────────────────────────
 *
 *   Action      what can be done — text, icon, shortcut, enabled, checked
 *     └ .menu   the list it opens, when it opens one (a `Menu`)
 *   Menu        a list of entries, plus whether it is showing
 *   Toolbar     a strip of entries that is always showing
 *   MenuItem    anything that can sit in a list or a strip
 *
 * An application makes `Action`s. Bars and menus are made **of** actions, and an
 * action that opens something **has** a `Menu` — it does not become one. That is
 * why the entry can still be greyed out, checked or triggered while the list it
 * opens is a separate object with its own open state.
 *
 * Nothing here draws anything.
 *
 * The live form of a toolbar: `CoreObject`s instead of literals.
 *
 * The plain tree in `models/ui/toolbar.ts` is a description — it says what a menu
 * contains and nothing else. These classes are the thing itself: a label is a
 * `Property` that tells you when it changes, a click is a `Signal`, a submenu is
 * the object tree `CoreObject` already provides, and destroying a toolbar
 * destroys everything hanging under it.
 *
 * Why one file for five classes: they build each other. `ItemHost.addAction()`
 * returns an `Action`, an `Action` is a host for its submenu, and splitting them
 * across modules would only buy a circular import.
 *
 * Nothing here knows how anything is drawn. `Action` has an `icon`, but it never
 * looks inside it: whatever the host put there comes back out untouched, exactly
 * as in the plain model. React lives in `@hestia/ui-core`.
 */

import { CoreObject } from '../CoreObject';
import { Property } from '../Property';
import { Signal, type IConnectionOwner } from '../Signal';
import {
  collapseSeparators,
  type MenuCustomNode,
  type MenuItemNode,
  type MenuSeparatorNode,
  type MenuToggleNode,
  type ToolbarNode,
} from '../../models/ui/toolbar';

/** What an item *is*, mirroring the plain model's `kind`. */
export type MenuItemKind = 'action' | 'separator' | 'custom';

/**
 * Anything that announces a change: every `Property`, whatever it holds.
 *
 * Structural on purpose — `Property<T>` is invariant in `T` (its `changed`
 * signal carries the value both ways), so a list of properties of different
 * types has no common `Property<…>` to be typed as.
 */
export interface ChangeSource {
  readonly changed: { connect(slot: () => void, context?: IConnectionOwner): unknown };
}

/**
 * The shortcut text, stripped of the ways people write it differently.
 *
 * `Ctrl+S`, `ctrl + s` and `CTRL+S` are one shortcut — the text is written by
 * hand in a dozen places and will not be written the same way twice.
 */
export function normalizeShortcut(shortcut: string): string {
  return shortcut.toLowerCase().replace(/\s+/g, '');
}

/** @internal Implemented by `ActionCollection`; structural so it can live in its own file. */
export interface ActionCollectionLike {
  readonly name: string;
  /** @internal */ _memberTriggered(action: Action): void;
  /** @internal */ _memberRemoved(action: Action): void;
}

/** @internal Implemented by `ActionGroup`, declared here so the group can live in its own file. */
export interface ExclusiveGroup {
  readonly groupName: string;
  /** @internal */ _memberChecked(action: Action, checked: boolean): void;
  /** @internal */ _memberRemoved(action: Action): void;
}

// ── The common base ──────────────────────────────────────────────────────────

/**
 * Anything in the interface tree: a bar, a menu, an entry, a panel, a tab.
 *
 * It adds two things to `CoreObject`. `changed` fires for any change anywhere
 * below, so one subscription redraws a whole bar, and `revision` gives React a
 * number to compare. And it can find things: `itemById` and `actionById` search
 * everything underneath, wherever the structure happens to put it.
 */
export abstract class UiObject extends CoreObject {
  /** Something below changed — a label, a checkmark, an item added or removed. */
  readonly changed = new Signal<[source: CoreObject]>();

  /** An action below was triggered. The same event `Action.triggered` reports locally. */
  readonly actionTriggered = new Signal<[action: Action]>();

  #revision = 0;

  constructor(parent?: CoreObject, objectName = '') {
    super(parent, objectName);
    // Structure counts as a change: adding an item redraws the bar just as
    // renaming one does.
    this.connect(this.childAdded, (child) => this._changed(child));
    this.connect(this.childRemoved, (child) => this._changed(child));
  }

  /** Bumped on every change below. A number is all `useSyncExternalStore` needs. */
  get revision(): number {
    return this.#revision;
  }

  // ── Finding ────────────────────────────────────────────────────────────────

  /** The item with this id, however deep and whatever holds it. */
  itemById(id: string): MenuItem | null {
    const found = this.findById(id);
    return found instanceof MenuItem ? found : null;
  }

  /** The action with this id. `null` when there is none, or when it is not an action. */
  actionById(id: string): Action | null {
    const found = this.itemById(id);
    return found instanceof Action ? found : null;
  }

  /**
   * The entries leading down to an item, this object's own first.
   *
   * Walks up from the item rather than down from here, so it does not care
   * whether the way down goes through a menu, a bar or an action that owns one.
   */
  pathTo(id: string): MenuItem[] | null {
    const target = this.itemById(id);
    if (!target) return null;
    const chain: MenuItem[] = [];
    for (let cur: CoreObject | null = target; cur && cur !== this; cur = cur.parent) {
      if (cur instanceof MenuItem) chain.unshift(cur);
    }
    return chain.length > 0 ? chain : null;
  }

  /** Every item below, depth first — for shortcuts, for tests, for anything that has to see them all. */
  allItems(): MenuItem[] {
    return this.findChildren<MenuItem>((o) => o instanceof MenuItem);
  }

  /** Every action below, in the same order. */
  actions(): Action[] {
    return this.findChildren<Action>((o) => o instanceof Action);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Forward a property's changes into `changed`, so whatever is above hears
   * them. Subclasses call this once, in their constructor, for their own
   * properties — everything observable must be watched or the view goes stale.
   */
  protected watch(...sources: readonly ChangeSource[]): void {
    for (const source of sources) {
      source.changed.connect(() => this._changed(this), this);
    }
  }

  /** @internal Report a change, and pass it up so the bar above hears it too. */
  _changed(source: CoreObject): void {
    this.#revision += 1;
    this.changed.emit(source);
    const up = this.parent;
    if (up instanceof UiObject) up._changed(source);
  }

  /** @internal */
  _triggered(action: Action): void {
    this.actionTriggered.emit(action);
  }
}

/**
 * Anywhere entries can be put: a menu, a bar, or an action that owns a menu.
 *
 * The three take the same `addAction`/`addSeparator`/`addItem`, so anything that
 * fills a list can take any of them and not care which it got.
 */
export type ItemTarget = ItemHost | Action;

// ── Things that hold entries ─────────────────────────────────────────────────

/**
 * Anything that holds entries: a `Menu`, a `Toolbar`.
 *
 * Not an `Action` — an action that opens a list owns one of these rather than
 * being one, which is the difference between "what can be done" and "the list
 * you picked it from".
 */
export abstract class ItemHost extends UiObject {
  /** The children that are items, in order. Other children (groups, timers) are not entries. */
  get items(): MenuItem[] {
    return this.children.filter((c): c is MenuItem => c instanceof MenuItem);
  }

  /**
   * The items to draw: hidden ones dropped, and separators that would end up
   * leading, trailing or doubled dropped with them — the same rule the plain
   * model applies, taken from the same function.
   */
  get visibleItems(): MenuItem[] {
    return collapseSeparators(
      this.items,
      (i) => i.kind === 'separator',
      (i) => !i.visible.value
    );
  }

  /** True when there is anything in it at all. */
  get hasItems(): boolean {
    return this.items.length > 0;
  }

  addItem<T extends MenuItem>(item: T): T {
    item.setParent(this);
    return item;
  }

  addAction(init: ActionInit = {}): Action {
    return this.addItem(new Action(init));
  }

  /**
   * An entry that opens a list of its own.
   *
   * It is an ordinary `Action` — what makes it a menu is the `Menu` it owns, so
   * `bar.addMenu({ text: 'File' }).addAction({ text: 'New' })` hangs "New" in
   * the file menu's list, not directly under the entry.
   */
  addMenu(init: ActionInit = {}): Action {
    return this.addAction(init);
  }

  addSeparator(id?: string): Separator {
    return this.addItem(new Separator(id));
  }

  addCustom(id: string, render: unknown): CustomItem {
    return this.addItem(new CustomItem({ id, render }));
  }

  removeItem(item: MenuItem): void {
    if (item.parent === this) item.setParent(null);
  }

  /** Drops every item and destroys it — a bar being rebuilt should not leave the old one connected. */
  clearItems(): void {
    for (const item of this.items) item.destroy();
  }

  /** Shut the lists opened by this host's own entries. */
  closeChildMenus(): void {
    for (const item of this.items) {
      if (item instanceof Action) item.closeMenu();
    }
  }

  /** The plain form of what this host holds. */
  itemsToModel(): ToolbarNode[] {
    return this.items.map((i) => i.toModel());
  }
}

// ── Items ────────────────────────────────────────────────────────────────────

export interface MenuItemInit {
  /** Stable id, as in the plain model. Left out, the object keeps `CoreObject`'s generated one. */
  id?: string;
  visible?: boolean;
}

/**
 * Anything that can sit in a toolbar or a menu.
 *
 * An entry, not a container: what an entry opens is a `Menu` it owns, which is
 * why this is no longer a host itself.
 */
export abstract class MenuItem extends UiObject {
  abstract readonly kind: MenuItemKind;

  /** Hidden entirely. A item that does not apply is better absent than greyed — that is `enabled`. */
  readonly visible = new Property<boolean>(true);

  constructor(init: MenuItemInit = {}) {
    super(undefined, init.id ?? '');
    if (init.id !== undefined) this.id = init.id;
    if (init.visible !== undefined) this.visible.setSilent(init.visible);
    this.watch(this.visible);
  }

  /** The plain form of this item, `children` included. */
  abstract toModel(): ToolbarNode;
}

export interface ActionInit extends MenuItemInit {
  text?: string;
  /** Whatever the host calls an icon. Kept and handed back; never inspected. */
  icon?: unknown;
  /** Hover text. Falls back to `text`. */
  tooltip?: string;
  /** The shortcut as text to show (`Ctrl+S`). Binding it is the host's business. */
  shortcut?: string;
  enabled?: boolean;
  checkable?: boolean;
  checked?: boolean;
  /** The name of the radio group, for the plain form. The behaviour is `ActionGroup`. */
  group?: string;
  /** What kind of command it is — `clipboard`, `io`. The behaviour is `ActionCollection`. */
  category?: string;
  onTriggered?: (action: Action) => void;
  onToggled?: (checked: boolean, action: Action) => void;
}

/**
 * Something to do — Qt's `QAction`, and the same idea: the command is an object,
 * not a button. The menu entry, the toolbar button and the keyboard shortcut are
 * three views of one `Action`, so disabling it disables all three at once.
 *
 * An `Action` with items under it is a submenu; one that is `checkable` is a
 * toggle; one that is both is a split button. That is the plain model's `item`,
 * `toggle` and `splitToggle`, with the state made observable.
 */
export class Action extends MenuItem {
  readonly kind = 'action' as const;

  readonly text = new Property<string>('');
  readonly icon = new Property<unknown>(undefined);
  readonly tooltip = new Property<string | undefined>(undefined);
  readonly shortcut = new Property<string | undefined>(undefined);
  readonly enabled = new Property<boolean>(true);
  readonly checkable = new Property<boolean>(false);
  readonly checked = new Property<boolean>(false);
  /** The group's name, kept for the plain form. Membership itself is `ActionGroup`. */
  readonly groupName = new Property<string | undefined>(undefined);
  /**
   * What kind of command this is — `clipboard`, `io`, `view`. Where the action
   * is drawn is the tree's business; this is what it does, and it is how
   * `ActionCollection` finds the commands that belong together.
   */
  readonly category = new Property<string | undefined>(undefined);

  /** The action was performed. For a checkable action this follows `toggled`. */
  readonly triggered = new Signal<[action: Action]>();
  /** The checked state changed — however it changed, including a direct write to `checked`. */
  readonly toggled = new Signal<[checked: boolean, action: Action]>();

  #group: ExclusiveGroup | null = null;
  #collection: ActionCollectionLike | null = null;
  #menu?: Menu;

  constructor(init: ActionInit = {}) {
    super(init);
    if (init.text !== undefined) this.text.setSilent(init.text);
    if (init.icon !== undefined) this.icon.setSilent(init.icon);
    if (init.tooltip !== undefined) this.tooltip.setSilent(init.tooltip);
    if (init.shortcut !== undefined) this.shortcut.setSilent(init.shortcut);
    if (init.enabled !== undefined) this.enabled.setSilent(init.enabled);
    if (init.checkable !== undefined) this.checkable.setSilent(init.checkable);
    if (init.checked !== undefined) {
      this.checked.setSilent(init.checked);
      if (init.checkable === undefined) this.checkable.setSilent(true);
    }
    if (init.group !== undefined) this.groupName.setSilent(init.group);
    if (init.category !== undefined) this.category.setSilent(init.category);
    if (this.objectName === '' && init.text) this.objectName = init.text;

    this.watch(
      this.text,
      this.icon,
      this.tooltip,
      this.shortcut,
      this.enabled,
      this.checkable,
      this.checked,
      this.category
    );

    // `checked` is the source of truth, so a direct write behaves exactly like
    // `setChecked` — otherwise half the code would report a toggle and half
    // would not, depending on which door it came through.
    this.checked.changed.connect((next) => {
      this.toggled.emit(next, this);
      this.#group?._memberChecked(this, next);
    }, this);

    if (init.onTriggered) this.triggered.connect(init.onTriggered, this);
    if (init.onToggled) this.toggled.connect(init.onToggled, this);
  }

  // ── The list it opens ──────────────────────────────────────────────────────

  /**
   * The list this action opens, made on first use.
   *
   * Lazy on purpose: most actions open nothing, and an empty `Menu` on every one
   * of them would be a `Signal`-carrying object per command for nothing. Reading
   * this makes one — which is why `hasMenu` does not read it.
   */
  get menu(): Menu {
    if (!this.#menu) {
      this.#menu = new Menu({ id: `${this.id}:menu`, title: this.text.value }, this);
      this.text.changed.connect((text) => {
        if (this.#menu) this.#menu.title.value = text;
      }, this);
    }
    return this.#menu;
  }

  /** Whether this action opens anything — without bringing a menu into being to find out. */
  get hasMenu(): boolean {
    return this.#menu !== undefined && this.#menu.items.length > 0;
  }

  /** Shut the list, and anything it had open, if there is one. */
  closeMenu(): void {
    this.#menu?.close();
  }

  // ── Its list, said the short way ───────────────────────────────────────────
  //
  // `file.addAction(...)` reads better than `file.menu.addAction(...)` and means
  // exactly the same thing. These are the whole of that convenience.

  get items(): MenuItem[] {
    return this.#menu ? this.#menu.items : [];
  }

  get visibleItems(): MenuItem[] {
    return this.#menu ? this.#menu.visibleItems : [];
  }

  addItem<T extends MenuItem>(item: T): T {
    return this.menu.addItem(item);
  }

  addAction(init: ActionInit = {}): Action {
    return this.menu.addAction(init);
  }

  addMenu(init: ActionInit = {}): Action {
    return this.menu.addMenu(init);
  }

  addSeparator(id?: string): Separator {
    return this.menu.addSeparator(id);
  }

  addCustom(id: string, render: unknown): CustomItem {
    return this.menu.addCustom(id, render);
  }

  clearItems(): void {
    this.#menu?.clearItems();
  }

  itemsToModel(): ToolbarNode[] {
    return this.#menu ? this.#menu.itemsToModel() : [];
  }

  /** What to show on hover: the explicit tooltip, or the text. */
  get title(): string | undefined {
    return this.tooltip.value ?? (this.text.value || undefined);
  }

  /** Whether this action can be interacted with at all. */
  get isActionable(): boolean {
    if (!this.visible.value || !this.enabled.value) return false;
    return this.checkable.value || this.hasMenu || this.triggered.connectionCount > 0;
  }

  /**
   * Clicking opens the submenu instead of doing something.
   *
   * An action with items under it and nothing of its own to do is a menu: the
   * click opens it. One that also has something to do (or is checkable) acts on
   * the click, and the arrow beside it opens the list — a split button. The
   * decision is here and not in the component because it is about what the
   * action is, not about how it is painted.
   */
  get opensOnClick(): boolean {
    return this.hasMenu && !this.checkable.value && this.triggered.connectionCount === 0;
  }

  /** The group this action belongs to, if any. */
  get group(): ExclusiveGroup | null {
    return this.#group;
  }

  /** The collection of commands of its kind this action belongs to, if any. */
  get collection(): ActionCollectionLike | null {
    return this.#collection;
  }

  /** Whether this action answers to a shortcut, however either was spelled. */
  matchesShortcut(shortcut: string): boolean {
    const own = this.shortcut.value;
    return own !== undefined && normalizeShortcut(own) === normalizeShortcut(shortcut);
  }

  /**
   * Perform the action: flip a checkable one, then tell everyone — the action's
   * own `triggered`, and `actionTriggered` on every host above it, so a toolbar
   * can watch all its actions in one place.
   *
   * Returns false when the action is disabled or hidden, rather than pretending.
   */
  trigger(): boolean {
    if (!this.isActionable) return false;
    if (this.checkable.value) this.setChecked(!this.checked.value);
    this.triggered.emit(this);
    // Told directly rather than through a connection to `triggered`: a listener
    // of the machinery's own would count towards `connectionCount`, and that is
    // what `isActionable` and `opensOnClick` read to decide whether this action
    // has anything to do. Joining a collection must not turn a menu into a
    // button.
    this.#collection?._memberTriggered(this);
    for (let up = this.parent; up; up = up.parent) {
      if (up instanceof ItemHost) up._triggered(this);
    }
    return true;
  }

  /** Set the checked state. A no-op on an action that is not checkable. */
  setChecked(checked: boolean): void {
    if (!this.checkable.value) return;
    this.checked.value = checked;
  }

  toggle(): void {
    this.setChecked(!this.checked.value);
  }

  /** @internal Called by `ActionGroup.add()` / `remove()`. */
  _setGroup(group: ExclusiveGroup | null): void {
    this.#group = group;
    this.groupName.value = group?.groupName;
  }

  /** @internal Called by `ActionCollection.add()` / `remove()`. */
  _setCollection(collection: ActionCollectionLike | null): void {
    this.#collection = collection;
    this.category.value = collection?.name;
  }

  override toModel(): MenuItemNode | MenuToggleNode {
    const base = {
      id: this.id,
      label: this.text.value || undefined,
      icon: this.icon.value,
      title: this.tooltip.value,
      disabled: this.enabled.value ? undefined : true,
      hidden: this.visible.value ? undefined : true,
      shortcut: this.shortcut.value,
      category: this.category.value,
    };
    const children = this.hasMenu ? this.itemsToModel() : undefined;

    if (this.checkable.value) {
      return {
        kind: 'toggle',
        ...base,
        checked: this.checked.value,
        group: this.groupName.value,
        onChange: (checked: boolean) => this.setChecked(checked),
        children,
      };
    }
    return {
      kind: 'item',
      ...base,
      onSelect: () => {
        this.trigger();
      },
      children,
    };
  }

  protected override onDestroy(): void {
    this.#group?._memberRemoved(this);
    this.#group = null;
    this.#collection?._memberRemoved(this);
    this.#collection = null;
  }
}

/** A line between groups. It has an id like everything else, so a list of them stays keyed. */
export class Separator extends MenuItem {
  readonly kind = 'separator' as const;

  constructor(id?: string) {
    super({ id });
  }

  override toModel(): MenuSeparatorNode {
    return { kind: 'separator', id: this.id, hidden: this.visible.value ? undefined : true };
  }
}

export interface CustomItemInit extends MenuItemInit {
  /** Handed back to the renderer untouched — a colour picker, a zoom readout. */
  render: unknown;
}

/** Anything the model has no vocabulary for. The host draws it; the toolbar only finds it a place. */
export class CustomItem extends MenuItem {
  readonly kind = 'custom' as const;

  readonly render = new Property<unknown>(undefined);

  constructor(init: CustomItemInit) {
    super(init);
    this.render.setSilent(init.render);
    this.watch(this.render);
  }

  override toModel(): MenuCustomNode {
    return {
      kind: 'custom',
      id: this.id,
      render: this.render.value,
      hidden: this.visible.value ? undefined : true,
    };
  }
}

// ── The list an entry opens ──────────────────────────────────────────────────

export interface MenuInit {
  id?: string;
  title?: string;
  open?: boolean;
}

/**
 * A menu that stands on its own: the ⋮ of a panel, a tab's context menu, the
 * list of what did not fit on a tab bar.
 *
 * ── Why this exists next to "an action with children" ────────────────────────
 *
 * A menu bar's "File" is an `Action`: it sits in a bar, it can be greyed out, it
 * has a place among other entries, and what it opens is what hangs under it.
 * That is an entry that happens to open a list.
 *
 * This is the other thing — the list itself, with nothing standing for it in any
 * bar. Modelling it as an `Action` nobody ever triggers was a small lie, and it
 * cost something real: the popup's open state had nowhere to live, so every
 * component that showed one kept its own `useState` and its own rules for
 * closing it. They drifted, of course. The panel's ⋮ had no way of closing at
 * all when the click landed somewhere else.
 *
 * So: `open` lives here, `closeOnTrigger()` is one line rather than a prop
 * threaded through a component, and a test can open a menu and check what
 * happened without a browser.
 *
 * It shares this file with `Action` because the two make each other: an action
 * owns the menu it opens, and a menu holds actions. Apart, that is a circular
 * import and a class extending `undefined` at load time.
 */
export class Menu extends ItemHost {
  /** What to call it where it needs a name — a submenu header, a tooltip. */
  readonly title = new Property<string>('');

  /** Whether the popup is showing. The view follows this; it does not own it. */
  readonly open = new Property<boolean>(false);

  /** Opened or shut — for a host that dims what is behind an open menu. */
  readonly openChanged = new Signal<[open: boolean]>();

  #openedByHover = false;

  constructor(init: MenuInit = {}, parent?: CoreObject) {
    super(undefined, init.id ?? init.title ?? 'Menu');
    if (init.id !== undefined) this.id = init.id;
    if (init.title !== undefined) this.title.setSilent(init.title);
    if (init.open !== undefined) this.open.setSilent(init.open);

    this.watch(this.title, this.open);
    this.open.changed.connect((on) => this.openChanged.emit(on), this);

    if (parent) this.setParent(parent);
  }

  get isOpen(): boolean {
    return this.open.value;
  }

  /**
   * Show it.
   *
   * `byHover` records that the pointer opened it merely by passing over,
   * rather than the user asking for it — {@link toggle} needs to know.
   */
  show(options: { byHover?: boolean } = {}): boolean {
    // An empty menu opens onto nothing, and a popup with nothing in it reads
    // as a fault rather than as an answer.
    if (this.visibleItems.length === 0) return false;
    this.#openedByHover = options.byHover === true;
    this.open.value = true;
    return true;
  }

  /** Shut it, and anything it had open below it. */
  close(): void {
    this.closeChildMenus();
    this.#openedByHover = false;
    this.open.value = false;
  }

  /**
   * A click on whatever opens this menu: shut if showing, show if not.
   *
   * With one exception, and it is the whole reason this is not a one-liner.
   * Moving the pointer along an open bar — or down an open menu — opens what
   * it passes over, so by the time the click lands the menu is *already* open,
   * and a plain toggle would shut it in the same gesture that asked for it.
   * A menu the pointer opened therefore survives its first click.
   */
  toggle(): void {
    if (!this.open.value) {
      this.show();
      return;
    }
    if (this.#openedByHover) {
      this.#openedByHover = false;
      return;
    }
    this.close();
  }

  /** Whether what is showing was opened by the pointer passing over. */
  get openedByHover(): boolean {
    return this.#openedByHover;
  }

  /** Shut once anything in it has been chosen, which is what a menu does. */
  closeOnTrigger(): this {
    this.actionTriggered.connect(() => this.close(), this);
    return this;
  }
}
