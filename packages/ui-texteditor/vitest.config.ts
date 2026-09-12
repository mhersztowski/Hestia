import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // See `src/test/monacoStub.ts`: without it a module that imports monaco
      // cannot be loaded in Node at all — vite fails to resolve the package's
      // entry, and the whole test file disappears rather than failing usefully.
      'monaco-editor': path.resolve(__dirname, 'src/test/monacoStub.ts'),
    },
  },
  test: {
    // The plugins' analysis (type extraction, UML sources, snippets) and the VFS
    // are what is tested; Monaco itself is not mounted. jsdom is still needed —
    // some of that code reads `localStorage` for its settings.
    name: 'ui-texteditor',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
