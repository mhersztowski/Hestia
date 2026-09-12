import * as monaco from 'monaco-editor';
import { definePlugin } from '../PluginSystem';
import type { PluginContext } from '../PluginSystem';
import type { Disposable } from '../../utils/types';

/**
 * Plugin that highlights the current line
 */
export const HighlightLinePlugin = definePlugin(
  {
    id: 'highlight-line',
    name: 'Highlight Current Line',
    version: '1.0.0',
    description: 'Highlights the line where the cursor is located',
  },
  (context: PluginContext) => {
    const disposables: Disposable[] = [];
    let decorationIds: string[] = [];

    const monacoEditor = context.editor.getMonacoEditor();

    const updateHighlight = () => {
      const position = monacoEditor.getPosition();
      if (!position) return;

      const model = monacoEditor.getModel();
      if (!model) return;

      decorationIds = model.deltaDecorations(decorationIds, [
        {
          range: new monaco.Range(
            position.lineNumber,
            1,
            position.lineNumber,
            1
          ),
          options: {
            isWholeLine: true,
            className: 'current-line-highlight',
            overviewRuler: {
              color: 'rgba(255, 255, 0, 0.3)',
              position: monaco.editor.OverviewRulerLane.Full,
            },
          },
        },
      ]);
    };

    // Add CSS for highlight
    const style = document.createElement('style');
    style.textContent = `
      .current-line-highlight {
        background-color: rgba(255, 255, 0, 0.1);
      }
    `;
    document.head.appendChild(style);

    // Update on cursor change
    const subscription = context.editor.on(
      'cursorPositionChanged',
      updateHighlight
    );
    disposables.push(subscription);
    disposables.push({ dispose: () => style.remove() });
    disposables.push({
      dispose: () => {
        const model = monacoEditor.getModel();
        if (model) {
          model.deltaDecorations(decorationIds, []);
        }
      },
    });

    // Initial highlight
    updateHighlight();

    (HighlightLinePlugin as { cleanup?: () => void }).cleanup = () => {
      disposables.forEach((d) => d.dispose());
    };
  },
  () => {
    (HighlightLinePlugin as { cleanup?: () => void }).cleanup?.();
    console.log('Highlight Line plugin deactivated');
  }
);
