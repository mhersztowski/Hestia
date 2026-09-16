import { defineConfig } from 'tsup';

export default defineConfig({
  // Three entries, one per area. `cad3d` in particular has to stay behind its
  // own import: OpenCascade is a WASM kernel of several megabytes, and a page
  // that wants only notes must not carry it.
  entry: ['src/index.ts', 'src/cad2d.ts', 'src/cad3d.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // React, MUI and Emotion stay on the host's side. Pulling them into the
  // package would give a second instance of React, and the symptom is broken
  // hooks on a page that is itself perfectly correct. `three` likewise: objects
  // built by one copy are foreign to another. `opencascade.js` loads its own
  // WASM at run time and has to stay where that lookup expects it.
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@mui/material',
    /^@mui\/material\/.*/,
    /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react',
    '@emotion/styled',
    /^three(\/.*)?$/,
    'opencascade.js',
    // One copy of the toolbar package, shared with the host's own menus.
    '@hestia/ui-core',
  ],
  treeshake: true,
});
