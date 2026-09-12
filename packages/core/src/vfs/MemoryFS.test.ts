import { describe, it, expect, vi } from 'vitest';
import { MemoryFS } from './MemoryFS';
import { FileType, FileChangeType } from './types';
import { VfsErrorCode } from './errors';
import { encodeText, decodeText } from './utils';

function createFs() {
  return new MemoryFS();
}

describe('MemoryFS', () => {
  it('should have scheme "memory"', () => {
    expect(createFs().scheme).toBe('memory');
  });

  it('should be writable with watch support', () => {
    const fs = createFs();
    expect(fs.capabilities.readonly).toBe(false);
    expect(fs.capabilities.watch).toBe(true);
  });

  describe('stat', () => {
    it('should stat root directory', async () => {
      const fs = createFs();
      const s = await fs.stat('/');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should throw FileNotFound for missing path', async () => {
      const fs = createFs();
      await expect(fs.stat('/missing')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('writeFile + readFile', () => {
    it('should write and read a file', async () => {
      const fs = createFs();
      await fs.writeFile!('/hello.txt', encodeText('hello'));
      const data = await fs.readFile('/hello.txt');
      expect(decodeText(data)).toBe('hello');
    });

    it('should auto-create parent directories', async () => {
      const fs = createFs();
      await fs.writeFile!('/a/b/c.txt', encodeText('deep'));
      const s = await fs.stat('/a/b');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should throw FileExists when overwrite is false', async () => {
      const fs = createFs();
      await fs.writeFile!('/f.txt', encodeText('v1'));
      await expect(fs.writeFile!('/f.txt', encodeText('v2'), { overwrite: false }))
        .rejects.toMatchObject({ code: VfsErrorCode.FileExists });
    });

    it('should overwrite with overwrite: true', async () => {
      const fs = createFs();
      await fs.writeFile!('/f.txt', encodeText('v1'));
      await fs.writeFile!('/f.txt', encodeText('v2'), { overwrite: true });
      expect(decodeText(await fs.readFile('/f.txt'))).toBe('v2');
    });

    it('should throw FileIsADirectory when reading a directory', async () => {
      const fs = createFs();
      await expect(fs.readFile('/')).rejects.toMatchObject({ code: VfsErrorCode.FileIsADirectory });
    });
  });

  describe('readDirectory', () => {
    it('should list root children', async () => {
      const fs = createFs();
      await fs.writeFile!('/a.txt', encodeText(''));
      await fs.mkdir!('/dir');
      const entries = await fs.readDirectory('/');
      expect(entries).toEqual(expect.arrayContaining([
        { name: 'a.txt', type: FileType.File },
        { name: 'dir', type: FileType.Directory },
      ]));
    });

    it('should only return direct children', async () => {
      const fs = createFs();
      await fs.writeFile!('/dir/sub/deep.txt', encodeText(''));
      const entries = await fs.readDirectory('/dir');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('sub');
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      const fs = createFs();
      await fs.mkdir!('/newdir');
      const s = await fs.stat('/newdir');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should be idempotent', async () => {
      const fs = createFs();
      await fs.mkdir!('/dir');
      await fs.mkdir!('/dir'); // no throw
      expect((await fs.stat('/dir')).type).toBe(FileType.Directory);
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      const fs = createFs();
      await fs.writeFile!('/f.txt', encodeText(''));
      await fs.delete!('/f.txt');
      await expect(fs.stat('/f.txt')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should delete directory recursively', async () => {
      const fs = createFs();
      await fs.writeFile!('/dir/a.txt', encodeText(''));
      await fs.delete!('/dir', { recursive: true });
      await expect(fs.stat('/dir')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should throw on non-empty dir without recursive', async () => {
      const fs = createFs();
      await fs.writeFile!('/dir/a.txt', encodeText(''));
      await expect(fs.delete!('/dir')).rejects.toThrow();
    });
  });

  describe('rename', () => {
    it('should rename a file', async () => {
      const fs = createFs();
      await fs.writeFile!('/old.txt', encodeText('data'));
      await fs.rename!('/old.txt', '/new.txt');
      expect(decodeText(await fs.readFile('/new.txt'))).toBe('data');
      await expect(fs.stat('/old.txt')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should rename a directory with children', async () => {
      const fs = createFs();
      await fs.writeFile!('/dir/a.txt', encodeText(''));
      await fs.rename!('/dir', '/renamed');
      expect((await fs.stat('/renamed')).type).toBe(FileType.Directory);
      expect((await fs.readDirectory('/renamed'))[0].name).toBe('a.txt');
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      const fs = createFs();
      await fs.writeFile!('/src.txt', encodeText('content'));
      await fs.copy!('/src.txt', '/dst.txt');
      expect(decodeText(await fs.readFile('/dst.txt'))).toBe('content');
      // Source still exists
      expect(decodeText(await fs.readFile('/src.txt'))).toBe('content');
    });

    it('should deep-copy a directory', async () => {
      const fs = createFs();
      await fs.writeFile!('/dir/a.txt', encodeText('aaa'));
      await fs.copy!('/dir', '/copy');
      expect(decodeText(await fs.readFile('/copy/a.txt'))).toBe('aaa');
    });
  });

  describe('events', () => {
    it('should fire Created event on writeFile', async () => {
      const fs = createFs();
      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.writeFile!('/f.txt', encodeText(''));
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Created, path: '/f.txt' },
      ]);
    });

    it('should fire Changed event on overwrite', async () => {
      const fs = createFs();
      await fs.writeFile!('/f.txt', encodeText('v1'));
      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.writeFile!('/f.txt', encodeText('v2'), { overwrite: true });
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Changed, path: '/f.txt' },
      ]);
    });

    it('should fire Deleted event', async () => {
      const fs = createFs();
      await fs.writeFile!('/f.txt', encodeText(''));
      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.delete!('/f.txt');
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Deleted, path: '/f.txt' },
      ]);
    });

    it('should stop receiving events after dispose', async () => {
      const fs = createFs();
      const listener = vi.fn();
      const sub = fs.onDidChangeFile(listener);
      sub.dispose();

      await fs.writeFile!('/f.txt', encodeText(''));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
