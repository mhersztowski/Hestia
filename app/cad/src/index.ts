/**
 * The CAD application's server.
 *
 * It serves the built frontend from `public/` (that is, `app/web/cad`) and
 * exposes `/api/*` of its own; accounts and files come from the platform
 * (`app/backend`), reached through `/platform/*` — see `api.ts`.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { HttpServer } from '@hestia/node-core';
import { PlatformClient } from './platform';
import { registerApi, registerForwarding } from './api';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: path.join(APP_DIR, '.env') });

const PORT = Number(process.env.CAD_PORT ?? 4994);
const PLATFORM_URL = process.env.HESTIA_PLATFORM_URL ?? 'http://localhost:4990';

async function main(): Promise<void> {
  const platform = new PlatformClient({ url: PLATFORM_URL });
  const server = new HttpServer({ port: PORT, publicDir: path.join(APP_DIR, 'public') });
  registerApi(server, platform);
  // The page talks only to this server; accounts and files travel on through it.
  registerForwarding(server, PLATFORM_URL);
  const port = await server.start();

  console.log(`[cad] server running at http://localhost:${port}`);
  console.log(`[cad] platform: ${PLATFORM_URL}`);
  // A platform that is down does not stop this server: `/api/health` and the
  // page say so. Otherwise the order of starting applications would become
  // part of the contract.
  const info = await platform.info().catch(() => null);
  console.log(
    info ? '[cad] platform responding' : '[cad] platform not responding (start app/backend)'
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n[cad] ${signal} — shutting down`);
      void server.stop().then(() => process.exit(0));
    });
  }
}

main().catch((e) => {
  console.error('[cad] failed to start:', e);
  process.exit(1);
});
