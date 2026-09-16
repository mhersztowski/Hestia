/**
 * The platform client (`app/backend`) — the source of files, accounts and the
 * MQTT address.
 *
 * The IoT application has **no store and no users of its own**: the device
 * registry lives in the platform's files and identity is checked by the
 * platform. That way an account created once works in every Hestia application,
 * and a backup is one directory rather than several scattered databases.
 *
 * The user's token is **passed through** rather than swapped for a service
 * account: were the application to walk the files "on everyone's behalf", any
 * mistake of its own in checking permissions would open somebody else's data.
 * This way the platform sees the real owner of the request and guards the
 * boundaries itself.
 */

export interface PlatformOptions {
  /** Address of `app/backend`, e.g. `http://localhost:4990`. */
  url: string;
}

export interface UserIdentity {
  userId: string;
  userName: string;
  isAdmin: boolean;
  roles: string[];
}

export class PlatformError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}

export class PlatformClient {
  constructor(private readonly options: PlatformOptions) {}

  /** Who holds the token; `null` when it is wrong or has expired. */
  async whoIs(token: string): Promise<UserIdentity | null> {
    const res = await fetch(`${this.options.url}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { user: UserIdentity }).user;
  }

  /** Contents of a file from the user's directory; `null` when there is none. */
  async read(token: string, path: string): Promise<string | null> {
    const res = await fetch(
      `${this.options.url}/api/vfs/readFile?path=${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 404 || res.status === 500) return null; // no such file
    if (!res.ok) throw new PlatformError(res.status, await this.reason(res));
    return ((await res.json()) as { content: string }).content;
  }

  async write(token: string, path: string, content: string): Promise<void> {
    const res = await fetch(`${this.options.url}/api/vfs/writeFile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) throw new PlatformError(res.status, await this.reason(res));
  }

  /** Where the applications should look for the broker. */
  async info(): Promise<{ name: string; mqtt: string; capabilities: string[] }> {
    const res = await fetch(`${this.options.url}/api/platform/info`);
    if (!res.ok) throw new PlatformError(res.status, 'The platform is not responding');
    return (await res.json()) as { name: string; mqtt: string; capabilities: string[] };
  }

  private async reason(res: Response): Promise<string> {
    try {
      return ((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }
}
