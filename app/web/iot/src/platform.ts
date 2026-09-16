/**
 * Access to the platform (`app/backend`) from the browser: accounts, files, MQTT.
 *
 * The page talks to **two** applications: its own API (`/api/*`) is served by
 * the IoT server, while accounts and files come from the platform. In
 * development the Vite proxy separates them (`/platform` → platform), and once
 * built the platform's address arrives from `/api/health`; guessing it in the
 * browser would break the page on every port change in a way indistinguishable
 * from a network outage.
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

async function response<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Base address of the platform — see the file header. */
let platformBase = '/platform';

export function setPlatformBase(address: string): void {
  platformBase = address.replace(/\/+$/, '');
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
    const res = await fetch(`${platformBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token() ?? ''}` },
    });
    return (await response<{ user: User }>(res)).user;
  },

  /** The user's file tree — from the platform, not from the IoT application. */
  async files(path = ''): Promise<unknown> {
    const res = await fetch(`${platformBase}/api/vfs/readdir?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token() ?? ''}` },
    });
    return (await response<{ entries: unknown }>(res)).entries;
  },
};

export interface DeviceView {
  deviceName: string;
  label: string;
  lastSeen: number;
  metrics: Record<string, number>;
  online: boolean;
}

async function iot<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token() ?? ''}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return response<T>(res);
}

export const api = {
  health: () => iot<{ ok: boolean; platform: { available: boolean; mqtt?: string } }>('/health'),
  devices: () => iot<{ devices: DeviceView[] }>('/devices'),
  add: (deviceName: string, label: string) =>
    iot<{ devices: DeviceView[] }>('/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceName, label }),
    }),
  remove: (deviceName: string) =>
    iot<{ devices: DeviceView[] }>(`/devices/${encodeURIComponent(deviceName)}`, {
      method: 'DELETE',
    }),
  reading: (deviceName: string, metrics: Record<string, number>) =>
    iot<{ devices: DeviceView[] }>(`/devices/${encodeURIComponent(deviceName)}/reading`, {
      method: 'POST',
      body: JSON.stringify(metrics),
    }),
};
