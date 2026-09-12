import { definePlugin } from '../PluginSystem';
import type { PluginContext } from '../PluginSystem';
import type { Disposable } from '../../utils/types';

/**
 * Plugin that shows word count in the status bar
 */
export const WordCountPlugin = definePlugin(
  {
    id: 'word-count',
    name: 'Word Count',
    version: '1.0.0',
    description: 'Displays word and character count in the status bar',
  },
  (context: PluginContext) => {
    const disposables: Disposable[] = [];

    // We'll need to access the status bar - for now just log
    const updateCount = () => {
      const content = context.editor.getContent();
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      const chars = content.length;
      console.log(`[Word Count] Words: ${words}, Characters: ${chars}`);
    };

    // Update on content change
    const subscription = context.editor.on('contentChanged', updateCount);
    disposables.push(subscription);

    // Initial count
    updateCount();

    // Store cleanup function
    (WordCountPlugin as { cleanup?: () => void }).cleanup = () => {
      disposables.forEach((d) => d.dispose());
    };
  },
  () => {
    (WordCountPlugin as { cleanup?: () => void }).cleanup?.();
    console.log('Word Count plugin deactivated');
  }
);
