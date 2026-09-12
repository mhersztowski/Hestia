/**
 * GitRepoService — a thin wrapper around the `git` CLI (via child_process) for
 * directories that are repository clones. No external dependencies: it uses the
 * `git` installed on the machine (the server). It operates on a working tree
 * containing `.git`.
 *
 * The `.repo.json` model (RepoJson) describes a clone living in the SAME
 * directory as the `.repo.json` file — it stores the remote URL, the current
 * branch/tag and (optionally) an HTTPS token. Operations (tags/branches/
 * checkout/pull/push/clone) run in the directory of the `.repo.json` file.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const pExecFile = promisify(execFile);

/** The contents of a `.repo.json` file. */
export interface RepoJson {
  /** Type discriminator — tells it apart from other *.json files. */
  type: 'git-repo';
  version: number;
  /** URL of the remote repository (origin). */
  url: string;
  /** The currently selected branch (when on a branch). */
  branch?: string;
  /** The currently selected tag (when HEAD points at a tag / is detached). */
  tag?: string;
  /** Name of the remote (`origin` by default). */
  remote?: string;
  /** Optional token (PAT) for HTTPS push/pull — injected into the URL for the
   *  duration of an operation.
   *  Note: stored in plain text in the file; use it only in private storage. For
   *  SSH leave it empty and rely on the server's SSH keys.
   *  Prefer `tokenSecretKey` — the value is then kept encrypted by the host's
   *  secrets store. */
  token?: string;
  /** Key of a secret in the host's secrets store (namespace `git`) instead of
   *  writing the token out in plain text. When set, the backend resolves the
   *  token at run time. */
  tokenSecretKey?: string;
  /** Timestamp of the last synchronisation (pull/push/clone), ms. */
  lastSync?: number;
}

export interface GitRef {
  /** The current branch, or null on a detached HEAD. */
  branch: string | null;
  /** The tag pointing at HEAD (if there is one). */
  tag: string | null;
  /** Abbreviated HEAD hash. */
  commit: string;
}

export interface GitStatus extends GitRef {
  /** Commits ahead of the remote (to push). */
  ahead: number;
  /** Commits behind the remote (to pull). */
  behind: number;
  /** Whether the working tree has uncommitted changes. */
  dirty: boolean;
}

export interface GitInfo {
  isRepo: boolean;
  url: string | null;
  branches: string[];
  /** Remote branches (without the `remotes/origin/` prefix). */
  remoteBranches: string[];
  tags: string[];
  status: GitStatus | null;
}

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class GitRepoService {
  /** Default time limit for a single git command. */
  private readonly timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Runs `git` in the given directory. Throws with the combined stderr on error.
   *  Always disables credential helpers and interactive prompts — on the server
   *  we rely solely on tokens injected into the URL. */
  private async git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    // -c credential.helper= overrides any global/system helper → git does not
    // ask for a password when the URL carries no credentials (fail fast instead
    // of hanging or falling back).
    const gitArgs = ['-c', 'credential.helper=', ...args];
    const fullEnv: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...env,
    };
    try {
      const { stdout } = await pExecFile('git', gitArgs, {
        cwd,
        timeout: this.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: fullEnv,
      });
      return stdout;
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = (err.stderr || err.stdout || err.message || 'git error').toString().trim();
      throw new Error(msg);
    }
  }

  /** Whether the directory is a git repository OF ITS OWN (toplevel == dir).
   *  The directory must have its own `.git` — merely lying inside a parent
   *  repository's tree (e.g. a data directory inside the monorepo) does NOT make
   *  it a clone; otherwise pull/push would hit the parent repository. */
  async isRepo(dir: string): Promise<boolean> {
    if (!fs.existsSync(dir)) return false;
    // `.git` (a directory, or a file for worktrees/submodules) must be right here.
    if (!fs.existsSync(path.join(dir, '.git'))) return false;
    try {
      const top = (await this.git(dir, ['rev-parse', '--show-toplevel'])).trim();
      return path.resolve(top) === path.resolve(dir);
    } catch {
      return false;
    }
  }

  /** Sets the remote's URL (creates the remote if it does not exist). Works only
   *  when dir is a repository. */
  async setRemoteUrl(dir: string, url: string, remote = 'origin'): Promise<void> {
    const existing = await this.remoteUrl(dir, remote);
    if (existing) await this.git(dir, ['remote', 'set-url', remote, url]);
    else await this.git(dir, ['remote', 'add', remote, url]);
  }

  /** URL of the remote (origin or the given one), null if there is none. */
  async remoteUrl(dir: string, remote = 'origin'): Promise<string | null> {
    try {
      const out = await this.git(dir, ['remote', 'get-url', remote]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /** Local branches. */
  async listBranches(dir: string): Promise<string[]> {
    const out = await this.git(dir, ['branch', '--format=%(refname:short)']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /** Remote branches (without `origin/HEAD`), names without the remote prefix. */
  async listRemoteBranches(dir: string, remote = 'origin'): Promise<string[]> {
    try {
      const out = await this.git(dir, ['branch', '--remotes', '--format=%(refname:short)']);
      const prefix = `${remote}/`;
      return out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((b) => b.startsWith(prefix) && !b.endsWith('/HEAD'))
        .map((b) => b.slice(prefix.length));
    } catch {
      return [];
    }
  }

  /** Tags (sorted by version, descending). */
  async listTags(dir: string): Promise<string[]> {
    const out = await this.git(dir, ['tag', '--sort=-v:refname']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /** The current ref: branch (or null when detached), the tag at HEAD, commit.
   *  Copes with an UNBORN HEAD (a repository with no commits, e.g. a fresh
   *  `git init` or an interrupted clone) — `rev-parse HEAD` fails there, so the
   *  branch name comes from `symbolic-ref` and the commit stays empty. */
  async currentRef(dir: string): Promise<GitRef> {
    let branch: string | null = null;
    try {
      const branchRaw = (await this.git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      branch = branchRaw === 'HEAD' ? null : branchRaw;
    } catch {
      // unborn HEAD — the branch has a name even without commits
      try { branch = (await this.git(dir, ['symbolic-ref', '--short', 'HEAD'])).trim() || null; } catch { branch = null; }
    }
    let commit = '';
    try { commit = (await this.git(dir, ['rev-parse', '--short', 'HEAD'])).trim(); } catch { commit = ''; }
    let tag: string | null = null;
    if (commit) {
      try { tag = (await this.git(dir, ['describe', '--tags', '--exact-match', 'HEAD'])).trim() || null; } catch { tag = null; }
    }
    return { branch, tag, commit };
  }

  /** Status: the current ref + ahead/behind relative to upstream + whether dirty. */
  async status(dir: string): Promise<GitStatus> {
    const ref = await this.currentRef(dir);
    let ahead = 0;
    let behind = 0;
    try {
      const counts = (await this.git(dir, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])).trim();
      const [b, a] = counts.split(/\s+/).map((n) => parseInt(n, 10) || 0);
      behind = b;
      ahead = a;
    } catch {
      // no upstream — leave 0/0
    }
    const dirtyOut = (await this.git(dir, ['status', '--porcelain'])).trim();
    return { ...ref, ahead, behind, dirty: dirtyOut.length > 0 };
  }

  /** The full picture of the repository in a directory (for display in a panel). */
  async info(dir: string): Promise<GitInfo> {
    if (!(await this.isRepo(dir))) {
      return { isRepo: false, url: null, branches: [], remoteBranches: [], tags: [], status: null };
    }
    const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
    const [url, branches, remoteBranches, tags, status] = await Promise.all([
      safe(this.remoteUrl(dir), null),
      safe(this.listBranches(dir), [] as string[]),
      safe(this.listRemoteBranches(dir), [] as string[]),
      safe(this.listTags(dir), [] as string[]),
      safe(this.status(dir), null),
    ]);
    return { isRepo: true, url, branches, remoteBranches, tags, status };
  }

  /** Checks out a branch or a tag. For a remote branch it creates a local tracking branch. */
  async checkout(dir: string, ref: string, opts: { type?: 'branch' | 'tag'; remote?: string } = {}): Promise<void> {
    const remote = opts.remote ?? 'origin';
    if (opts.type === 'branch') {
      const localBranches = await this.listBranches(dir);
      if (!localBranches.includes(ref)) {
        const remoteBranches = await this.listRemoteBranches(dir, remote);
        if (remoteBranches.includes(ref)) {
          // create a local branch tracking the remote one
          await this.git(dir, ['checkout', '-B', ref, '--track', `${remote}/${ref}`]);
          return;
        }
      }
    }
    await this.git(dir, ['checkout', ref]);
  }

  /** Builds a URL with the token injected (for HTTPS) — used for pull/push. */
  private urlWithToken(url: string, token?: string): string {
    if (!token) return url;
    if (!/^https?:\/\//i.test(url)) return url; // SSH/other — a token does not apply
    try {
      const u = new URL(url);
      // The PAT has to go in the password field: https://x-access-token:<TOKEN>@host/...
      // That is how GitHub, Gitea and most other HTTPS git hosts work.
      u.username = 'x-access-token';
      u.password = token;
      return u.toString();
    } catch {
      return url;
    }
  }

  /** Stage all changes + commit. */
  async commit(dir: string, message: string, opts: { authorName?: string; authorEmail?: string } = {}): Promise<GitCommandResult> {
    try {
      await this.git(dir, ['add', '-A']);
      // Fallback identity — the server (Docker) may have no global
      // user.name/email configured, and git commit would fail without them.
      const name = opts.authorName ?? 'Hestia';
      const email = opts.authorEmail ?? 'hestia@localhost';
      const out = await this.git(dir, ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-m', message]);
      return { ok: true, stdout: out, stderr: '' };
    } catch (e) {
      return { ok: false, stdout: '', stderr: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Pull (fast-forward when possible). The token is injected into the URL ad hoc. */
  async pull(dir: string, opts: { remote?: string; branch?: string; token?: string } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    return this.withToken(dir, remote, opts.token, async () => {
      const args = ['pull', '--ff', remote];
      if (opts.branch) args.push(opts.branch);
      const out = await this.git(dir, args);
      return out;
    });
  }

  /** Pushes the current branch (or the given one) to the remote. */
  async push(dir: string, opts: { remote?: string; branch?: string; token?: string; setUpstream?: boolean } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    return this.withToken(dir, remote, opts.token, async () => {
      const args = ['push'];
      if (opts.setUpstream) args.push('-u');
      args.push(remote);
      if (opts.branch) args.push(opts.branch);
      const out = await this.git(dir, args);
      return out;
    });
  }

  /** The remote's default branch (after a fetch): prefers main/master, otherwise the first one. */
  async defaultRemoteBranch(dir: string, remote = 'origin'): Promise<string | null> {
    const remotes = await this.listRemoteBranches(dir, remote);
    if (!remotes.length) return null;
    if (remotes.includes('main')) return 'main';
    if (remotes.includes('master')) return 'master';
    return remotes[0];
  }

  /** Initialises a repository IN AN EXISTING (non-empty) directory: `git init` +
   *  remote + fetch + checkout. Used when the directory already holds
   *  `.repo.json` (so `git clone`, which needs an empty directory, would fail). */
  async cloneInto(dir: string, url: string, opts: { branch?: string; token?: string; remote?: string } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    fs.mkdirSync(dir, { recursive: true });
    try {
      if (!(await this.isRepo(dir))) await this.git(dir, ['init']);
      // set/create the remote (without the token — withToken injects it temporarily)
      const existing = await this.remoteUrl(dir, remote);
      if (existing) await this.git(dir, ['remote', 'set-url', remote, url]);
      else await this.git(dir, ['remote', 'add', remote, url]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, stdout: '', stderr: msg };
    }
    // fetch + checkout through withToken: git fetch <remote> (not the URL!)
    // creates refs/remotes/origin/*, which is what makes
    // checkout --track origin/branch work.
    return this.withToken(dir, remote, opts.token, async () => {
      let out = await this.git(dir, ['fetch', remote]);
      const branch = opts.branch || (await this.defaultRemoteBranch(dir, remote)) || 'main';
      out += '\n' + await this.git(dir, ['checkout', '-B', branch, '--track', `${remote}/${branch}`]);
      return out;
    });
  }

  /** Files tracked by git at the given ref (or in the working tree when ref is empty). */
  async listFiles(dir: string, ref?: string): Promise<string[]> {
    try {
      const args = ref ? ['ls-tree', '-r', '--name-only', ref] : ['ls-files'];
      const out = await this.git(dir, args);
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Unified diff:
   *  - `from` + `to` given → `git diff --no-color <from>..<to> [-- file]`
   *  - only `from` (to empty) → `git diff --no-color <from> [-- file]` (from vs the working tree)
   *  `from='HEAD'` by default. Returns the diff text, or throws when a ref does not exist. */
  async diff(dir: string, opts: { from?: string; to?: string; file?: string; maxLines?: number } = {}): Promise<string> {
    const { from = 'HEAD', to, file } = opts;
    const args = ['diff', '--no-color'];
    if (to) {
      args.push(`${from}..${to}`);
    } else {
      args.push(from);
    }
    if (file) args.push('--', file);
    let out = await this.git(dir, args);

    // Working tree mode: git diff shows only tracked files. Untracked (new) files
    // need separate treatment via git diff --no-index /dev/null <file>.
    if (!to) {
      try {
        const untrackedArgs = ['ls-files', '--others', '--exclude-standard'];
        if (file) untrackedArgs.push('--', file);
        const untracked = await this.git(dir, untrackedArgs);
        const untrackedFiles = untracked.split('\n').map((s) => s.trim()).filter(Boolean);
        if (untrackedFiles.length > 0) {
          const parts: string[] = out ? [out] : [];
          for (const uf of untrackedFiles) {
            try {
              const fd = await this.gitNoIndexDiff(dir, uf);
              if (fd) parts.push(fd);
            } catch { /* binary or inaccessible — skip */ }
          }
          out = parts.join('\n');
        }
      } catch { /* ignore ls-files errors */ }
    }

    if (opts.maxLines) {
      const lines = out.split('\n');
      if (lines.length > opts.maxLines) {
        return lines.slice(0, opts.maxLines).join('\n') + `\n… (diff truncated, showing ${opts.maxLines} of ${lines.length} lines)`;
      }
    }
    return out;
  }

  /** `git diff --no-index /dev/null <file>` — a safe call that does NOT throw on
   *  exit code 1 (the normal result when the files differ). */
  private async gitNoIndexDiff(dir: string, file: string): Promise<string> {
    try {
      const { stdout } = await pExecFile(
        'git', ['diff', '--no-color', '--no-index', '/dev/null', file],
        { cwd: dir, timeout: this.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      );
      return stdout; // exit 0 = no differences (practically impossible for /dev/null vs a file)
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      if (err.code === 1 && err.stdout) return err.stdout; // exit 1 = there are differences — stdout is the diff
      const msg = (err.stderr || err.stdout || 'git diff --no-index error').toString().trim();
      throw new Error(msg);
    }
  }

  /** Clones url into the target directory (which must be empty or not exist). */
  async clone(url: string, dir: string, opts: { branch?: string; token?: string } = {}): Promise<GitCommandResult> {
    const parent = path.dirname(dir);
    fs.mkdirSync(parent, { recursive: true });
    const src = this.urlWithToken(url, opts.token);
    const args = ['-c', 'credential.helper=', 'clone'];
    if (opts.branch) args.push('--branch', opts.branch);
    args.push(src, path.basename(dir));
    try {
      const { stdout, stderr } = await pExecFile('git', args, {
        cwd: parent,
        timeout: this.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      // Strip the token from the remote — the token is never kept in git config.
      if (opts.token) {
        await this.git(dir, ['remote', 'set-url', 'origin', url]).catch(() => undefined);
      }
      return { ok: true, stdout, stderr };
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      return { ok: false, stdout: err.stdout ?? '', stderr: (err.stderr || err.message || 'clone failed').toString() };
    }
  }

  /** Temporarily sets the remote URL with the token for an operation, then restores it. */
  private async withToken(
    dir: string,
    remote: string,
    token: string | undefined,
    op: () => Promise<string>,
  ): Promise<GitCommandResult> {
    let original: string | null = null;
    if (token) {
      original = await this.remoteUrl(dir, remote);
      if (original) {
        const tokened = this.urlWithToken(original, token);
        if (tokened !== original) await this.git(dir, ['remote', 'set-url', remote, tokened]);
        else original = null;
      }
    }
    try {
      const out = await op();
      return { ok: true, stdout: out, stderr: '' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, stdout: '', stderr: msg };
    } finally {
      if (token && original) {
        await this.git(dir, ['remote', 'set-url', remote, original]).catch(() => undefined);
      }
    }
  }
}

/** Parses the contents of a `.repo.json` file; throws when it is invalid. */
export function parseRepoJson(text: string): RepoJson {
  const data = JSON.parse(text) as Partial<RepoJson>;
  if (!data || typeof data.url !== 'string' || !data.url) {
    throw new Error('.repo.json: missing required field "url"');
  }
  return {
    type: 'git-repo',
    version: typeof data.version === 'number' ? data.version : 1,
    url: data.url,
    branch: data.branch,
    tag: data.tag,
    remote: data.remote ?? 'origin',
    token: data.token,
    tokenSecretKey: data.tokenSecretKey,
    lastSync: data.lastSync,
  };
}

/** Serialises a RepoJson for writing (indented). */
export function stringifyRepoJson(repo: RepoJson): string {
  return JSON.stringify(repo, null, 2) + '\n';
}
