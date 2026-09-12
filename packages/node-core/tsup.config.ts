import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  target: 'node20',
  // Runtime dependencies stay external — bundling `aedes` or `ws` into the
  // package would give a second copy of the broker next to the one in
  // `node_modules`.
  external: ['@hestia/core', 'zod', 'aedes', 'ws', 'bcryptjs', 'jsonwebtoken'],
});
