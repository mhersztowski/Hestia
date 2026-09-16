/**
 * The platform client (`app/backend`) — where accounts and files come from.
 *
 * The Drive application has **no users and no store of its own**: drawings,
 * models and notes live in the platform's files, and identity is checked by the
 * platform. That way one account works in every Hestia application, and a
 * backup is one directory rather than several scattered stores.
 *
 * The user's token is passed through rather than swapped for a service account:
 * were this application to walk the files "on everyone's behalf", any mistake of
 * its own in checking permissions would open somebody else's drawings.
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

  /** What the platform says about itself — used by `/api/health`. */
  async info(): Promise<{ name: string; mqtt: string; capabilities: string[] }> {
    const res = await fetch(`${this.options.url}/api/platform/info`);
    if (!res.ok) throw new PlatformError(res.status, 'The platform is not responding');
    return (await res.json()) as { name: string; mqtt: string; capabilities: string[] };
  }
}
