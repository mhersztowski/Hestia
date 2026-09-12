import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The plugins' analysis (type extraction, UML sources, snippets) and the VFS
  // are what is tested; Monaco itself is not mounted.
  test: { name: 'ui-texteditor', globals: true, include: ['src/**/*.test.ts'] },
});
