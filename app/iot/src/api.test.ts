import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpServer } from '@hestia/node-core';
import { PlatformClient } from './platform';
import { registerApi, REGISTRY_FILE } from './api';

/**
 * Tested over HTTP, with a stub **platform** (rather than stubs of our own
 * functions): this is the only place where it shows that the application really
 * passes the token on and really keeps the registry in the platform's files
 * rather than its own.
 */
describe('IoT API', () => {
  let server: HttpServer;
  let port: number;
  let platformServer: HttpServer;
  let files: Map<string, string>;
  let lastToken: string | null;

  beforeEach(async () => {
    files = new Map();
    lastToken = null;

    platformServer = new HttpServer({ port: 0, host: '127.0.0.1' });
    platformServer.get('/api/platform/info', () => ({
      name: 'stub',
      mqtt: '/mqtt',
      capabilities: ['files', 'mqtt', 'auth'],
    }));
    platformServer.get('/api/auth/me', (ctx) => {
      lastToken = (ctx.req.headers.authorization ?? '').replace('Bearer ', '');
      if (lastToken !== 'good') {
        ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
        ctx.res.end('{}');
        return;
      }
      return { user: { userId: 'u1', userName: 'admin', isAdmin: true, roles: [] } };
    });
    platformServer.get('/api/vfs/readFile', (ctx) => {
      const p = ctx.query.get('path') ?? '';
      if (!files.has(p)) {
        ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
        ctx.res.end('{"error":"missing"}');
        return;
      }
      return { path: p, content: files.get(p) };
    });
    platformServer.post('/api/vfs/writeFile', (ctx) => {
      const { path, content } = ctx.body as { path: string; content: string };
      files.set(path, content);
      return { ok: true };
    });
    const platformPort = await platformServer.start();

    server = new HttpServer({ port: 0, host: '127.0.0.1' });
    registerApi(server, new PlatformClient({ url: `http://127.0.0.1:${platformPort}` }));
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
    await platformServer.stop();
  });

  const ask = async (path: string, init: RequestInit & { token?: string } = {}) => {
    const { token, ...rest } = init;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...rest,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return { status: r.status, body: (await r.json()) as any };
  };

  it('does not let anyone in without a token', async () => {
    expect((await ask('/api/devices')).status).toBe(401);
  });

  it('a bad token is rejected by the platform, not by this application', async () => {
    const r = await ask('/api/devices', { token: 'forged' });
    expect(r.status).toBe(401);
    expect(lastToken).toBe('forged'); // the token went to the platform
  });

  it('the registry lives in the platform files, not locally', async () => {
    await ask('/api/devices', {
      method: 'POST',
      token: 'good',
      body: JSON.stringify({ deviceName: 'sensor-1', label: 'Living room' }),
    });
    expect([...files.keys()]).toEqual([REGISTRY_FILE]);
    expect(JSON.parse(files.get(REGISTRY_FILE)!).devices[0].deviceName).toBe('sensor-1');
  });

  it('a reading stores metrics and marks the device present', async () => {
    await ask('/api/devices/sensor-1/reading', {
      method: 'POST',
      token: 'good',
      body: JSON.stringify({ temperature: 21.5 }),
    });
    const list = (await ask('/api/devices', { token: 'good' })).body.devices;
    expect(list[0]).toMatchObject({
      deviceName: 'sensor-1',
      online: true,
      metrics: { temperature: 21.5 },
    });
  });

  it('a reading with no numbers is an error, not an empty write', async () => {
    const r = await ask('/api/devices/x/reading', {
      method: 'POST',
      token: 'good',
      body: JSON.stringify({ state: 'ok' }),
    });
    expect(r.status).toBe(400);
  });

  it('deletes a device, and reports a missing one as 404', async () => {
    await ask('/api/devices', {
      method: 'POST',
      token: 'good',
      body: JSON.stringify({ deviceName: 'a' }),
    });
    expect((await ask('/api/devices/a', { method: 'DELETE', token: 'good' })).status).toBe(200);
    expect((await ask('/api/devices/a', { method: 'DELETE', token: 'good' })).status).toBe(404);
  });

  it('a damaged registry is an error, not a silent wipe of the devices', async () => {
    files.set(REGISTRY_FILE, '{ this is not json');
    const r = await ask('/api/devices', { token: 'good' });
    expect(r.status).toBe(500);
    expect(files.get(REGISTRY_FILE)).toBe('{ this is not json'); // file untouched
  });

  it('health says whether the platform responds and where MQTT is', async () => {
    const r = await ask('/api/health');
    expect(r.body.platform).toMatchObject({ available: true, mqtt: '/mqtt' });
  });
});
