import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'hestia-backend', globals: true, include: ['src/**/*.test.ts'] },
});
