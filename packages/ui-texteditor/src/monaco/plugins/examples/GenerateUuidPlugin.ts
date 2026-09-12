import { defineEditorPlugin } from '../PluginRegistry';
import * as monaco from 'monaco-editor';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function insertInActiveEditor(text: string): void {
  const editors = monaco.editor.getEditors();
  // Prefer the focused editor; fall back to the first available one
  const editor = editors.find(e => e.hasTextFocus()) ?? editors[0];
  if (!editor) return;

  const selection = editor.getSelection();
  if (!selection) return;

  editor.executeEdits('generate-uuid', [{ range: selection, text, forceMoveMarkers: true }]);
  editor.focus();
}

// Shuffle icon — semantically "generate random"
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';

export const GenerateUuidPlugin = defineEditorPlugin(
  {
    id: 'builtin.generate-uuid',
    name: 'Generate UUID',
    version: '1.0.0',
    description: 'Inserts a newly generated UUID v4 at the cursor position',
    contributes: ['toolbar', 'commandpalette'],
  },

  (api) => {
    api.commands.register('insert', () => {
      insertInActiveEditor(generateUuid());
    });

    api.ui.toolbar.register({
      id: 'builtin.generate-uuid.toolbar',
      label: 'Generate UUID',
      icon: ICON,
      command: `${api.pluginId}:insert`,
      group: 'right',
      order: 200,
    });

    api.ui.commandpalette.register({
      command: `${api.pluginId}:insert`,
      title: 'Insert UUID',
      category: 'Generate',
    });

    api.logger.info('Generate UUID plugin activated');
  },

  () => {},
);
