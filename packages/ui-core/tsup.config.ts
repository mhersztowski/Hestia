import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // React, MUI and Emotion stay on the host's side — a second instance of React
  // breaks hooks, and the symptom (a blank screen) says nothing about the cause.
  external: [
    'react', 'react-dom', 'react/jsx-runtime',
    '@mui/material', /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react', '@emotion/styled',
  ],
  treeshake: true,
});
