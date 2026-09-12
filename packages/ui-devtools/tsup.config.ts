import { defineConfig } from 'tsup';

export default defineConfig({
  // One entry per tool, plus the umbrella: a host that wants only diagrams
  // should not carry the codemap editor, and the other way round.
  entry: ['src/index.ts', 'src/diagrams.ts', 'src/codemap.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // React, MUI and Emotion stay on the host's side — a second instance of React
  // breaks hooks. `@xyflow/react` stays external too, including the stylesheet
  // the editors import (`@xyflow/react/dist/style.css`): the host's Vite loads
  // it from `node_modules`. `@hestia/node-devtools/format` is resolved by the
  // host from the workspace, so there is one copy of the format code in a page.
  external: [
    'react', 'react-dom', 'react/jsx-runtime',
    '@mui/material', /^@mui\/icons-material(\/.*)?$/,
    '@emotion/react', '@emotion/styled',
    /^@xyflow\/react(\/.*)?$/,
    /^@hestia\/node-devtools(\/.*)?$/,
  ],
  treeshake: true,
});
