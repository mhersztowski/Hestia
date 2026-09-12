import type { IDisposable } from './types';

type CommandHandler = (...args: unknown[]) => unknown;

/**
 * Registry for plugin-defined commands. Separate from Monaco's built-in action
 * registry — these commands are invoked by toolbar clicks, context-menu entries,
 * and command-palette items registered by plugins.
 */
export class PluginCommandRegistry {
  private readonly commands = new Map<string, CommandHandler>();

  register(id: string, handler: CommandHandler): IDisposable {
    if (this.commands.has(id)) {
      console.warn(`[PluginCommandRegistry] Overwriting command "${id}"`);
    }
    this.commands.set(id, handler);
    return {
      dispose: () => {
        this.commands.delete(id);
      },
    };
  }

  async execute(id: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.commands.get(id);
    if (!handler) {
      throw new Error(`[PluginCommandRegistry] Command "${id}" not found`);
    }
    return handler(...args);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  getAll(): string[] {
    return Array.from(this.commands.keys());
  }
}

/** Singleton shared across the editor shell. */
export const globalCommandRegistry = new PluginCommandRegistry();
