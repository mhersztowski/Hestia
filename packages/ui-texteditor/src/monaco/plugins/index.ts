// ── Legacy plugin system (v1) ────────────────────────────────────────────────
export { PluginSystem, definePlugin } from './PluginSystem';
export type {
  Plugin,
  PluginContext,
  PluginManifest,
  PluginState,
  PluginInfo,
} from './PluginSystem';

// ── Plugin system v2 — types ─────────────────────────────────────────────────
export type {
  IDisposable,
  IPlugin,
  IPluginManifest,
  IPluginState,
  IPluginInfo,
  IPluginAPI,
  IPluginEditorAPI,
  IPluginCommandsAPI,
  IPluginUIAPI,
  IPluginEventsAPI,
  IPluginStorageAPI,
  IPluginLoggerAPI,
  IStatusBarItemHandle,
  ContributionPointType,
  ContextExpression,
  ToolbarContribution,
  StatusBarContribution,
  ContextMenuContribution,
  CommandPaletteContribution,
  SidebarContribution,
} from './types';

// ── Core infrastructure ───────────────────────────────────────────────────────
export { EventBus, globalEventBus } from './EventBus';
export { PluginCommandRegistry, globalCommandRegistry } from './PluginCommandRegistry';
export {
  globalUIRegistry,
  useToolbarItems,
  useStatusBarPluginItems,
  useSidebarContributions,
  useContextMenuContributions,
  useCommandPaletteContributions,
  usePlugins,
} from './UIRegistry';
export { createPluginAPI } from './PluginAPI';
export type { IInternalPluginAPI } from './PluginAPI';
export {
  PluginRegistry,
  globalPluginRegistry,
  defineEditorPlugin,
} from './PluginRegistry';

// ── Built-in example plugins (v1) ────────────────────────────────────────────
export { WordCountPlugin, HighlightLinePlugin } from './examples';

// ── Built-in example plugins (v2) ────────────────────────────────────────────
export { WordCountPluginV2 } from './examples/WordCountPluginV2';
export { GenerateUuidPlugin } from './examples/GenerateUuidPlugin';
