/**
 * This application's API, and the way to the platform.
 *
 * There is little of the first kind on purpose. The drive shows the
 * platform's files, and everything that works on them — the editors, the
 * previews, the assistant — runs in the browser.
 * So this server serves the page, says whether the platform is up, and forwards
 * what belongs to the platform.
 *
 * It exists all the same, and not only for symmetry with `app/finances`: the
 * page talks to **one** address, which is its own server, and the platform's
 * address stays a matter of the server's configuration rather than something
 * the browser has to guess. Work that genuinely needs Node — converting a STEP
 * file outside the browser, say, or meshing a model too large for it — has a
 * place to go without moving the application first.
 */

import { HttpError, type HttpServer } from '@hestia/node-core';
import { PlatformClient, type UserIdentity } from './platform';

/** The token from the `Authorization` header; the platform decides whether it is any good. */
async function identify(
  platform: PlatformClient,
  header: string | undefined
): Promise<UserIdentity> {
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'No token — sign in to the platform');
  const user = await platform.whoIs(token);
  if (!user) throw new HttpError(401, 'The token is invalid or has expired');
  return user;
}

export function registerApi(server: HttpServer, platform: PlatformClient): void {
  server.get('/api/health', async () => {
    const info = await platform.info().catch(() => null);
    return {
      ok: true,
      // The platform's address reaches the browser from here. Were the page
      // to guess it, changing a port would break it in a way
      // indistinguishable from a network outage.
      platform: info ? { ...info, available: true } : { available: false },
    };
  });

  // Who am I, as this application sees it. The page has the same answer from
  // the platform; this route is what tells the two apart when signing in works
  // but the drive server cannot reach the platform at all.
  server.get('/api/me', async (ctx) => ({
    user: await identify(platform, ctx.req.headers.authorization),
  }));
}

/**
 * Everything under `/platform/*` goes on to the platform with the caller's own
 * token. The page therefore talks to one address, and the platform still sees
 * the real owner of each request.
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
    // The status has to pass through unchanged: a 401 from the platform must
    // stay a 401, or the page cannot tell a wrong password from an outage.
    ctx.res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    });
    ctx.res.end(text);
  });
}
