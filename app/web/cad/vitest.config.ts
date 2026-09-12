import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'cad-web', globals: true, environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
