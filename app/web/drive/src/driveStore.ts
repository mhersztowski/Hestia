/**
 * The drive, on the platform's files.
 *
 * `Drive` from `@hestia/ui-core` describes what it needs and this supplies it.
 * It cannot reach for a file system itself: the one in `@hestia/node-core` is
 * Node code (`node:fs`), and a page has no such thing. So the store speaks to
 * the platform over `/platform/api/vfs/*` — and what answers there **is** that
 * `FileSystem`, on the server, with the user's own token deciding what it will
 * show. The same store, reached the only way a browser can reach it.
 *
 * The root is the whole of the user's space: this application is for looking at
 * what is on the drive, including what another application put there, and a
 * drive that shows one directory is a file picker, not a drive.
 */

import { DIR_TYPE, type DriveEntry, type DriveStore } from '@hestia/ui-core';
import { platform, PlatformError } from './platform';

export function platformDrive(): DriveStore {
  return {
    startDir: '',

    async list(dir: string): Promise<DriveEntry[]> {
      let entries;
      try {
        entries = await platform.dir(dir);
      } catch (e) {
        // A directory that is not there yet is a normal state. An expired
        // token is not: shown as an empty folder it would look like the
        // files were gone.
        if (e instanceof PlatformError && (e.status === 401 || e.status === 403)) throw e;
        return [];
      }
      return entries.map((e) => ({ name: e.name, directory: e.type === DIR_TYPE }));
    },

    read: (path) => platform.read(path),
    write: (path, content) => platform.write(path, content),
    remove: (path) => platform.remove(path),

    // No `readBytes`: the platform's VFS hands out text. Images and PDFs are
    // listed and can be opened in a tab, but the panel does not draw them —
    // better than a broken picture with no reason given.
  };
}
