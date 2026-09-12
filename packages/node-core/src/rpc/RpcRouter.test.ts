import { describe, it, expect } from 'vitest';
import { RpcRouter, type RpcContext } from './RpcRouter';

describe('RpcRouter', () => {
  it('registers a handler and exposes it via getRegisteredMethods', () => {
    const router = new RpcRouter();
    router.register('ping', async (input) => ({
      pong: true as const,
      echo: input.echo,
      timestamp: 123,
      version: '1.0.0',
    }));

    const methods = router.getRegisteredMethods();
    expect(methods.map((m) => m.name)).toContain('ping');
    const ping = methods.find((m) => m.name === 'ping');
    expect(ping?.def).toBeDefined();
  });

  it('dispatches to a registered handler with validated input', async () => {
    const router = new RpcRouter();
    router.register('ping', async (input) => ({
      pong: true as const,
      echo: input.echo,
      timestamp: 42,
      version: '9.9.9',
    }));

    const res = await router.dispatch('ping', { echo: 'hi' }, {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      result: { pong: true, echo: 'hi', timestamp: 42, version: '9.9.9' },
    });
  });

  it('passes the RpcContext (user) through to the handler', async () => {
    const router = new RpcRouter();
    let seen: RpcContext | null = null;
    router.register('ping', async (_input, ctx) => {
      seen = ctx;
      return { pong: true as const, timestamp: 1, version: '1' };
    });

    const ctx: RpcContext = {
      user: { userId: 'u1', userName: 'marcin', isAdmin: true, roles: [] },
    };
    await router.dispatch('ping', {}, ctx);
    expect(seen).toBe(ctx);
  });

  it('returns 404 METHOD_NOT_FOUND for an unknown method', async () => {
    const router = new RpcRouter();
    const res = await router.dispatch('doesNotExist', {}, {});
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: 'METHOD_NOT_FOUND' });
  });

  it('returns 400 VALIDATION_ERROR for malformed input', async () => {
    const router = new RpcRouter();
    router.register('getDeviceStatuses', async () => ({ items: [] }));

    // userName is required and must be a string
    const res = await router.dispatch('getDeviceStatuses', { userName: 123 }, {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    if (!res.body.ok) {
      expect(res.body.error).toContain('userName');
    }
  });

  it('returns 500 HANDLER_ERROR when the handler throws an Error', async () => {
    const router = new RpcRouter();
    router.register('ping', async () => {
      throw new Error('boom');
    });

    const res = await router.dispatch('ping', {}, {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: 'HANDLER_ERROR', error: 'boom' });
  });

  it('returns a generic message when the handler throws a non-Error', async () => {
    const router = new RpcRouter();
    router.register('ping', async () => {
      throw 'string failure';
    });

    const res = await router.dispatch('ping', {}, {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: 'HANDLER_ERROR', error: 'Internal error' });
  });

  it('re-registering a method overrides the previous handler', async () => {
    const router = new RpcRouter();
    router.register('ping', async () => ({ pong: true as const, timestamp: 1, version: 'old' }));
    router.register('ping', async () => ({ pong: true as const, timestamp: 2, version: 'new' }));

    const res = await router.dispatch('ping', {}, {});
    expect(res.body).toMatchObject({ ok: true, result: { version: 'new' } });
    // still only one registration
    expect(router.getRegisteredMethods().filter((m) => m.name === 'ping')).toHaveLength(1);
  });
});
