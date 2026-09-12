import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // React, MUI and Emotion stay on the host's side — a second instance of React
  // breaks hooks. `three` is an optional peer: only two stages reach for it,
  // and both `import('three')` at run time, so a page with no 3D block does not
  // have to install a renderer.
  external: [
    'react', 'react-dom', 'react/jsx-runtime',
    '@mui/material', /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react', '@emotion/styled',
    'three', /^three\/(.*)$/,
    '@hestia/core-sci',
  ],
  treeshake: true,
});
