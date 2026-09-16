import { Property } from '../Property';
import { Signal } from '../Signal';
import { isHorizontalArea, type PanelArea, type WorkspaceModel } from '../../models/ui/panel';
import { Action, UiObject } from './items';
import { Panel, type PanelInit } from './Panel';

export interface WorkspaceInit {
  objectName?: string;
  /** How much room a panel takes when it does not say. */
  defaultSize?: number;
}

/**
 * Everything a window holds that is not chrome: the panels and the middle where
 * the page draws.
 *
 * The name is a choice. Win32's "client area" takes in the toolbars as well, and
 * this deliberately does not — a toolbar is chrome, a panel is content. Qt calls
 * the middle the central widget and has no name for the whole; `Workspace` is
 * the word an application uses when it says "save my workspace", which is
 * exactly what `toModel()` writes out.
 *
 * Panels are children, so the tree, the cascade destroy and the `changed`
 * bubbling come from `CoreObject` and `ItemHost` as they do everywhere else.
 * Actions parented here (the View menu) are children too, and the
 * `instanceof Panel` filter keeps the two apart — the same trick that keeps a
 * `Timer` out of a menu.
 */
export class Workspace extends UiObject {
  /** How much room a panel takes when it does not say. */
  readonly defaultSize = new Property<number>(240);

  /** A panel was docked somewhere else, floated or docked again. */
  readonly panelMoved = new Signal<[panel: Panel, area: PanelArea]>();
  /** A panel was shut or brought back. */
  readonly panelVisibilityChanged = new Signal<[panel: Panel, visible: boolean]>();

  #applyingExpand = false;

  constructor(init: WorkspaceInit = {}) {
    super(undefined, init.objectName ?? 'Workspace');
    if (init.defaultSize !== undefined) this.defaultSize.setSilent(init.defaultSize);
    this.watch(this.defaultSize);
  }

  // ── Its panels ─────────────────────────────────────────────────────────────

  get panels(): Panel[] {
    return this.children.filter((c): c is Panel => c instanceof Panel);
  }

  /** The panels that are on screen at all — shut ones keep their place but take no room. */
  get visiblePanels(): Panel[] {
    return this.panels.filter((p) => p.visible.value);
  }

  /** The panels docked in an area, in the order they were added. Floating ones are elsewhere. */
  panelsIn(area: PanelArea): Panel[] {
    return this.visiblePanels.filter((p) => !p.floating.value && p.area.value === area);
  }

  get floatingPanels(): Panel[] {
    return this.visiblePanels.filter((p) => p.floating.value);
  }

  /** The panel filling the workspace, if one is. At most one ever is. */
  get expandedPanel(): Panel | null {
    return this.visiblePanels.find((p) => p.expanded.value) ?? null;
  }

  /**
   * The room an area needs: the largest of its panels' sizes. One strip cannot
   * be two widths, and the alternative — the last panel added deciding for the
   * rest — changes the layout for reasons the user cannot see.
   */
  sizeOf(area: PanelArea): number {
    const panels = this.panelsIn(area);
    if (panels.length === 0) return 0;
    return Math.max(...panels.map((p) => p.size.value));
  }

  /** Set the room an area takes, on every panel in it. */
  resize(area: PanelArea, size: number): void {
    for (const panel of this.panelsIn(area)) panel.size.value = Math.max(60, size);
  }

  /** Whether panels in this area sit side by side rather than stacked. */
  isHorizontal(area: PanelArea): boolean {
    return isHorizontalArea(area);
  }

  // ── Building ───────────────────────────────────────────────────────────────

  addPanel(init: PanelInit = {}): Panel {
    const panel = new Panel({ size: this.defaultSize.value, ...init });
    return this.attach(panel);
  }

  /** Take an existing panel into this workspace. */
  attach(panel: Panel): Panel {
    panel.setParent(this);

    panel.areaChanged.connect((area) => this.panelMoved.emit(panel, area), this);
    panel.floating.changed.connect(() => this.panelMoved.emit(panel, panel.area.value), this);
    panel.visibilityChanged.connect(
      (visible) => this.panelVisibilityChanged.emit(panel, visible),
      this
    );

    // Expanding is exclusive: two panels each filling the whole workspace is
    // a state with no meaning, and the second one would simply hide the first.
    panel.expanded.changed.connect((on) => {
      if (!on || this.#applyingExpand) return;
      this.#applyingExpand = true;
      try {
        for (const other of this.panels) if (other !== panel) other.expanded.value = false;
      } finally {
        this.#applyingExpand = false;
      }
    }, this);

    return panel;
  }

  panelById(id: string): Panel | null {
    const found = this.panels.find((p) => p.id === id);
    return found ?? null;
  }

  removePanel(panel: Panel): void {
    if (panel.parent === this) panel.destroy();
  }

  // ── A menu for it ──────────────────────────────────────────────────────────

  /**
   * A "View" menu: one entry per panel, ticked while the panel is open, and
   * opening onto what else can be done to it.
   *
   * The entry is a split button — a click shows or hides the panel, and the
   * list it opens holds the rest. The title bar is in that list for a reason
   * that took a round to notice: turning it off from the panel's own ⋮ leaves
   * no ⋮ to turn it back on with, and a switch you can only flick one way is
   * not a switch. From here it flicks both.
   *
   * Everything is wired both ways, so hiding a panel from its own close button
   * moves the tick in the menu bar.
   *
   * It is parented to the workspace, and it is an `Action`, not a `Panel`, so
   * it never shows up among `panels`.
   */
  viewMenu(id = 'view', text = 'View'): Action {
    const existing = this.actionById(id);
    if (existing) return existing;

    // An entry, parented here, whose list is what the bar will open. The
    // bar draws it; what it does belongs to the workspace.
    const menu = new Action({ id, text });
    menu.setParent(this);
    for (const panel of this.panels) this.#addViewEntry(menu, panel);

    // Panels arrive later — a page mounts and brings its own. The menu has
    // to grow with them, or a panel added after the bar was built can only
    // be shut, never brought back.
    this.childAdded.connect((child) => {
      if (child instanceof Panel) this.#addViewEntry(menu, child);
    }, this);

    return menu;
  }

  #addViewEntry(menu: Action, panel: Panel): void {
    const entry = menu.addAction({
      id: `${menu.id}:${panel.id}`,
      text: panel.title.value || panel.id,
      checkable: true,
      checked: panel.visible.value,
    });
    entry.triggered.connect(() => {
      if (entry.checked.value) panel.show();
      else if (!panel.close()) entry.setChecked(true);
    }, this);
    panel.visibilityChanged.connect((visible) => entry.setChecked(visible), this);
    panel.title.changed.connect((title) => {
      entry.text.value = title || panel.id;
    }, this);

    // The list the entry opens: what can be done to the panel from a menu
    // bar, rather than from a panel that may have nothing left to click.
    const header = entry.addAction({
      id: `${entry.id}:header`,
      text: 'Title bar',
      checkable: true,
      checked: panel.headerVisible.value,
    });
    header.triggered.connect(() => panel.setHeaderVisible(header.checked.value), this);
    panel.headerVisible.changed.connect((on) => header.setChecked(on), this);

    const floating = entry.addAction({
      id: `${entry.id}:floating`,
      text: 'Floating',
      checkable: true,
      checked: panel.floating.value,
    });
    floating.triggered.connect(() => {
      if (!panel.setFloating(floating.checked.value)) floating.setChecked(panel.floating.value);
    }, this);
    panel.floating.changed.connect((on) => floating.setChecked(on), this);

    // A panel that goes takes its entry with it: the alternative is a menu
    // of ghosts, each ticking something that is not there.
    panel.destroyed.connect(() => entry.destroy(), this);
  }

  // ── The plain model ────────────────────────────────────────────────────────

  static fromModel(model: WorkspaceModel, init: WorkspaceInit = {}): Workspace {
    const workspace = new Workspace({ objectName: model.id, ...init });
    for (const node of model.panels) workspace.attach(Panel.fromModel(node));
    return workspace;
  }

  /** The layout as it stands — what "save my workspace" writes. */
  toModel(): WorkspaceModel {
    return {
      id: this.objectName || undefined,
      panels: this.panels.map((p) => p.toModel()),
    };
  }

  /**
   * Put a saved layout back on panels that already exist.
   *
   * Restoring by rebuilding would throw away the panels' contents — the file
   * tree, the console — so what is restored is where things were, not what
   * they are. Panels the layout does not mention are left alone.
   */
  applyModel(model: WorkspaceModel): void {
    for (const node of model.panels) {
      const panel = this.panelById(node.id);
      if (!panel) continue;
      if (node.area !== undefined) panel.area.value = node.area;
      if (node.size !== undefined) panel.size.value = node.size;
      if (node.geometry !== undefined) panel.geometry.value = node.geometry;
      panel.floating.value = node.floating === true;
      panel.expanded.value = node.expanded === true;
      panel.visible.value = node.closed !== true;
      panel.headerVisible.value = node.header !== false;
    }
  }
}
