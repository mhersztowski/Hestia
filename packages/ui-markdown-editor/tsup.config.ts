import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // Everything with an identity of its own stays on the host's side: React and
  // MUI because a second instance breaks hooks, TipTap because two copies of
  // ProseMirror's schema do not recognise each other's nodes, and the renderers
  // (mermaid, katex, leaflet) because they register themselves globally.
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-router-dom',
    '@mui/material',
    /^@mui\/material\/.*/,
    /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react',
    '@emotion/styled',
    /^@tiptap\/.*/,
    'mermaid',
    'katex',
    'leaflet',
    'react-leaflet',
    /^@hestia\/.*/,
  ],
  treeshake: true,
});
