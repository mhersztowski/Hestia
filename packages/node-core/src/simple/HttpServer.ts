/**
 * The application's HTTP server: the API under `/api/*` and the built frontend
 * under everything else.
 *
 * On the `node:http` module, without a framework. The reason is the same as for
 * the store: this is a few dozen lines, whereas a framework would have to be
 * updated, configured and have its behaviour explained on every odd report.
 *
 * The two things that must be right are split out and tested separately:
 * `router.ts` (path matching) and `staticFiles.ts` (safe file path resolution).
 */

import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { match, type Params } from './router';
import { resolvePath, mimeType } from './staticFiles';

export interface Context {
  /** Parameters from the path pattern, e.g. `:id`. */
  params: Params;
  /** Query parameters from the URL. */
  query: URLSearchParams;
  /** Request body as JSON; `undefined` when empty. */
  body: unknown;
  req: http.IncomingMessage;
  res: http.ServerResponse;
}

export type Handler = (ctx: Context) => unknown | Promise<unknown>;

/**
 * An error carrying a response code.
 *
 * A handler throws `new HttpError(404, 'No such transaction')` instead of
 * poking at `res` — so there is one path for errors and the response always has
 * the same shape.
 */
export class HttpError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}
interface PrefixRoute {
  prefix: string;
  handler: Handler;
}

export interface ServerOptions {
  port: number;
  /** Directory with the built frontend; without it the server exposes the API only. */
  publicDir?: string;
  host?: string;
}

export class HttpServer {
  private readonly routes: Route[] = [];
  private readonly prefixes: PrefixRoute[] = [];
  private server: http.Server | null = null;

  constructor(private readonly options: ServerOptions) {}

  get(pattern: string, handler: Handler): this {
    return this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: Handler): this {
    return this.add('POST', pattern, handler);
  }
  put(pattern: string, handler: Handler): this {
    return this.add('PUT', pattern, handler);
  }
  delete(pattern: string, handler: Handler): this {
    return this.add('DELETE', pattern, handler);
  }

  /**
   * A handler for a **whole branch** of URLs, on any method.
   *
   * For passing traffic on (one application in front of another): the paths
   * below a prefix cannot be enumerated in advance, and a `:param` pattern
   * covers only one segment. Checked before the routes, because a prefix is a
   * declaration that "this URL is not mine to handle at all".
   */
  prefix(prefix: string, handler: Handler): this {
    this.prefixes.push({ prefix: prefix.replace(/\/+$/, ''), handler });
    return this;
  }

  private add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, pattern, handler });
    return this;
  }

  /** Starts and returns the port actually listened on (port 0 → random). */
  async start(): Promise<number> {
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((done, fail) => {
      this.server!.once('error', fail);
      this.server!.listen(this.options.port, this.options.host ?? '0.0.0.0', done);
    });
    const address = this.server.address();
    return typeof address === 'object' && address ? address.port : this.options.port;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    this.server = null;
    await new Promise<void>((done) => s.close(() => done()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      for (const { prefix, handler } of this.prefixes) {
        if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;
        const body = await this.readBody(req);
        const result = await handler({
          params: { rest: url.pathname.slice(prefix.length) },
          query: url.searchParams,
          body,
          req,
          res,
        });
        if (!res.writableEnded) this.sendJson(res, 200, result ?? { ok: true });
        return;
      }
      for (const route of this.routes) {
        if (route.method !== req.method) continue;
        const params = match(route.pattern, url.pathname);
        if (!params) continue;
        const body = await this.readBody(req);
        const result = await route.handler({ params, query: url.searchParams, body, req, res });
        if (!res.writableEnded) this.sendJson(res, 200, result ?? { ok: true });
        return;
      }
      // An unknown `/api/*` must return JSON rather than a page: otherwise
      // the browser shows "Unexpected token <" instead of the 404.
      if (url.pathname.startsWith('/api/')) {
        this.sendJson(res, 404, { error: `No such route: ${req.method} ${url.pathname}` });
        return;
      }
      await this.staticFile(url.pathname, res);
    } catch (e) {
      const code = e instanceof HttpError ? e.code : 500;
      if (code === 500) console.error('[hestia]', e);
      this.sendJson(res, code, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<unknown> {
    if (req.method === 'GET' || req.method === 'DELETE') return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'The request body is not valid JSON');
    }
  }

  /**
   * A file from the public directory, or `index.html` when there is none.
   *
   * Returning `index.html` instead of a 404 is how single-page application
   * routes are served: a refresh on `/transactions` must enter the
   * application, not an error page.
   */
  private async staticFile(pathname: string, res: http.ServerResponse): Promise<void> {
    const dir = this.options.publicDir;
    if (!dir) {
      this.sendJson(res, 404, { error: 'No built frontend' });
      return;
    }

    const file = resolvePath(dir, pathname);
    const toSend = file && (await exists(file)) ? file : resolvePath(dir, '/index.html');
    if (!toSend || !(await exists(toSend))) {
      this.sendJson(res, 404, {
        error: 'No built frontend — run `pnpm build:web`',
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType(toSend) });
    createReadStream(toSend).pipe(res);
  }

  private sendJson(res: http.ServerResponse, code: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}
