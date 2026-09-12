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
  VfsEvent,
} from './types';
import { FileChangeType } from './types';
import { VfsError, VfsErrorCode } from './errors';
import { VfsEventEmitter } from './EventEmitter';

export interface RemoteFSOptions {
  /** Base URL for VFS REST endpoints, e.g. "/api/vfs" or "http://localhost:1902/api/vfs" */
  baseUrl: string;
  /** Bearer token for authentication */
  token?: string;
  /** Custom fetch function (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
}

/**
 * VFS provider that proxies all operations to a remote server via REST API.
 * Mirrors a server-side CompositeFS through HTTP endpoints.
 */
export class RemoteFS implements FileSystemProvider {
  readonly scheme = 'remote';

  private baseUrl: string;
  private token?: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  private cachedCapabilities: FileSystemCapabilities | null = null;

  constructor(options: RemoteFSOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get capabilities(): FileSystemCapabilities {
    return this.cachedCapabilities ?? { readonly: false, watch: false };
  }

  /** Update auth token (e.g. after login). Fires a change event so UI trees refresh. */
  setToken(token: string | undefined): void {
    const changed = this.token !== token;
    this.token = token;
    if (changed && token) {
      this.emitter.fire([{ type: FileChangeType.Changed, path: '/' }]);
    }
  }

  /** Fetch capabilities from the server and cache them */
  async fetchCapabilities(): Promise<FileSystemCapabilities> {
    const data = await this.get('/capabilities');
    this.cachedCapabilities = data as FileSystemCapabilities;
    return this.cachedCapabilities;
  }

  async stat(path: string): Promise<FileStat> {
    return await this.get('/stat', path) as FileStat;
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const data = await this.get('/readdir', path) as { entries: DirectoryEntry[] };
    return data.entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = await this.get('/readFile', path) as { data: string };
    return base64ToUint8Array(data.data);
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    await this.post('/writeFile', path, {
      data: uint8ArrayToBase64(content),
      options,
    });
    this.emitter.fire([{ type: FileChangeType.Changed, path }]);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    await this.post('/delete', path, { options });
    this.emitter.fire([{ type: FileChangeType.Deleted, path }]);
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    await this.post('/rename', undefined, { oldPath, newPath, options });
    this.emitter.fire([
      { type: FileChangeType.Deleted, path: oldPath },
      { type: FileChangeType.Created, path: newPath },
    ]);
  }

  async mkdir(path: string): Promise<void> {
    await this.post('/mkdir', path, {});
    this.emitter.fire([{ type: FileChangeType.Created, path }]);
  }

  async copy(source: string, destination: string, options?: CopyOptions): Promise<void> {
    await this.post('/copy', undefined, { source, destination, options });
    this.emitter.fire([{ type: FileChangeType.Created, path: destination }]);
  }

  // --- Private helpers ---

  private async get(operation: string, path?: string): Promise<unknown> {
    const url = new URL(this.baseUrl + operation, getOrigin());
    if (path) url.searchParams.set('path', path);

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: this.headers(),
    });

    return this.handleResponse(response);
  }

  private async post(operation: string, path: string | undefined, body: unknown): Promise<unknown> {
    const url = new URL(this.baseUrl + operation, getOrigin());
    if (path) url.searchParams.set('path', path);

    const response = await this.fetchFn(url.toString(), {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return this.handleResponse(response);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private async handleResponse(response: Response): Promise<unknown> {
    if (response.ok) {
      return response.json();
    }

    // Try to parse VfsError from response body
    let errorData: { error?: string; code?: string; path?: string } | undefined;
    try {
      errorData = await response.json();
    } catch {
      // Response body wasn't JSON
    }

    if (errorData?.code) {
      throw new VfsError(
        errorData.code as VfsErrorCode,
        errorData.error,
        errorData.path,
      );
    }

    // Generic HTTP error
    const statusMap: Record<number, VfsErrorCode> = {
      404: VfsErrorCode.FileNotFound,
      403: VfsErrorCode.NoPermissions,
      401: VfsErrorCode.NoPermissions,
      409: VfsErrorCode.FileExists,
    };
    const code = statusMap[response.status] ?? VfsErrorCode.Unavailable;
    throw new VfsError(code, errorData?.error ?? `HTTP ${response.status}`, undefined);
  }
}

/** Get origin for URL construction — handles both browser and Node.js */
function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
