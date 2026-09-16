/**
 * Starting Hestia's platform server.
 *
 * One process gives the other applications three things: files (VFS), an MQTT
 * broker and authentication. The domain applications (`app/iot`,
 * `app/finances`) have no accounts and no file store of their own — they ask
 * here.
 */

import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { FileSystem, JsonStore, JwtService, MqttServer } from '@hestia/node-core';
import { HestiaPlatformServer } from './HestiaPlatformServer';
import { UserDatabase, createFirstAccount } from './users';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: path.join(APP_DIR, '.env') });

const PORT = Number(process.env.HESTIA_PLATFORM_PORT ?? 4990);
const DATA_DIR = path.resolve(APP_DIR, process.env.HESTIA_PLATFORM_DATA_DIR ?? 'data');

async function main(): Promise<void> {
  const fileSystem = new FileSystem(path.join(DATA_DIR, 'files'));
  const users = new JsonStore(path.join(DATA_DIR, 'users.json'), UserDatabase, () => ({
    users: [],
  }));

  // No secret in the configuration means a random secret for the lifetime of
  // the process: tokens stop working after a restart, but there is never a
  // default secret known to everyone who has seen this repository.
  const secret = process.env.HESTIA_JWT_SECRET?.trim();
  if (!secret) {
    console.warn('[hestia] no HESTIA_JWT_SECRET — tokens will stop working after a restart');
  }
  const jwt = new JwtService(secret || randomBytes(32).toString('hex'));

  const created = await createFirstAccount(
    users,
    process.env.HESTIA_ADMIN_USER ?? 'admin',
    process.env.HESTIA_ADMIN_PASSWORD ?? 'admin'
  );
  if (created) console.log(`[hestia] created the first account: ${created.userName}`);

  const server = new HestiaPlatformServer({
    port: PORT,
    fileSystem,
    // Where those files actually live — source control needs a real path.
    filesRoot: path.join(DATA_DIR, 'files'),
    users,
    jwt,
    staticDir: path.join(APP_DIR, 'public'),
  });

  // The broker joins THE SAME HTTP server (the `/mqtt` WebSocket), so the
  // applications have one address and one port for everything.
  const mqtt = new MqttServer(fileSystem, server.httpServer);
  mqtt.setAuthenticate((_clientId, userName, password) => {
    // Empty credentials mean an anonymous client (the browser before
    // signing in) — we let it through, because without that the sign-in
    // page has no way to connect, and the broker hands out nothing anyway
    // until it subscribes to the user's topic.
    if (!userName && !password) return true;
    return jwt.verify(password) !== null;
  });
  await mqtt.start();

  await server.start();
  console.log(`[hestia] platform: http://localhost:${PORT}`);
  console.log(`[hestia] MQTT (WebSocket): ws://localhost:${PORT}/mqtt`);
  console.log(`[hestia] data: ${DATA_DIR}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n[hestia] ${signal} — shutting down`);
      void mqtt.stop().then(() => process.exit(0));
    });
  }
}

main().catch((e) => {
  console.error('[hestia] failed to start:', e);
  process.exit(1);
});
