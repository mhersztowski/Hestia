import type {
  FileSystemProvider,
  FileSystemCapabilities,
  FileStat,
  DirectoryEntry,
  FileChangeEvent,
  WriteFileOptions,
  DeleteOptions,
  RenameOptions,
  WatchOptions,
  Disposable,
  VfsEvent,
} from './types';
import { FileType, FileChangeType } from './types';
import { VfsError, VfsErrorCode } from './errors';
import { VfsEventEmitter } from './EventEmitter';
import { normalize, segments, dirname, basename } from './paths';

/**
 * VFS provider using the browser File System Access API (Chromium only).
 * Wraps a FileSystemDirectoryHandle obtained from window.showDirectoryPicker().
 *
 * Usage:
 *   const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
 *   const fs = new BrowserFS({ handle: dirHandle });
 */
export interface BrowserFSOptions {
  handle: FileSystemDirectoryHandle;
}

export class BrowserFS implements FileSystemProvider {
  readonly scheme = 'browser';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: false };

  private readonly root: FileSystemDirectoryHandle;
  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  constructor(options: BrowserFSOptions) {
    this.root = options.handle;
  }

  async stat(path: string): Promise<FileStat> {
    const p = normalize(path);
    if (p === '/') {
      return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
    }

    const handle = await this.resolveHandle(p);
    if (handle.kind === 'directory') {
      return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
    }

    const file = await (handle as FileSystemFileHandle).getFile();
    return {
      type: FileType.File,
      size: file.size,
      ctime: file.lastModified,
      mtime: file.lastModified,
    };
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const dir = await this.resolveDir(path);
    const entries: DirectoryEntry[] = [];

    // Use values() — entries() not available in all TS DOM lib versions
    for await (const handle of (dir as any).values()) {
      entries.push({
        name: handle.name,
        type: handle.kind === 'directory' ? FileType.Directory : FileType.File,
      });
    }

    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = normalize(path);
    const handle = await this.resolveHandle(p);

    if (handle.kind === 'directory') throw VfsError.isADirectory(p);

    const file = await (handle as FileSystemFileHandle).getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    const p = normalize(path);
    const parentPath = dirname(p);
    const name = basename(p);

    // Check if file exists
    let exists = false;
    try {
      const handle = await this.resolveHandle(p);
      if (handle.kind === 'directory') throw VfsError.isADirectory(p);
      exists = true;
    } catch (err) {
      if (err instanceof VfsError && err.code === VfsErrorCode.FileNotFound) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (exists && !options?.overwrite) throw VfsError.fileExists(p);
    if (!exists && options?.create === false) throw VfsError.fileNotFound(p);

    // Ensure parent dirs exist
    const dir = await this.ensureParentDirs(parentPath);

    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content as unknown as ArrayBuffer);
    await writable.close();

    this.emitter.fire([{
      type: exists ? FileChangeType.Changed : FileChangeType.Created,
      path: p,
    }]);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    const p = normalize(path);
    if (p === '/') throw VfsError.noPermissions(p);

    const parentPath = dirname(p);
    const name = basename(p);
    const parentDir = await this.resolveDir(parentPath);

    try {
      await parentDir.removeEntry(name, { recursive: options?.recursive ?? false });
      this.emitter.fire([{ type: FileChangeType.Deleted, path: p }]);
    } catch (err: any) {
      if (err.name === 'NotFoundError') throw VfsError.fileNotFound(p);
      if (err.name === 'InvalidModificationError') {
        throw new VfsError(VfsErrorCode.Unknown, `Directory not empty: ${p}`, p);
      }
      throw new VfsError(VfsErrorCode.Unknown, err.message, p);
    }
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    // File System Access API has no native rename/move.
    // Implement as copy + delete.
    const op = normalize(oldPath);
    const np = normalize(newPath);

    // Check target
    let targetExists = false;
    try {
      await this.resolveHandle(np);
      targetExists = true;
    } catch { /* target doesn't exist — OK */ }

    if (targetExists && !options?.overwrite) throw VfsError.fileExists(np);

    const srcHandle = await this.resolveHandle(op);

    if (srcHandle.kind === 'file') {
      const content = await this.readFile(op);
      await this.writeFile(np, content, { create: true, overwrite: true });
      await this.delete(op);
    } else {
      await this.copyDir(op, np);
      await this.delete(op, { recursive: true });
    }

    this.emitter.fire([
      { type: FileChangeType.Deleted, path: op },
      { type: FileChangeType.Created, path: np },
    ]);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    // ensureParentDirs + create the leaf dir
    await this.ensureParentDirs(p);

    const segs = segments(p);
    let dir = this.root;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }

    this.emitter.fire([{ type: FileChangeType.Created, path: p }]);
  }

  async copy(source: string, destination: string): Promise<void> {
    const sp = normalize(source);
    const dp = normalize(destination);
    const handle = await this.resolveHandle(sp);

    if (handle.kind === 'file') {
      const content = await this.readFile(sp);
      await this.writeFile(dp, content, { create: true, overwrite: true });
    } else {
      await this.copyDir(sp, dp);
    }

    this.emitter.fire([{ type: FileChangeType.Created, path: dp }]);
  }

  // No native watch in File System Access API
  watch(_path: string, _options?: WatchOptions): Disposable {
    return { dispose: () => {} };
  }

  /** Resolve a VFS path to a FileSystemHandle */
  private async resolveHandle(path: string): Promise<FileSystemHandle> {
    const p = normalize(path);
    if (p === '/') return this.root;

    const segs = segments(p);
    let current: FileSystemDirectoryHandle = this.root;

    for (let i = 0; i < segs.length; i++) {
      const isLast = i === segs.length - 1;
      const seg = segs[i];

      if (isLast) {
        // Try directory first, then file
        try {
          return await current.getDirectoryHandle(seg);
        } catch {
          try {
            return await current.getFileHandle(seg);
          } catch {
            throw VfsError.fileNotFound(p);
          }
        }
      } else {
        try {
          current = await current.getDirectoryHandle(seg);
        } catch {
          throw VfsError.fileNotFound(p);
        }
      }
    }

    return current;
  }

  /** Resolve a VFS path to a directory handle */
  private async resolveDir(path: string): Promise<FileSystemDirectoryHandle> {
    const p = normalize(path);
    if (p === '/') return this.root;

    const segs = segments(p);
    let current = this.root;

    for (const seg of segs) {
      try {
        current = await current.getDirectoryHandle(seg);
      } catch {
        throw VfsError.fileNotFound(p);
      }
    }

    return current;
  }

  /** Create parent directories recursively */
  private async ensureParentDirs(path: string): Promise<FileSystemDirectoryHandle> {
    const p = normalize(path);
    if (p === '/') return this.root;

    const segs = segments(p);
    let current = this.root;

    for (const seg of segs) {
      current = await current.getDirectoryHandle(seg, { create: true });
    }

    return current;
  }

  /** Recursively copy a directory tree */
  private async copyDir(srcPath: string, dstPath: string): Promise<void> {
    await this.mkdir(dstPath);
    const entries = await this.readDirectory(srcPath);

    for (const entry of entries) {
      const srcChild = srcPath === '/' ? `/${entry.name}` : `${srcPath}/${entry.name}`;
      const dstChild = dstPath === '/' ? `/${entry.name}` : `${dstPath}/${entry.name}`;

      if (entry.type === FileType.Directory) {
        await this.copyDir(srcChild, dstChild);
      } else {
        const content = await this.readFile(srcChild);
        await this.writeFile(dstChild, content, { create: true, overwrite: true });
      }
    }
  }
}
