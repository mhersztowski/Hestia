import * as monaco from 'monaco-editor';
import type { Disposable } from '../utils/types';
import { DisposableStore } from '../utils/disposable';

export interface CommandDescriptor {
  readonly id: string;
  readonly label: string;
  readonly keybinding?: number;
  readonly keybindingContext?: string;
  readonly precondition?: string;
}

export interface CommandHandler {
  (accessor: unknown, ...args: unknown[]): void | Promise<void>;
}

/**
 * Registry for managing editor commands and keybindings
 */
export class CommandRegistry implements Disposable {
  private readonly commands = new Map<
    string,
    { descriptor: CommandDescriptor; handler: CommandHandler }
  >();
  private readonly disposables = new DisposableStore();

  /**
   * Registers a new command
   */
  registerCommand(
    descriptor: CommandDescriptor,
    handler: CommandHandler
  ): Disposable {
    if (this.commands.has(descriptor.id)) {
      console.warn(`Command "${descriptor.id}" is already registered`);
    }

    this.commands.set(descriptor.id, { descriptor, handler });

    // Register with Monaco if keybinding is specified
    let keybindingDisposable: Disposable | undefined;
    if (descriptor.keybinding !== undefined) {
      keybindingDisposable = monaco.editor.addKeybindingRule({
        keybinding: descriptor.keybinding,
        command: descriptor.id,
        when: descriptor.keybindingContext,
      });
    }

    // Register the command action
    const actionDisposable = monaco.editor.addEditorAction({
      id: descriptor.id,
      label: descriptor.label,
      keybindings: descriptor.keybinding ? [descriptor.keybinding] : undefined,
      precondition: descriptor.precondition,
      run: (editor) => {
        const command = this.commands.get(descriptor.id);
        if (command) {
          return command.handler(editor);
        }
      },
    });

    return {
      dispose: () => {
        this.commands.delete(descriptor.id);
        keybindingDisposable?.dispose();
        actionDisposable.dispose();
      },
    };
  }

  /**
   * Executes a command by ID
   */
  executeCommand(
    commandId: string,
    editor: monaco.editor.ICodeEditor,
    ...args: unknown[]
  ): void | Promise<void> {
    const command = this.commands.get(commandId);
    if (command) {
      return command.handler(editor, ...args);
    }
    // Try Monaco's built-in command
    editor.trigger('CommandRegistry', commandId, args);
  }

  /**
   * Gets all registered commands
   */
  getCommands(): readonly CommandDescriptor[] {
    return Array.from(this.commands.values()).map((c) => c.descriptor);
  }

  /**
   * Checks if a command is registered
   */
  hasCommand(commandId: string): boolean {
    return this.commands.has(commandId);
  }

  /**
   * Disposes all registered commands
   */
  dispose(): void {
    this.commands.clear();
    this.disposables.dispose();
  }
}

/**
 * Common keybinding helpers
 */
export const KeyMod = monaco.KeyMod;
export const KeyCode = monaco.KeyCode;

/**
 * Creates a keybinding from modifiers and key
 */
export function createKeybinding(
  modifiers: number,
  key: number
): number {
  return modifiers | key;
}
