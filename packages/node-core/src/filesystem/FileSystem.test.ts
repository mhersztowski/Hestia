import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystem, type FileChangeEvent } from './FileSystem';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileSystem', () => {
  describe('initialize', () => {
    it('creates rootDir if not exists', async () => {
      const newDir = path.join(tmpDir, 'subdir', 'deep');
      const fsSub = new FileSystem(newDir);
      await fsSub.initialize();
      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('succeeds if rootDir already exists', async () => {
      await expect(fileSystem.initialize()).resolves.not.toThrow();
    });
  });

  describe('writeFile / readFile', () => {
    it('writes and reads file', async () => {
      await fileSystem.writeFile('test.txt', 'hello world');
      const data = await fileSystem.readFile('test.txt');
      expect(data.content).toBe('hello world');
      expect(data.path).toBe('test.txt');
    });

    it('creates parent directories', async () => {
      await fileSystem.writeFile('a/b/c.txt', 'nested');
      const data = await fileSystem.readFile('a/b/c.txt');
      expect(data.content).toBe('nested');
    });

    it('returns cached data on second read', async () => {
      await fileSystem.writeFile('cached.txt', 'data');
      const first = await fileSystem.readFile('cached.txt');
      const second = await fileSystem.readFile('cached.txt');
      expect(first).toBe(second); // same reference = from cache
    });

    it('writeFile updates cache', async () => {
      await fileSystem.writeFile('update.txt', 'v1');
      const v1 = await fileSystem.readFile('update.txt');
      expect(v1.content).toBe('v1');

      await fileSystem.writeFile('update.txt', 'v2');
      const v2 = await fileSystem.readFile('update.txt');
      expect(v2.content).toBe('v2');
    });
  });

  describe('writeFile emits fileChanged', () => {
    it('emits write event with correct path', async () => {
      const events: FileChangeEvent[] = [];
      fileSystem.on('fileChanged', (e: FileChangeEvent) => events.push(e));

      await fileSystem.writeFile('event.txt', 'data');
      expect(events).toHaveLength(1);
      expect(events[0].path).toBe('event.txt');
      expect(events[0].action).toBe('write');
    });
  });

  describe('deleteFile', () => {
    it('removes file and evicts cache', async () => {
      await fileSystem.writeFile('del.txt', 'data');
      await fileSystem.deleteFile('del.txt');
      expect(await fileSystem.exists('del.txt')).toBe(false);
    });

    it('emits delete event', async () => {
      const events: FileChangeEvent[] = [];
      fileSystem.on('fileChanged', (e: FileChangeEvent) => events.push(e));

      await fileSystem.writeFile('del2.txt', 'data');
      events.length = 0; // clear write event
      await fileSystem.deleteFile('del2.txt');

      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('delete');
    });
  });

  describe('deleteDirectory', () => {
    it('removes directory recursively', async () => {
      await fileSystem.writeFile('dir/a.txt', 'a');
      await fileSystem.writeFile('dir/sub/b.txt', 'b');
      await fileSystem.deleteDirectory('dir');
      expect(await fileSystem.exists('dir')).toBe(false);
    });
  });

  describe('listDirectory', () => {
    it('returns correct tree structure', async () => {
      await fileSystem.writeFile('dir/a.txt', 'a');
      await fileSystem.writeFile('dir/b.txt', 'b');
      await fileSystem.writeFile('dir/sub/c.txt', 'c');

      const tree = await fileSystem.listDirectory('dir');
      expect(tree.type).toBe('directory');
      expect(tree.children).toBeDefined();

      // Directories first, then files alphabetically
      const childNames = tree.children!.map(c => c.name);
      expect(childNames[0]).toBe('sub'); // directory first
      expect(childNames).toContain('a.txt');
      expect(childNames).toContain('b.txt');
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      await fileSystem.writeFile('exists.txt', 'data');
      expect(await fileSystem.exists('exists.txt')).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      expect(await fileSystem.exists('nope.txt')).toBe(false);
    });
  });

  describe('path traversal rejection', () => {
    it('rejects path outside root', async () => {
      await expect(
        fileSystem.readFile('../../etc/passwd')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('writeBinaryFile / readBinaryFile', () => {
    it('round-trips binary data via base64', async () => {
      const originalData = Buffer.from('binary content here').toString('base64');
      await fileSystem.writeBinaryFile('binary.bin', originalData, 'application/octet-stream');

      const result = await fileSystem.readBinaryFile('binary.bin');
      expect(result.data).toBe(originalData);
      expect(result.size).toBe(Buffer.from(originalData, 'base64').length);
    });

    it('detects mime type from extension', async () => {
      const data = Buffer.from('fake png').toString('base64');
      await fileSystem.writeBinaryFile('image.png', data, 'image/png');

      const result = await fileSystem.readBinaryFile('image.png');
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('clearCache / invalidateCache', () => {
    it('clearCache forces re-read', async () => {
      await fileSystem.writeFile('cache.txt', 'v1');
      const first = await fileSystem.readFile('cache.txt');

      // Write directly to disk bypassing FileSystem
      await fs.writeFile(path.join(tmpDir, 'cache.txt'), 'v2-direct');
      fileSystem.clearCache();

      const second = await fileSystem.readFile('cache.txt');
      expect(second.content).toBe('v2-direct');
      expect(first).not.toBe(second);
    });

    it('invalidateCache invalidates single file', async () => {
      await fileSystem.writeFile('inv.txt', 'v1');
      await fileSystem.readFile('inv.txt'); // populate cache

      await fs.writeFile(path.join(tmpDir, 'inv.txt'), 'v2-direct');
      fileSystem.invalidateCache('inv.txt');

      const result = await fileSystem.readFile('inv.txt');
      expect(result.content).toBe('v2-direct');
    });
  });

  describe('concurrent writes (locking)', () => {
    it('serializes concurrent writes to same file', async () => {
      const writes = Array.from({ length: 10 }, (_, i) =>
        fileSystem.writeFile('concurrent.txt', `write-${i}`)
      );
      await Promise.all(writes);

      const data = await fileSystem.readFile('concurrent.txt');
      // The content should be one of the writes (last one wins), not corrupted
      expect(data.content).toMatch(/^write-\d$/);
    });
  });
});
