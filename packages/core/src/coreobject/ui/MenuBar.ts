import { CoreObject } from '../CoreObject';
import { type MenuBarModel, type MenuNode } from '../../models/ui/menubar';
import { type ToolbarNode } from '../../models/ui/toolbar';
import { Action } from './items';
import { Toolbar, addModel, type ToolbarInit } from './Toolbar';

export type MenuBarInit = Omit<ToolbarInit, 'orientation' | 'variant' | 'display'>;

/**
 * A bar of menus: "File", "Edit", "View", each opening onto what it holds.
 *
 * It is a {@link Toolbar} — the entries are the same `Action`s, drawn the same
 * way — with the one thing a row of buttons has no use for: **which menu is
 * open**. Exactly one is, moving along an open bar moves the opening, and
 * clicking the open one shuts it. Those are rules about a menu bar, not about
 * how it is painted, so they are here and not in the component: a test can open
 * a menu, hover along the bar and check what happened, with no DOM in sight.
 *
 * Since a `Toolbar` can hold entries that open lists too, almost all of that is
 * the toolbar's now. What is left here is the naming a menu bar deserves —
 * `open`, `close`, `toggle`, `hover` — and the fact that it is drawn as a row of
 * labels rather than of buttons.
 *
 * The entries themselves inherit from `Action` and nothing toolbar-specific:
 * `Action` → `MenuItem` (an entry: action, separator or custom) → `ItemHost`
 * (anything that holds entries) → `CoreObject`. A `Toolbar` and a `MenuBar` are
 * both hosts; neither is above the other.
 */
export class MenuBar extends Toolbar {
  constructor(init: MenuBarInit = {}, parent?: CoreObject) {
    super({ ...init, orientation: 'horizontal', variant: 'bar', display: 'label' }, parent);
  }

  /** The top-level entries that actually open something. */
  get menus(): Action[] {
    return this.items.filter((i): i is Action => i instanceof Action && i.hasMenu);
  }

  /** The menu that is open, or none. */
  get openMenu(): Action | null {
    return this.openEntry;
  }

  /** Opened or shut — the same event as `menuOpenChanged`, under the name a bar of menus uses. */
  get openChanged(): Toolbar['menuOpenChanged'] {
    return this.menuOpenChanged;
  }

  /** Open a menu of this bar, or shut whatever is open with `null`. */
  open(menu: Action | null, options: { byHover?: boolean } = {}): void {
    this.openMenuOf(menu, options);
  }

  openById(id: string): boolean {
    const menu = this.actionById(id);
    return menu !== null && this.openMenuOf(menu);
  }

  close(): void {
    this.closeMenus();
  }

  /** A click on a top-level entry: any other one opens, the open one shuts. */
  toggle(menu: Action): void {
    this.toggleMenuOf(menu);
  }

  /** The pointer moved over a top-level entry. */
  hover(menu: Action): void {
    this.hoverMenuOf(menu);
  }

  /** Whether what is open was opened by the pointer passing over it. */
  get openedByHover(): boolean {
    return this.openEntry?.menu.openedByHover ?? false;
  }

  /** Shut whatever is open once an action below has been performed. */
  closeOnTrigger(): void {
    this.actionTriggered.connect(() => this.close(), this);
  }

  // ── The plain model ────────────────────────────────────────────────────────

  static override fromModel(nodes: readonly ToolbarNode[], init: MenuBarInit = {}): MenuBar {
    const bar = new MenuBar(init);
    addModel(bar, nodes);
    return bar;
  }

  /** Build from the menu bar's own model — a list of menus rather than a loose tree. */
  static fromMenuBarModel(model: MenuBarModel): MenuBar {
    return MenuBar.fromModel(model.menus, model.id ? { objectName: model.id } : {});
  }

  /** The menu bar's own model: only the top-level entries that are menus. */
  toMenuBarModel(): MenuBarModel {
    return {
      id: this.objectName || undefined,
      menus: this.menus.map((m) => m.toModel() as MenuNode),
    };
  }
}
