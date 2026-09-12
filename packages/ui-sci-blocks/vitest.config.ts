import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * These tests render components, which the repository's rule otherwise forbids.
 * The reason they are the exception: each loads a **real** knowledge document
 * from `documents/` and asserts that its formulas resolve, its references point
 * somewhere and its simulation runs. That is a statement about the document
 * pipeline, not about markup, and there is no other way to make it.
 *
 * The fixtures are read with paths relative to the working directory, which for
 * vitest is this package's root — hence `documents/` beside `src/`.
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
