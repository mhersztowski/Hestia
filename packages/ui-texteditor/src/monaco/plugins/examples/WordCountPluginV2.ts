import { defineEditorPlugin } from '../PluginRegistry';

/**
 * Word Count plugin — demonstrates the full Plugin API (v2).
 *
 * Contribution points used:
 *  - statusbar  : live word/char count in the bottom bar
 *  - commandpalette : "Word Count: Show Summary" command
 */
export const WordCountPluginV2 = defineEditorPlugin(
  {
    id: 'builtin.word-count',
    name: 'Word Count',
    version: '2.0.0',
    description: 'Shows live word and character count in the status bar',
    contributes: ['statusbar', 'commandpalette'],
  },

  (api) => {
    // ── State ────────────────────────────────────────────────────────────────
    let wordCount = 0;
    let charCount = 0;

    // ── StatusBar item ────────────────────────────────────────────────────────
    const statusItem = api.ui.statusbar.register({
      id: 'builtin.word-count.status',
      text: 'W: — C: —',
      tooltip: 'Word count (click for summary)',
      alignment: 'right',
      priority: 50,
      command: 'summary',
    });

    // ── Commands ──────────────────────────────────────────────────────────────
    api.commands.register('summary', () => {
      api.logger.info(`Summary: ${wordCount} words, ${charCount} chars`);
      // In a real plugin you'd open a notification or modal here
    });

    // ── Command palette entry ─────────────────────────────────────────────────
    api.ui.commandpalette.register({
      command: `${api.pluginId}:summary`,
      title: 'Show Word Count Summary',
      category: 'Word Count',
    });

    // ── Live updates on every keystroke ──────────────────────────────────────
    function updateCounts(text: string) {
      charCount = text.length;
      wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
      statusItem.update({
        text: `W: ${wordCount}  C: ${charCount}`,
        tooltip: `${wordCount} words, ${charCount} characters`,
      });
    }

    api.editor.onDidChangeContent((text) => {
      updateCounts(text);
    });

    api.logger.info('Word Count plugin (v2) activated');
  },

  () => {
    // All disposables (statusItem, commands, subscriptions) are automatically
    // cleaned up by the PluginRegistry via api._disposeAll().
  },
);
