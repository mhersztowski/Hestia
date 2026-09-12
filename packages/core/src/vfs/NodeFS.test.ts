import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFS } from './NodeFS';
import { FileType, FileChangeType } from './types';
import { VfsErrorCode } from './errors';
import { encodeText, decodeText } from './utils';

let tempDir: string;
let fs: NodeFS;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'nodefs-test-'));
  fs = new NodeFS({ rootDir: tempDir });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('NodeFS', () => {
  it('should have scheme "node"', () => {
    expect(fs.scheme).toBe('node');
  });

  it('should be writable with watch support', () => {
    expect(fs.capabilities.readonly).toBe(false);
    expect(fs.capabilities.watch).toBe(true);
  });

  describe('stat', () => {
    it('should stat root as directory', async () => {
      const s = await fs.stat('/');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should stat a file', async () => {
      await writeFile(join(tempDir, 'test.txt'), 'hello');
      const s = await fs.stat('/test.txt');
      expect(s.type).toBe(FileType.File);
      expect(s.size).toBe(5);
      expect(s.mtime).toBeGreaterThan(0);
    });

    it('should stat a subdirectory', async () => {
      await mkdir(join(tempDir, 'subdir'));
      const s = await fs.stat('/subdir');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should throw FileNotFound for missing path', async () => {
      await expect(fs.stat('/nope')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('readDirectory', () => {
    it('should list files and directories', async () => {
      await writeFile(join(tempDir, 'a.txt'), '');
      await mkdir(join(tempDir, 'dir'));

      const entries = await fs.readDirectory('/');
      expect(entries).toEqual(expect.arrayContaining([
        { name: 'a.txt', type: FileType.File },
        { name: 'dir', type: FileType.Directory },
      ]));
    });

    it('should throw FileNotFound for missing dir', async () => {
      await expect(fs.readDirectory('/missing')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      await writeFile(join(tempDir, 'hello.txt'), 'world');
      const data = await fs.readFile('/hello.txt');
      expect(decodeText(data)).toBe('world');
    });

    it('should throw FileIsADirectory', async () => {
      await expect(fs.readFile('/')).rejects.toMatchObject({ code: VfsErrorCode.FileIsADirectory });
    });

    it('should throw FileNotFound for missing file', async () => {
      await expect(fs.readFile('/nope.txt')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('writeFile', () => {
    it('should create a new file', async () => {
      await fs.writeFile!('/new.txt', encodeText('content'));
      const real = await readFile(join(tempDir, 'new.txt'), 'utf-8');
      expect(real).toBe('content');
    });

    it('should auto-create parent directories', async () => {
      await fs.writeFile!('/a/b/c.txt', encodeText('deep'));
      const real = await readFile(join(tempDir, 'a', 'b', 'c.txt'), 'utf-8');
      expect(real).toBe('deep');
    });

    it('should overwrite with overwrite: true', async () => {
      await fs.writeFile!('/f.txt', encodeText('v1'));
      await fs.writeFile!('/f.txt', encodeText('v2'), { overwrite: true });
      expect(decodeText(await fs.readFile('/f.txt'))).toBe('v2');
    });

    it('should throw FileExists when overwrite is false', async () => {
      await fs.writeFile!('/f.txt', encodeText('v1'));
      await expect(fs.writeFile!('/f.txt', encodeText('v2'), { overwrite: false }))
        .rejects.toMatchObject({ code: VfsErrorCode.FileExists });
    });

    it('should fire change event', async () => {
      const listener = vi.fn();
      fs.onDidChangeFile(listener);
      await fs.writeFile!('/f.txt', encodeText(''));
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Changed, path: '/f.txt' },
      ]);
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      await writeFile(join(tempDir, 'del.txt'), 'bye');
      await fs.delete!('/del.txt');
      await expect(fs.stat('/del.txt')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should delete directory recursively', async () => {
      await mkdir(join(tempDir, 'dir'));
      await writeFile(join(tempDir, 'dir', 'f.txt'), '');
      await fs.delete!('/dir', { recursive: true });
      await expect(fs.stat('/dir')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should throw on non-empty dir without recursive', async () => {
      await mkdir(join(tempDir, 'dir'));
      await writeFile(join(tempDir, 'dir', 'f.txt'), '');
      await expect(fs.delete!('/dir')).rejects.toThrow();
    });

    it('should throw FileNotFound for missing path', async () => {
      await expect(fs.delete!('/nope')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('rename', () => {
    it('should rename a file', async () => {
      await writeFile(join(tempDir, 'old.txt'), 'data');
      await fs.rename!('/old.txt', '/new.txt');
      expect(decodeText(await fs.readFile('/new.txt'))).toBe('data');
      await expect(fs.stat('/old.txt')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should rename a directory', async () => {
      await mkdir(join(tempDir, 'dir'));
      await writeFile(join(tempDir, 'dir', 'f.txt'), '');
      await fs.rename!('/dir', '/renamed');
      expect((await fs.stat('/renamed')).type).toBe(FileType.Directory);
      const entries = await fs.readDirectory('/renamed');
      expect(entries[0].name).toBe('f.txt');
    });

    it('should throw FileExists without overwrite', async () => {
      await writeFile(join(tempDir, 'a.txt'), '');
      await writeFile(join(tempDir, 'b.txt'), '');
      await expect(fs.rename!('/a.txt', '/b.txt'))
        .rejects.toMatchObject({ code: VfsErrorCode.FileExists });
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      await fs.mkdir!('/newdir');
      expect((await fs.stat('/newdir')).type).toBe(FileType.Directory);
    });

    it('should create nested directories', async () => {
      await fs.mkdir!('/a/b/c');
      expect((await fs.stat('/a/b/c')).type).toBe(FileType.Directory);
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      await writeFile(join(tempDir, 'src.txt'), 'copy me');
      await fs.copy!('/src.txt', '/dst.txt');
      expect(decodeText(await fs.readFile('/dst.txt'))).toBe('copy me');
      // Source still exists
      expect(decodeText(await fs.readFile('/src.txt'))).toBe('copy me');
    });

    it('should copy a directory recursively', async () => {
      await mkdir(join(tempDir, 'dir'));
      await writeFile(join(tempDir, 'dir', 'f.txt'), 'data');
      await fs.copy!('/dir', '/copy');
      expect(decodeText(await fs.readFile('/copy/f.txt'))).toBe('data');
    });
  });

  describe('watch', () => {
    it('should return a disposable', () => {
      const watcher = fs.watch!('/');
      expect(watcher.dispose).toBeInstanceOf(Function);
      watcher.dispose();
    });
  });
});
