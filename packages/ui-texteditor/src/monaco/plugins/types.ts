import type { ComponentType } from 'react';

// ── Disposable ────────────────────────────────────────────────────────────────

export interface IDisposable {
  dispose(): void;
}

// ── Manifest & contribution points ───────────────────────────────────────────

export type ContributionPointType =
  | 'toolbar'
  | 'statusbar'
  | 'contextmenu'
  | 'commandpalette'
  | 'sidebar';

export interface IPluginManifest {
  /** Unique id, e.g. "com.example.formatter" */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Which contribution points this plugin uses */
  contributes: ContributionPointType[];
}

// ── Contribution types ────────────────────────────────────────────────────────

/** Simple boolean context expression, e.g. "editorHasSelection" */
export type ContextExpression = string;

// -- Toolbar --

export interface ToolbarContribution {
  id: string;
  /** Tooltip and accessibility label */
  label: string;
  /**
   * Icon: SVG string (starts with "<svg"), a Unicode symbol/emoji,
   * or plain text. Codicon names ("codicon-xxx") rendered as text fallback.
   */
  icon: string;
  /** Alignment group in the toolbar */
  group?: string;
  /** Sort order within the group (ascending) */
  order?: number;
  when?: ContextExpression;
  /** Command id to execute on click */
  command: string;
  /** When set, button renders as a toggle */
  toggle?: { contextKey: string };
}

// -- StatusBar --

export interface IStatusBarItemHandle extends IDisposable {
  update(patch: Partial<Omit<StatusBarContribution, 'id'>>): void;
}

export interface StatusBarContribution {
  id: string;
  text: string;
  tooltip?: string;
  alignment: 'left' | 'right';
  /** Higher priority = closer to center */
  priority?: number;
  command?: string;
  backgroundColor?: string;
  color?: string;
}

// -- ContextMenu --

export interface ContextMenuContribution {
  id: string;
  label: string;
  group?: string;
  order?: number;
  command: string;
  when?: ContextExpression;
  submenu?: ContextMenuContribution[];
}

// -- CommandPalette --

export interface CommandPaletteContribution {
  command: string;
  title: string;
  category?: string;
  /** Human-readable keybinding hint shown in the palette, not parsed */
  keybinding?: string;
  when?: ContextExpression;
}

// -- Sidebar --

export interface SidebarContribution {
  id: string;
  title: string;
  /** SVG string or Unicode symbol */
  icon: string;
  /** React component rendered as the panel body */
  component: ComponentType;
  order?: number;
}

// ── Plugin API ────────────────────────────────────────────────────────────────

export interface IPluginEditorAPI {
  /** Called when the active document changes (tab switch, new file, etc.) */
  onDidChangeModel(cb: (uri: string) => void): IDisposable;
  /**
   * Called when the active document changes AND provides its full text —
   * useful for initializing state (e.g. a preview) without waiting for a keystroke.
   */
  onDidOpenDocument(cb: (uri: string, text: string) => void): IDisposable;
  onDidChangeCursorPosition(cb: (pos: { lineNumber: number; column: number }) => void): IDisposable;
  onDidSaveDocument(cb: (uri: string) => void): IDisposable;
  /** Called whenever the active editor content changes. Receives the full text. */
  onDidChangeContent(cb: (text: string) => void): IDisposable;
}

export interface IPluginCommandsAPI {
  /** Register a command handler. The id is automatically namespaced to the plugin. */
  register(id: string, handler: (...args: unknown[]) => unknown): IDisposable;
  /** Execute a command by its full id. */
  execute(id: string, ...args: unknown[]): Promise<unknown>;
}

export interface IPluginUIAPI {
  toolbar: { register(item: ToolbarContribution): IDisposable };
  statusbar: { register(item: StatusBarContribution): IStatusBarItemHandle };
  contextmenu: { register(item: ContextMenuContribution): IDisposable };
  commandpalette: { register(item: CommandPaletteContribution): IDisposable };
  sidebar: { register(panel: SidebarContribution): IDisposable };
  /** Programmatically open (reveal) a sidebar panel by its contribution id. */
  openSidebarPanel(panelId: string): void;
}

export interface IPluginEventsAPI {
  /** Subscribe to a plugin-scoped event. Automatically prefixed with pluginId. */
  on<T>(event: string, handler: (payload: T) => void): IDisposable;
  /** Emit a plugin-scoped event. */
  emit<T>(event: string, payload: T): void;
}

export interface IPluginStorageAPI {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

export interface IPluginLoggerAPI {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface IPluginAPI {
  readonly pluginId: string;
  readonly editor: IPluginEditorAPI;
  readonly commands: IPluginCommandsAPI;
  readonly ui: IPluginUIAPI;
  readonly events: IPluginEventsAPI;
  readonly storage: IPluginStorageAPI;
  readonly logger: IPluginLoggerAPI;
  /**
   * Open a custom React component as an editor tab (no VFS backing).
   * If a tab with the same `uri` is already open, switches to it instead of opening a duplicate.
   * @param toSide - open in a new split group to the right (side-by-side, like VSCode "Preview to Side")
   */
  openEditorTab(opts: {
    uri: string;
    title: string;
    component: ComponentType;
    toSide?: boolean;
  }): void;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export interface IPlugin {
  readonly manifest: IPluginManifest;
  activate(api: IPluginAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export type IPluginState = 'inactive' | 'activating' | 'active' | 'deactivating' | 'error';

export interface IPluginInfo {
  readonly manifest: IPluginManifest;
  readonly state: IPluginState;
  readonly error?: Error;
}
