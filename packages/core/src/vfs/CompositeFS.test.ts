import { describe, it, expect, vi } from 'vitest';
import { CompositeFS } from './CompositeFS';
import { MemoryFS } from './MemoryFS';
import { FileType, FileChangeType } from './types';
import { VfsErrorCode } from './errors';
import { encodeText, decodeText } from './utils';

function setup() {
  const composite = new CompositeFS();
  const mem1 = new MemoryFS();
  const mem2 = new MemoryFS();
  composite.mount('/mem1', mem1);
  composite.mount('/mem2', mem2);
  return { composite, mem1, mem2 };
}

describe('CompositeFS', () => {
  it('should have scheme "composite"', () => {
    expect(new CompositeFS().scheme).toBe('composite');
  });

  describe('mount / unmount', () => {
    it('should list mount points at root', async () => {
      const { composite } = setup();
      const entries = await composite.readDirectory('/');
      expect(entries).toEqual(expect.arrayContaining([
        { name: 'mem1', type: FileType.Directory },
        { name: 'mem2', type: FileType.Directory },
      ]));
    });

    it('should unmount', () => {
      const { composite } = setup();
      composite.unmount('/mem1');
      expect(composite.getMounts()).toHaveLength(1);
    });

    it('should dispose via returned disposable', () => {
      const composite = new CompositeFS();
      const disposable = composite.mount('/test', new MemoryFS());
      expect(composite.getMounts()).toHaveLength(1);
      disposable.dispose();
      expect(composite.getMounts()).toHaveLength(0);
    });

    it('should prevent duplicate mounts', () => {
      const composite = new CompositeFS();
      composite.mount('/test', new MemoryFS());
      expect(() => composite.mount('/test', new MemoryFS())).toThrow();
    });
  });

  describe('read operations', () => {
    it('should stat root as directory', async () => {
      const { composite } = setup();
      const s = await composite.stat('/');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should stat mount point as directory', async () => {
      const { composite } = setup();
      const s = await composite.stat('/mem1');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should read file through mount', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/hello.txt', encodeText('world'));
      const data = await composite.readFile('/mem1/hello.txt');
      expect(decodeText(data)).toBe('world');
    });

    it('should read directory through mount', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/a.txt', encodeText(''));
      const entries = await composite.readDirectory('/mem1');
      expect(entries).toEqual([{ name: 'a.txt', type: FileType.File }]);
    });

    it('should throw FileNotFound for unknown mount', async () => {
      const { composite } = setup();
      await expect(composite.readFile('/unknown/file.txt'))
        .rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('write operations', () => {
    it('should write file through mount', async () => {
      const { composite } = setup();
      await composite.writeFile!('/mem1/new.txt', encodeText('data'));
      const data = await composite.readFile('/mem1/new.txt');
      expect(decodeText(data)).toBe('data');
    });

    it('should mkdir through mount', async () => {
      const { composite } = setup();
      await composite.mkdir!('/mem1/subdir');
      const s = await composite.stat('/mem1/subdir');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should delete through mount', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/del.txt', encodeText(''));
      await composite.delete!('/mem1/del.txt');
      await expect(composite.stat('/mem1/del.txt'))
        .rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should rename within same mount', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/old.txt', encodeText('data'));
      await composite.rename!('/mem1/old.txt', '/mem1/new.txt');
      expect(decodeText(await composite.readFile('/mem1/new.txt'))).toBe('data');
    });

    it('should reject rename across mounts', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/f.txt', encodeText(''));
      await expect(composite.rename!('/mem1/f.txt', '/mem2/f.txt'))
        .rejects.toThrow('Cannot rename across mount points');
    });
  });

  describe('copy', () => {
    it('should copy within same mount', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/src.txt', encodeText('content'));
      await composite.copy!('/mem1/src.txt', '/mem1/dst.txt');
      expect(decodeText(await composite.readFile('/mem1/dst.txt'))).toBe('content');
    });

    it('should cross-mount copy (read from one, write to another)', async () => {
      const { composite, mem1 } = setup();
      await mem1.writeFile!('/src.txt', encodeText('cross'));
      await composite.copy!('/mem1/src.txt', '/mem2/dst.txt');
      expect(decodeText(await composite.readFile('/mem2/dst.txt'))).toBe('cross');
    });
  });

  describe('events', () => {
    it('should propagate events with mount prefix', async () => {
      const { composite, mem1 } = setup();
      const listener = vi.fn();
      composite.onDidChangeFile(listener);

      await mem1.writeFile!('/f.txt', encodeText(''));
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Created, path: '/mem1/f.txt' },
      ]);
    });

    it('should stop propagating after unmount', async () => {
      const { composite, mem1 } = setup();
      const listener = vi.fn();
      composite.onDidChangeFile(listener);

      composite.unmount('/mem1');
      await mem1.writeFile!('/f.txt', encodeText(''));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
