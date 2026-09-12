/**
 * A `NoteStore` backed by the user's files in the Hestia platform.
 *
 * The `@hestia/ui-cad` package describes what it needs; this is the only place that
 * knows there is a platform on the other side. Three operations the package
 * treats as optional, and **two of them are missing here**, because the platform
 * does not expose them:
 *
 *  • `rename` — the platform VFS has no move operation; faking it with "read,
 *    write under the new name, delete the old one" would look identical right up
 *    to the moment the write succeeds and the delete does not — leaving the user
 *    with two copies and no idea which is which.
 *  • `createDir` — directories come into being when a file is written
 *    (`writeFile` creates the missing ones along the way), so an empty directory
 *    would have nowhere to exist. A new folder is made by typing
 *    `meetings/tuesday` as the name.
 *
 * The file dialog draws no buttons for operations the store does not have.
 */

import type { NoteStore, DirEntry } from '@hestia/ui-cad';
import { PlatformError, platform } from './platform';

/** The notes directory inside the user's space. */
const NOTES_DIR = 'cad/notes';

export function platformStore(): NoteStore {
    return {
        startDir: NOTES_DIR,
        // The root is the CAD directory rather than the user's whole space: the
        // file dialog is meant to show notes, not everything the user keeps.
        rootDir: 'cad',

        async list(dir: string): Promise<DirEntry[]> {
            let entries;
            try {
                entries = await platform.dir(dir);
            } catch (e) {
                // A directory that does not exist is a normal state — before the
                // first save it is not on disk yet. A lack of permission is
                // something else and has to reach the user: an empty list shown
                // instead would look like "you have no notes", when the notes are
                // all there and only the token has expired.
                if (e instanceof PlatformError && (e.status === 401 || e.status === 403)) throw e;
                return [];
            }
            // The platform does not report modification times when listing — the
            // package knows what their absence means and sorts alphabetically then.
            return entries.map((e) => ({ name: e.name, directory: e.type === 'directory' }));
        },

        read: (path) => platform.read(path),
        write: (path, content) => platform.write(path, content),
        remove: (path) => platform.remove(path),
    };
}
