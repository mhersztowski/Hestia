import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries, one per area. The viewers pull in Leaflet and the page shells,
  // and a page that wants only a scene graph must not carry them.
  entry: ['src/index.ts', 'src/cad-viewer/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // Everything with an identity of its own stays on the host's side. React and
  // MUI for the usual reason — a second instance of React breaks hooks, and the
  // symptom (a blank screen) says nothing about the cause. `three` and its
  // React bindings because an object built by one copy of three is foreign to
  // another. Leaflet because it registers itself on the window.
  external: [
    'react', 'react-dom', 'react/jsx-runtime',
    '@mui/material', /^@mui\/material\/.*/, /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react', '@emotion/styled',
    'three', /^three\/(.*)$/,
    '@react-three/fiber', '@react-three/drei',
    'leaflet', 'react-leaflet',
    '@hestia/ui-cad', /^@hestia\/ui-cad\/.*/,
  ],
  treeshake: true,
});
