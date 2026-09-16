/**
 * The plain form of a panel and of the area that holds panels.
 *
 * A window is a menu bar, a toolbar and a status bar around **everything else**,
 * and everything else is what this file describes: a middle where the page draws
 * and panels docked around it — the file tree on the left, a console at the
 * bottom, properties on the right. Qt calls the panels dock widgets and the
 * middle the central widget; Win32 calls the whole of it the client area. It is
 * named `Workspace` here because "client area" in Win32 includes the toolbars,
 * and this deliberately does not: a panel is content, a toolbar is chrome.
 *
 * A panel is either docked in one of the four sides (or stacked in the middle),
 * or **floating** — a little window of its own, over the page. Floating is what
 * the user meant by "fly": Qt's undocked dock widget.
 *
 * As with the toolbar, this is the description only. `coreobject/ui/Panel` and
 * `coreobject/ui/Workspace` are the live objects, they convert both ways, and
 * they are what an application should hold.
 */

/** Where a panel sits. `centre` stacks it with the page rather than beside it. */
export type PanelArea = 'left' | 'right' | 'top' | 'bottom' | 'centre';

export const PANEL_AREAS: readonly PanelArea[] = ['left', 'right', 'top', 'bottom', 'centre'];

/** English names for the areas, for a "Move to" menu that has not been translated. */
export const PANEL_AREA_NAMES: Record<PanelArea, string> = {
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
  centre: 'Centre',
};

/** Where a floating panel is, and how big. */
export interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_GEOMETRY: PanelGeometry = { x: 80, y: 80, width: 320, height: 240 };

export interface PanelNode {
  id: string;
  title?: string;
  /** Kept and handed back untouched, exactly as a toolbar item's icon is. */
  icon?: unknown;
  /** Where it is docked. A floating panel remembers this as where it came from. */
  area?: PanelArea;
  /**
   * How much room it takes across the docking axis: a width on the left and
   * right, a height at the top and bottom. Panels sharing an area share the
   * largest of their sizes — one strip cannot be two widths.
   */
  size?: number;
  /** Shut. It keeps its place and comes back to it. */
  closed?: boolean;
  /**
   * Whether the title bar is drawn. Off gives a panel that is only its
   * contents — a preview, a canvas — with no strip of chrome above it.
   */
  header?: boolean;
  /** Filling the whole workspace, over everything else. At most one panel is. */
  expanded?: boolean;
  /** A window of its own, over the page. */
  floating?: boolean;
  geometry?: PanelGeometry;
  /** Whatever the host draws inside — kept without being looked at. */
  content?: unknown;
  closable?: boolean;
  movable?: boolean;
  floatable?: boolean;
}

export interface WorkspaceModel {
  id?: string;
  panels: PanelNode[];
}

export function panel(
  id: string,
  title: string,
  rest: Omit<PanelNode, 'id' | 'title'> = {}
): PanelNode {
  return { id, title, ...rest };
}

export function workspace(panels: PanelNode[], id?: string): WorkspaceModel {
  return { id, panels };
}

/** The panels of an area that are neither shut nor floating — the ones that take up room. */
export function panelsIn(model: WorkspaceModel, area: PanelArea): PanelNode[] {
  return model.panels.filter((p) => (p.area ?? 'left') === area && !p.closed && !p.floating);
}

/**
 * Whether panels in this area sit side by side (top and bottom) rather than one
 * above the other (left, right and the middle).
 */
export function isHorizontalArea(area: PanelArea): boolean {
  return area === 'top' || area === 'bottom';
}

/** The room an area needs: the largest of its panels' sizes, or none when it is empty. */
export function areaSize(model: WorkspaceModel, area: PanelArea, fallback = 240): number {
  const sizes = panelsIn(model, area).map((p) => p.size ?? fallback);
  return sizes.length === 0 ? 0 : Math.max(...sizes);
}
