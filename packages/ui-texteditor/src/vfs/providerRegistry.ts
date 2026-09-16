import type { FileSystemProvider } from '@hestia/core';
import { MemoryFS, GitHubFS, WritableGitHubFS, BrowserFS, RemoteFS } from '@hestia/core';

/* ── Types ── */

export interface VfsProviderConfigField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'password';
  placeholder?: string;
  defaultValue?: string;
}

export interface VfsProviderDef {
  type: string;
  label: string;
  description?: string;
  configFields?: VfsProviderConfigField[];
  /** If true, the factory receives no config — mount manager calls asyncFactory instead */
  needsUserGesture?: boolean;
  factory: (config: Record<string, string>) => FileSystemProvider;
  /** Async factory for providers requiring user interaction (e.g. directory picker) */
  asyncFactory?: () => Promise<FileSystemProvider>;
}

/* ── Built-in provider definitions ── */

export const memoryFsProvider: VfsProviderDef = {
  type: 'memory',
  label: 'MemoryFS',
  description: 'In-memory filesystem (read/write, ephemeral)',
  factory: () => new MemoryFS(),
};

export const githubFsProvider: VfsProviderDef = {
  type: 'github',
  label: 'GitHubFS',
  description: 'GitHub repository via API (read/write with token)',
  configFields: [
    { name: 'owner', label: 'Owner', required: true, placeholder: 'e.g. facebook' },
    { name: 'repo', label: 'Repository', required: true, placeholder: 'e.g. react' },
    { name: 'ref', label: 'Branch / Tag', placeholder: 'main', defaultValue: 'main' },
    { name: 'token', label: 'Token (optional)', type: 'password', placeholder: 'ghp_...' },
  ],
  factory: (config) =>
    new GitHubFS({
      owner: config.owner,
      repo: config.repo,
      ref: config.ref || 'main',
      token: config.token || undefined,
    }),
};

export const writableGithubFsProvider: VfsProviderDef = {
  type: 'github-writable',
  label: 'GitHub (writable)',
  description:
    'GitHub repository with batched commits — changes staged locally, committed on demand',
  configFields: [
    { name: 'owner', label: 'Owner', required: true, placeholder: 'e.g. myorg' },
    { name: 'repo', label: 'Repository', required: true, placeholder: 'e.g. myrepo' },
    { name: 'ref', label: 'Branch', placeholder: 'main', defaultValue: 'main' },
    { name: 'token', label: 'Token', type: 'password', required: true, placeholder: 'ghp_...' },
  ],
  factory: (config) =>
    new WritableGitHubFS({
      owner: config.owner,
      repo: config.repo,
      ref: config.ref || 'main',
      token: config.token,
    }),
};

export const browserFsProvider: VfsProviderDef = {
  type: 'browser',
  label: 'Local Directory',
  description: 'Local filesystem via File System Access API (Chromium only)',
  needsUserGesture: true,
  factory: () => {
    throw new Error('BrowserFS requires asyncFactory — use showDirectoryPicker()');
  },
  asyncFactory: async () => {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return new BrowserFS({ handle });
  },
};

export const remoteFsProvider: VfsProviderDef = {
  type: 'remote',
  label: 'Remote Server',
  description: 'Server-side filesystem via REST API',
  configFields: [
    {
      name: 'baseUrl',
      label: 'Base URL',
      required: true,
      placeholder: '/api/vfs',
      defaultValue: '/api/vfs',
    },
    { name: 'token', label: 'Auth Token', type: 'password', placeholder: 'Bearer token' },
  ],
  factory: (config) =>
    new RemoteFS({
      baseUrl: config.baseUrl || '/api/vfs',
      token: config.token || undefined,
    }),
};

/** Check if File System Access API is available in the current browser */
export function isBrowserFSSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export const defaultProviderRegistry: VfsProviderDef[] = [
  memoryFsProvider,
  githubFsProvider,
  writableGithubFsProvider,
  ...(isBrowserFSSupported() ? [browserFsProvider] : []),
];
