import type * as monaco from 'monaco-editor';

/**
 * Branded type for Monaco editor instance ID
 */
export type EditorId = string & { readonly __brand: 'EditorId' };

/**
 * Branded type for document URI
 */
export type DocumentUri = string & { readonly __brand: 'DocumentUri' };

/**
 * Creates an EditorId from a string
 */
export function createEditorId(id: string): EditorId {
  return id as EditorId;
}

/**
 * Creates a DocumentUri from a string
 */
export function createDocumentUri(uri: string): DocumentUri {
  return uri as DocumentUri;
}

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Combines multiple disposables into one
 */
export function combineDisposables(...disposables: Disposable[]): Disposable {
  return {
    dispose(): void {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

/**
 * Editor configuration options
 */
export interface EditorOptions {
  readonly language?: string;
  readonly theme?: string;
  readonly readOnly?: boolean;
  readonly lineNumbers?: monaco.editor.LineNumbersType;
  readonly minimap?: monaco.editor.IEditorMinimapOptions;
  readonly wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  readonly fontSize?: number;
  readonly tabSize?: number;
  readonly insertSpaces?: boolean;
}

/**
 * Editor state that can be serialized
 */
export interface SerializableEditorState {
  readonly content: string;
  readonly language: string;
  readonly cursorPosition: {
    readonly lineNumber: number;
    readonly column: number;
  };
  readonly scrollPosition: {
    readonly scrollTop: number;
    readonly scrollLeft: number;
  };
  readonly selections: ReadonlyArray<{
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
  }>;
}

/**
 * Event types for the editor
 */
export type EditorEventType =
  | 'contentChanged'
  | 'cursorPositionChanged'
  | 'selectionChanged'
  | 'modelChanged'
  | 'focusChanged'
  | 'disposed';

/**
 * Event listener function type
 */
export type EventListener<T> = (data: T) => void;

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Creates a success result
 */
export function success<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Creates a failure result
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}
