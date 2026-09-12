import {
  memoryFsProvider,
  githubFsProvider,
  writableGithubFsProvider,
  remoteFsProvider,
  browserFsProvider,
  isBrowserFSSupported,
  defaultProviderRegistry,
} from './providerRegistry';
import { MemoryFS, GitHubFS, WritableGitHubFS, RemoteFS } from '@hestia/core';

describe('providerRegistry', () => {
  it('memoryFsProvider builds a MemoryFS', () => {
    expect(memoryFsProvider.type).toBe('memory');
    expect(memoryFsProvider.factory({})).toBeInstanceOf(MemoryFS);
  });

  it('githubFsProvider builds a GitHubFS and declares its config fields', () => {
    const fs = githubFsProvider.factory({ owner: 'o', repo: 'r', ref: '', token: '' });
    expect(fs).toBeInstanceOf(GitHubFS);
    const names = githubFsProvider.configFields!.map((f) => f.name);
    expect(names).toEqual(['owner', 'repo', 'ref', 'token']);
  });

  it('writableGithubFsProvider builds a WritableGitHubFS', () => {
    const fs = writableGithubFsProvider.factory({ owner: 'o', repo: 'r', ref: 'main', token: 't' });
    expect(fs).toBeInstanceOf(WritableGitHubFS);
  });

  it('remoteFsProvider builds a RemoteFS, defaulting baseUrl', () => {
    expect(remoteFsProvider.factory({ baseUrl: '', token: '' })).toBeInstanceOf(RemoteFS);
  });

  it('browserFsProvider requires an async factory (sync factory throws)', () => {
    expect(browserFsProvider.needsUserGesture).toBe(true);
    expect(() => browserFsProvider.factory({})).toThrow(/asyncFactory/);
  });

  it('isBrowserFSSupported is false in jsdom (no showDirectoryPicker)', () => {
    expect(isBrowserFSSupported()).toBe(false);
  });

  it('defaultProviderRegistry omits the browser provider when unsupported', () => {
    expect(defaultProviderRegistry.map((p) => p.type)).toEqual([
      'memory',
      'github',
      'github-writable',
    ]);
  });
});
