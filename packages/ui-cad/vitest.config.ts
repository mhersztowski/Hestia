import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ui-cad',
    globals: true,
    // The pen hook and the notes page touch the DOM — without jsdom there is nothing to test.
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
