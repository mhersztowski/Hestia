/**
 * `coreobject/ui` — the live form of what a user clicks on.
 *
 * `Action` is the command (Qt's `QAction`): a menu entry, a toolbar button and a
 * shortcut are three views of one object, so disabling it disables all three.
 * `Toolbar` holds them, `ActionGroup` makes a set of them behave as radio
 * buttons, and the object tree of `CoreObject` is the menu structure.
 *
 * `Panel` and `Workspace` are the other half of a window: the panels that dock
 * around the page, and the area that holds them. A panel's own commands — move
 * it, float it, expand it, shut it — are `Action`s hanging off the panel, so the
 * title bar and the menu draw the same objects.
 *
 * The plain, serialisable form of all of it is `models/ui/*`, and the two
 * convert into each other. React lives in `@hestia/ui-core` and is not
 * mentioned anywhere below.
 */

export {
  UiObject,
  ItemHost,
  MenuItem,
  Action,
  Separator,
  CustomItem,
  Menu,
  normalizeShortcut,
} from './items';
export type {
  MenuItemKind,
  MenuItemInit,
  ActionInit,
  CustomItemInit,
  ExclusiveGroup,
  ActionCollectionLike,
  MenuInit,
  ItemTarget,
} from './items';

export { ActionGroup } from './ActionGroup';

export { ActionCollection } from './ActionCollection';
export type { ActionCollectionInit } from './ActionCollection';

export { Toolbar, addModel } from './Toolbar';
export type { ToolbarInit } from './Toolbar';

export { MenuBar } from './MenuBar';
export type { MenuBarInit } from './MenuBar';

export { Tab, TabBar } from './TabBar';
export type { TabInit, TabBarInit } from './TabBar';

export { Panel } from './Panel';
export type { PanelInit } from './Panel';

export { Workspace } from './Workspace';
export type { WorkspaceInit } from './Workspace';
