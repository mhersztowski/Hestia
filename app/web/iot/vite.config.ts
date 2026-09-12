import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { config } from 'dotenv';

// Ports from the IoT application's `.env` — one source of truth for the server
// and the browser.
config({ path: resolve(__dirname, '../../iot/.env') });

const PORT_IOT = Number(process.env.IOT_PORT ?? 4992);
const PORT_WEBA = Number(process.env.IOT_WEB_PORT ?? 4993);
const PLATFORMA = process.env.HESTIA_PLATFORM_URL ?? 'http://localhost:4990';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  server: {
    host: true,
    port: PORT_WEBA,
    proxy: {
      // Two targets, because the page talks to two applications: its own API
      // goes to `app/iot`, while accounts, files and the broker go to the
      // platform (`app/backend`). Once built there is no proxy — `/api` is
      // served by the IoT server, and the page takes the platform's address
      // from `/api/health`.
      '/api': { target: `http://localhost:${PORT_IOT}`, changeOrigin: true },
      '/platform': {
        target: PLATFORMA,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/platform/, ''),
      },
      '/mqtt': { target: PLATFORMA, changeOrigin: true, ws: true },
    },
  },
  build: {
    // The build lands in the IoT server, which serves it as the static frontend.
    outDir: '../../iot/public',
    emptyOutDir: true,
  },
});
