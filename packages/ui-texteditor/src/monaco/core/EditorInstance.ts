import * as monaco from 'monaco-editor';
import type {
  Disposable,
  EditorId,
  EditorOptions,
  SerializableEditorState,
  DocumentUri,
} from '../utils/types';
import { createEditorId, createDocumentUri } from '../utils/types';
import { DisposableStore } from '../utils/disposable';
import { EventEmitter } from './EventEmitter';

export interface EditorInstanceEvents {
  contentChanged: { content: string; isUndoing: boolean; isRedoing: boolean };
  cursorPositionChanged: { lineNumber: number; column: number };
  selectionChanged: monaco.editor.ICursorSelectionChangedEvent;
  focusChanged: { focused: boolean };
  disposed: void;
}

/**
 * Wrapper around Monaco editor instance providing a clean API
 * and proper resource management
 */
export class EditorInstance implements Disposable {
  private readonly id: EditorId;
  private readonly editor: monaco.editor.IStandaloneCodeEditor;
  private readonly disposables = new DisposableStore();
  private readonly events = new EventEmitter<EditorInstanceEvents>();
  private isDisposed = false;

  private constructor(
    container: HTMLElement,
    options: EditorOptions & monaco.editor.IStandaloneEditorConstructionOptions
  ) {
    const uuid = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + (i === 6 ? ((b & 0x0f) | 0x40).toString(16) : i === 8 ? ((b & 0x3f) | 0x80).toString(16) : b.toString(16).padStart(2, '0')))
          .join('');
    this.id = createEditorId(uuid);

    this.editor = monaco.editor.create(container, {
      automaticLayout: true,
      ...options,
    });

    this.setupEventListeners();
  }

  /**
   * Creates a new editor instance
   */
  static create(
    container: HTMLElement,
    options: EditorOptions & monaco.editor.IStandaloneEditorConstructionOptions = {}
  ): EditorInstance {
    return new EditorInstance(container, options);
  }

  /**
   * Returns the unique identifier for this editor instance
   */
  getId(): EditorId {
    return this.id;
  }

  /**
   * Returns the underlying Monaco editor instance
   * Use sparingly - prefer the wrapped API methods
   */
  getMonacoEditor(): monaco.editor.IStandaloneCodeEditor {
    this.assertNotDisposed();
    return this.editor;
  }

  /**
   * Gets the current model
   */
  getModel(): monaco.editor.ITextModel | null {
    this.assertNotDisposed();
    return this.editor.getModel();
  }

  /**
   * Sets a new model for the editor
   */
  setModel(model: monaco.editor.ITextModel | null): void {
    this.assertNotDisposed();
    this.editor.setModel(model);
  }

  /**
   * Gets the current content of the editor
   */
  getContent(): string {
    this.assertNotDisposed();
    return this.editor.getValue();
  }

  /**
   * Sets the content of the editor
   */
  setContent(content: string): void {
    this.assertNotDisposed();
    this.editor.setValue(content);
  }

  /**
   * Gets the current language ID
   */
  getLanguage(): string | undefined {
    this.assertNotDisposed();
    return this.getModel()?.getLanguageId();
  }

  /**
   * Sets the language for the current model
   */
  setLanguage(languageId: string): void {
    this.assertNotDisposed();
    const model = this.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, languageId);
    }
  }

  /**
   * Gets the document URI
   */
  getDocumentUri(): DocumentUri | undefined {
    this.assertNotDisposed();
    const model = this.getModel();
    return model ? createDocumentUri(model.uri.toString()) : undefined;
  }

  /**
   * Gets the cursor position
   */
  getCursorPosition(): monaco.Position | null {
    this.assertNotDisposed();
    return this.editor.getPosition();
  }

  /**
   * Sets the cursor position
   */
  setCursorPosition(lineNumber: number, column: number): void {
    this.assertNotDisposed();
    this.editor.setPosition({ lineNumber, column });
  }

  /**
   * Gets all current selections
   */
  getSelections(): readonly monaco.Selection[] {
    this.assertNotDisposed();
    return this.editor.getSelections() ?? [];
  }

  /**
   * Sets the selections
   */
  setSelections(selections: monaco.ISelection[]): void {
    this.assertNotDisposed();
    if (selections.length > 0) {
      this.editor.setSelections(selections);
    }
  }

  /**
   * Focus the editor
   */
  focus(): void {
    this.assertNotDisposed();
    this.editor.focus();
  }

  /**
   * Check if the editor has focus
   */
  hasFocus(): boolean {
    this.assertNotDisposed();
    return this.editor.hasTextFocus();
  }

  /**
   * Execute a Monaco command
   */
  executeCommand(commandId: string, ...args: unknown[]): void {
    this.assertNotDisposed();
    this.editor.trigger('EditorInstance', commandId, args);
  }

  /**
   * Gets the current editor state as a serializable object
   */
  getState(): SerializableEditorState {
    this.assertNotDisposed();
    const position = this.getCursorPosition() ?? { lineNumber: 1, column: 1 };
    const scrollTop = this.editor.getScrollTop();
    const scrollLeft = this.editor.getScrollLeft();

    return {
      content: this.getContent(),
      language: this.getLanguage() ?? 'plaintext',
      cursorPosition: {
        lineNumber: position.lineNumber,
        column: position.column,
      },
      scrollPosition: {
        scrollTop,
        scrollLeft,
      },
      selections: this.getSelections().map((s) => ({
        startLineNumber: s.startLineNumber,
        startColumn: s.startColumn,
        endLineNumber: s.endLineNumber,
        endColumn: s.endColumn,
      })),
    };
  }

  /**
   * Restores the editor state from a serializable object
   */
  restoreState(state: SerializableEditorState): void {
    this.assertNotDisposed();
    this.setContent(state.content);
    this.setLanguage(state.language);
    this.setCursorPosition(
      state.cursorPosition.lineNumber,
      state.cursorPosition.column
    );
    this.editor.setScrollPosition({
      scrollTop: state.scrollPosition.scrollTop,
      scrollLeft: state.scrollPosition.scrollLeft,
    });
    if (state.selections.length > 0) {
      this.setSelections(
        state.selections.map((s) => ({
          selectionStartLineNumber: s.startLineNumber,
          selectionStartColumn: s.startColumn,
          positionLineNumber: s.endLineNumber,
          positionColumn: s.endColumn,
        }))
      );
    }
  }

  /**
   * Subscribe to editor events
   */
  on<K extends keyof EditorInstanceEvents>(
    event: K,
    listener: (data: EditorInstanceEvents[K]) => void
  ): Disposable {
    return this.events.on(event, listener);
  }

  /**
   * Update editor options
   */
  updateOptions(
    options: monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions
  ): void {
    this.assertNotDisposed();
    this.editor.updateOptions(options);
  }

  /**
   * Layout the editor (useful after container resize)
   */
  layout(): void {
    this.assertNotDisposed();
    this.editor.layout();
  }

  /**
   * Dispose of the editor and all associated resources
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    this.events.emit('disposed', undefined);
    this.disposables.dispose();
    this.editor.dispose();
    this.events.dispose();
  }

  private setupEventListeners(): void {
    this.disposables.add(
      this.editor.onDidChangeModelContent((e) => {
        this.events.emit('contentChanged', {
          content: this.getContent(),
          isUndoing: e.isUndoing,
          isRedoing: e.isRedoing,
        });
      })
    );

    this.disposables.add(
      this.editor.onDidChangeCursorPosition((e) => {
        this.events.emit('cursorPositionChanged', {
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });
      })
    );

    this.disposables.add(
      this.editor.onDidChangeCursorSelection((e) => {
        this.events.emit('selectionChanged', e);
      })
    );

    this.disposables.add(
      this.editor.onDidFocusEditorText(() => {
        this.events.emit('focusChanged', { focused: true });
      })
    );

    this.disposables.add(
      this.editor.onDidBlurEditorText(() => {
        this.events.emit('focusChanged', { focused: false });
      })
    );
  }

  private assertNotDisposed(): void {
    if (this.isDisposed) {
      throw new Error('EditorInstance has been disposed');
    }
  }
}
