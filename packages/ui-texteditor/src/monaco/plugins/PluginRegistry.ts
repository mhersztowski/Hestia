import type { IPlugin, IPluginState, IPluginInfo, IDisposable } from './types';
import { createPluginAPI } from './PluginAPI';
import type { IInternalPluginAPI } from './PluginAPI';
import { globalEventBus } from './EventBus';

interface RegistryEntry {
  plugin: IPlugin;
  state: IPluginState;
  error?: Error;
  api?: IInternalPluginAPI;
}

/**
 * Central registry that manages plugin lifecycle:
 *  register → activate → (active) → deactivate → inactive
 *
 * On activation each plugin receives a scoped IPluginAPI.
 * On deactivation all resources registered through the API are disposed.
 */
export class PluginRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /** Register a plugin without activating it. */
  register(plugin: IPlugin): IDisposable {
    const { id } = plugin.manifest;
    if (this.entries.has(id)) {
      throw new Error(`[PluginRegistry] Plugin "${id}" is already registered`);
    }
    this.entries.set(id, { plugin, state: 'inactive' });
    globalEventBus.emit('plugin:registered', { pluginId: id });
    return { dispose: () => this.unregister(id) };
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.state === 'active') {
      this.deactivate(id);
    }
    this.entries.delete(id);
  }

  /** Activate a plugin — creates a scoped API and calls plugin.activate(). */
  async activate(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`[PluginRegistry] Plugin "${id}" not found`);
    if (entry.state === 'active') return;

    entry.state = 'activating';
    const api = createPluginAPI(id);
    entry.api = api;

    try {
      await entry.plugin.activate(api);
      entry.state = 'active';
      entry.error = undefined;
      globalEventBus.emit('plugin:activated', { pluginId: id });
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err : new Error(String(err));
      api._disposeAll();
      console.error(`[PluginRegistry] Failed to activate "${id}":`, err);
    }
  }

  /** Deactivate a plugin and clean up all its resources. */
  async deactivate(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== 'active') return;

    entry.state = 'deactivating';
    try {
      await entry.plugin.deactivate?.();
    } catch (err) {
      console.error(`[PluginRegistry] Error during deactivation of "${id}":`, err);
    }
    entry.api?._disposeAll();
    entry.api = undefined;
    entry.state = 'inactive';
    globalEventBus.emit('plugin:deactivated', { pluginId: id });
  }

  /** Activate all registered inactive plugins. */
  async activateAll(): Promise<void> {
    for (const id of this.entries.keys()) {
      const entry = this.entries.get(id)!;
      if (entry.state === 'inactive') {
        try {
          await this.activate(id);
        } catch { /* error already logged */ }
      }
    }
  }

  /** Deactivate all active plugins (in reverse registration order). */
  async deactivateAll(): Promise<void> {
    const ids = Array.from(this.entries.keys()).reverse();
    for (const id of ids) {
      try {
        await this.deactivate(id);
      } catch { /* error already logged */ }
    }
  }

  getPlugins(): readonly IPluginInfo[] {
    return Array.from(this.entries.values()).map((e) => ({
      manifest: e.plugin.manifest,
      state: e.state,
      error: e.error,
    }));
  }

  getPlugin(id: string): IPluginInfo | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    return { manifest: e.plugin.manifest, state: e.state, error: e.error };
  }
}

/** Singleton shared across the editor shell. */
export const globalPluginRegistry = new PluginRegistry();

// ── Helper ───────────────────────────────────────────────────────────────────

import type { IPluginManifest, ContributionPointType } from './types';
import type { IPluginAPI } from './types';

/**
 * Helper to define a plugin with full type inference — mirrors VSCode's approach
 * of a plain object with activate/deactivate methods.
 */
export function defineEditorPlugin(
  manifest: IPluginManifest & { contributes: ContributionPointType[] },
  activate: (api: IPluginAPI) => void | Promise<void>,
  deactivate?: () => void | Promise<void>,
): IPlugin {
  return { manifest, activate, deactivate };
}
