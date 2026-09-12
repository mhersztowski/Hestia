import type { Disposable, SerializableEditorState, EditorId } from '../utils/types';
import { DisposableStore } from '../utils/disposable';
import { EventEmitter } from '../core/EventEmitter';
import { debounce } from '../utils/debounce';

export interface EditorStateSnapshot {
  readonly editorId: EditorId;
  readonly state: SerializableEditorState;
  readonly timestamp: number;
}

export interface StateManagerEvents {
  stateChanged: EditorStateSnapshot;
  stateSaved: EditorStateSnapshot;
  stateRestored: EditorStateSnapshot;
}

export interface StateStorage {
  save(key: string, state: SerializableEditorState): Promise<void>;
  load(key: string): Promise<SerializableEditorState | null>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * Manages editor state persistence and restoration
 */
export class EditorStateManager implements Disposable {
  private readonly states = new Map<EditorId, SerializableEditorState>();
  private readonly events = new EventEmitter<StateManagerEvents>();
  private readonly disposables = new DisposableStore();
  private storage: StateStorage | null = null;
  private readonly autosaveDebounceMs = 1000;

  /**
   * Sets the storage backend for persistence
   */
  setStorage(storage: StateStorage): void {
    this.storage = storage;
  }

  /**
   * Saves editor state to memory and optionally to storage
   */
  async saveState(
    editorId: EditorId,
    state: SerializableEditorState,
    persist = false
  ): Promise<void> {
    this.states.set(editorId, state);

    const snapshot: EditorStateSnapshot = {
      editorId,
      state,
      timestamp: Date.now(),
    };

    this.events.emit('stateChanged', snapshot);

    if (persist && this.storage) {
      await this.storage.save(editorId, state);
      this.events.emit('stateSaved', snapshot);
    }
  }

  /**
   * Gets the current state for an editor
   */
  getState(editorId: EditorId): SerializableEditorState | undefined {
    return this.states.get(editorId);
  }

  /**
   * Loads state from storage
   */
  async loadState(editorId: EditorId): Promise<SerializableEditorState | null> {
    if (!this.storage) {
      return this.states.get(editorId) ?? null;
    }

    const state = await this.storage.load(editorId);
    if (state) {
      this.states.set(editorId, state);
      this.events.emit('stateRestored', {
        editorId,
        state,
        timestamp: Date.now(),
      });
    }

    return state;
  }

  /**
   * Removes state for an editor
   */
  async removeState(editorId: EditorId): Promise<void> {
    this.states.delete(editorId);

    if (this.storage) {
      await this.storage.remove(editorId);
    }
  }

  /**
   * Creates a debounced autosave function
   */
  createAutosave(
    editorId: EditorId,
    getState: () => SerializableEditorState
  ): Disposable {
    const debouncedSave = debounce(() => {
      const state = getState();
      this.saveState(editorId, state, true);
    }, this.autosaveDebounceMs);

    return {
      dispose: () => {
        debouncedSave.cancel();
      },
    };
  }

  /**
   * Subscribe to state events
   */
  on<K extends keyof StateManagerEvents>(
    event: K,
    listener: (data: StateManagerEvents[K]) => void
  ): Disposable {
    return this.events.on(event, listener);
  }

  /**
   * Lists all editor IDs with saved state
   */
  async listSavedEditors(): Promise<EditorId[]> {
    if (this.storage) {
      return (await this.storage.list()) as EditorId[];
    }
    return Array.from(this.states.keys());
  }

  /**
   * Clears all in-memory state
   */
  clearMemoryState(): void {
    this.states.clear();
  }

  dispose(): void {
    this.states.clear();
    this.events.dispose();
    this.disposables.dispose();
  }
}

/**
 * LocalStorage-based state storage implementation
 */
export class LocalStorageStateStorage implements StateStorage {
  private readonly prefix: string;

  constructor(prefix = 'monaco-editor-state:') {
    this.prefix = prefix;
  }

  async save(key: string, state: SerializableEditorState): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save state to localStorage:', error);
    }
  }

  async load(key: string): Promise<SerializableEditorState | null> {
    try {
      const data = localStorage.getItem(this.prefix + key);
      return data ? (JSON.parse(data) as SerializableEditorState) : null;
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }

  async list(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }
}
