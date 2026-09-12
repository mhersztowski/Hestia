import { defineConfig } from 'vitest/config';

export default defineConfig({
  // No React here and nothing to render — the solvers, the formula graph and
  // the knowledge base are what is tested, in node.
  test: { name: 'core-sci', globals: true, include: ['src/**/*.test.ts'] },
});
