import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface FileChangeEvent {
  path: string;
  action: 'write' | 'delete';
}

export interface FileData {
  path: string;
  content: string;
  lastModified: Date;
}

export interface BinaryFileData {
  path: string;
  data: string; // Base64 encoded
  mimeType: string;
  size: number;
  lastModified: Date;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
}

// Dirinfo structures for metadata caching
export interface DirinfoFileComponent {
  type: string;
  schemaPath?: string;
  ref?: string;
  objectType?: string;
  visible?: boolean;
  id?: string;
}

export interface DirinfoFile {
  type: string;
  id?: string;
  name: string;
  kind: string;
  description?: string;
  components?: DirinfoFileComponent[];
}

export interface DirinfoData {
  type: 'dir';
  id?: string;
  name?: string;
  description?: string;
  files?: DirinfoFile[];
  components?: Array<{ type: string; id?: string }>;
}

export class FileSystem extends EventEmitter {
  private rootDir: string;
  private cache: Map<string, FileData>;
  private dirinfoCache: Map<string, DirinfoData>; // key is directory path
  private locks: Map<string, Promise<void>>;

  constructor(rootDir: string) {
    super();
    this.rootDir = path.resolve(rootDir);
    this.cache = new Map();
    this.dirinfoCache = new Map();
    this.locks = new Map();
  }

  // Per-file write lock using promise chains (no external dependencies)
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) || Promise.resolve();
    let release: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.locks.set(key, current);

    try {
      await previous;
      return await fn();
    } finally {
      release!();
      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    }
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.rootDir);
    } catch {
      await fs.mkdir(this.rootDir, { recursive: true });
    }
  }

  private getAbsolutePath(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    const absolute = path.join(this.rootDir, normalized);

    if (!absolute.startsWith(this.rootDir)) {
      throw new Error('Access denied: path outside root directory');
    }

    return absolute;
  }

  private getRelativePath(absolutePath: string): string {
    return path.relative(this.rootDir, absolutePath);
  }

  async readFile(filePath: string): Promise<FileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const cached = this.cache.get(relativePath);
    if (cached) {
      const stats = await fs.stat(absolutePath);
      if (stats.mtime <= cached.lastModified) {
        return cached;
      }
      // File modified externally — invalidate cache entry
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    const stats = await fs.stat(absolutePath);

    const fileData: FileData = {
      path: relativePath,
      content,
      lastModified: stats.mtime,
    };

    this.cache.set(relativePath, fileData);
    return fileData;
  }

  async writeFile(filePath: string, content: string): Promise<FileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    return this.withLock(relativePath, async () => {
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      // Atomic write: write to temp file, then rename
      const tmpPath = absolutePath + '.tmp';
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, absolutePath);

      const stats = await fs.stat(absolutePath);

      const fileData: FileData = {
        path: relativePath,
        content,
        lastModified: stats.mtime,
      };

      this.cache.set(relativePath, fileData);
      this.emit('fileChanged', { path: relativePath, action: 'write' } as FileChangeEvent);
      return fileData;
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    await this.withLock(relativePath, async () => {
      await fs.unlink(absolutePath);
      this.cache.delete(relativePath);
      this.emit('fileChanged', { path: relativePath, action: 'delete' } as FileChangeEvent);
    });
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(dirPath);
    await fs.rm(absolutePath, { recursive: true, force: true });
  }

  /**
   * Directories that are not user data and should never be traversed.
   * They contain millions of files (node_modules) or symlinks that often
   * break after rsync between machines — a single broken symlink there
   * used to bring down `loadAllData()` for the whole frontend.
   */
  private static readonly EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.next', '.cache', '.pnpm-store',
    'dist', 'build', 'out', '.venv', '__pycache__',
    '.gradle', '.idea', '.vscode',
  ]);

  async listDirectory(dirPath: string = ''): Promise<DirectoryTree> {
    const absolutePath = this.getAbsolutePath(dirPath);
    const relativePath = this.getRelativePath(absolutePath);

    const tree = await this.buildDirectoryTree(absolutePath, relativePath || '.');
    if (!tree) {
      throw new Error(`Directory not accessible: ${absolutePath}`);
    }
    return tree;
  }

  private async buildDirectoryTree(absolutePath: string, relativePath: string): Promise<DirectoryTree | null> {
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(absolutePath);
    } catch (err) {
      // Broken symlink or missing target — typical for node_modules synced
      // between machines (pnpm `.bin/*` symlinks). Skip silently instead of
      // failing the whole tree walk; otherwise every frontend page that depends
      // on `loadAllData()` (Health/Memory/Shopping/Todo/…) hangs on a spinner.
      console.warn(`[FileSystem] skip ${absolutePath}: ${(err as Error).message}`);
      return null;
    }

    const name = path.basename(absolutePath) || path.basename(this.rootDir);

    if (!stats.isDirectory()) {
      return { name, path: relativePath, type: 'file' };
    }

    // Skip noise directories — frontend only reads `.json` + `.md`, never these.
    // Returns an empty directory node so listings still show the folder exists.
    if (FileSystem.EXCLUDED_DIRS.has(name)) {
      return { name, path: relativePath, type: 'directory', children: [] };
    }

    let entries: string[];
    try {
      entries = await fs.readdir(absolutePath);
    } catch (err) {
      console.warn(`[FileSystem] readdir failed for ${absolutePath}: ${(err as Error).message}`);
      return { name, path: relativePath, type: 'directory', children: [] };
    }

    const children: DirectoryTree[] = [];
    for (const entry of entries) {
      const entryAbsPath = path.join(absolutePath, entry);
      const entryRelPath = path.join(relativePath, entry);
      const child = await this.buildDirectoryTree(entryAbsPath, entryRelPath);
      if (child) children.push(child);
    }

    return {
      name,
      path: relativePath,
      type: 'directory',
      children: children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    };
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async writeBinaryFile(filePath: string, base64Data: string, mimeType: string): Promise<BinaryFileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    return this.withLock(relativePath, async () => {
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      // Atomic write: write to temp file, then rename
      const buffer = Buffer.from(base64Data, 'base64');
      const tmpPath = absolutePath + '.tmp';
      await fs.writeFile(tmpPath, buffer);
      await fs.rename(tmpPath, absolutePath);

      const stats = await fs.stat(absolutePath);

      return {
        path: relativePath,
        data: base64Data,
        mimeType,
        size: buffer.length,
        lastModified: stats.mtime,
      };
    });
  }

  async readBinaryFile(filePath: string): Promise<BinaryFileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const buffer = await fs.readFile(absolutePath);
    const stats = await fs.stat(absolutePath);
    const base64Data = buffer.toString('base64');

    // Detect mime type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return {
      path: relativePath,
      data: base64Data,
      mimeType,
      size: buffer.length,
      lastModified: stats.mtime,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateCache(filePath: string): void {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);
    this.cache.delete(relativePath);
  }

  // Sync dirinfo.json data to cache
  async syncDirinfo(dirinfoPath: string): Promise<DirinfoData> {
    const absolutePath = this.getAbsolutePath(dirinfoPath);
    const relativePath = this.getRelativePath(absolutePath);

    // Read and parse dirinfo.json
    const content = await fs.readFile(absolutePath, 'utf-8');
    const dirinfo = JSON.parse(content) as DirinfoData;

    // Get directory path (remove /dirinfo.json from end)
    const dirPath = path.dirname(relativePath);

    // Store in cache
    this.dirinfoCache.set(dirPath, dirinfo);

    console.log(`Synced dirinfo for: ${dirPath}`, {
      filesCount: dirinfo.files?.length || 0,
      componentsCount: dirinfo.components?.length || 0,
    });

    return dirinfo;
  }

  // Get dirinfo for a directory
  getDirinfo(dirPath: string): DirinfoData | undefined {
    return this.dirinfoCache.get(dirPath);
  }

  // Get schema path for a file from dirinfo
  getFileSchemaPath(filePath: string): string | null {
    const dirPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const dirinfo = this.dirinfoCache.get(dirPath);

    if (!dirinfo?.files) return null;

    const fileEntry = dirinfo.files.find(f => f.name === fileName);
    if (!fileEntry?.components) return null;

    const jsonComponent = fileEntry.components.find(c => c.type === 'file_json');
    if (!jsonComponent) return null;

    return jsonComponent.schemaPath || jsonComponent.ref || null;
  }

  // Get all cached dirinfo data
  getAllDirinfo(): Map<string, DirinfoData> {
    return new Map(this.dirinfoCache);
  }

  // Load all dirinfo.json files from the filesystem
  async loadAllDirinfo(): Promise<void> {
    await this.scanForDirinfo(this.rootDir);
  }

  private async scanForDirinfo(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stats = await fs.stat(entryPath);

        if (stats.isDirectory()) {
          await this.scanForDirinfo(entryPath);
        } else if (entry === 'dirinfo.json') {
          const relativePath = this.getRelativePath(entryPath);
          try {
            await this.syncDirinfo(relativePath);
          } catch (err) {
            console.warn(`Failed to load dirinfo: ${relativePath}`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to scan directory: ${dirPath}`, err);
    }
  }
}
