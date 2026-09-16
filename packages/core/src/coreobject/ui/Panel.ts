import { Property } from '../Property';
import { Signal } from '../Signal';
import {
  DEFAULT_GEOMETRY,
  PANEL_AREAS,
  PANEL_AREA_NAMES,
  type PanelArea,
  type PanelGeometry,
  type PanelNode,
} from '../../models/ui/panel';
import { ActionGroup } from './ActionGroup';
import { Action, Menu, UiObject } from './items';

export interface PanelInit {
  id?: string;
  title?: string;
  icon?: unknown;
  area?: PanelArea;
  size?: number;
  visible?: boolean;
  header?: boolean;
  expanded?: boolean;
  floating?: boolean;
  geometry?: PanelGeometry;
  content?: unknown;
  closable?: boolean;
  movable?: boolean;
  floatable?: boolean;
}

/**
 * A panel: a piece of the workspace that can be moved, floated, expanded and
 * shut — Qt's dock widget.
 *
 * It is an {@link ItemHost}, which is the point: the things a panel can do are
 * `Action`s hanging off it, not props on a title bar. `panel.menu` is the whole
 * "Panel" menu, and `panel.actionById('close')` is the same object a title-bar
 * button and a keyboard shortcut would use. They are wired both ways — trigger
 * the action and the property moves, move the property and the checkmark
 * follows — so nothing has to remember to keep a menu in step with the state.
 *
 * What a panel does **not** know is how wide a pixel is. `size` and `geometry`
 * are numbers it carries for the view; `content` is whatever the host put there,
 * handed back untouched.
 */
export class Panel extends UiObject {
  readonly title = new Property<string>('');
  readonly icon = new Property<unknown>(undefined);

  /** Where it is docked. A floating panel keeps this as the place it returns to. */
  readonly area = new Property<PanelArea>('left');
  /** Width on the left and right, height at the top and bottom. */
  readonly size = new Property<number>(240);

  /** Shut panels keep their place and their contents; they are not destroyed. */
  readonly visible = new Property<boolean>(true);

  /**
   * Whether the title bar is drawn — the strip with the name and the buttons.
   *
   * Off leaves the contents and nothing else, which is what a preview or a
   * canvas usually wants. It is turned off through an action in the panel's
   * own menu, so the way back is where the way out was: a right-click on the
   * contents opens the same menu when there is no ⋮ to click.
   */
  readonly headerVisible = new Property<boolean>(true);
  /** Filling the whole workspace, over everything else. */
  readonly expanded = new Property<boolean>(false);
  /** A window of its own, over the page. */
  readonly floating = new Property<boolean>(false);
  readonly geometry = new Property<PanelGeometry>(DEFAULT_GEOMETRY);

  readonly content = new Property<unknown>(undefined);

  readonly closable = new Property<boolean>(true);
  readonly movable = new Property<boolean>(true);
  readonly floatable = new Property<boolean>(true);

  /**
   * What the ⋮ on the title bar shows: where to move it, floating, expand,
   * close. It is a {@link Menu} rather than an action with children, because
   * nothing ever triggers it — and because the popup's open state belongs
   * somewhere a test can reach, not in a component's `useState`.
   */
  readonly menu = new Menu({ id: 'panel-menu', title: 'Panel' });

  /** The panel was docked somewhere else. */
  readonly areaChanged = new Signal<[area: PanelArea, previous: PanelArea]>();
  /** The panel was shut or brought back. */
  readonly visibilityChanged = new Signal<[visible: boolean]>();

  constructor(init: PanelInit = {}) {
    super(undefined, init.id ?? init.title ?? 'Panel');
    if (init.id !== undefined) this.id = init.id;
    if (init.title !== undefined) this.title.setSilent(init.title);
    if (init.icon !== undefined) this.icon.setSilent(init.icon);
    if (init.area !== undefined) this.area.setSilent(init.area);
    if (init.size !== undefined) this.size.setSilent(init.size);
    if (init.visible !== undefined) this.visible.setSilent(init.visible);
    if (init.header !== undefined) this.headerVisible.setSilent(init.header);
    if (init.expanded !== undefined) this.expanded.setSilent(init.expanded);
    if (init.floating !== undefined) this.floating.setSilent(init.floating);
    if (init.geometry !== undefined) this.geometry.setSilent(init.geometry);
    if (init.content !== undefined) this.content.setSilent(init.content);
    if (init.closable !== undefined) this.closable.setSilent(init.closable);
    if (init.movable !== undefined) this.movable.setSilent(init.movable);
    if (init.floatable !== undefined) this.floatable.setSilent(init.floatable);

    this.watch(
      this.title,
      this.icon,
      this.area,
      this.size,
      this.visible,
      this.headerVisible,
      this.expanded,
      this.floating,
      this.geometry,
      this.content,
      this.closable,
      this.movable,
      this.floatable
    );

    this.area.changed.connect((next, previous) => this.areaChanged.emit(next, previous), this);
    this.visible.changed.connect((next) => this.visibilityChanged.emit(next), this);

    this.menu.setParent(this);
    this.menu.closeOnTrigger();
    this.#buildActions();
  }

  // ── Doing things to it ─────────────────────────────────────────────────────

  /** Dock it somewhere else. Refused when the panel is not movable. */
  moveTo(area: PanelArea): boolean {
    if (!this.movable.value) return false;
    this.floating.value = false;
    this.area.value = area;
    return true;
  }

  /** Take it out of the layout into a window of its own, or put it back. */
  setFloating(floating: boolean, geometry?: PanelGeometry): boolean {
    if (floating && !this.floatable.value) return false;
    if (geometry) this.geometry.value = geometry;
    this.floating.value = floating;
    return true;
  }

  /** Put a floating panel back where it came from, or in `area`. */
  dock(area?: PanelArea): boolean {
    if (area) return this.moveTo(area);
    this.floating.value = false;
    return true;
  }

  setExpanded(expanded: boolean): void {
    this.expanded.value = expanded;
  }

  toggleExpanded(): void {
    this.expanded.value = !this.expanded.value;
  }

  /** Shut it. Refused when the panel is not closable — some panels are the page. */
  close(): boolean {
    if (!this.closable.value) return false;
    this.visible.value = false;
    this.expanded.value = false;
    return true;
  }

  show(): void {
    this.visible.value = true;
  }

  toggle(): void {
    if (this.visible.value) this.close();
    else this.show();
  }

  // ── Its actions ────────────────────────────────────────────────────────────

  /** Show or hide the title bar. The action in the menu does exactly this. */
  setHeaderVisible(visible: boolean): void {
    this.headerVisible.value = visible;
  }

  /** The entries a title bar draws as buttons, in the order they belong there. */
  get titleBarActions(): Action[] {
    return ['expand', 'float', 'close']
      .map((id) => this.actionById(id))
      .filter((a): a is Action => a !== null);
  }

  #buildActions(): void {
    const menu = this.menu;

    const move = menu.addMenu({ id: 'move', text: 'Move to' });
    move.enabled.setSilent(this.movable.value);
    const areas = new ActionGroup('area', move);
    areas.allowNone.value = false;
    for (const area of PANEL_AREAS) {
      const entry = areas.add(move.addAction({ id: `move:${area}`, text: PANEL_AREA_NAMES[area] }));
      entry.checked.setSilent(area === this.area.value);
      entry.triggered.connect(() => {
        // A refusal must not leave the tick where the click put it.
        if (!this.moveTo(area)) this.#syncArea();
      }, this);
    }

    menu.addSeparator('s1');

    const float = menu.addAction({
      id: 'float',
      text: 'Floating',
      checkable: true,
      checked: this.floating.value,
    });
    float.enabled.setSilent(this.floatable.value);
    float.triggered.connect(() => {
      if (!this.setFloating(float.checked.value)) float.setChecked(this.floating.value);
    }, this);

    const expand = menu.addAction({
      id: 'expand',
      text: 'Expand',
      checkable: true,
      checked: this.expanded.value,
    });
    expand.triggered.connect(() => this.setExpanded(expand.checked.value), this);

    const header = menu.addAction({
      id: 'header',
      text: 'Title bar',
      checkable: true,
      checked: this.headerVisible.value,
    });
    header.triggered.connect(() => {
      this.headerVisible.value = header.checked.value;
    }, this);

    menu.addSeparator('s2');

    const close = menu.addAction({ id: 'close', text: 'Close' });
    close.enabled.setSilent(this.closable.value);
    close.triggered.connect(() => this.close(), this);

    // The other direction: whatever moved the panel, the menu shows it.
    this.area.changed.connect(() => this.#syncArea(), this);
    this.floating.changed.connect((on) => float.setChecked(on), this);
    this.expanded.changed.connect((on) => expand.setChecked(on), this);
    this.headerVisible.changed.connect((on) => header.setChecked(on), this);
    this.movable.changed.connect((on) => {
      move.enabled.value = on;
    }, this);
    this.floatable.changed.connect((on) => {
      float.enabled.value = on;
    }, this);
    this.closable.changed.connect((on) => {
      close.enabled.value = on;
    }, this);
  }

  #syncArea(): void {
    this.actionById(`move:${this.area.value}`)?.setChecked(true);
  }

  // ── The plain model ────────────────────────────────────────────────────────

  static fromModel(node: PanelNode): Panel {
    return new Panel({
      id: node.id,
      title: node.title,
      icon: node.icon,
      area: node.area,
      size: node.size,
      visible: node.closed === undefined ? undefined : !node.closed,
      header: node.header,
      expanded: node.expanded,
      floating: node.floating,
      geometry: node.geometry,
      content: node.content,
      closable: node.closable,
      movable: node.movable,
      floatable: node.floatable,
    });
  }

  toModel(): PanelNode {
    return {
      id: this.id,
      title: this.title.value || undefined,
      icon: this.icon.value,
      area: this.area.value,
      size: this.size.value,
      closed: this.visible.value ? undefined : true,
      header: this.headerVisible.value ? undefined : false,
      expanded: this.expanded.value ? true : undefined,
      floating: this.floating.value ? true : undefined,
      geometry: this.geometry.value,
      content: this.content.value,
      closable: this.closable.value,
      movable: this.movable.value,
      floatable: this.floatable.value,
    };
  }
}
