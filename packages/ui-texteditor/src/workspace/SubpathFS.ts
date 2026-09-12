import type {
  FileSystemProvider, FileSystemCapabilities, FileStat, DirectoryEntry,
  WriteFileOptions, DeleteOptions, RenameOptions, VfsEvent, FileChangeEvent,
} from '@hestia/core';

/**
 * Wraps a {@link FileSystemProvider}, prefixing every path operation with a
 * fixed base path. Lets the editor expose a sub-tree of a larger remote
 * filesystem as if it were the root.
 */
export class SubpathFS implements FileSystemProvider {
  readonly scheme: string;
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]>;

  constructor(private readonly inner: FileSystemProvider, private readonly prefix: string) {
    this.scheme = inner.scheme;
    this.onDidChangeFile = inner.onDidChangeFile;
  }

  get capabilities(): FileSystemCapabilities { return this.inner.capabilities; }

  private p(path: string) { return path === '/' ? this.prefix : this.prefix + path; }

  stat(path: string): Promise<FileStat> { return this.inner.stat(this.p(path)); }
  readDirectory(path: string): Promise<DirectoryEntry[]> { return this.inner.readDirectory(this.p(path)); }
  readFile(path: string): Promise<Uint8Array> { return this.inner.readFile(this.p(path)); }
  writeFile(path: string, content: Uint8Array, opts?: WriteFileOptions) { return this.inner.writeFile!(this.p(path), content, opts); }
  mkdir(path: string) { return this.inner.mkdir!(this.p(path)); }
  delete(path: string, opts?: DeleteOptions) { return this.inner.delete!(this.p(path), opts); }
  rename(o: string, n: string, opts?: RenameOptions) { return this.inner.rename!(this.p(o), this.p(n), opts); }
}
