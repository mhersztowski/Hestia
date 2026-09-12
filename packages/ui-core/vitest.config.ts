import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The model is tested; the components are not rendered here. What a toolbar
  // or a drive listing looks like is worth showing, not asserting on.
  test: { name: 'ui-core', globals: true, include: ['src/**/*.test.ts'] },
});
