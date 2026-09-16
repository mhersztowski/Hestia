import { CoreObject } from '../CoreObject';
import { Property } from '../Property';
import { Signal } from '../Signal';
import {
  type ToolbarDisplay,
  type ToolbarNode,
  type ToolbarOrientation,
  type ToolbarVariant,
} from '../../models/ui/toolbar';
import { ActionGroup } from './ActionGroup';
import { Action, CustomItem, ItemHost, Separator, type ItemTarget } from './items';

export interface ToolbarInit {
  objectName?: string;
  orientation?: ToolbarOrientation;
  variant?: ToolbarVariant;
  /** Left out, it follows the variant: labels in a bar, icons in a palette. */
  display?: ToolbarDisplay;
  scrollable?: boolean;
}

/**
 * A toolbar, a menu bar and a floating palette — one object, as they are one
 * thing: items in a row or a column, some of which open a menu.
 *
 * It holds the items (`ItemHost`), the settings that are not drawing decisions
 * (which way it runs, whether it scrolls), and the two bridges to the plain
 * model. Everything a view needs to react to arrives through `changed`; every
 * command through `actionTriggered`.
 */
export class Toolbar extends ItemHost {
  readonly orientation = new Property<ToolbarOrientation>('horizontal');
  readonly variant = new Property<ToolbarVariant>('bar');
  readonly display = new Property<ToolbarDisplay | undefined>(undefined);
  readonly scrollable = new Property<boolean>(true);

  /** The entry whose list opened, or `null` when the last one shut. */
  readonly menuOpenChanged = new Signal<[entry: Action | null]>();

  constructor(init: ToolbarInit = {}, parent?: CoreObject) {
    super(undefined, init.objectName ?? 'Toolbar');
    if (init.orientation) this.orientation.setSilent(init.orientation);
    if (init.variant) this.variant.setSilent(init.variant);
    if (init.display) this.display.setSilent(init.display);
    if (init.scrollable !== undefined) this.scrollable.setSilent(init.scrollable);

    this.watch(this.orientation, this.variant, this.display, this.scrollable);
    if (parent) this.setParent(parent);
  }

  /**
   * What items show in the bar itself: what was asked for, or labels in a bar
   * and icons in a palette. The rule is here rather than in the component
   * because it is a decision about the toolbar, not about how it is painted.
   */
  get effectiveDisplay(): ToolbarDisplay {
    return this.display.value ?? (this.variant.value === 'bar' ? 'label' : 'icon');
  }

  get vertical(): boolean {
    return this.orientation.value === 'vertical';
  }

  // ── The plain model ────────────────────────────────────────────────────────

  /** Build a live toolbar from a plain tree. */
  static fromModel(nodes: readonly ToolbarNode[], init: ToolbarInit = {}): Toolbar {
    return new Toolbar(init).setModel(nodes);
  }

  /**
   * Replace the contents with a plain tree. The old items are destroyed, so
   * whatever was connected to them goes with them: a toolbar rebuilt on every
   * render must not leave a trail of live actions behind.
   */
  setModel(nodes: readonly ToolbarNode[]): this {
    this.clearItems();
    addModel(this, nodes);
    return this;
  }

  /** The plain form of the whole toolbar. `onSelect` and `onChange` come back as calls into the live objects. */
  toModel(): ToolbarNode[] {
    return this.itemsToModel();
  }

  // ── The menus its entries open ─────────────────────────────────────────────

  /** The entry whose list is showing, if any. One at a time is the rule. */
  get openEntry(): Action | null {
    return (
      this.items.find((i): i is Action => i instanceof Action && i.hasMenu && i.menu.isOpen) ?? null
    );
  }

  get isOpen(): boolean {
    return this.openEntry !== null;
  }

  /**
   * Open one entry's list, shutting whatever else was open.
   *
   * A bar with two lists showing at once is a state nothing recovers from, so
   * the rule lives here rather than in whichever component happens to draw it.
   */
  openMenuOf(entry: Action | null, options: { byHover?: boolean } = {}): boolean {
    const previous = this.openEntry;
    for (const item of this.items) {
      if (item instanceof Action && item !== entry) item.closeMenu();
    }
    if (entry === null) {
      if (previous) this.menuOpenChanged.emit(null);
      return false;
    }
    if (entry.parent !== this || !entry.enabled.value) return false;
    const opened = entry.menu.show(options);
    if (opened && previous !== entry) this.menuOpenChanged.emit(entry);
    return opened;
  }

  /** Shut whatever is open. */
  closeMenus(): void {
    if (this.openEntry === null) return;
    this.closeChildMenus();
    this.menuOpenChanged.emit(null);
  }

  /** A click on an entry that opens a list. The hover rule is the menu's own. */
  toggleMenuOf(entry: Action): void {
    if (this.openEntry !== entry) {
      this.openMenuOf(entry);
      return;
    }
    const before = entry.menu.isOpen;
    entry.menu.toggle();
    if (before !== entry.menu.isOpen) this.menuOpenChanged.emit(entry.menu.isOpen ? entry : null);
  }

  /**
   * The pointer moved over an entry.
   *
   * Only meaningful once something is open: then moving along the bar moves the
   * opening, which is how a bar of menus behaves everywhere. With nothing open,
   * hovering does nothing — a bar that opened lists at rest would follow the
   * pointer across the page.
   */
  hoverMenuOf(entry: Action): void {
    if (this.isOpen && entry.hasMenu) this.openMenuOf(entry, { byHover: true });
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  /** The group of this name under `host`, created on first use. */
  static groupFor(host: ItemTarget, name: string): ActionGroup {
    const existing = host.children.find(
      (c): c is ActionGroup => c instanceof ActionGroup && c.groupName === name
    );
    return existing ?? new ActionGroup(name, host);
  }

  groupNamed(name: string): ActionGroup | null {
    return (
      this.findChildren<ActionGroup>((o) => o instanceof ActionGroup && o.objectName === name)[0] ??
      null
    );
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /** Trigger an action by id, wherever it is. False when there is no such action, or it is not actionable. */
  triggerById(id: string): boolean {
    const item = this.itemById(id);
    return item instanceof Action ? item.trigger() : false;
  }

  /**
   * The action bound to a shortcut. Matching ignores case and spacing, so
   * `Ctrl+S`, `ctrl + s` and `CTRL+S` are the same shortcut — the text is
   * written by hand in a dozen places and will not be written the same way.
   */
  actionForShortcut(shortcut: string): Action | null {
    return this.actions().find((a) => a.matchesShortcut(shortcut)) ?? null;
  }

  /** Find the action for a shortcut and perform it. The host binds the key; this decides what it means. */
  triggerShortcut(shortcut: string): boolean {
    return this.actionForShortcut(shortcut)?.trigger() ?? false;
  }
}

/**
 * Build plain nodes into any host — a toolbar, or one action's submenu.
 *
 * The piece `setModel` is made of, exported because a host often wants both: a
 * menu built by hand, with one branch of it filled from a list that arrives
 * later as plain data.
 *
 * Two things are worth reading twice. A toggle's `onChange` is wired to
 * `triggered`, not to `toggled`: the plain model calls it for the item that was
 * clicked, and a group unchecking its siblings must not look like five clicks.
 * And groups are created per host, so `group: 'tool'` in a submenu is a
 * different group from `group: 'tool'` in the bar — the same scoping the plain
 * `applyToggle` has, where a group is local to its parent's children.
 */
export function addModel(host: ItemTarget, nodes: readonly ToolbarNode[]): void {
  for (const node of nodes) {
    if (node.kind === 'separator') {
      host.addItem(new Separator(node.id));
      if (node.hidden) host.items[host.items.length - 1].visible.value = false;
      continue;
    }
    if (node.kind === 'custom') {
      host.addItem(new CustomItem({ id: node.id, render: node.render, visible: !node.hidden }));
      continue;
    }

    const checkable = node.kind === 'toggle';
    const action = new Action({
      id: node.id,
      text: node.label ?? '',
      icon: node.icon,
      tooltip: node.title,
      shortcut: node.shortcut,
      category: node.category,
      enabled: !node.disabled,
      visible: !node.hidden,
      checkable,
      checked: checkable ? node.checked : undefined,
      group: checkable ? node.group : undefined,
      onTriggered: checkable
        ? (a) => node.onChange?.(a.checked.value)
        : node.onSelect
          ? () => node.onSelect?.()
          : undefined,
    });
    host.addItem(action);

    if (checkable && node.group !== undefined) {
      Toolbar.groupFor(host, node.group).add(action);
    }
    if (node.children?.length) addModel(action, node.children);
  }
}
