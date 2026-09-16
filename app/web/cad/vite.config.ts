import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { cpSync, createReadStream, existsSync } from 'node:fs';
import { config } from 'dotenv';

// Ports are read from the CAD server's `.env` — one source of truth, so
// changing a port does not mean touching two configurations.
config({ path: resolve(__dirname, '../../cad/.env') });

const PORT_CAD = Number(process.env.CAD_PORT ?? 4994);
const PORT_WEBA = Number(process.env.CAD_WEB_PORT ?? 4996);

const ICONS_DIR = resolve(__dirname, '../../../packages/ui-cad/icons');

/**
 * Serves the FreeCAD icons that `@hestia/ui-cad` ships with, under
 * `/freecad-icons`.
 *
 * The package cannot bundle them: they come to nearly a megabyte, and a page
 * importing one icon would carry all of them. Nor can it leave them to Vite's
 * `import.meta.glob`, which is a Vite transform and would end up in the built
 * package for somebody else's bundler to choke on. So the files stay files, and
 * whoever serves the page serves them too — in development straight from the
 * package, in the build copied next to the rest.
 */
function freecadIcons(): Plugin {
  return {
    name: 'hestia-freecad-icons',
    configureServer(server) {
      server.middlewares.use('/freecad-icons', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
        // A name, not a path: everything else belongs to somebody else's files.
        if (!/^[\w.-]+\.svg$/.test(name)) {
          next();
          return;
        }
        const file = resolve(ICONS_DIR, name);
        if (!existsSync(file)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      cpSync(ICONS_DIR, resolve(__dirname, '../../cad/public/freecad-icons'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), freecadIcons()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
    // One instance of React, MUI and three for the application and for the CAD
    // packages. A second React breaks hooks, and a second three makes objects
    // built by one foreign to the other — in both cases the symptom (a blank
    // screen, an empty viewport) does not point at the cause.
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled', 'three'],
  },
  server: {
    host: true,
    port: PORT_WEBA,
    proxy: {
      // Two targets, because the page talks to two applications: its own API
      // goes to `app/cad`, while accounts and files go to the platform
      // (`app/backend`). Once built there is no proxy — the CAD server serves
      // the page, answers `/api` and forwards `/platform` itself.
      '/api': { target: `http://localhost:${PORT_CAD}`, changeOrigin: true },
      '/platform': { target: `http://localhost:${PORT_CAD}`, changeOrigin: true },
    },
  },
  // `opencascade.js` imports its kernel as `import wasmUrl from './opencascade.full.wasm'`
  // — it wants the URL, and hands it to Emscripten. Vite treats `.wasm` as a
  // module rather than an asset by default, and the build stops at
  // `[vite:wasm-fallback] "ESM integration proposal for Wasm" is not supported`.
  // Listing it here makes the import resolve to a URL, which is what that code
  // expects. `cad-app` in MyCastle carries the same line for the same reason.
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Pre-bundling rewrites the paths the kernel looks for, and it then fails to
    // start in development.
    exclude: ['opencascade.js'],
  },
  build: {
    // The build lands in the CAD server, which serves it as the static frontend.
    outDir: '../../cad/public',
    emptyOutDir: true,
  },
});
