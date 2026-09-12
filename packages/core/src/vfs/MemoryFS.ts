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
import { VfsError } from './errors';
import { VfsEventEmitter } from './EventEmitter';
import { normalize, segments } from './paths';

interface MemoryNode {
  type: FileType;
  content?: Uint8Array;
  ctime: number;
  mtime: number;
}

export class MemoryFS implements FileSystemProvider {
  readonly scheme = 'memory';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: true };

  private nodes = new Map<string, MemoryNode>();
  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  constructor() {
    const now = Date.now();
    this.nodes.set('/', { type: FileType.Directory, ctime: now, mtime: now });
  }

  async stat(path: string): Promise<FileStat> {
    const p = normalize(path);
    const node = this.nodes.get(p);
    if (!node) throw VfsError.fileNotFound(p);
    return {
      type: node.type,
      size: node.content?.byteLength ?? 0,
      ctime: node.ctime,
      mtime: node.mtime,
    };
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const p = normalize(path);
    const node = this.nodes.get(p);
    if (!node) throw VfsError.fileNotFound(p);
    if (node.type !== FileType.Directory) throw VfsError.notADirectory(p);

    const prefix = p === '/' ? '/' : p + '/';
    const entries: DirectoryEntry[] = [];

    for (const [key, child] of this.nodes) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      // Direct children only (no nested slashes)
      if (rest && !rest.includes('/')) {
        entries.push({ name: rest, type: child.type });
      }
    }

    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = normalize(path);
    const node = this.nodes.get(p);
    if (!node) throw VfsError.fileNotFound(p);
    if (node.type === FileType.Directory) throw VfsError.isADirectory(p);
    return node.content ?? new Uint8Array(0);
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    const p = normalize(path);
    const existing = this.nodes.get(p);

    if (existing?.type === FileType.Directory) throw VfsError.isADirectory(p);
    if (existing && !options?.overwrite) throw VfsError.fileExists(p);
    if (!existing && options?.create === false) throw VfsError.fileNotFound(p);

    // Auto-mkdir parent directories
    this.ensureParentDirs(p);

    const now = Date.now();
    const changeType = existing ? FileChangeType.Changed : FileChangeType.Created;

    this.nodes.set(p, {
      type: FileType.File,
      content,
      ctime: existing?.ctime ?? now,
      mtime: now,
    });

    this.emitter.fire([{ type: changeType, path: p }]);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    const p = normalize(path);
    const node = this.nodes.get(p);
    if (!node) throw VfsError.fileNotFound(p);

    if (node.type === FileType.Directory) {
      const children = await this.readDirectory(p);
      if (children.length > 0 && !options?.recursive) {
        throw new VfsError(
          'FileNotADirectory' as any,
          `Directory not empty: ${p}`,
          p,
        );
      }
      if (options?.recursive) {
        this.deleteRecursive(p);
        return;
      }
    }

    this.nodes.delete(p);
    this.emitter.fire([{ type: FileChangeType.Deleted, path: p }]);
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    const op = normalize(oldPath);
    const np = normalize(newPath);
    const node = this.nodes.get(op);
    if (!node) throw VfsError.fileNotFound(op);

    const existingTarget = this.nodes.get(np);
    if (existingTarget && !options?.overwrite) throw VfsError.fileExists(np);

    this.ensureParentDirs(np);

    const events: FileChangeEvent[] = [];

    if (node.type === FileType.Directory) {
      // Move directory and all children
      const prefix = op === '/' ? '/' : op + '/';
      const toMove: [string, MemoryNode][] = [];

      for (const [key, child] of this.nodes) {
        if (key === op || key.startsWith(prefix)) {
          toMove.push([key, child]);
        }
      }

      for (const [key] of toMove) {
        this.nodes.delete(key);
        events.push({ type: FileChangeType.Deleted, path: key });
      }

      for (const [key, child] of toMove) {
        const newKey = key === op ? np : np + key.slice(op.length);
        child.mtime = Date.now();
        this.nodes.set(newKey, child);
        events.push({ type: FileChangeType.Created, path: newKey });
      }
    } else {
      this.nodes.delete(op);
      node.mtime = Date.now();
      this.nodes.set(np, node);
      events.push(
        { type: FileChangeType.Deleted, path: op },
        { type: FileChangeType.Created, path: np },
      );
    }

    this.emitter.fire(events);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    const existing = this.nodes.get(p);
    if (existing) {
      if (existing.type === FileType.Directory) return; // idempotent
      throw VfsError.fileExists(p);
    }

    this.ensureParentDirs(p);
    const now = Date.now();
    this.nodes.set(p, { type: FileType.Directory, ctime: now, mtime: now });
    this.emitter.fire([{ type: FileChangeType.Created, path: p }]);
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    const sp = normalize(source);
    const dp = normalize(destination);
    const node = this.nodes.get(sp);
    if (!node) throw VfsError.fileNotFound(sp);

    const existingTarget = this.nodes.get(dp);
    if (existingTarget && !options?.overwrite) throw VfsError.fileExists(dp);

    this.ensureParentDirs(dp);
    const now = Date.now();
    const events: FileChangeEvent[] = [];

    if (node.type === FileType.Directory) {
      const prefix = sp === '/' ? '/' : sp + '/';
      const toCopy: [string, MemoryNode][] = [];

      for (const [key, child] of this.nodes) {
        if (key === sp || key.startsWith(prefix)) {
          toCopy.push([key, child]);
        }
      }

      for (const [key, child] of toCopy) {
        const newKey = key === sp ? dp : dp + key.slice(sp.length);
        this.nodes.set(newKey, {
          type: child.type,
          content: child.content ? new Uint8Array(child.content) : undefined,
          ctime: now,
          mtime: now,
        });
        events.push({ type: FileChangeType.Created, path: newKey });
      }
    } else {
      this.nodes.set(dp, {
        type: FileType.File,
        content: node.content ? new Uint8Array(node.content) : undefined,
        ctime: now,
        mtime: now,
      });
      events.push({ type: FileChangeType.Created, path: dp });
    }

    this.emitter.fire(events);
  }

  watch(_path: string, _options?: WatchOptions): Disposable {
    // MemoryFS fires events on every mutation — watch is implicit
    return { dispose: () => {} };
  }

  private ensureParentDirs(path: string): void {
    const segs = segments(path);
    // Build each parent, e.g. for /a/b/c → ensure /a, /a/b
    let current = '';
    for (let i = 0; i < segs.length - 1; i++) {
      current += '/' + segs[i];
      const existing = this.nodes.get(current);
      if (existing) {
        if (existing.type !== FileType.Directory) {
          throw VfsError.notADirectory(current);
        }
        continue;
      }
      const now = Date.now();
      this.nodes.set(current, { type: FileType.Directory, ctime: now, mtime: now });
    }
  }

  private deleteRecursive(path: string): void {
    const prefix = path === '/' ? '/' : path + '/';
    const toDelete: string[] = [path];

    for (const key of this.nodes.keys()) {
      if (key.startsWith(prefix)) {
        toDelete.push(key);
      }
    }

    const events: FileChangeEvent[] = [];
    for (const key of toDelete) {
      this.nodes.delete(key);
      events.push({ type: FileChangeType.Deleted, path: key });
    }

    this.emitter.fire(events);
  }
}
