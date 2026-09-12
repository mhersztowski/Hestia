import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'drive-backend', globals: true, include: ['src/**/*.test.ts'] },
});
