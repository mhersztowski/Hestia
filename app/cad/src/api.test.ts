import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpServer } from '@hestia/node-core';
import { PlatformClient } from './platform';
import { registerApi, registerForwarding } from './api';

/**
 * Tested over HTTP against a stub **platform**, because what is worth checking
 * here is exactly the boundary between the two: that the caller's token travels
 * on unchanged, that the platform's refusals arrive as refusals rather than as
 * this server's own errors, and that a platform which is down leaves the page
 * saying so instead of failing to load.
 */
describe('CAD API', () => {
    let server: HttpServer;
    let port: number;
    let platformServer: HttpServer;
    let platformUp: boolean;
    let lastToken: string | null;
    let files: Map<string, string>;

    beforeEach(async () => {
        platformUp = true;
        lastToken = null;
        files = new Map();

        platformServer = new HttpServer({ port: 0, host: '127.0.0.1' });
        platformServer.get('/api/platform/info', (ctx) => {
            if (!platformUp) { ctx.res.writeHead(503, { 'Content-Type': 'application/json' }); ctx.res.end('{}'); return; }
            return { name: 'stub', mqtt: '/mqtt', capabilities: ['files', 'auth'] };
        });
        platformServer.get('/api/auth/me', (ctx) => {
            lastToken = (ctx.req.headers.authorization ?? '').replace('Bearer ', '');
            if (lastToken !== 'good') { ctx.res.writeHead(401, { 'Content-Type': 'application/json' }); ctx.res.end('{"error":"bad token"}'); return; }
            return { user: { userId: 'u1', userName: 'admin', isAdmin: true, roles: [] } };
        });
        platformServer.get('/api/vfs/readFile', (ctx) => {
            const p = ctx.query.get('path') ?? '';
            if (!files.has(p)) { ctx.res.writeHead(404, { 'Content-Type': 'application/json' }); ctx.res.end('{"error":"missing"}'); return; }
            return { path: p, content: files.get(p) };
        });
        platformServer.post('/api/vfs/writeFile', (ctx) => {
            const { path, content } = ctx.body as { path: string; content: string };
            files.set(path, content);
            return { ok: true };
        });
        const platformPort = await platformServer.start();

        server = new HttpServer({ port: 0, host: '127.0.0.1' });
        const platform = new PlatformClient({ url: `http://127.0.0.1:${platformPort}` });
        registerApi(server, platform);
        registerForwarding(server, `http://127.0.0.1:${platformPort}`);
        port = await server.start();
    });

    afterEach(async () => { await server.stop(); await platformServer.stop(); });

    const ask = async (path: string, init: RequestInit & { token?: string } = {}) => {
        const { token, ...rest } = init;
        const r = await fetch(`http://127.0.0.1:${port}${path}`, {
            ...rest,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
            },
        });
        return { status: r.status, body: await r.json() as Record<string, unknown> };
    };

    it('health says whether the platform responds', async () => {
        const up = await ask('/api/health');
        expect(up.body.platform).toMatchObject({ available: true, name: 'stub' });

        platformUp = false;
        const down = await ask('/api/health');
        // Still 200: this server is up, and it is the page that has to decide
        // what to do about a platform that is not.
        expect(down.status).toBe(200);
        expect(down.body.platform).toEqual({ available: false });
    });

    it('identity is checked by the platform, not by this application', async () => {
        expect((await ask('/api/me')).status).toBe(401);            // no token at all
        expect((await ask('/api/me', { token: 'forged' })).status).toBe(401);
        expect(lastToken).toBe('forged');                            // the token went to the platform

        const ok = await ask('/api/me', { token: 'good' });
        expect(ok.body.user).toMatchObject({ userName: 'admin' });
    });

    it('forwards files to the platform with the caller\'s own token', async () => {
        const written = await ask('/platform/api/vfs/writeFile', {
            method: 'POST', token: 'good',
            body: JSON.stringify({ path: 'cad/drawings/a.json', content: '{"entities":[]}' }),
        });
        expect(written.status).toBe(200);
        expect(files.get('cad/drawings/a.json')).toBe('{"entities":[]}');

        const read = await ask('/platform/api/vfs/readFile?path=cad%2Fdrawings%2Fa.json', { token: 'good' });
        expect(read.body.content).toBe('{"entities":[]}');
    });

    it('passes the platform\'s status through instead of replacing it', async () => {
        // A file that does not exist is a 404 from the platform, and stays a 404
        // here: the page tells "nothing saved yet" from "the server is broken"
        // by the status alone.
        const missing = await ask('/platform/api/vfs/readFile?path=nothing.json', { token: 'good' });
        expect(missing.status).toBe(404);

        const unauthorised = await ask('/platform/api/auth/me', { token: 'forged' });
        expect(unauthorised.status).toBe(401);
    });
});
