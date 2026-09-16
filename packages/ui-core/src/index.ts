/**
 * `@hestia/ui-core` — React components meant to be used in more than one place.
 *
 * The rule for what belongs here is the same as for `@hestia/core`: nothing
 * about any one application. A component lands here when a second application
 * needs it, or when it is plainly general from the start — not in the hope that
 * one day something might.
 *
 * React, MUI and Emotion are peers: the host has them anyway, and a second copy
 * of React breaks hooks in a way whose symptom (a blank screen) says nothing
 * about the cause.
 */

export { Toolbar, FloatingToolbar } from './toolbar/Toolbar';
export type {
  ToolbarProps,
  ToolbarOrientation,
  ToolbarVariant,
  ToolbarDisplay,
} from './toolbar/Toolbar';
export {
  useToolbarRevision,
  useToolbarFromModel,
  useShortcuts,
  shortcutFromEvent,
} from './toolbar/useToolbar';
export { useDismissOnOutside } from './toolbar/usePopup';
export type { ShortcutSource } from './toolbar/useToolbar';
// The menu bar draws a `MenuBar` object, which knows which menu is open — see
// the note at the foot of `toolbar/Toolbar.tsx` for why it is not a toolbar prop.
export { MenuBar } from './menubar/MenuBar';
export type { MenuBarProps } from './menubar/MenuBar';
// The panels and the area they dock around — everything a window holds that is
// not a menu bar, a toolbar or a status bar.
export { Panel } from './panel/Panel';
export type { PanelProps } from './panel/Panel';
export { Workspace } from './panel/Workspace';
export type { WorkspaceProps } from './panel/Workspace';
// Zakładki: pasek, przewijanie, menu na tabie i menu z listą wszystkich.
export { TabBar, useCurrentTab } from './tabbar/TabBar';
export type { TabBarProps } from './tabbar/TabBar';

// The drive: MyCastle's page, whole — the listing, favourites, the actions,
// search, the preview and the panels.
export { default as DrivePage } from './drive/DrivePage';
export type { DrivePageProps } from './drive/DrivePage';
// The small one: a listing with a preview, for a host that wants a file panel
// rather than a drive (the CAD application's side bar).
export { Drive } from './drive/Drive';
export type { DriveProps } from './drive/Drive';
export {
  pathIn as drivePathIn,
  parentDir as driveParentDir,
  baseName as driveBaseName,
  breadcrumbs as driveBreadcrumbs,
  safeName as driveSafeName,
  sortEntries as sortDriveEntries,
  kindOf as driveFileKind,
  extensionOf,
  formatSize,
  imageMimeType,
  dataUrl,
} from './drive/store';
export type { DriveStore, DriveEntry, FileKind } from './drive/store';
// The file operations the ported Drive page performs
export {
  asText,
  fromText,
  readTextOrNull,
  readJson,
  sortVfsEntries,
  freeName,
  FILE_TYPE,
  DIR_TYPE,
} from './drive/vfs';
export { isArchive, folderNameFor, archiveNameFor } from './drive/zip';
export {
  PACKAGE_MANAGERS,
  detectPackageManager,
  installPlan,
  runPlan,
  decideScript,
  isSafeScriptName,
  readPackageScripts,
  readPackageManagerField,
} from './drive/npmProject';
export type {
  PackageManagerId,
  PackageManagerInfo,
  DetectedManager,
  CommandPlan,
  ScriptDecision,
} from './drive/npmProject';
export {
  isRunnableScript,
  runScript,
  stopScript,
  stripImports,
  formatConsoleArg,
  MAX_CONSOLE_LINES,
} from './drive/runScript';
export type { ConsoleLine, ConsoleLevel, ScriptSession } from './drive/runScript';
export type { DriveVfs, VfsEntry } from './drive/vfs';
export { has as hasCapability } from './drive/capabilities';
export type {
  DriveCapabilities,
  DriveEditor,
  DriveAssistant,
  DriveViewers,
  DriveFileRef,
  EditorViewOption,
} from './drive/capabilities';

/*
 * The toolbar's model and the objects behind it now live in `@hestia/core`:
 * `model/ui/toolbar` for the plain tree, `coreobject/ui` for the live `Toolbar`,
 * `Action` and `ActionGroup`. They are re-exported here so that a caller who
 * imports a menu and the component that draws it keeps doing it in one import.
 */
export {
  item,
  submenu,
  toggle,
  splitToggle,
  separator,
  custom,
  childrenOf,
  hasSubmenu,
  isActionable,
  titleOf,
  findNode,
  findPath,
  walk,
  visibleNodes,
  applyToggle,
  collapseSeparators,
  Toolbar as ToolbarObject,
  MenuBar as MenuBarObject,
  Action,
  ActionGroup,
  Separator as ToolbarSeparator,
  CustomItem as ToolbarCustomItem,
  MenuItem as ToolbarMenuItem,
  UiObject,
  ItemHost,
  addModel,
  ActionCollection,
  normalizeShortcut,
  menu,
  menuBar,
  isMenu,
  menusOf,
  Panel as PanelObject,
  Workspace as WorkspaceObject,
  Menu as MenuObject,
  Tab as TabObject,
  TabBar as TabBarObject,
  tab as tabNode,
  tabBar as tabBarModel,
  visibleTabs,
  currentTab,
  panel as panelNode,
  workspace as workspaceModel,
  panelsIn,
  areaSize,
  PANEL_AREAS,
  PANEL_AREA_NAMES,
} from '@hestia/core';
export type {
  ToolbarNode,
  ToolbarParent,
  ToolbarNodeBase,
  MenuItemNode,
  MenuToggleNode,
  MenuSeparatorNode,
  MenuCustomNode,
  ToolbarInit,
  MenuBarInit,
  ActionInit,
  MenuItemKind,
  MenuBarModel,
  MenuNode,
  PanelInit,
  WorkspaceInit,
  PanelNode,
  PanelArea,
  PanelGeometry,
  WorkspaceModel,
  ActionCollectionInit,
  MenuInit,
  TabInit,
  TabBarInit,
  TabNode,
  TabBarModel,
  ItemTarget,
} from '@hestia/core';
