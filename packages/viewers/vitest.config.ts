import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'viewers',
    globals: true,
    // The model is tested; the components are not rendered here.
    include: ['src/**/*.test.ts'],
  },
});
