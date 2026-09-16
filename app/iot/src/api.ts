/**
 * The IoT application's API.
 *
 * Every route requires a token, which the **platform** validates — this
 * application has no accounts of its own and cannot verify the signature; it
 * only passes the token on. That way there is one place where "who is this" is
 * decided, and one place to fix when something about that decision turns out to
 * be wrong.
 */

import { HttpError, type HttpServer } from '@hestia/node-core';
import type { Context } from '@hestia/node-core';
import { PlatformClient, type UserIdentity } from './platform';
import { DeviceRegistry, recordReading, register, withPresence } from './devices';

/** Where in the user's files the registry lives. */
export const REGISTRY_FILE = 'iot/devices.json';

function token(ctx: Context): string {
  const header = ctx.req.headers.authorization ?? '';
  const t = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!t) throw new HttpError(401, 'No token — sign in to the platform');
  return t;
}

async function whoIs(
  platform: PlatformClient,
  ctx: Context
): Promise<{ token: string; who: UserIdentity }> {
  const t = token(ctx);
  const who = await platform.whoIs(t);
  if (!who) throw new HttpError(401, 'Token is invalid — sign in again');
  return { token: t, who };
}

async function loadRegistry(platform: PlatformClient, t: string): Promise<DeviceRegistry> {
  const content = await platform.read(t, REGISTRY_FILE);
  if (!content) return { devices: [] };
  try {
    return DeviceRegistry.parse(JSON.parse(content));
  } catch (e) {
    // A damaged registry is an error, not an empty list: replacing it with
    // an empty one would erase, on the first write, every device that could
    // still be recovered.
    throw new HttpError(500, `Cannot read ${REGISTRY_FILE}: ${(e as Error).message}`);
  }
}

async function saveRegistry(
  platform: PlatformClient,
  t: string,
  registry: DeviceRegistry
): Promise<void> {
  await platform.write(t, REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`);
}

/**
 * Passes `/platform/*` through to the platform.
 *
 * Without it the built page has no way to sign in: in development the Vite
 * proxy splits the traffic, but once built the browser knows only this server.
 * We forward here rather than have the browser call the platform directly,
 * because the platform's address is an address **as seen by the server** —
 * `localhost` in the configuration means the phone itself on a phone, not this
 * machine.
 */
export function registerForwarding(server: HttpServer, platformUrl: string): void {
  server.prefix('/platform', async (ctx) => {
    const target = new URL(ctx.params.rest || '/', platformUrl);
    target.search = ctx.query.toString();

    const response = await fetch(target, {
      method: ctx.req.method,
      headers: {
        ...(ctx.req.headers.authorization ? { Authorization: ctx.req.headers.authorization } : {}),
        ...(ctx.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: ctx.body === undefined ? undefined : JSON.stringify(ctx.body),
    });

    const text = await response.text();
    // The status code must pass through unchanged: a 401 from the platform
    // has to stay a 401, otherwise the page cannot tell a wrong password
    // from an outage.
    ctx.res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    });
    ctx.res.end(text);
  });
}

export function registerApi(server: HttpServer, platform: PlatformClient): void {
  server.get('/api/health', async () => {
    const info = await platform.info().catch(() => null);
    return {
      ok: true,
      // The broker address comes from the platform and is handed to the
      // browser: were the frontend to guess it, changing the platform's
      // port would break the page in a way indistinguishable from a
      // network outage.
      platform: info ? { ...info, available: true } : { available: false },
    };
  });

  server.get('/api/devices', async (ctx) => {
    const { token: t } = await whoIs(platform, ctx);
    return { devices: withPresence(await loadRegistry(platform, t)) };
  });

  server.post('/api/devices', async (ctx) => {
    const { token: t } = await whoIs(platform, ctx);
    const { deviceName, label } = (ctx.body ?? {}) as { deviceName?: string; label?: string };
    if (!deviceName) throw new HttpError(400, 'Provide deviceName');
    const registry = register(await loadRegistry(platform, t), deviceName, label ?? '');
    await saveRegistry(platform, t, registry);
    return { devices: withPresence(registry) };
  });

  server.post('/api/devices/:deviceName/reading', async (ctx) => {
    const { token: t } = await whoIs(platform, ctx);
    const metrics = (ctx.body ?? {}) as Record<string, unknown>;
    const numbers = Object.fromEntries(
      Object.entries(metrics).filter(([, v]) => typeof v === 'number')
    ) as Record<string, number>;
    if (Object.keys(numbers).length === 0)
      throw new HttpError(400, 'A reading must carry at least one numeric value');

    const registry = recordReading(await loadRegistry(platform, t), ctx.params.deviceName, numbers);
    await saveRegistry(platform, t, registry);
    return { devices: withPresence(registry) };
  });

  server.delete('/api/devices/:deviceName', async (ctx) => {
    const { token: t } = await whoIs(platform, ctx);
    const registry = await loadRegistry(platform, t);
    if (!registry.devices.some((d) => d.deviceName === ctx.params.deviceName)) {
      throw new HttpError(404, `There is no device ${ctx.params.deviceName}`);
    }
    const without = {
      devices: registry.devices.filter((d) => d.deviceName !== ctx.params.deviceName),
    };
    await saveRegistry(platform, t, without);
    return { devices: withPresence(without) };
  });
}
