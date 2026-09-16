/**
 * The platform's files as a `FileSystemProvider`.
 *
 * Two of the things this page mounts want one rather than a `DriveStore`: the
 * code editor (`@hestia/ui-texteditor`) and the assistant's tools
 * (`@hestia/ui-ai`). They are older and lower-level interfaces than the drive's,
 * and that is the right way round — a provider is the general thing and a
 * `DriveStore` is a listing with a preview.
 *
 * `RemoteFS` from `@hestia/core` does this shape over HTTP, but against its own
 * endpoint layout; the platform answers `/platform/api/vfs/{operation}`. So this
 * is the same idea spelled against the endpoints that exist here, on top of the
 * helpers in `platform.ts` — one place that knows the wire format, rather than
 * two that have to agree.
 *
 * The token is not held here: `platform.ts` reads it per request, so signing in
 * again does not leave a provider holding a stale one.
 */

import {
  FileChangeType,
  FileType,
  VfsEventEmitter,
  type DirectoryEntry,
  type FileChangeEvent,
  type FileStat,
  type FileSystemCapabilities,
  type FileSystemProvider,
} from '@hestia/core';
import { DIR_TYPE } from '@hestia/ui-core';
import { platform } from './platform';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `/a/b` and `a/b` mean the same directory to the platform; it wants the second. */
const rel = (path: string) => path.replace(/^\/+/, '');

export function platformProvider(): FileSystemProvider {
  const emitter = new VfsEventEmitter<FileChangeEvent[]>();

  return {
    scheme: 'hestia',
    capabilities: { readonly: false, watch: false } satisfies FileSystemCapabilities,
    onDidChangeFile: emitter.event,

    async stat(path: string): Promise<FileStat> {
      const entries = await platform.dir(parentOf(rel(path)));
      const name = baseOf(rel(path));
      const found = entries.find((e) => e.name === name);
      // A missing file is `File` with size 0 rather than a throw: the editor
      // asks for a stat before opening a path the user typed, and a throw
      // there reads to the user as "the drive is broken".
      return {
        type: found?.type === DIR_TYPE ? FileType.Directory : FileType.File,
        size: 0,
        ctime: 0,
        mtime: 0,
      };
    },

    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const entries = await platform.dir(rel(path));
      return entries.map((e) => ({
        name: e.name,
        type: e.type === DIR_TYPE ? FileType.Directory : FileType.File,
      }));
    },

    async readFile(path: string): Promise<Uint8Array> {
      return encoder.encode(await platform.read(rel(path)));
    },

    async writeFile(path: string, content: Uint8Array): Promise<void> {
      await platform.write(rel(path), decoder.decode(content));
      emitter.fire([{ type: FileChangeType.Changed, path }]);
    },

    async delete(path: string): Promise<void> {
      await platform.remove(rel(path));
      emitter.fire([{ type: FileChangeType.Deleted, path }]);
    },
  };
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function baseOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}
