import { GitHubFS } from './GitHubFS';
import type { GitHubFSOptions } from './GitHubFS';
import { FileChangeType, FileType } from './types';
import type { WriteFileOptions, DeleteOptions, FileStat, DirectoryEntry } from './types';
import { normalize } from './paths';
import { VfsError } from './errors';
import { uint8ArrayToBase64 } from './utils';

/**
 * WritableGitHubFS — GitHub VFS with batched commits.
 *
 * Unlike GitHubFS (which commits on every writeFile), this provider
 * buffers all writes and deletes locally. Call commit() to push all
 * pending changes as a single Git commit via the Git Trees API.
 *
 * Requires a token with `contents: write` permission.
 */
export class WritableGitHubFS extends GitHubFS {
  override readonly scheme = 'github-writable';

  // path → content (null = pending delete)
  private readonly pending = new Map<string, Uint8Array | null>();

  constructor(options: GitHubFSOptions) {
    super(options);
  }

  hasPendingChanges(): boolean {
    return this.pending.size > 0;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /** Returns all staged changes. content === null means deletion. */
  getPendingEntries(): Array<{ path: string; content: Uint8Array | null }> {
    return Array.from(this.pending.entries()).map(([path, content]) => ({ path, content }));
  }

  /** Fetches the current GitHub content for a path (bypasses pending buffer). Returns null for new files. */
  async getBaseContent(path: string): Promise<Uint8Array | null> {
    try {
      return await super.readFile(path);
    } catch {
      return null;
    }
  }

  discardPending(): void {
    this.pending.clear();
    this.clearCache();
  }

  // ── Overrides: buffer instead of immediate commit ────────────────────────

  override async writeFile(path: string, content: Uint8Array, _options?: WriteFileOptions): Promise<void> {
    if (!this.token) throw VfsError.noPermissions(normalize(path));
    const p = normalize(path);
    this.pending.set(p, content);
    this.emitter.fire([{ type: FileChangeType.Changed, path: p }]);
  }

  override async delete(path: string, _options?: DeleteOptions): Promise<void> {
    if (!this.token) throw VfsError.noPermissions(normalize(path));
    const p = normalize(path);
    this.pending.set(p, null);
    this.emitter.fire([{ type: FileChangeType.Deleted, path: p }]);
  }

  override async readFile(path: string): Promise<Uint8Array> {
    const p = normalize(path);
    if (this.pending.has(p)) {
      const content = this.pending.get(p)!;
      if (content === null) throw VfsError.fileNotFound(p);
      return content;
    }
    return super.readFile(path);
  }

  override async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const p = normalize(path);

    let baseEntries: DirectoryEntry[] = [];
    try {
      baseEntries = await super.readDirectory(path);
    } catch {
      // directory may not exist on GitHub yet
    }

    const entries = new Map(baseEntries.map(e => [e.name, e]));

    for (const [pendingPath, content] of this.pending) {
      const pp = normalize(pendingPath);
      const parentIdx = pp.lastIndexOf('/');
      const parentPath = parentIdx <= 0 ? '/' : pp.slice(0, parentIdx);
      if (parentPath !== p) continue;
      const name = pp.slice(parentIdx + 1);
      if (content === null) {
        entries.delete(name);
      } else {
        entries.set(name, { name, type: FileType.File });
      }
    }

    return Array.from(entries.values());
  }

  override async stat(path: string): Promise<FileStat> {
    const p = normalize(path);
    if (this.pending.has(p)) {
      const content = this.pending.get(p)!;
      if (content === null) throw VfsError.fileNotFound(p);
      return { type: FileType.File, size: content.byteLength, ctime: 0, mtime: Date.now() };
    }
    return super.stat(path);
  }

  // ── Commit: batch all pending changes as a single Git commit ─────────────

  /**
   * Commit all pending changes to GitHub as a single commit.
   *
   * @param message Commit message. Defaults to current date/time: "2026-03-18 14:30".
   */
  async commit(message?: string): Promise<void> {
    if (!this.token) throw new Error('Token required for commit');
    if (this.pending.size === 0) return;

    const msg = message ?? formatDate(new Date());

    // 1. Get HEAD commit SHA for the branch
    const refRes = await this.request(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/${this.ref}`,
    );
    if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status} ${await refRes.text()}`);
    const refData = await refRes.json() as { object: { sha: string } };
    const headCommitSha = refData.object.sha;

    // 2. Get base tree SHA from HEAD commit
    const commitRes = await this.request(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/commits/${headCommitSha}`,
    );
    if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
    const commitData = await commitRes.json() as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for modified files and build tree entries
    const treeEntries: Array<{ path: string; mode: string; type: string; sha?: string | null }> = [];

    for (const [filePath, content] of this.pending) {
      const apiPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

      if (content === null) {
        // Delete: entry with sha null removes the file from the tree
        treeEntries.push({ path: apiPath, mode: '100644', type: 'blob', sha: null });
      } else {
        // Create/update: upload blob first
        const blobRes = await this.request(
          `https://api.github.com/repos/${this.owner}/${this.repo}/git/blobs`,
          'POST',
          { content: uint8ArrayToBase64(content), encoding: 'base64' },
        );
        if (!blobRes.ok) throw new Error(`Failed to create blob for ${apiPath}: ${blobRes.status}`);
        const blobData = await blobRes.json() as { sha: string };
        treeEntries.push({ path: apiPath, mode: '100644', type: 'blob', sha: blobData.sha });
      }
    }

    // 4. Create new tree based on base tree + changes
    const treeRes = await this.request(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees`,
      'POST',
      { base_tree: baseTreeSha, tree: treeEntries },
    );
    if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status} ${await treeRes.text()}`);
    const treeData = await treeRes.json() as { sha: string };

    // 5. Create commit
    const newCommitRes = await this.request(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/commits`,
      'POST',
      { message: msg, tree: treeData.sha, parents: [headCommitSha] },
    );
    if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status} ${await newCommitRes.text()}`);
    const newCommitData = await newCommitRes.json() as { sha: string };

    // 6. Update branch ref to new commit
    const updateRes = await this.request(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/${this.ref}`,
      'PATCH',
      { sha: newCommitData.sha },
    );
    if (!updateRes.ok) throw new Error(`Failed to update ref: ${updateRes.status} ${await updateRes.text()}`);

    // Clear buffer and refresh cache
    this.pending.clear();
    this.clearCache();
    this.emitter.fire([{ type: FileChangeType.Changed, path: '/' }]);
  }
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
