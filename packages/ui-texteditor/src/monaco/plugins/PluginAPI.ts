import type {
  IPluginAPI,
  IDisposable,
  ToolbarContribution,
  StatusBarContribution,
  ContextMenuContribution,
  CommandPaletteContribution,
  SidebarContribution,
} from './types';
import { globalEventBus } from './EventBus';
import { globalCommandRegistry } from './PluginCommandRegistry';
import { globalUIRegistry } from './UIRegistry';

// Internal API type adds cleanup method used by PluginRegistry.
export interface IInternalPluginAPI extends IPluginAPI {
  _disposeAll(): void;
}

/**
 * Creates a scoped Plugin API for a single plugin.
 *
 * The API automatically:
 *  - Namespaces plugin-scoped events with `pluginId:`
 *  - Namespaces plugin commands with `pluginId:`
 *  - Tracks all registered disposables so they can be cleaned up on deactivation
 *  - Isolates localStorage keys under `plugin:pluginId:`
 */
export function createPluginAPI(pluginId: string): IInternalPluginAPI {
  const disposables: IDisposable[] = [];

  function track<T extends IDisposable>(d: T): T {
    disposables.push(d);
    return d;
  }

  const pluginPrefix = `${pluginId}:`;

  const api: IInternalPluginAPI = {
    pluginId,

    // ── Editor events (via global event bus — decoupled from Monaco instances) ──

    editor: {
      onDidChangeModel(cb) {
        const unsub = globalEventBus.on<{ uri: string; text: string }>(
          'system:editor:modelChanged',
          ({ uri }) => cb(uri),
        );
        return track({ dispose: unsub });
      },
      onDidOpenDocument(cb) {
        const unsub = globalEventBus.on<{ uri: string; text: string }>(
          'system:editor:modelChanged',
          ({ uri, text }) => cb(uri, text),
        );
        return track({ dispose: unsub });
      },
      onDidChangeCursorPosition(cb) {
        const unsub = globalEventBus.on<{ lineNumber: number; column: number }>(
          'system:editor:cursorMoved',
          cb,
        );
        return track({ dispose: unsub });
      },
      onDidSaveDocument(cb) {
        const unsub = globalEventBus.on<{ uri: string }>(
          'system:editor:didSave',
          ({ uri }) => cb(uri),
        );
        return track({ dispose: unsub });
      },
      onDidChangeContent(cb) {
        const unsub = globalEventBus.on<{ text: string }>(
          'system:editor:contentChanged',
          ({ text }) => cb(text),
        );
        return track({ dispose: unsub });
      },
    },

    // ── Commands ──────────────────────────────────────────────────────────────

    commands: {
      register(id, handler) {
        // Plugin commands are namespaced: "pluginId:commandId"
        return track(globalCommandRegistry.register(`${pluginPrefix}${id}`, handler));
      },
      execute(id, ...args) {
        // Allow both short ids (auto-prefixed) and full ids
        const fullId = id.startsWith(pluginPrefix) ? id : `${pluginPrefix}${id}`;
        return globalCommandRegistry.execute(fullId, ...args);
      },
    },

    // ── UI ────────────────────────────────────────────────────────────────────

    ui: {
      toolbar: {
        register(item: ToolbarContribution) {
          return track(globalUIRegistry.registerToolbar(pluginId, item));
        },
      },
      statusbar: {
        register(item: StatusBarContribution) {
          const handle = globalUIRegistry.registerStatusBar(pluginId, item);
          track(handle);
          return handle;
        },
      },
      contextmenu: {
        register(item: ContextMenuContribution) {
          return track(globalUIRegistry.registerContextMenu(pluginId, item));
        },
      },
      commandpalette: {
        register(item: CommandPaletteContribution) {
          return track(globalUIRegistry.registerCommandPalette(pluginId, item));
        },
      },
      sidebar: {
        register(panel: SidebarContribution) {
          return track(globalUIRegistry.registerSidebar(pluginId, panel));
        },
      },
      openSidebarPanel(panelId: string) {
        globalEventBus.emit('system:ui:openSidebar', { panelId });
      },
    },

    // ── Events (plugin-scoped) ────────────────────────────────────────────────

    events: {
      on<T>(event: string, handler: (payload: T) => void) {
        const unsub = globalEventBus.on<T>(`${pluginPrefix}${event}`, handler);
        return track({ dispose: unsub });
      },
      emit<T>(event: string, payload: T) {
        globalEventBus.emit(`${pluginPrefix}${event}`, payload);
      },
    },

    // ── Storage (plugin-namespaced localStorage) ──────────────────────────────

    storage: {
      get<T>(key: string): T | undefined {
        const raw = localStorage.getItem(`plugin:${pluginId}:${key}`);
        if (raw === null) return undefined;
        try {
          return JSON.parse(raw) as T;
        } catch {
          return undefined;
        }
      },
      set<T>(key: string, value: T): void {
        localStorage.setItem(`plugin:${pluginId}:${key}`, JSON.stringify(value));
      },
      delete(key: string): void {
        localStorage.removeItem(`plugin:${pluginId}:${key}`);
      },
    },

    // ── Logger ────────────────────────────────────────────────────────────────

    logger: {
      info(msg, ...args) { console.info(`[${pluginId}] ${msg}`, ...args); },
      warn(msg, ...args) { console.warn(`[${pluginId}] ${msg}`, ...args); },
      error(msg, ...args) { console.error(`[${pluginId}] ${msg}`, ...args); },
    },

    // ── Virtual editor tabs ───────────────────────────────────────────────────

    openEditorTab({ uri, title, component, toSide }) {
      globalEventBus.emit('system:editor:openVirtualTab', { uri, title, component, toSide: toSide ?? false });
    },

    // ── Internal cleanup ──────────────────────────────────────────────────────

    _disposeAll() {
      for (const d of disposables) {
        try { d.dispose(); } catch { /* ignore */ }
      }
      disposables.length = 0;
    },
  };

  return api;
}
