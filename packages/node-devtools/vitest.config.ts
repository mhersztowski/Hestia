import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'node-devtools', globals: true, include: ['src/**/*.test.ts'] },
});
