// --- Enums ---

export enum FileType {
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum FileChangeType {
  Created = 1,
  Changed = 2,
  Deleted = 3,
}

// --- Data structures ---

export interface FileStat {
  type: FileType;
  size: number;
  ctime: number;
  mtime: number;
}

export interface DirectoryEntry {
  name: string;
  type: FileType;
}

export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
}

// --- Disposable ---

export interface Disposable {
  dispose(): void;
}

// --- Event (VS Code pattern) ---

export type VfsEventListener<T> = (event: T) => void;

export interface VfsEvent<T> {
  (listener: VfsEventListener<T>): Disposable;
}

// --- Operation options ---

export interface WriteFileOptions {
  create?: boolean;
  overwrite?: boolean;
}

export interface DeleteOptions {
  recursive?: boolean;
}

export interface RenameOptions {
  overwrite?: boolean;
}

export interface CopyOptions {
  overwrite?: boolean;
}

export interface WatchOptions {
  recursive?: boolean;
}

// --- Provider ---

export interface FileSystemCapabilities {
  readonly: boolean;
  watch: boolean;
}

export interface FileSystemProvider {
  readonly scheme: string;
  readonly capabilities: FileSystemCapabilities;
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]>;

  stat(path: string): Promise<FileStat>;
  readDirectory(path: string): Promise<DirectoryEntry[]>;
  readFile(path: string): Promise<Uint8Array>;

  writeFile?(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void>;
  delete?(path: string, options?: DeleteOptions): Promise<void>;
  rename?(oldPath: string, newPath: string, options?: RenameOptions): Promise<void>;
  mkdir?(path: string): Promise<void>;
  copy?(source: string, destination: string, options?: CopyOptions): Promise<void>;

  watch?(path: string, options?: WatchOptions): Disposable;
}

// --- Type guard ---

export function isWritable(provider: FileSystemProvider): boolean {
  return !provider.capabilities.readonly;
}
