import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpServer, HttpError } from './HttpServer';

/**
 * The server is really started, on port 0 (the system picks a free one) — a
 * `req`/`res` stub would only check what we ourselves assumed about the `http`
 * module.
 */
describe('HttpServer', () => {
  let server: HttpServer;
  let port: number;
  let publicDir: string;

  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), 'hestia-www-'));
    mkdirSync(join(publicDir, 'assets'));
    writeFileSync(join(publicDir, 'index.html'), '<h1>Hestia</h1>');
    writeFileSync(join(publicDir, 'assets', 'app.js'), 'console.log(1)');
    server = new HttpServer({ port: 0, publicDir, host: '127.0.0.1' });
  });

  afterEach(async () => {
    await server.stop();
    rmSync(publicDir, { recursive: true, force: true });
  });

  const get = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);

  it('returns the handler result as JSON', async () => {
    server.get('/api/echo/:what', ({ params, query }) => ({
      what: params.what,
      howMany: query.get('howMany'),
    }));
    port = await server.start();
    const r = await get('/api/echo/abc?howMany=3');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ what: 'abc', howMany: '3' });
  });

  it('reads a JSON body on POST', async () => {
    server.post('/api/sum', ({ body }) => {
      const { a, b } = body as { a: number; b: number };
      return { sum: a + b };
    });
    port = await server.start();
    const r = await get('/api/sum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 2, b: 3 }),
    });
    expect(await r.json()).toEqual({ sum: 5 });
  });

  it('broken JSON is a 400 with an explanation, not a 500', async () => {
    server.post('/api/something', () => ({ ok: true }));
    port = await server.start();
    const r = await get('/api/something', { method: 'POST', body: '{{{' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/JSON/);
  });

  it('HttpError from a handler sets the response code', async () => {
    server.get('/api/missing', () => {
      throw new HttpError(404, 'No such transaction');
    });
    port = await server.start();
    const r = await get('/api/missing');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe('No such transaction');
  });

  it('an unknown /api/* returns JSON rather than a page', async () => {
    // Otherwise the client gets `<h1>Hestia</h1>` and blows up on
    // "Unexpected token <" instead of seeing that the route does not exist.
    port = await server.start();
    const r = await get('/api/nowhere');
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('serves files from the public directory with the right type', async () => {
    port = await server.start();
    const r = await get('/assets/app.js');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/javascript/);
    expect(await r.text()).toBe('console.log(1)');
  });

  it('an unknown path enters the application rather than an error page', async () => {
    // A refresh on `/transactions` must open the single-page application.
    port = await server.start();
    const r = await get('/transactions/2026-01');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('<h1>Hestia</h1>');
  });

  it('a prefix catches a whole branch of URLs, on any method', async () => {
    // For passing traffic on: the paths below a prefix cannot be listed in
    // advance, and a `:param` pattern would cover only one segment.
    server.prefix('/onwards', ({ params, req }) => ({ rest: params.rest, method: req.method }));
    port = await server.start();
    expect(await (await get('/onwards/a/b/c')).json()).toEqual({ rest: '/a/b/c', method: 'GET' });
    expect(await (await get('/onwards', { method: 'POST', body: '{}' })).json()).toEqual({
      rest: '',
      method: 'POST',
    });
  });

  it('a prefix does not catch a URL that merely starts the same way', async () => {
    // `/onwardsmore` starts with `/onwards`, but it is a different branch.
    server.prefix('/onwards', () => ({ caught: true }));
    port = await server.start();
    const r = await get('/onwardsmore');
    expect(await r.text()).toBe('<h1>Hestia</h1>'); // went to files, not to the prefix
  });

  it('an API route takes precedence over a file at the same path', async () => {
    server.get('/api/data', () => ({ from: 'api' }));
    port = await server.start();
    expect(await (await get('/api/data')).json()).toEqual({ from: 'api' });
  });
});
