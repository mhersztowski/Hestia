import * as monaco from 'monaco-editor';
import type { Disposable } from '../utils/types';

export interface FormattingOptions {
  readonly tabSize: number;
  readonly insertSpaces: boolean;
  readonly trimAutoWhitespace?: boolean;
  readonly trimTrailingWhitespace?: boolean;
  readonly insertFinalNewline?: boolean;
}

const DEFAULT_FORMATTING_OPTIONS: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  trimAutoWhitespace: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
};

/**
 * Service for handling document formatting
 */
export class FormattingService implements Disposable {
  private options: FormattingOptions = DEFAULT_FORMATTING_OPTIONS;

  /**
   * Updates formatting options
   */
  setOptions(options: Partial<FormattingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Gets current formatting options
   */
  getOptions(): FormattingOptions {
    return { ...this.options };
  }

  /**
   * Formats the entire document
   */
  async formatDocument(
    editor: monaco.editor.ICodeEditor
  ): Promise<boolean> {
    const model = editor.getModel();
    if (!model) {
      return false;
    }

    try {
      await editor.getAction('editor.action.formatDocument')?.run();
      return true;
    } catch (error) {
      console.error('Format document failed:', error);
      return false;
    }
  }

  /**
   * Formats the selected range
   */
  async formatSelection(
    editor: monaco.editor.ICodeEditor
  ): Promise<boolean> {
    const model = editor.getModel();
    const selection = editor.getSelection();

    if (!model || !selection || selection.isEmpty()) {
      return false;
    }

    try {
      await editor.getAction('editor.action.formatSelection')?.run();
      return true;
    } catch (error) {
      console.error('Format selection failed:', error);
      return false;
    }
  }

  /**
   * Applies post-formatting fixes (trailing whitespace, final newline)
   */
  applyPostFormatFixes(model: monaco.editor.ITextModel): monaco.editor.IIdentifiedSingleEditOperation[] {
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
    const lineCount = model.getLineCount();

    if (this.options.trimTrailingWhitespace) {
      for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
        const line = model.getLineContent(lineNumber);
        const trimmedLine = line.trimEnd();

        if (line !== trimmedLine) {
          edits.push({
            range: new monaco.Range(
              lineNumber,
              trimmedLine.length + 1,
              lineNumber,
              line.length + 1
            ),
            text: '',
          });
        }
      }
    }

    if (this.options.insertFinalNewline) {
      const lastLine = model.getLineContent(lineCount);
      if (lastLine.length > 0) {
        edits.push({
          range: new monaco.Range(lineCount, lastLine.length + 1, lineCount, lastLine.length + 1),
          text: model.getEOL(),
        });
      }
    }

    return edits;
  }

  /**
   * Converts tabs to spaces in the model
   */
  convertTabsToSpaces(model: monaco.editor.ITextModel): monaco.editor.IIdentifiedSingleEditOperation[] {
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
    const spaces = ' '.repeat(this.options.tabSize);
    const lineCount = model.getLineCount();

    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const line = model.getLineContent(lineNumber);
      let column = 1;

      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\t') {
          edits.push({
            range: new monaco.Range(lineNumber, column, lineNumber, column + 1),
            text: spaces,
          });
        }
        column++;
      }
    }

    return edits;
  }

  /**
   * Converts spaces to tabs in the model
   */
  convertSpacesToTabs(model: monaco.editor.ITextModel): monaco.editor.IIdentifiedSingleEditOperation[] {
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
    const tabSize = this.options.tabSize;
    const lineCount = model.getLineCount();

    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const line = model.getLineContent(lineNumber);
      const leadingSpaces = line.match(/^( +)/)?.[1] ?? '';
      const tabCount = Math.floor(leadingSpaces.length / tabSize);
      const remainingSpaces = leadingSpaces.length % tabSize;

      if (tabCount > 0) {
        edits.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, leadingSpaces.length + 1),
          text: '\t'.repeat(tabCount) + ' '.repeat(remainingSpaces),
        });
      }
    }

    return edits;
  }

  dispose(): void {
    // Nothing to dispose
  }
}
