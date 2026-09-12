import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { config } from 'dotenv';

// Ports are read from the backend's `.env` — one source of truth for both
// applications, so changing a port does not mean touching two configurations.
config({ path: resolve(__dirname, '../../finances/.env') });

const PORT_BACKENDU = Number(process.env.HESTIA_BACKEND_PORT ?? 4894);
const PORT_WEBA = Number(process.env.HESTIA_WEB_PORT ?? 4895);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
    // One instance of React and MUI for all workspace packages — a second one
    // breaks hooks, and the symptom (a blank screen) does not point at the cause.
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  server: {
    host: true,
    port: PORT_WEBA,
    // In development the frontend runs separately, so `/api` has to reach the
    // backend. Once built there is no proxy: the backend serves both.
    proxy: { '/api': { target: `http://localhost:${PORT_BACKENDU}`, changeOrigin: true } },
  },
  build: {
    // The build lands in the backend, which serves it as the static frontend.
    outDir: '../../finances/public',
    emptyOutDir: true,
  },
});
