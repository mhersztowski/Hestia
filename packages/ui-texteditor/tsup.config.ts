import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  // Everything with an identity of its own stays on the host's side: React and
  // MUI because a second instance breaks hooks, and `monaco-editor` because two
  // copies register two sets of languages and workers and fight over them.
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@mui/material',
    /^@mui\/material\/.*/,
    /^@mui\/icons-material(\/.*)?$/,
    /^@mui\/x-tree-view(\/.*)?$/,
    '@emotion/react',
    '@emotion/styled',
    'monaco-editor',
    /^monaco-editor\/.*/,
    /^@xterm\/.*/,
    '@hestia/core',
  ],
  treeshake: true,
});
