/**
 * Access to the platform (`app/backend`) from the browser: accounts and files.
 *
 * The page talks to **two** applications: its own API (`/api/*`) is served by
 * the CAD server (`app/cad`), while accounts and files come from the platform,
 * reached through `/platform/*` — which that server forwards. In development
 * the Vite proxy separates the two; once built there is no proxy, because the
 * CAD server serves the page and forwards `/platform` itself. Either way the
 * browser knows one address, its own, and where the platform actually lives
 * stays a matter of the server's configuration.
 */

import { DIR_TYPE, FILE_TYPE } from '@hestia/ui-core';

const TOKEN_KEY = 'hestia-token';

/** What the platform writes to make an empty directory exist. */
export const KEEP_MARKER = '.keep';

/** The token lives in `sessionStorage`: closing the tab signs the user out. */
export function token(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private window or site data blocked
  }
}

export function saveToken(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* without storage the token lives until a reload — so be it */
  }
}

export interface User {
  userId: string;
  userName: string;
  isAdmin: boolean;
  roles: string[];
}

/**
 * A directory entry as the platform returns it.
 *
 * `type` is a number, not a word: `/api/vfs/readdir` answers in MyCastle's
 * shape (`FILE_TYPE` 1, `DIR_TYPE` 2), which is what `@hestia/ui-core` also
 * describes. This was declared as `{ type: 'file' | 'directory'; children }`
 * and read as a subtree — so every listing came out empty and the drive said
 * the folder had nothing in it, whatever was on the disk.
 */
export interface TreeEntry {
  name: string;
  type: typeof FILE_TYPE | typeof DIR_TYPE;
}

/**
 * An error from the platform carrying the HTTP status.
 *
 * The caller needs the status, because not every failure means the same thing:
 * a missing directory is an ordinary situation (we show an empty list), while an
 * expired token calls for signing in again. Without the distinction, being
 * signed out would look like "you have no notes yet".
 */
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

async function response<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PlatformError((data as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

function headers(withBody = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token() ?? ''}`,
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

/** Where the platform is, as the browser addresses it — see the file header. */
const platformBase = '/platform';

/**
 * Asks this application's own server whether the platform answers. A `false`
 * here is worth showing before anyone types a password: signing in will fail,
 * and the reason will not be the password.
 */
export async function platformAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    const health = (await res.json()) as { platform?: { available?: boolean } };
    return health.platform?.available === true;
  } catch {
    return false;
  }
}

export const platform = {
  async signIn(userName: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${platformBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName, password }),
    });
    return response(res);
  },

  async me(): Promise<User> {
    const res = await fetch(`${platformBase}/api/auth/me`, { headers: headers() });
    return (await response<{ user: User }>(res)).user;
  },

  /**
   * Contents of a directory — one level, which is what the server sends: it
   * flattens the subtree before answering, so there is nothing to descend
   * into here. Stepping deeper is a request of its own.
   */
  async dir(path: string): Promise<TreeEntry[]> {
    const res = await fetch(`${platformBase}/api/vfs/readdir?path=${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    const { entries } = await response<{ entries: TreeEntry[] }>(res);
    // `.keep` is the platform's own marker, not the user's file: its file
    // system has no directories, so "create a folder" writes an empty
    // `.keep` inside one to make it exist. Filtering it here covers every
    // listing at once — the drive, the editor's tree and the assistant all
    // come through this one call.
    return (entries ?? []).filter((e) => e.name !== KEEP_MARKER);
  },

  /**
   * A file's bytes.
   *
   * `readFile` answers with base64 under `data` — this read `content` and got
   * `undefined` for every file, which downstream looked like an empty file
   * rather than a misread response.
   */
  async readBytes(path: string): Promise<Uint8Array> {
    const res = await fetch(`${platformBase}/api/vfs/readFile?path=${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    const { data } = await response<{ data: string }>(res);
    const binary = atob(data ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async read(path: string): Promise<string> {
    return new TextDecoder('utf-8').decode(await platform.readBytes(path));
  },

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const res = await fetch(`${platformBase}/api/vfs/writeFile`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ path, data: btoa(binary) }),
    });
    await response(res);
  },

  async zipPack(source: string, destination: string): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/zip_pack`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ source, destination }),
    });
    await response(res);
  },

  async zipUnpack(archive: string, destination: string): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/zip_unpack`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ archive, destination }),
    });
    await response(res);
  },

  /**
   * Runs a package-manager command and reports its output line by line.
   *
   * `fetch` with a reader rather than `EventSource`: the latter can only do
   * GET, and this request carries a body. The stream is `text/event-stream`
   * all the same, so a proxy in between treats it as one.
   */
  async runCommand(
    directory: string,
    command: string,
    args: readonly string[],
    onLine: (line: string) => void
  ): Promise<{ code: number }> {
    const res = await fetch(
      `${platformBase}/api/vfs/run_command?path=${encodeURIComponent(directory)}`,
      {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ command, args }),
      }
    );
    if (!res.ok || !res.body) {
      const { error } = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
        error?: string;
      };
      throw new PlatformError(error ?? `HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // A chunk can end in the middle of an event, so what is left over waits
    // for the next one — splitting per chunk would cut lines in half.
    let buffer = '';
    let code = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        const payload = event.replace(/^data: /, '').trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload) as { type: string; line?: string; code?: number };
          if (parsed.type === 'line' && parsed.line !== undefined) onLine(parsed.line);
          if (parsed.type === 'done') code = parsed.code ?? -1;
        } catch {
          /* a partial event: the next chunk completes it */
        }
      }
    }
    return { code };
  },

  async mkdir(path: string): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/mkdir`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ path }),
    });
    await response(res);
  },

  async move(from: string, to: string, operation: 'rename' | 'copy'): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/${operation}`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ oldPath: from, newPath: to }),
    });
    await response(res);
  },

  /** `null` when nothing is there — the drive checks before it overwrites. */
  async stat(path: string): Promise<{ type: number } | null> {
    const res = await fetch(`${platformBase}/api/vfs/stat?path=${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const { type } = (await res.json()) as { type?: number };
    return type === undefined ? null : { type };
  },

  async write(path: string, content: string): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/writeFile`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ path, content }),
    });
    await response(res);
  },

  async remove(path: string): Promise<void> {
    const res = await fetch(`${platformBase}/api/vfs/delete`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ path }),
    });
    await response(res);
  },
};
