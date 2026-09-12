/**
 * The Hestia/Finance application server.
 *
 * It exposes the API under `/api/*` and serves the built frontend from
 * `public/` — exactly the one produced from `app/web/finances`. One process,
 * one port: a household application does not need a separate static server, and
 * every extra part is one more thing to start after a restart.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { HttpServer, JsonStore } from '@hestia/node-core';
import { Data, emptyData } from '@hestia/core';
import { registerApi } from './api';
import { seedData } from './seed';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

loadEnv({ path: path.join(APP_DIR, '.env') });

const PORT = Number(process.env.HESTIA_BACKEND_PORT ?? 4894);
// A relative path resolved from the application directory, not from `cwd`:
// otherwise `pnpm start` from the repository root would look for the store
// somewhere other than `pnpm dev` does.
const DATA_DIR = path.resolve(APP_DIR, process.env.HESTIA_DATA_DIR ?? 'data');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

async function main(): Promise<void> {
    const store = new JsonStore(path.join(DATA_DIR, 'finances.json'), Data, emptyData);

    // Samples only into an empty store — see `seed.ts`.
    const current = await store.read();
    if (current.accounts.length === 0 && current.transactions.length === 0) {
        await store.write(seedData());
        console.log('[hestia] empty store — wrote the sample data');
    }

    const server = new HttpServer({ port: PORT, publicDir: PUBLIC_DIR });
    registerApi(server, store);
    const port = await server.start();

    console.log(`[hestia] server running at http://localhost:${port}`);
    console.log(`[hestia] data: ${DATA_DIR}`);

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            console.log(`\n[hestia] ${signal} — shutting down`);
            void server.stop().then(() => process.exit(0));
        });
    }
}

main().catch((e) => {
    console.error('[hestia] failed to start:', e);
    process.exit(1);
});
