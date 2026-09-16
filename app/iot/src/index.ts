/**
 * The IoT application's server.
 *
 * It exposes its own API under `/api/*` and serves the built frontend from
 * `public/` (that is, `app/web/iot`). Files, accounts and the MQTT broker come
 * from the platform (`app/backend`) — see `platform.ts`.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { HttpServer } from '@hestia/node-core';
import { PlatformClient } from './platform';
import { registerApi, registerForwarding } from './api';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: path.join(APP_DIR, '.env') });

const PORT = Number(process.env.IOT_PORT ?? 4992);
const PLATFORM_URL = process.env.HESTIA_PLATFORM_URL ?? 'http://localhost:4990';

async function main(): Promise<void> {
  const platform = new PlatformClient({ url: PLATFORM_URL });
  const server = new HttpServer({ port: PORT, publicDir: path.join(APP_DIR, 'public') });
  registerApi(server, platform);
  // The page talks only to this server; accounts and files travel on through it.
  registerForwarding(server, PLATFORM_URL);
  const port = await server.start();

  console.log(`[iot] server running at http://localhost:${port}`);
  console.log(`[iot] platform: ${PLATFORM_URL}`);
  // A missing platform does not block startup — `/api/health` and the page
  // say so. Otherwise the order of starting applications would become part
  // of the contract.
  const info = await platform.info().catch(() => null);
  console.log(
    info
      ? `[iot] platform responding, MQTT: ${info.mqtt}`
      : '[iot] platform not responding (start app/backend)'
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n[iot] ${signal} — shutting down`);
      void server.stop().then(() => process.exit(0));
    });
  }
}

main().catch((e) => {
  console.error('[iot] failed to start:', e);
  process.exit(1);
});
