import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { config } from 'dotenv';

// Ports are read from the Drive server's `.env` — one source of truth, so
// changing a port does not mean touching two configurations.
config({ path: resolve(__dirname, '../../drive/.env') });

const PORT_DRIVE = Number(process.env.DRIVE_PORT ?? 4997);
const PORT_WEB = Number(process.env.DRIVE_WEB_PORT ?? 4998);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // djvu.js reaches for pngjs to export a page as a PNG, which the viewer
      // never asks it to do — see the stub. Without the alias the production
      // build fails to resolve the import, while the dev server is fine.
      'pngjs/browser': resolve(__dirname, './src/stubs/pngjsBrowser.ts'),
    },
    // One copy of each of these in the page. The packages declare them as peers
    // and pnpm's store would otherwise be free to give a package its own —
    // a second React breaks hooks, a second Monaco registers a second set of
    // languages and workers, and the symptom in both cases (a blank panel)
    // does not point at the cause.
    dedupe: [
      'react',
      'react-dom',
      '@mui/material',
      '@emotion/react',
      '@emotion/styled',
      'monaco-editor',
      '@tiptap/core',
      '@tiptap/pm',
      '@tiptap/react',
    ],
  },
  server: {
    host: true,
    port: PORT_WEB,
    proxy: {
      // Two paths, one target: the page talks only to `app/drive`, which
      // answers `/api` itself and forwards `/platform` to `app/backend`. Once
      // built there is no proxy at all — that server serves the page too.
      '/api': { target: `http://localhost:${PORT_DRIVE}`, changeOrigin: true },
      '/platform': { target: `http://localhost:${PORT_DRIVE}`, changeOrigin: true },
    },
  },
  build: {
    // The build lands in the Drive server, which serves it as the static frontend.
    outDir: '../../drive/public',
    emptyOutDir: true,
  },
});
