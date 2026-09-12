import { defineConfig } from 'vitest/config';

/**
 * Two projects, as MyCastle had them before the move: the scene graph and the
 * layout solver are pure model and run in node, the viewers need a DOM.
 *
 * The DOM here is not for rendering components — none are rendered. It is for
 * the browser objects the drawing code uses directly: `renderNotes` builds an
 * `Image` per source and caches it, and there is no `Image` in node.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'ui-scene3d',
          globals: true,
          include: ['src/**/*.test.ts'],
          exclude: ['src/cad-viewer/**'],
        },
      },
      {
        test: {
          name: 'ui-scene3d/cad-viewer',
          globals: true,
          environment: 'jsdom',
          include: ['src/cad-viewer/**/*.test.ts'],
        },
      },
    ],
  },
});
