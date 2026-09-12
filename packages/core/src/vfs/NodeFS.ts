import type {
  FileSystemProvider,
  FileSystemCapabilities,
  FileStat,
  DirectoryEntry,
  FileChangeEvent,
  WriteFileOptions,
  DeleteOptions,
  RenameOptions,
  CopyOptions,
  WatchOptions,
  Disposable,
  VfsEvent,
} from './types';
import { FileType, FileChangeType } from './types';
import { VfsError, VfsErrorCode } from './errors';
import { VfsEventEmitter } from './EventEmitter';
import { normalize, join, dirname } from './paths';

export interface NodeFSOptions {
  /** Root directory on the real filesystem. All VFS paths are resolved relative to this. */
  rootDir: string;
}

/**
 * VFS provider that wraps Node.js fs/promises.
 * All paths are resolved relative to rootDir — VFS "/" maps to rootDir on disk.
 * Only works in Node.js environments.
 */
export class NodeFS implements FileSystemProvider {
  readonly scheme = 'node';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: true };

  private readonly rootDir: string;
  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;
  private watchers = new Map<string, { abort: AbortController }>();

  constructor(options: NodeFSOptions) {
    // Normalize rootDir: remove trailing slash
    this.rootDir = options.rootDir.replace(/\/+$/, '') || '/';
  }

  /** Resolve a VFS path to a real filesystem path */
  private realPath(vfsPath: string): string {
    const p = normalize(vfsPath);
    if (p === '/') return this.rootDir;
    return this.rootDir + p;
  }

  async stat(path: string): Promise<FileStat> {
    const fs = await this.getFs();
    const real = this.realPath(path);
    try {
      const s = await fs.stat(real);
      return {
        type: s.isDirectory() ? FileType.Directory : s.isSymbolicLink() ? FileType.SymbolicLink : FileType.File,
        size: s.size,
        ctime: s.ctimeMs,
        mtime: s.mtimeMs,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(normalize(path));
      if (err.code === 'ENOTDIR') throw VfsError.fileNotFound(normalize(path));
      if (err.code === 'EACCES') throw VfsError.noPermissions(normalize(path));
      throw new VfsError(VfsErrorCode.Unknown, err.message, normalize(path));
    }
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const fs = await this.getFs();
    const real = this.realPath(path);
    try {
      const entries = await fs.readdir(real, { withFileTypes: true });
      return entries.map((e: any) => ({
        name: e.name,
        type: e.isDirectory() ? FileType.Directory : e.isSymbolicLink() ? FileType.SymbolicLink : FileType.File,
      }));
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(normalize(path));
      if (err.code === 'ENOTDIR') throw VfsError.notADirectory(normalize(path));
      if (err.code === 'EACCES') throw VfsError.noPermissions(normalize(path));
      throw new VfsError(VfsErrorCode.Unknown, err.message, normalize(path));
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const fs = await this.getFs();
    const real = this.realPath(path);
    try {
      const buffer = await fs.readFile(real);
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(normalize(path));
      if (err.code === 'EISDIR') throw VfsError.isADirectory(normalize(path));
      if (err.code === 'ENOTDIR') throw VfsError.fileNotFound(normalize(path));
      if (err.code === 'EACCES') throw VfsError.noPermissions(normalize(path));
      throw new VfsError(VfsErrorCode.Unknown, err.message, normalize(path));
    }
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    const fs = await this.getFs();
    const p = normalize(path);
    const real = this.realPath(p);

    try {
      const s = await fs.stat(real);
      if (s.isDirectory()) throw VfsError.isADirectory(p);
      if (!options?.overwrite) throw VfsError.fileExists(p);
    } catch (err: any) {
      if (err instanceof VfsError) throw err;
      if (err.code === 'ENOENT' && options?.create === false) throw VfsError.fileNotFound(p);
      // ENOENT is fine — we'll create the file
    }

    // Ensure parent directories exist
    const parentReal = this.realPath(dirname(p));
    await fs.mkdir(parentReal, { recursive: true });

    await fs.writeFile(real, content);
    this.emitter.fire([{ type: FileChangeType.Changed, path: p }]);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    const fs = await this.getFs();
    const p = normalize(path);
    const real = this.realPath(p);

    try {
      const s = await fs.stat(real);
      if (s.isDirectory()) {
        if (options?.recursive) {
          await fs.rm(real, { recursive: true });
        } else {
          await fs.rmdir(real);
        }
      } else {
        await fs.unlink(real);
      }
      this.emitter.fire([{ type: FileChangeType.Deleted, path: p }]);
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(p);
      if (err.code === 'ENOTEMPTY') {
        throw new VfsError(VfsErrorCode.Unknown, `Directory not empty: ${p}`, p);
      }
      if (err.code === 'EACCES') throw VfsError.noPermissions(p);
      throw new VfsError(VfsErrorCode.Unknown, err.message, p);
    }
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    const fs = await this.getFs();
    const op = normalize(oldPath);
    const np = normalize(newPath);
    const realOld = this.realPath(op);
    const realNew = this.realPath(np);

    try {
      await fs.stat(realNew);
      if (!options?.overwrite) throw VfsError.fileExists(np);
    } catch (err: any) {
      if (err instanceof VfsError) throw err;
      // ENOENT is fine
    }

    // Ensure parent of destination exists
    const parentReal = this.realPath(dirname(np));
    await fs.mkdir(parentReal, { recursive: true });

    try {
      await fs.rename(realOld, realNew);
      this.emitter.fire([
        { type: FileChangeType.Deleted, path: op },
        { type: FileChangeType.Created, path: np },
      ]);
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(op);
      if (err.code === 'EACCES') throw VfsError.noPermissions(op);
      throw new VfsError(VfsErrorCode.Unknown, err.message, op);
    }
  }

  async mkdir(path: string): Promise<void> {
    const fs = await this.getFs();
    const p = normalize(path);
    const real = this.realPath(p);

    try {
      await fs.mkdir(real, { recursive: true });
      this.emitter.fire([{ type: FileChangeType.Created, path: p }]);
    } catch (err: any) {
      if (err.code === 'EEXIST') return; // idempotent
      if (err.code === 'EACCES') throw VfsError.noPermissions(p);
      throw new VfsError(VfsErrorCode.Unknown, err.message, p);
    }
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    const fs = await this.getFs();
    const sp = normalize(source);
    const dp = normalize(destination);
    const realSrc = this.realPath(sp);
    const realDst = this.realPath(dp);

    try {
      await fs.stat(realDst);
      if (!options?.overwrite) throw VfsError.fileExists(dp);
    } catch (err: any) {
      if (err instanceof VfsError) throw err;
      // ENOENT is fine
    }

    // Ensure parent of destination exists
    const parentReal = this.realPath(dirname(dp));
    await fs.mkdir(parentReal, { recursive: true });

    try {
      await fs.cp(realSrc, realDst, { recursive: true });
      this.emitter.fire([{ type: FileChangeType.Created, path: dp }]);
    } catch (err: any) {
      if (err.code === 'ENOENT') throw VfsError.fileNotFound(sp);
      if (err.code === 'EACCES') throw VfsError.noPermissions(sp);
      throw new VfsError(VfsErrorCode.Unknown, err.message, sp);
    }
  }

  watch(path: string, options?: WatchOptions): Disposable {
    const p = normalize(path);
    const real = this.realPath(p);

    const abort = new AbortController();
    const key = `${real}:${options?.recursive ?? false}`;

    // Clean up existing watcher for the same path
    const existing = this.watchers.get(key);
    if (existing) existing.abort.abort();

    this.watchers.set(key, { abort });

    // Start watching asynchronously
    this.startWatch(real, p, options?.recursive ?? false, abort.signal);

    return {
      dispose: () => {
        abort.abort();
        this.watchers.delete(key);
      },
    };
  }

  private async startWatch(realPath: string, vfsPath: string, recursive: boolean, signal: AbortSignal): Promise<void> {
    try {
      const fs = await this.getFs();
      const watcher = fs.watch(realPath, { recursive, signal });
      for await (const event of watcher) {
        const changedPath = event.filename
          ? join(vfsPath, event.filename)
          : vfsPath;
        this.emitter.fire([{
          type: event.eventType === 'rename' ? FileChangeType.Created : FileChangeType.Changed,
          path: changedPath,
        }]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      // Watch failed silently — fs.watch is best-effort
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fsModule: any = null;

  // Concatenation hides the module specifier from TS DTS generation
  // (core is a shared browser+node package without @types/node).
  private static readonly _FS_MOD = 'node:' + 'fs/promises';

  private async getFs(): Promise<any> {
    if (this.fsModule) return this.fsModule;
    this.fsModule = await import(/* @vite-ignore */ NodeFS._FS_MOD);
    return this.fsModule;
  }
}
