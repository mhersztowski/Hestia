import { defineConfig } from 'vitest/config';

/**
 * The root aggregates the packages' suites — each package has a configuration
 * of its own with its own name, so the results show where a test came from.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'app/*', 'app/web/*'],
  },
});
