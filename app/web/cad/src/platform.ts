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

const TOKEN_KEY = 'hestia-token';

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

/** A file-tree entry as the platform returns it. */
export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
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
   * Contents of a directory. The platform returns the **whole subtree** rather
   * than one level — we take only its direct children, because that is all the
   * file dialog shows, and stepping deeper is a separate request anyway.
   */
  async dir(path: string): Promise<TreeEntry[]> {
    const res = await fetch(`${platformBase}/api/vfs/readdir?path=${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    const { entries } = await response<{ entries: TreeEntry }>(res);
    return entries?.children ?? [];
  },

  async read(path: string): Promise<string> {
    const res = await fetch(`${platformBase}/api/vfs/readFile?path=${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    return (await response<{ content: string }>(res)).content;
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
