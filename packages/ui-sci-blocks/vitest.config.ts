import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * These tests render components, which the repository's rule otherwise forbids.
 * The reason they are the exception: each loads a **real** knowledge document
 * from `documents/` and asserts that its formulas resolve, its references point
 * somewhere and its simulation runs. That is a statement about the document
 * pipeline, not about markup, and there is no other way to make it.
 *
 * The documents live in `documents/` beside `src/` and are read through
 * `testDocuments.ts`, which resolves them against the source file: the working
 * directory is this package only when vitest is started here, and the
 * repository-wide `pnpm test` starts at the root.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui-sci-blocks',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
