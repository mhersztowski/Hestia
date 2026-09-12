/**
 * publicPaths.ts — which Drive directories are reachable without logging in.
 *
 * The rule used to live in two places at once: the backend checked whether a
 * path began with `drive/public`, and the Drive page had a copy of the same
 * condition. While there was one directory, a drift had no way of coming to
 * light — with three it would have shown at the first one: the backend serving
 * a file the UI did not mark as public, or the UI showing a link that leads to
 * a 403.
 *
 * Hence one source of truth, used by both sides.
 *
 * **This is a decision about who can see data.** Everything lying in the
 * directories listed here can be read by anybody who knows the address —
 * without an account and without a password. The `git` directory carries
 * repositories together with their history, and `knowledge` a knowledge base;
 * both are sometimes published on purpose, but private notes must not be put
 * there.
 */

/**
 * The Drive directories served publicly.
 *
 * The list is explicit and short on purpose: every entry is consent to reading
 * without authentication, so adding another one is meant to require a
 * deliberate decision rather than falling under a rule.
 */
export const PUBLIC_DRIVE_DIRS = ['public', 'knowledge', 'git'] as const;

export type PublicDriveDir = typeof PUBLIC_DRIVE_DIRS[number];

/** A path relative to `drive/`, normalised for comparison. */
function normalize(relPath: string): string {
  return relPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Which public directory covers this path; `undefined` when none does.
 *
 * Paths containing `..` are rejected **before** a directory is matched:
 * `public/../secret` begins correctly and points outside the public area.
 * Settling that only when the file is read would leave the rule in two places —
 * exactly the split this module exists to prevent.
 */
export function publicDriveRoot(relPath: string): PublicDriveDir | undefined {
  const path = normalize(relPath);
  if (!path || path.split('/').includes('..')) return undefined;

  return PUBLIC_DRIVE_DIRS.find(
    // The slash matters: `public-notes` begins with "public" and has nothing
    // to do with it.
    (dir) => path === dir || path.startsWith(`${dir}/`),
  );
}

/** Whether a path relative to `drive/` lies in the public area. */
export function isPublicDrivePath(relPath: string): boolean {
  return publicDriveRoot(relPath) !== undefined;
}

/**
 * The address at which a file is reachable without logging in.
 *
 * `undefined` for paths outside the public area — a link to a file the server
 * will not hand over anyway is worse than no button: it looks like it works.
 */
export function publicDriveUrl(
  origin: string,
  userName: string,
  relPath: string,
): string | undefined {
  if (!isPublicDrivePath(relPath)) return undefined;

  const path = normalize(relPath).split('/').map(encodeURIComponent).join('/');
  return `${origin.replace(/\/+$/, '')}/public/drive/users/${encodeURIComponent(userName)}/${path}`;
}
