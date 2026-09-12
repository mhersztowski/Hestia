import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'cad-backend', globals: true, include: ['src/**/*.test.ts'] },
});
