import { useState, useEffect } from 'react';
import type {
  IDisposable,
  IStatusBarItemHandle,
  ToolbarContribution,
  StatusBarContribution,
  ContextMenuContribution,
  CommandPaletteContribution,
  SidebarContribution,
  IPluginInfo,
} from './types';
import { globalEventBus } from './EventBus';

// ── Internal storage entry ─────────────────────────────────────────────────

interface Entry<T> {
  pluginId: string;
  item: T;
}

// ── UIRegistry ─────────────────────────────────────────────────────────────────

class UIRegistry {
  private readonly toolbar = new Map<string, Entry<ToolbarContribution>>();
  private readonly statusbar = new Map<string, Entry<StatusBarContribution>>();
  private readonly contextmenu = new Map<string, Entry<ContextMenuContribution>>();
  private readonly commandpalette = new Map<string, Entry<CommandPaletteContribution>>();
  private readonly sidebar = new Map<string, Entry<SidebarContribution>>();

  private notify(area: string) {
    globalEventBus.emit(`ui:${area}:changed`, undefined);
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  registerToolbar(pluginId: string, item: ToolbarContribution): IDisposable {
    this.toolbar.set(item.id, { pluginId, item: { ...item } });
    this.notify('toolbar');
    return {
      dispose: () => {
        this.toolbar.delete(item.id);
        this.notify('toolbar');
      },
    };
  }

  getToolbarItems(): ToolbarContribution[] {
    return Array.from(this.toolbar.values()).map((e) => e.item);
  }

  // ── StatusBar ──────────────────────────────────────────────────────────────

  registerStatusBar(pluginId: string, item: StatusBarContribution): IStatusBarItemHandle {
    this.statusbar.set(item.id, { pluginId, item: { ...item } });
    this.notify('statusbar');

    const handle: IStatusBarItemHandle = {
      update: (patch) => {
        const entry = this.statusbar.get(item.id);
        if (entry) {
          entry.item = { ...entry.item, ...patch };
          this.notify('statusbar');
        }
      },
      dispose: () => {
        this.statusbar.delete(item.id);
        this.notify('statusbar');
      },
    };
    return handle;
  }

  getStatusBarItems(): StatusBarContribution[] {
    return Array.from(this.statusbar.values()).map((e) => e.item);
  }

  // ── ContextMenu ────────────────────────────────────────────────────────────

  registerContextMenu(pluginId: string, item: ContextMenuContribution): IDisposable {
    this.contextmenu.set(item.id, { pluginId, item: { ...item } });
    this.notify('contextmenu');
    return {
      dispose: () => {
        this.contextmenu.delete(item.id);
        this.notify('contextmenu');
      },
    };
  }

  getContextMenuItems(): ContextMenuContribution[] {
    return Array.from(this.contextmenu.values()).map((e) => e.item);
  }

  // ── CommandPalette ─────────────────────────────────────────────────────────

  registerCommandPalette(pluginId: string, item: CommandPaletteContribution): IDisposable {
    this.commandpalette.set(item.command, { pluginId, item: { ...item } });
    this.notify('commandpalette');
    return {
      dispose: () => {
        this.commandpalette.delete(item.command);
        this.notify('commandpalette');
      },
    };
  }

  getCommandPaletteItems(): CommandPaletteContribution[] {
    return Array.from(this.commandpalette.values()).map((e) => e.item);
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  registerSidebar(pluginId: string, panel: SidebarContribution): IDisposable {
    this.sidebar.set(panel.id, { pluginId, item: { ...panel } });
    this.notify('sidebar');
    return {
      dispose: () => {
        this.sidebar.delete(panel.id);
        this.notify('sidebar');
      },
    };
  }

  getSidebarPanels(): SidebarContribution[] {
    return Array.from(this.sidebar.values())
      .map((e) => e.item)
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }
}

/** Singleton shared across the editor shell. */
export const globalUIRegistry = new UIRegistry();

// ── React hooks ────────────────────────────────────────────────────────────────

function useUIArea<T>(area: string, getter: () => T): T {
  const [items, setItems] = useState<T>(getter);

  useEffect(() => {
    // Re-sync on mount (in case plugins activated between render and effect)
    setItems(getter());
    const unsub = globalEventBus.on<undefined>(`ui:${area}:changed`, () => {
      setItems(getter());
    });
    return unsub;
    // getter is stable (always reads from singleton) — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  return items;
}

export function useToolbarItems(): ToolbarContribution[] {
  return useUIArea('toolbar', () => globalUIRegistry.getToolbarItems());
}

export function useStatusBarPluginItems(): StatusBarContribution[] {
  return useUIArea('statusbar', () => globalUIRegistry.getStatusBarItems());
}

export function useSidebarContributions(): SidebarContribution[] {
  return useUIArea('sidebar', () => globalUIRegistry.getSidebarPanels());
}

export function useContextMenuContributions(): ContextMenuContribution[] {
  return useUIArea('contextmenu', () => globalUIRegistry.getContextMenuItems());
}

export function useCommandPaletteContributions(): CommandPaletteContribution[] {
  return useUIArea('commandpalette', () => globalUIRegistry.getCommandPaletteItems());
}

/** Tracks the plugin list (activated/deactivated events). */
export function usePlugins(getPlugins: () => readonly IPluginInfo[]): readonly IPluginInfo[] {
  const [plugins, setPlugins] = useState<readonly IPluginInfo[]>(getPlugins);

  useEffect(() => {
    const refresh = () => setPlugins(getPlugins().slice());
    const u1 = globalEventBus.on('plugin:activated', refresh);
    const u2 = globalEventBus.on('plugin:deactivated', refresh);
    const u3 = globalEventBus.on('plugin:registered', refresh);
    refresh();
    return () => { u1(); u2(); u3(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return plugins;
}
