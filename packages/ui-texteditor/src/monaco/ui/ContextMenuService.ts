import * as monaco from 'monaco-editor';
import type { Disposable } from '../utils/types';
import { DisposableStore } from '../utils/disposable';

export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly keybinding?: number;
  readonly contextMenuGroupId?: string;
  readonly contextMenuOrder?: number;
  readonly precondition?: string;
  run(editor: monaco.editor.ICodeEditor): void | Promise<void>;
}

export interface MenuGroup {
  readonly id: string;
  readonly order: number;
}

/**
 * Service for managing context menu actions
 */
export class ContextMenuService implements Disposable {
  private readonly disposables = new DisposableStore();
  private readonly actions = new Map<string, Disposable>();

  /**
   * Registers a context menu action
   */
  registerAction(action: MenuAction): Disposable {
    // Remove existing action with same ID
    this.unregisterAction(action.id);

    const disposable = monaco.editor.addEditorAction({
      id: action.id,
      label: action.label,
      keybindings: action.keybinding ? [action.keybinding] : undefined,
      contextMenuGroupId: action.contextMenuGroupId ?? 'navigation',
      contextMenuOrder: action.contextMenuOrder ?? 1,
      precondition: action.precondition,
      run: action.run,
    });

    this.actions.set(action.id, disposable);
    this.disposables.add(disposable);

    return {
      dispose: () => {
        this.unregisterAction(action.id);
      },
    };
  }

  /**
   * Registers multiple actions at once
   */
  registerActions(actions: MenuAction[]): Disposable {
    const disposables = actions.map((action) => this.registerAction(action));

    return {
      dispose: () => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      },
    };
  }

  /**
   * Unregisters an action by ID
   */
  unregisterAction(actionId: string): boolean {
    const disposable = this.actions.get(actionId);
    if (disposable) {
      this.disposables.delete(disposable);
      disposable.dispose();
      this.actions.delete(actionId);
      return true;
    }
    return false;
  }

  /**
   * Gets all registered action IDs
   */
  getActionIds(): readonly string[] {
    return Array.from(this.actions.keys());
  }

  dispose(): void {
    this.actions.clear();
    this.disposables.dispose();
  }
}

/**
 * Standard context menu groups
 */
export const MenuGroups = {
  navigation: { id: 'navigation', order: 1 },
  modification: { id: '1_modification', order: 2 },
  cutcopypaste: { id: '9_cutcopypaste', order: 3 },
} as const satisfies Record<string, MenuGroup>;
