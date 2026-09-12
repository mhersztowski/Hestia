import type { Disposable } from '../utils/types';
import { DisposableStore } from '../utils/disposable';
import type { EditorInstance } from '../core/EditorInstance';
import type { LanguageService } from '../language/LanguageService';
import type { ContextMenuService } from '../ui/ContextMenuService';
import type { CommandRegistry } from '../core/CommandRegistry';

/**
 * Context provided to plugins for accessing editor services
 */
export interface PluginContext {
  readonly editor: EditorInstance;
  readonly languageService: LanguageService;
  readonly contextMenuService: ContextMenuService;
  readonly commandRegistry: CommandRegistry;
}

/**
 * Plugin metadata
 */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly dependencies?: readonly string[];
}

/**
 * Plugin lifecycle interface
 */
export interface Plugin {
  readonly manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/**
 * Plugin state
 */
export type PluginState = 'inactive' | 'activating' | 'active' | 'deactivating' | 'error';

export interface PluginInfo {
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly error?: Error;
}

/**
 * Manages plugin lifecycle and registration
 */
export class PluginSystem implements Disposable {
  private readonly plugins = new Map<string, { plugin: Plugin; state: PluginState; error?: Error }>();
  private readonly disposables = new DisposableStore();
  private context: PluginContext | null = null;

  /**
   * Sets the plugin context (must be called before activating plugins)
   */
  setContext(context: PluginContext): void {
    this.context = context;
  }

  /**
   * Registers a plugin
   */
  registerPlugin(plugin: Plugin): Disposable {
    const { id } = plugin.manifest;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }

    this.plugins.set(id, { plugin, state: 'inactive' });

    return {
      dispose: () => {
        this.unregisterPlugin(id);
      },
    };
  }

  /**
   * Unregisters and deactivates a plugin
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return;
    }

    if (entry.state === 'active') {
      await this.deactivatePlugin(pluginId);
    }

    this.plugins.delete(pluginId);
  }

  /**
   * Activates a plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    if (!this.context) {
      throw new Error('Plugin context not set');
    }

    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    if (entry.state === 'active') {
      return;
    }

    if (entry.state === 'activating') {
      throw new Error(`Plugin "${pluginId}" is already activating`);
    }

    // Check dependencies
    const dependencies = entry.plugin.manifest.dependencies ?? [];
    for (const depId of dependencies) {
      const depEntry = this.plugins.get(depId);
      if (!depEntry) {
        throw new Error(`Plugin "${pluginId}" depends on "${depId}" which is not registered`);
      }
      if (depEntry.state !== 'active') {
        await this.activatePlugin(depId);
      }
    }

    entry.state = 'activating';

    try {
      await entry.plugin.activate(this.context);
      entry.state = 'active';
      entry.error = undefined;
    } catch (error) {
      entry.state = 'error';
      entry.error = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to activate plugin "${pluginId}":`, error);
      throw entry.error;
    }
  }

  /**
   * Deactivates a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry || entry.state !== 'active') {
      return;
    }

    // Check if other plugins depend on this one
    for (const [otherId, otherEntry] of this.plugins) {
      if (
        otherEntry.state === 'active' &&
        otherEntry.plugin.manifest.dependencies?.includes(pluginId)
      ) {
        throw new Error(
          `Cannot deactivate "${pluginId}" because "${otherId}" depends on it`
        );
      }
    }

    entry.state = 'deactivating';

    try {
      await entry.plugin.deactivate?.();
      entry.state = 'inactive';
    } catch (error) {
      entry.state = 'error';
      entry.error = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to deactivate plugin "${pluginId}":`, error);
    }
  }

  /**
   * Activates all registered plugins
   */
  async activateAll(): Promise<void> {
    // Sort by dependencies
    const sorted = this.topologicalSort();

    for (const pluginId of sorted) {
      const entry = this.plugins.get(pluginId);
      if (entry && entry.state === 'inactive') {
        try {
          await this.activatePlugin(pluginId);
        } catch {
          // Error already logged in activatePlugin
        }
      }
    }
  }

  /**
   * Deactivates all plugins
   */
  async deactivateAll(): Promise<void> {
    // Deactivate in reverse dependency order
    const sorted = this.topologicalSort().reverse();

    for (const pluginId of sorted) {
      try {
        await this.deactivatePlugin(pluginId);
      } catch {
        // Error already logged in deactivatePlugin
      }
    }
  }

  /**
   * Gets information about all plugins
   */
  getPlugins(): readonly PluginInfo[] {
    return Array.from(this.plugins.entries()).map(([, entry]) => ({
      manifest: entry.plugin.manifest,
      state: entry.state,
      error: entry.error,
    }));
  }

  /**
   * Gets information about a specific plugin
   */
  getPlugin(pluginId: string): PluginInfo | undefined {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return undefined;
    }

    return {
      manifest: entry.plugin.manifest,
      state: entry.state,
      error: entry.error,
    };
  }

  private topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) {
        return;
      }
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected involving plugin "${id}"`);
      }

      visiting.add(id);

      const entry = this.plugins.get(id);
      if (entry) {
        for (const depId of entry.plugin.manifest.dependencies ?? []) {
          if (this.plugins.has(depId)) {
            visit(depId);
          }
        }
      }

      visiting.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }

    return result;
  }

  dispose(): void {
    // Synchronously mark all as inactive
    for (const entry of this.plugins.values()) {
      entry.state = 'inactive';
    }
    this.plugins.clear();
    this.context = null;
    this.disposables.dispose();
  }
}

/**
 * Helper to create a plugin
 */
export function definePlugin(
  manifest: PluginManifest,
  activate: (context: PluginContext) => void | Promise<void>,
  deactivate?: () => void | Promise<void>
): Plugin {
  return {
    manifest,
    activate,
    deactivate,
  };
}
