/**
 * The platform's files as the drive page speaks of them.
 *
 * `DrivePage` from `@hestia/ui-core` works on a `DriveVfs`: MyCastle's file
 * operations, kept as they were, with the backend swapped for whatever the host
 * supplies. This is that host — the platform (`app/backend`), over
 * `/platform/api/vfs/*`, with the user's own token.
 *
 * What is absent is absent on purpose. `publicUrl` is not here because the
 * platform serves nothing without a token, so the drive draws no "copy public
 * link"; `downloadUrl` is not here because a navigation carries no
 * Authorization header, and the page falls back to reading the bytes and
 * handing the browser a blob — which works.
 */
import { DIR_TYPE, FILE_TYPE, type DriveVfs, type VfsEntry } from '@hestia/ui-core';
import { platform } from './platform';

export function platformVfs(): DriveVfs {
    return {
        async list(path: string): Promise<VfsEntry[]> {
            return (await platform.dir(path)).map((e) => ({
                name: e.name,
                type: e.type === DIR_TYPE ? DIR_TYPE : FILE_TYPE,
            }));
        },

        readFile: (path) => platform.readBytes(path),
        writeFile: (path, data) => platform.writeBytes(path, data),
        mkdir: (path) => platform.mkdir(path),
        // The platform decides for itself whether the target is a directory, so
        // the flag the drive passes is not needed on the wire.
        delete: (path) => platform.remove(path),
        rename: (from, to) => platform.move(from, to, 'rename'),
        copy: (from, to) => platform.move(from, to, 'copy'),
        stat: (path) => platform.stat(path),
        zipPack: (source, destination) => platform.zipPack(source, destination),
        zipUnpack: (archive, destination) => platform.zipUnpack(archive, destination),
        runCommand: (directory, command, args, onLine) =>
            platform.runCommand(directory, command, args, onLine),
    };
}
