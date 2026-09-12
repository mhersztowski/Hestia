import type {
  FileSystemProvider,
  FileSystemCapabilities,
  FileStat,
  DirectoryEntry,
  FileChangeEvent,
  WriteFileOptions,
  DeleteOptions,
  VfsEvent,
} from './types';
import { FileType, FileChangeType } from './types';
import { VfsError } from './errors';
import { VfsEventEmitter } from './EventEmitter';
import { normalize } from './paths';
import { base64ToUint8Array, uint8ArrayToBase64 } from './utils';

export interface GitHubFSOptions {
  owner: string;
  repo: string;
  ref?: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
  cacheTtlMs?: number;
}

interface CacheEntry {
  data: unknown;
  expiry: number;
}

interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
  encoding?: string;
}

export class GitHubFS implements FileSystemProvider {
  readonly scheme: string = 'github';

  get capabilities(): FileSystemCapabilities {
    return { readonly: !this.token, watch: false };
  }

  protected readonly owner: string;
  protected readonly repo: string;
  protected readonly ref: string;
  protected readonly token?: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  protected emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  constructor(options: GitHubFSOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'main';
    this.token = options.token;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  async stat(path: string): Promise<FileStat> {
    const p = normalize(path);
    const apiPath = p === '/' ? '' : p.startsWith('/') ? p.slice(1) : p;
    const data = await this.fetchContents(apiPath);

    if (Array.isArray(data)) {
      return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
    }

    const item = data as GitHubContentItem;
    return {
      type: item.type === 'dir' ? FileType.Directory : FileType.File,
      size: item.size ?? 0,
      ctime: 0,
      mtime: 0,
    };
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const p = normalize(path);
    const apiPath = p === '/' ? '' : p.startsWith('/') ? p.slice(1) : p;
    const data = await this.fetchContents(apiPath);

    if (!Array.isArray(data)) {
      throw VfsError.notADirectory(p);
    }

    return (data as GitHubContentItem[]).map((item) => ({
      name: item.name,
      type: item.type === 'dir' ? FileType.Directory : FileType.File,
    }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = normalize(path);
    const apiPath = p.startsWith('/') ? p.slice(1) : p;
    const data = await this.fetchContents(apiPath);

    if (Array.isArray(data)) {
      throw VfsError.isADirectory(p);
    }

    const item = data as GitHubContentItem;

    if (item.content && item.encoding === 'base64') {
      return base64ToUint8Array(item.content);
    }

    // Large files (>1MB) — fetch via Git Blobs API
    if (item.sha) {
      return this.fetchBlob(item.sha);
    }

    throw VfsError.unavailable(`Cannot read file content: ${p}`);
  }

  /**
   * Write/create a file via the GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path}).
   * Requires an authenticated token with `contents: write` permission.
   * Creates a commit for each write.
   */
  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    if (!this.token) throw VfsError.noPermissions(normalize(path));

    const p = normalize(path);
    const apiPath = p.startsWith('/') ? p.slice(1) : p;

    // Get existing file SHA (needed for updates)
    let existingSha: string | undefined;
    try {
      const data = await this.fetchContents(apiPath);
      if (Array.isArray(data)) throw VfsError.isADirectory(p);
      existingSha = (data as GitHubContentItem).sha;
      if (!options?.overwrite) throw VfsError.fileExists(p);
    } catch (err) {
      if (err instanceof VfsError && err.code === 'FileNotFound') {
        if (options?.create === false) throw err;
      } else {
        throw err;
      }
    }

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${apiPath}`;
    const body: Record<string, unknown> = {
      message: existingSha ? `Update ${apiPath}` : `Create ${apiPath}`,
      content: uint8ArrayToBase64(content),
      branch: this.ref,
    };
    if (existingSha) body.sha = existingSha;

    const response = await this.request(url, 'PUT', body);
    if (!response.ok) {
      const err = await response.text();
      throw VfsError.unavailable(`GitHub write failed (${response.status}): ${err}`);
    }

    // Invalidate cache for this path and parent
    this.invalidatePath(apiPath);

    this.emitter.fire([{
      type: existingSha ? FileChangeType.Changed : FileChangeType.Created,
      path: p,
    }]);
  }

  /**
   * Delete a file or directory via the GitHub Contents API.
   * Directories are deleted by recursively deleting all files (GitHub has no directory delete).
   */
  async delete(path: string, options?: DeleteOptions): Promise<void> {
    if (!this.token) throw VfsError.noPermissions(normalize(path));

    const p = normalize(path);
    const apiPath = p.startsWith('/') ? p.slice(1) : p;
    const data = await this.fetchContents(apiPath);

    if (Array.isArray(data)) {
      // Directory — must delete files inside
      if (!options?.recursive) {
        throw new VfsError('FileNotADirectory' as any, `Directory not empty: ${p}`, p);
      }
      await this.deleteDirectoryRecursive(apiPath, data as GitHubContentItem[]);
    } else {
      const item = data as GitHubContentItem;
      await this.deleteFile(apiPath, item.sha);
    }

    this.invalidatePath(apiPath);
    this.emitter.fire([{ type: FileChangeType.Deleted, path: p }]);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // --- Private helpers ---

  private async deleteFile(apiPath: string, sha: string): Promise<void> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${apiPath}`;
    const body = {
      message: `Delete ${apiPath}`,
      sha,
      branch: this.ref,
    };

    const response = await this.request(url, 'DELETE', body);
    if (!response.ok) {
      const err = await response.text();
      throw VfsError.unavailable(`GitHub delete failed (${response.status}): ${err}`);
    }
  }

  private async deleteDirectoryRecursive(_apiPath: string, items: GitHubContentItem[]): Promise<void> {
    for (const item of items) {
      if (item.type === 'dir') {
        const subData = await this.fetchContents(item.path);
        await this.deleteDirectoryRecursive(item.path, subData as GitHubContentItem[]);
      } else {
        await this.deleteFile(item.path, item.sha);
      }
    }
  }

  protected invalidatePath(apiPath: string): void {
    // Remove from cache: the file itself and its parent directory listing
    this.cache.delete(`contents:${apiPath}`);
    const parentPath = apiPath.includes('/') ? apiPath.slice(0, apiPath.lastIndexOf('/')) : '';
    this.cache.delete(`contents:${parentPath}`);
  }

  private async fetchContents(apiPath: string): Promise<unknown> {
    const cacheKey = `contents:${apiPath}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${apiPath}?ref=${this.ref}`;
    const response = await this.request(url);

    if (response.status === 404) {
      throw VfsError.fileNotFound('/' + apiPath);
    }

    if (!response.ok) {
      throw VfsError.unavailable(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.setCache(cacheKey, data);
    return data;
  }

  private async fetchBlob(sha: string): Promise<Uint8Array> {
    const cacheKey = `blob:${sha}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached as Uint8Array;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/blobs/${sha}`;
    const response = await this.request(url);

    if (!response.ok) {
      throw VfsError.unavailable(`GitHub Blob API error: ${response.status}`);
    }

    const data = (await response.json()) as { content: string; encoding: string };
    const content = base64ToUint8Array(data.content);
    this.setCache(cacheKey, content);
    return content;
  }

  protected async request(url: string, method = 'GET', body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const init: RequestInit = { method, headers };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return this.fetchFn(url, init);
  }

  private getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiry: Date.now() + this.cacheTtlMs });
  }
}

