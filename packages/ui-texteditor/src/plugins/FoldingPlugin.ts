import { defineEditorPlugin } from '../monaco';
import * as monaco from 'monaco-editor';

// Languages with meaningful fold ranges in Monaco
const FOLD_LANGUAGES = new Set([
  'json', 'python', 'typescript', 'javascript',
  'typescriptreact', 'javascriptreact', 'cpp', 'c',
  'html', 'css', 'yaml', 'xml',
]);

// Languages that support line/block comments
const COMMENT_LANGUAGES = new Set([
  'python', 'typescript', 'javascript',
  'typescriptreact', 'javascriptreact', 'cpp', 'c',
  'html', 'css', 'yaml', 'xml', 'rust', 'go', 'java',
  'csharp', 'shell', 'dockerfile',
]);

function getActiveEditor(): monaco.editor.ICodeEditor | undefined {
  const editors = monaco.editor.getEditors();
  return editors.find(e => e.hasTextFocus()) ?? editors[0];
}

function runAction(actionId: string) {
  const editor = getActiveEditor();
  if (!editor) return;
  editor.focus();
  editor.getAction(actionId)?.run();
}

// Fold All: arrows from outer lines pointing toward center (compress)
const FOLD_ALL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M1 2.5h14M1 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M8 4.5v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M5.5 6l2.5 2 2.5-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 11.5v-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M5.5 10l2.5-2 2.5 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Unfold All: arrows from center pointing away (expand)
const UNFOLD_ALL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M1 2.5h14M1 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M8 7.5v-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M5.5 6l2.5-2.5 2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 8.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M5.5 10l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Toggle Line Comment: // with a line
const LINE_COMMENT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M2 5v6M4 5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M7 8h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M7 5h5M7 11h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-opacity="0.5"/>
</svg>`;

// Toggle Block Comment: /* */
const BLOCK_COMMENT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M1 8l3-3.5M1 8l3 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 8l-3-3.5M15 8l-3 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
</svg>`;

export const FoldingPlugin = defineEditorPlugin(
  {
    id: 'builtin.folding',
    name: 'Folding',
    version: '1.0.0',
    description: 'Fold and unfold code blocks (JSON, Python, JS/TS)',
    contributes: ['toolbar', 'commandpalette'],
  },

  (api) => {
    api.commands.register('foldAll', () => runAction('editor.foldAll'));
    api.commands.register('unfoldAll', () => runAction('editor.unfoldAll'));
    api.commands.register('fold', () => runAction('editor.fold'));
    api.commands.register('unfold', () => runAction('editor.unfold'));
    api.commands.register('foldRecursively', () => runAction('editor.foldRecursively'));
    api.commands.register('unfoldRecursively', () => runAction('editor.unfoldRecursively'));
    api.commands.register('toggleLineComment', () => runAction('editor.action.commentLine'));
    api.commands.register('toggleBlockComment', () => runAction('editor.action.blockComment'));

    type ToolbarDisposable = ReturnType<typeof api.ui.toolbar.register> | null;

    // Fold toolbar
    let foldToolbarDisposable: ToolbarDisposable = null;
    let unfoldToolbarDisposable: ToolbarDisposable = null;

    // Comment toolbar
    let lineCommentDisposable: ToolbarDisposable = null;
    let blockCommentDisposable: ToolbarDisposable = null;

    function updateToolbar(languageId: string | undefined) {
      foldToolbarDisposable?.dispose();
      unfoldToolbarDisposable?.dispose();
      foldToolbarDisposable = null;
      unfoldToolbarDisposable = null;

      lineCommentDisposable?.dispose();
      blockCommentDisposable?.dispose();
      lineCommentDisposable = null;
      blockCommentDisposable = null;

      if (!languageId) return;

      if (FOLD_LANGUAGES.has(languageId)) {
        foldToolbarDisposable = api.ui.toolbar.register({
          id: 'builtin.folding.fold-all',
          label: 'Fold All',
          icon: FOLD_ALL_ICON,
          command: `${api.pluginId}:foldAll`,
          group: 'right',
          order: 150,
        });
        unfoldToolbarDisposable = api.ui.toolbar.register({
          id: 'builtin.folding.unfold-all',
          label: 'Unfold All',
          icon: UNFOLD_ALL_ICON,
          command: `${api.pluginId}:unfoldAll`,
          group: 'right',
          order: 151,
        });
      }

      if (COMMENT_LANGUAGES.has(languageId)) {
        lineCommentDisposable = api.ui.toolbar.register({
          id: 'builtin.folding.line-comment',
          label: 'Toggle Line Comment',
          icon: LINE_COMMENT_ICON,
          command: `${api.pluginId}:toggleLineComment`,
          group: 'right',
          order: 152,
        });
        blockCommentDisposable = api.ui.toolbar.register({
          id: 'builtin.folding.block-comment',
          label: 'Toggle Block Comment',
          icon: BLOCK_COMMENT_ICON,
          command: `${api.pluginId}:toggleBlockComment`,
          group: 'right',
          order: 153,
        });
      }
    }

    // Initial state: check current model language
    const currentEditor = getActiveEditor();
    updateToolbar(currentEditor?.getModel()?.getLanguageId());

    // Update on model change (file tab switch or language change)
    api.editor.onDidChangeModel(() => {
      updateToolbar(getActiveEditor()?.getModel()?.getLanguageId());
    });

    // Command palette — always available
    api.ui.commandpalette.register({
      command: `${api.pluginId}:foldAll`,
      title: 'Fold All',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:unfoldAll`,
      title: 'Unfold All',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:fold`,
      title: 'Fold Block at Cursor',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:unfold`,
      title: 'Unfold Block at Cursor',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:foldRecursively`,
      title: 'Fold Block Recursively',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:unfoldRecursively`,
      title: 'Unfold Block Recursively',
      category: 'View',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:toggleLineComment`,
      title: 'Toggle Line Comment',
      category: 'Edit',
    });
    api.ui.commandpalette.register({
      command: `${api.pluginId}:toggleBlockComment`,
      title: 'Toggle Block Comment',
      category: 'Edit',
    });

    api.logger.info('Folding plugin activated');
  },

  () => {},
);
