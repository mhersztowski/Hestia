import * as monaco from 'monaco-editor';
import type { Disposable } from '../utils/types';

export interface DecorationDefinition {
  readonly id: string;
  readonly range: monaco.IRange;
  readonly options: monaco.editor.IModelDecorationOptions;
}

export interface DecorationCollection {
  readonly id: string;
  set(decorations: DecorationDefinition[]): void;
  clear(): void;
  dispose(): void;
}

/**
 * Manages editor decorations with proper lifecycle handling
 */
export class DecorationManager implements Disposable {
  private readonly collections = new Map<string, DecorationCollectionImpl>();
  private readonly editor: monaco.editor.ICodeEditor;

  constructor(editor: monaco.editor.ICodeEditor) {
    this.editor = editor;
  }

  /**
   * Creates a new decoration collection
   */
  createCollection(collectionId: string): DecorationCollection {
    const existing = this.collections.get(collectionId);
    if (existing) {
      return existing;
    }

    const collection = new DecorationCollectionImpl(this.editor, collectionId);
    this.collections.set(collectionId, collection);

    return collection;
  }

  /**
   * Gets an existing collection
   */
  getCollection(collectionId: string): DecorationCollection | undefined {
    return this.collections.get(collectionId);
  }

  /**
   * Removes and disposes a collection
   */
  removeCollection(collectionId: string): boolean {
    const collection = this.collections.get(collectionId);
    if (collection) {
      collection.dispose();
      this.collections.delete(collectionId);
      return true;
    }
    return false;
  }

  /**
   * Clears all decorations from all collections
   */
  clearAll(): void {
    for (const collection of this.collections.values()) {
      collection.clear();
    }
  }

  dispose(): void {
    for (const collection of this.collections.values()) {
      collection.dispose();
    }
    this.collections.clear();
  }
}

class DecorationCollectionImpl implements DecorationCollection {
  readonly id: string;
  private readonly editor: monaco.editor.ICodeEditor;
  private decorationIds: string[] = [];

  constructor(editor: monaco.editor.ICodeEditor, id: string) {
    this.editor = editor;
    this.id = id;
  }

  set(decorations: DecorationDefinition[]): void {
    const model = this.editor.getModel();
    if (!model) {
      return;
    }

    this.decorationIds = model.deltaDecorations(
      this.decorationIds,
      decorations.map((d) => ({
        range: d.range,
        options: d.options,
      }))
    );
  }

  clear(): void {
    const model = this.editor.getModel();
    if (model) {
      this.decorationIds = model.deltaDecorations(this.decorationIds, []);
    }
  }

  dispose(): void {
    this.clear();
  }
}

/**
 * Pre-defined decoration styles
 */
export const DecorationStyles = {
  highlight: {
    className: 'editor-highlight-decoration',
    inlineClassName: 'editor-highlight-inline',
  },
  error: {
    className: 'editor-error-decoration',
    glyphMarginClassName: 'editor-error-glyph',
    isWholeLine: true,
  },
  warning: {
    className: 'editor-warning-decoration',
    glyphMarginClassName: 'editor-warning-glyph',
    isWholeLine: true,
  },
  info: {
    className: 'editor-info-decoration',
    inlineClassName: 'editor-info-inline',
  },
  lineHighlight: {
    isWholeLine: true,
    className: 'editor-line-highlight',
  },
} as const satisfies Record<string, monaco.editor.IModelDecorationOptions>;
