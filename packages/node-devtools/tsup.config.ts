import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries: `format` is the browser-safe part (see `src/format.ts`). With
  // splitting on (the default for ESM), what both entries share goes into its
  // own chunk, so `format.js` never pulls in the Node-only code.
  entry: ['src/index.ts', 'src/format.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  target: 'node20',
  // The parsers stay external. `typescript` is several megabytes the host has
  // anyway, and tree-sitter's runtime and grammars are `.wasm` files found with
  // `require.resolve` at run time (see `codemap/parsers/treeSitter.ts`) — they
  // have to stay in `node_modules`, where that lookup expects them.
  external: ['typescript', 'web-tree-sitter', 'tree-sitter-wasms'],
});
