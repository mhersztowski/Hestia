import { defineConfig } from 'vitest/config';

/**
 * One project, with a DOM for everything.
 *
 * The scene graph and the layout solver are pure model and would run in node;
 * the viewers need browser objects the drawing code uses directly (`renderNotes`
 * builds an `Image` per source and caches it, and node has no `Image`). MyCastle
 * split that into two vitest projects — but a project of a project is not a
 * thing: the repository-wide run declares `packages/*` as its projects, and the
 * nested ones were dropped along with their `globals` and `environment`, so six
 * files failed with `describe is not defined` from the root and passed here.
 * A DOM the model does not use costs a second of startup; a suite that only
 * passes when run from the right directory costs an afternoon.
 */
export default defineConfig({
  test: {
    name: 'ui-scene3d',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
