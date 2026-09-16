import { Signal } from './Signal';
import { CoreObject } from './CoreObject';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Raw response body as text. */
  body: string;
  /** True when status is 200–299. */
  ok: boolean;
  /** Parse body as JSON. Throws if not valid JSON. */
  json<T = unknown>(): T;
}

/**
 * HTTP request node (fetch-based, browser + Node.js 18+).
 *
 * Configure `url`, `method`, `headers`, optional `body`, then call
 * `send()` or one of the shorthand methods (`get()`, `post()`, …).
 * Results are delivered both as the returned Promise and via signals
 * (`success`, `error`, `finished`) so they integrate naturally with
 * the rest of the minislib signal/slot system.
 *
 * Requests are cancelled automatically when the node is destroyed.
 *
 * Usage:
 *   const req = new HttpReq('https://api.example.com/data', parent);
 *   req.headers = { Authorization: 'Bearer token' };
 *   req.success.connect((res) => console.log(res.json()));
 *   req.error.connect((err) => console.error(err));
 *   req.get();
 *
 *   // POST with JSON body
 *   const res = await req.post({ key: 'value' });
 */
export class HttpReq extends CoreObject {
  /** Emitted when the response status is 200–299. */
  readonly success = new Signal<[response: HttpResponse]>();
  /** Emitted on network errors or non-2xx responses. */
  readonly error = new Signal<[err: Error]>();
  /** Always emitted after `success` or `error`. `err` is null on success. */
  readonly finished = new Signal<[response: HttpResponse | null, err: Error | null]>();

  url: string;
  method: HttpMethod = 'GET';
  headers: Record<string, string> = {};
  /** Request timeout in milliseconds. Default: 30 000. */
  timeoutMs = 30_000;

  #abortCtrl: AbortController | null = null;

  constructor(url: string, parent?: CoreObject) {
    super(parent, 'HttpReq');
    this.url = url;
  }

  /**
   * Send the request.
   * `body` overrides any previously set body for this call only.
   * Objects are JSON-serialized automatically.
   */
  async send(body?: string | object): Promise<HttpResponse> {
    this.#abortCtrl?.abort();
    const ctrl = new AbortController();
    this.#abortCtrl = ctrl;

    const timer = setTimeout(
      () => ctrl.abort(new Error(`HttpReq: timeout after ${this.timeoutMs}ms`)),
      this.timeoutMs
    );

    const bodyStr =
      body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);

    const mergedHeaders: Record<string, string> = { ...this.headers };
    if (bodyStr !== undefined && !mergedHeaders['Content-Type']) {
      mergedHeaders['Content-Type'] = typeof body === 'string' ? 'text/plain' : 'application/json';
    }

    try {
      const raw = await fetch(this.url, {
        method: this.method,
        headers: mergedHeaders,
        body: bodyStr,
        signal: ctrl.signal,
      });

      const text = await raw.text();
      const response: HttpResponse = {
        status: raw.status,
        statusText: raw.statusText,
        headers: Object.fromEntries(raw.headers.entries()),
        body: text,
        ok: raw.ok,
        json<T = unknown>(): T {
          return JSON.parse(text);
        },
      };

      if (raw.ok) {
        this.success.emit(response);
      } else {
        this.error.emit(new Error(`HttpReq: HTTP ${raw.status} ${raw.statusText}`));
      }
      this.finished.emit(response, null);
      return response;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.error.emit(e);
      this.finished.emit(null, e);
      throw e;
    } finally {
      clearTimeout(timer);
      if (this.#abortCtrl === ctrl) this.#abortCtrl = null;
    }
  }

  /** GET shorthand — sets `method` to `'GET'` and sends. */
  get(): Promise<HttpResponse> {
    this.method = 'GET';
    return this.send();
  }

  /** POST shorthand — sets `method` to `'POST'` and sends with `body`. */
  post(body?: string | object): Promise<HttpResponse> {
    this.method = 'POST';
    return this.send(body);
  }

  /** PUT shorthand. */
  put(body?: string | object): Promise<HttpResponse> {
    this.method = 'PUT';
    return this.send(body);
  }

  /** PATCH shorthand. */
  patch(body?: string | object): Promise<HttpResponse> {
    this.method = 'PATCH';
    return this.send(body);
  }

  /** DELETE shorthand. */
  delete(): Promise<HttpResponse> {
    this.method = 'DELETE';
    return this.send();
  }

  protected override onDestroy(): void {
    this.#abortCtrl?.abort();
  }
}
