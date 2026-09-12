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
import { normalize } from './paths';

export interface MountEntry {
  mountPoint: string;
  provider: FileSystemProvider;
}

interface InternalMount extends MountEntry {
  eventSubscription: Disposable;
}

export class CompositeFS implements FileSystemProvider {
  readonly scheme = 'composite';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: true };

  private mounts: InternalMount[] = [];
  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  mount(mountPoint: string, provider: FileSystemProvider): Disposable {
    const mp = normalize(mountPoint);

    // Prevent duplicate mounts
    if (this.mounts.some((m) => m.mountPoint === mp)) {
      throw new VfsError('FileExists' as any, `Mount point already in use: ${mp}`, mp);
    }

    // Subscribe to provider events and re-emit with prefixed paths
    const eventSubscription = provider.onDidChangeFile((events) => {
      const prefixed = events.map((e) => ({
        type: e.type,
        path: mp === '/' ? e.path : mp + (e.path.startsWith('/') ? e.path : '/' + e.path),
      }));
      this.emitter.fire(prefixed);
    });

    const entry: InternalMount = { mountPoint: mp, provider, eventSubscription };
    this.mounts.push(entry);

    // Sort by mount point length descending for longest prefix match
    this.mounts.sort((a, b) => b.mountPoint.length - a.mountPoint.length);

    // Notify listeners that the mount point directory was created so tree subscribers refresh
    this.emitter.fire([{ type: FileChangeType.Created, path: mp }]);

    return {
      dispose: () => {
        this.removeMountEntry(mp);
      },
    };
  }

  unmount(mountPoint: string): void {
    const mp = normalize(mountPoint);
    if (!this.removeMountEntry(mp)) {
      throw VfsError.fileNotFound(mp);
    }
  }

  getMounts(): readonly MountEntry[] {
    return this.mounts.map(({ mountPoint, provider }) => ({ mountPoint, provider }));
  }

  async stat(path: string): Promise<FileStat> {
    const p = normalize(path);

    if (p === '/') {
      return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
    }

    // Check if path IS a mount point
    const exactMount = this.mounts.find((m) => m.mountPoint === p);
    if (exactMount) {
      return exactMount.provider.stat('/');
    }

    const resolved = this.resolve(p);
    return resolved.provider.stat(resolved.relativePath);
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const p = normalize(path);

    if (p === '/') {
      return this.mounts.map((m) => ({
        name: m.mountPoint.startsWith('/') ? m.mountPoint.slice(1) : m.mountPoint,
        type: FileType.Directory,
      }));
    }

    // Check if path IS a mount point
    const exactMount = this.mounts.find((m) => m.mountPoint === p);
    if (exactMount) {
      return exactMount.provider.readDirectory('/');
    }

    const resolved = this.resolve(p);
    return resolved.provider.readDirectory(resolved.relativePath);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = normalize(path);
    const resolved = this.resolve(p);
    return resolved.provider.readFile(resolved.relativePath);
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    const p = normalize(path);
    const resolved = this.resolve(p);
    if (resolved.provider.capabilities.readonly || !resolved.provider.writeFile) {
      throw VfsError.noPermissions(p);
    }
    return resolved.provider.writeFile(resolved.relativePath, content, options);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    const p = normalize(path);
    const resolved = this.resolve(p);
    if (resolved.provider.capabilities.readonly || !resolved.provider.delete) {
      throw VfsError.noPermissions(p);
    }
    return resolved.provider.delete(resolved.relativePath, options);
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    const op = normalize(oldPath);
    const np = normalize(newPath);
    const resolvedOld = this.resolve(op);
    const resolvedNew = this.resolve(np);

    // Rename across mount points is not supported
    if (resolvedOld.mount.mountPoint !== resolvedNew.mount.mountPoint) {
      throw new VfsError('NoPermissions' as any, 'Cannot rename across mount points');
    }

    if (resolvedOld.provider.capabilities.readonly || !resolvedOld.provider.rename) {
      throw VfsError.noPermissions(op);
    }

    return resolvedOld.provider.rename(resolvedOld.relativePath, resolvedNew.relativePath, options);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    const resolved = this.resolve(p);
    if (resolved.provider.capabilities.readonly || !resolved.provider.mkdir) {
      throw VfsError.noPermissions(p);
    }
    return resolved.provider.mkdir(resolved.relativePath);
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    const sp = normalize(source);
    const dp = normalize(destination);
    const resolvedSrc = this.resolve(sp);
    const resolvedDst = this.resolve(dp);

    // Same mount — delegate to provider.copy if available
    if (resolvedSrc.mount.mountPoint === resolvedDst.mount.mountPoint) {
      if (resolvedDst.provider.capabilities.readonly) {
        throw VfsError.noPermissions(dp);
      }
      if (resolvedSrc.provider.copy) {
        return resolvedSrc.provider.copy(resolvedSrc.relativePath, resolvedDst.relativePath, options);
      }
    }

    // Cross-mount copy: read from source, write to destination
    if (resolvedDst.provider.capabilities.readonly || !resolvedDst.provider.writeFile) {
      throw VfsError.noPermissions(dp);
    }

    const content = await resolvedSrc.provider.readFile(resolvedSrc.relativePath);
    return resolvedDst.provider.writeFile(resolvedDst.relativePath, content, {
      create: true,
      overwrite: options?.overwrite,
    });
  }

  watch(path: string, options?: WatchOptions): Disposable {
    const p = normalize(path);

    if (p === '/') {
      // Watch all mounts
      const disposables = this.mounts
        .filter((m) => m.provider.watch)
        .map((m) => m.provider.watch!('/', options));
      return {
        dispose: () => disposables.forEach((d) => d.dispose()),
      };
    }

    const resolved = this.resolve(p);
    if (!resolved.provider.watch) {
      return { dispose: () => {} };
    }
    return resolved.provider.watch(resolved.relativePath, options);
  }

  private resolve(path: string): { mount: InternalMount; provider: FileSystemProvider; relativePath: string } {
    for (const mount of this.mounts) {
      if (path === mount.mountPoint || path.startsWith(mount.mountPoint + '/')) {
        const relativePath = path.slice(mount.mountPoint.length) || '/';
        return { mount, provider: mount.provider, relativePath };
      }
    }
    throw VfsError.fileNotFound(path);
  }

  private removeMountEntry(mountPoint: string): boolean {
    const index = this.mounts.findIndex((m) => m.mountPoint === mountPoint);
    if (index === -1) return false;
    this.mounts[index].eventSubscription.dispose();
    this.mounts.splice(index, 1);
    return true;
  }
}
