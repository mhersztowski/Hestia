import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteFS } from './RemoteFS';
import { FileType, FileChangeType } from './types';
import { VfsErrorCode } from './errors';
import { encodeText } from './utils';

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const result = handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    } as Response;
  });
}

describe('RemoteFS', () => {
  it('should have scheme "remote"', () => {
    const fs = new RemoteFS({ baseUrl: '/api/vfs' });
    expect(fs.scheme).toBe('remote');
  });

  it('should default capabilities to writable, no watch', () => {
    const fs = new RemoteFS({ baseUrl: '/api/vfs' });
    expect(fs.capabilities.readonly).toBe(false);
    expect(fs.capabilities.watch).toBe(false);
  });

  describe('stat', () => {
    it('should call GET /stat with path param', async () => {
      const fetch = mockFetch((url) => {
        expect(url).toContain('/api/vfs/stat');
        expect(url).toContain('path=%2Fhello.txt');
        return { status: 200, body: { type: FileType.File, size: 42, ctime: 100, mtime: 200 } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      const stat = await fs.stat('/hello.txt');
      expect(stat.type).toBe(FileType.File);
      expect(stat.size).toBe(42);
    });

    it('should throw VfsError on 404', async () => {
      const fetch = mockFetch(() => ({
        status: 404,
        body: { error: 'File not found: /missing', code: 'FileNotFound', path: '/missing' },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await expect(fs.stat('/missing')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });
  });

  describe('readDirectory', () => {
    it('should return entries from GET /readdir', async () => {
      const fetch = mockFetch(() => ({
        status: 200,
        body: {
          entries: [
            { name: 'a.txt', type: FileType.File },
            { name: 'dir', type: FileType.Directory },
          ],
        },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      const entries = await fs.readDirectory('/');
      expect(entries).toEqual([
        { name: 'a.txt', type: FileType.File },
        { name: 'dir', type: FileType.Directory },
      ]);
    });
  });

  describe('readFile', () => {
    it('should decode base64 content from GET /readFile', async () => {
      const content = btoa('hello world');
      const fetch = mockFetch(() => ({
        status: 200,
        body: { data: content },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      const data = await fs.readFile('/file.txt');
      expect(new TextDecoder().decode(data)).toBe('hello world');
    });
  });

  describe('writeFile', () => {
    it('should POST base64 content to /writeFile', async () => {
      const fetch = mockFetch((url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          expect(body.data).toBe(btoa('new content'));
          return { status: 200, body: { ok: true } };
        }
        return { status: 200, body: {} };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });

      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.writeFile!('/new.txt', encodeText('new content'));

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Changed, path: '/new.txt' },
      ]);
    });

    it('should pass options through', async () => {
      const fetch = mockFetch((_url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          expect(body.options).toEqual({ create: true, overwrite: false });
        }
        return { status: 200, body: { ok: true } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await fs.writeFile!('/f.txt', encodeText(''), { create: true, overwrite: false });
    });
  });

  describe('delete', () => {
    it('should POST to /delete with path', async () => {
      const fetch = mockFetch((url) => {
        expect(url).toContain('/api/vfs/delete');
        expect(url).toContain('path=%2Fbye.txt');
        return { status: 200, body: { ok: true } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });

      const listener = vi.fn();
      fs.onDidChangeFile(listener);
      await fs.delete!('/bye.txt');

      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Deleted, path: '/bye.txt' },
      ]);
    });
  });

  describe('rename', () => {
    it('should POST oldPath and newPath to /rename', async () => {
      const fetch = mockFetch((_url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          expect(body.oldPath).toBe('/old.txt');
          expect(body.newPath).toBe('/new.txt');
        }
        return { status: 200, body: { ok: true } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });

      const listener = vi.fn();
      fs.onDidChangeFile(listener);
      await fs.rename!('/old.txt', '/new.txt');

      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Deleted, path: '/old.txt' },
        { type: FileChangeType.Created, path: '/new.txt' },
      ]);
    });
  });

  describe('mkdir', () => {
    it('should POST to /mkdir with path', async () => {
      const fetch = mockFetch((url) => {
        expect(url).toContain('/api/vfs/mkdir');
        expect(url).toContain('path=%2Fnewdir');
        return { status: 200, body: { ok: true } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await fs.mkdir!('/newdir');
    });
  });

  describe('copy', () => {
    it('should POST source and destination to /copy', async () => {
      const fetch = mockFetch((_url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          expect(body.source).toBe('/src.txt');
          expect(body.destination).toBe('/dst.txt');
        }
        return { status: 200, body: { ok: true } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await fs.copy!('/src.txt', '/dst.txt');
    });
  });

  describe('fetchCapabilities', () => {
    it('should fetch and cache capabilities', async () => {
      const fetch = mockFetch(() => ({
        status: 200,
        body: { readonly: true, watch: false },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      const caps = await fs.fetchCapabilities();
      expect(caps.readonly).toBe(true);
      expect(fs.capabilities.readonly).toBe(true);
    });
  });

  describe('auth', () => {
    it('should send Authorization header when token is set', async () => {
      const fetch = mockFetch((_url, init) => {
        expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token');
        return { status: 200, body: { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', token: 'my-token', fetch });
      await fs.stat('/');
    });

    it('should not send Authorization header without token', async () => {
      const fetch = mockFetch((_url, init) => {
        expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined();
        return { status: 200, body: { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await fs.stat('/');
    });

    it('should update token via setToken', async () => {
      let callCount = 0;
      const fetch = mockFetch((_url, init) => {
        callCount++;
        if (callCount === 2) {
          expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer new-token');
        }
        return { status: 200, body: { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 } };
      });
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await fs.stat('/');
      fs.setToken('new-token');
      await fs.stat('/');
    });
  });

  describe('error handling', () => {
    it('should map 403 to NoPermissions', async () => {
      const fetch = mockFetch(() => ({
        status: 403,
        body: { error: 'Forbidden' },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await expect(fs.stat('/')).rejects.toMatchObject({ code: VfsErrorCode.NoPermissions });
    });

    it('should map 409 to FileExists', async () => {
      const fetch = mockFetch(() => ({
        status: 409,
        body: { error: 'File exists', code: 'FileExists', path: '/f.txt' },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await expect(fs.writeFile!('/f.txt', encodeText(''))).rejects.toMatchObject({
        code: VfsErrorCode.FileExists,
      });
    });

    it('should use server error code when available', async () => {
      const fetch = mockFetch(() => ({
        status: 400,
        body: { error: 'Is a directory', code: 'FileIsADirectory', path: '/dir' },
      }));
      const fs = new RemoteFS({ baseUrl: '/api/vfs', fetch });
      await expect(fs.readFile('/dir')).rejects.toMatchObject({
        code: VfsErrorCode.FileIsADirectory,
      });
    });
  });
});
