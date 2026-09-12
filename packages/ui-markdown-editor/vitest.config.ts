import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * One jsdom environment for the whole package, as MyCastle had it.
 *
 * This is not the component-rendering exception `sci-blocks` needed — almost
 * nothing here renders. It is that this is browser code through and through:
 * `embedFraming` resolves relative URLs against `window.location`, the block
 * views build DOM nodes, the converters walk an `HTMLElement`. Running those in
 * node does not fail loudly, it fails quietly — `new URL(url, undefined)`
 * throws, the catch returns null, and a host on the blocklist comes back
 * allowed.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui-markdown-editor',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
