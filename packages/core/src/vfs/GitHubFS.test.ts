import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubFS } from './GitHubFS';
import { FileType, FileChangeType } from './types';
import { VfsErrorCode } from './errors';
import { encodeText } from './utils';

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.split('?')[0]}`;

    // Try exact match first, then prefix match
    const entry = responses[key] ?? Object.entries(responses).find(([k]) => key.startsWith(k))?.[1];

    if (!entry) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}), text: async () => '' } as Response;
    }

    return {
      ok: entry.status >= 200 && entry.status < 300,
      status: entry.status,
      statusText: entry.status === 200 ? 'OK' : 'Error',
      json: async () => entry.body,
      text: async () => JSON.stringify(entry.body),
    } as Response;
  });
}

describe('GitHubFS', () => {
  describe('capabilities', () => {
    it('should be readonly without token', () => {
      const fs = new GitHubFS({ owner: 'user', repo: 'repo' });
      expect(fs.capabilities.readonly).toBe(true);
    });

    it('should be writable with token', () => {
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', token: 'ghp_test' });
      expect(fs.capabilities.readonly).toBe(false);
    });
  });

  describe('read operations', () => {
    it('should stat root as directory', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/': {
          status: 200,
          body: [{ name: 'README.md', path: 'README.md', sha: 'abc', size: 10, type: 'file' }],
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      const s = await fs.stat('/');
      expect(s.type).toBe(FileType.Directory);
    });

    it('should stat a file', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/README.md': {
          status: 200,
          body: { name: 'README.md', path: 'README.md', sha: 'abc', size: 42, type: 'file' },
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      const s = await fs.stat('/README.md');
      expect(s.type).toBe(FileType.File);
      expect(s.size).toBe(42);
    });

    it('should read directory entries', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/src': {
          status: 200,
          body: [
            { name: 'index.ts', path: 'src/index.ts', sha: 'a', size: 100, type: 'file' },
            { name: 'utils', path: 'src/utils', sha: 'b', size: 0, type: 'dir' },
          ],
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      const entries = await fs.readDirectory('/src');
      expect(entries).toEqual([
        { name: 'index.ts', type: FileType.File },
        { name: 'utils', type: FileType.Directory },
      ]);
    });

    it('should read file content (base64)', async () => {
      const content = btoa('hello world');
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/file.txt': {
          status: 200,
          body: { name: 'file.txt', path: 'file.txt', sha: 'abc', size: 11, type: 'file', content, encoding: 'base64' },
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      const data = await fs.readFile('/file.txt');
      expect(new TextDecoder().decode(data)).toBe('hello world');
    });

    it('should throw FileNotFound for 404', async () => {
      const fetch = mockFetch({});
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      await expect(fs.stat('/missing')).rejects.toMatchObject({ code: VfsErrorCode.FileNotFound });
    });

    it('should use cache within TTL', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/': {
          status: 200,
          body: [{ name: 'a.txt', path: 'a.txt', sha: 'x', size: 1, type: 'file' }],
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });
      await fs.stat('/');
      await fs.stat('/');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('write operations', () => {
    it('should create a new file via Contents API', async () => {
      const fetch = mockFetch({
        // First GET returns 404 (file doesn't exist)
        'GET https://api.github.com/repos/user/repo/contents/new.txt': { status: 404, body: {} },
        // PUT creates the file
        'PUT https://api.github.com/repos/user/repo/contents/new.txt': {
          status: 201,
          body: { content: { sha: 'new-sha' } },
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', token: 'ghp_test', fetch });

      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.writeFile!('/new.txt', encodeText('hello'));

      // Verify PUT was called with correct body
      const putCall = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!;
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.message).toBe('Create new.txt');
      expect(body.branch).toBe('main');
      expect(body.sha).toBeUndefined(); // new file, no SHA

      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Created, path: '/new.txt' },
      ]);
    });

    it('should update an existing file with SHA', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/existing.txt': {
          status: 200,
          body: { name: 'existing.txt', sha: 'old-sha', size: 5, type: 'file', content: btoa('old'), encoding: 'base64' },
        },
        'PUT https://api.github.com/repos/user/repo/contents/existing.txt': {
          status: 200,
          body: { content: { sha: 'new-sha' } },
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', token: 'ghp_test', fetch });

      await fs.writeFile!('/existing.txt', encodeText('new content'), { overwrite: true });

      const putCall = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!;
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.sha).toBe('old-sha');
      expect(body.message).toBe('Update existing.txt');
    });

    it('should throw FileExists when overwrite is false', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/exists.txt': {
          status: 200,
          body: { name: 'exists.txt', sha: 'sha', size: 5, type: 'file', content: btoa('x'), encoding: 'base64' },
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', token: 'ghp_test', fetch });

      await expect(fs.writeFile!('/exists.txt', encodeText(''), { overwrite: false }))
        .rejects.toMatchObject({ code: VfsErrorCode.FileExists });
    });

    it('should throw NoPermissions without token', async () => {
      const fs = new GitHubFS({ owner: 'user', repo: 'repo' });
      await expect(fs.writeFile!('/f.txt', encodeText('')))
        .rejects.toMatchObject({ code: VfsErrorCode.NoPermissions });
    });
  });

  describe('delete', () => {
    it('should delete a file via Contents API', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/del.txt': {
          status: 200,
          body: { name: 'del.txt', sha: 'file-sha', size: 5, type: 'file' },
        },
        'DELETE https://api.github.com/repos/user/repo/contents/del.txt': {
          status: 200,
          body: {},
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', token: 'ghp_test', fetch });

      const listener = vi.fn();
      fs.onDidChangeFile(listener);

      await fs.delete!('/del.txt');

      const delCall = fetch.mock.calls.find(c => c[1]?.method === 'DELETE')!;
      const body = JSON.parse(delCall[1]!.body as string);
      expect(body.sha).toBe('file-sha');

      expect(listener).toHaveBeenCalledWith([
        { type: FileChangeType.Deleted, path: '/del.txt' },
      ]);
    });

    it('should throw NoPermissions without token', async () => {
      const fs = new GitHubFS({ owner: 'user', repo: 'repo' });
      await expect(fs.delete!('/f.txt'))
        .rejects.toMatchObject({ code: VfsErrorCode.NoPermissions });
    });
  });

  describe('clearCache', () => {
    it('should invalidate all cached data', async () => {
      const fetch = mockFetch({
        'GET https://api.github.com/repos/user/repo/contents/': {
          status: 200,
          body: [],
        },
      });
      const fs = new GitHubFS({ owner: 'user', repo: 'repo', fetch });

      await fs.readDirectory('/');
      fs.clearCache();
      await fs.readDirectory('/');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
