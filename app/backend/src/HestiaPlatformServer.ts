/**
 * The platform server: files, MQTT and authentication for the other apps.
 *
 * Extends `HttpUploadServer` from the copied MyCastle base — upload, serving
 * `/files/` and the static frontend are already in the base class, and what the
 * Hestia applications need is added here:
 *
 *  • `/api/auth/*` — signing in and checking the token,
 *  • `/api/vfs/*`  — the file system contract (the one `RemoteFS` expects),
 *  • `/api/platform/info` — what this server is and where to find MQTT.
 *
 * **One port for HTTP and MQTT** (the broker joins the same server over the
 * `/mqtt` WebSocket): a second exposed service is a second port to open in the
 * firewall, a second rule in the proxy and a second place where the address can
 * be wrong.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { decideCommand } from './runCommand';
import { GitService } from './git/GitService.js';
import {
  ApiKeyService,
  HttpUploadServer,
  JwtService,
  checkAuth,
  type FileSystem,
} from '@hestia/node-core';
import type { AuthTokenPayload } from '@hestia/core';
import { tokenPayload, publicUser, verifyLogin, type UserStore } from './users';

export interface PlatformOptions {
  port: number;
  fileSystem: FileSystem;
  users: UserStore;
  jwt: JwtService;
  apiKeys?: ApiKeyService;
  /** Directory with the built frontend; without it the server exposes the API only. */
  staticDir?: string;
  /**
   * The directory the file system serves, as an absolute path.
   *
   * Only source control needs it: `git` is a process with a working
   * directory, and a process is neither a read nor a write, so it cannot go
   * through `FileSystem`. Absent: no git endpoints.
   */
  filesRoot?: string;
  /** The broker's WebSocket address reported to apps in `/api/platform/info`. */
  mqttPath?: string;
}

export class HestiaPlatformServer extends HttpUploadServer {
  private readonly options: PlatformOptions;
  /**
   * Source control, when the host supplies a files root to look in.
   *
   * Absent means the git endpoints answer 503 and the editor's panel says the
   * feature is not available — which is the honest answer for a deployment
   * with no `git` on it.
   */
  private readonly gitService: GitService | null;

  constructor(options: PlatformOptions) {
    super(options.port, options.fileSystem, undefined, undefined, undefined, options.staticDir);
    this.options = options;
    this.gitService = options.filesRoot ? new GitService(options.filesRoot) : null;
  }

  /** The HTTP server — the broker needs it to join the same port. */
  get httpServer() {
    return this.server;
  }

  /**
   * Who is asking — or `null`.
   *
   * One path for a JWT and for an API key: the web application signs in with
   * a password and a device with a key, but the rest of the server has no
   * reason to tell them apart.
   */
  checkIdentity(req: IncomingMessage): AuthTokenPayload | null {
    return checkAuth(req, this.options.jwt, this.options.apiKeys);
  }

  protected async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/vfs/') ||
      url.pathname === '/api/platform/info'
    ) {
      this.setCorsHeaders(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        if (await this.handleOwn(url, req, res)) return;
      } catch (e) {
        this.sendJsonResponse(res, 500, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    await super.handleRequest(req, res);
  }

  /** `true` when the request was handled here. */
  private async handleOwn(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const { pathname } = url;

    if (pathname === '/api/platform/info' && req.method === 'GET') {
      this.sendJsonResponse(res, 200, {
        name: 'hestia-platform',
        mqtt: this.options.mqttPath ?? '/mqtt',
        capabilities: ['files', 'mqtt', 'auth'],
      });
      return true;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = (await this.readJson(req)) as { userName?: string; password?: string };
      const user = await verifyLogin(this.options.users, body.userName ?? '', body.password ?? '');
      if (!user) {
        // One message for both causes — see `verifyLogin`.
        this.sendJsonResponse(res, 401, { error: 'Wrong user name or password' });
        return true;
      }
      this.sendJsonResponse(res, 200, {
        token: this.options.jwt.sign(tokenPayload(user)),
        user: publicUser(user),
      });
      return true;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const identity = this.checkIdentity(req);
      if (!identity) {
        this.sendJsonResponse(res, 401, { error: 'No valid token' });
        return true;
      }
      this.sendJsonResponse(res, 200, { user: identity });
      return true;
    }

    // `/api/users/{userName}/vfs/{operation}` — the shape MyCastle uses, and
    // the one the pages moved over from it expect. The user is in the path so
    // that an admin can reach somebody else's space; **who may do so is
    // decided by the token**, never by the path, or renaming oneself in the
    // address bar would be enough to read another person's files.
    // `/api/users/{userName}/git/{operation}` — source control for a clone on
    // that user's drive. Same rule as the VFS routes: the path names whose
    // drive, the token decides who may reach it.
    const userGit = pathname.match(/^\/api\/users\/([^/]+)\/git\/([a-zA-Z-]+)$/);
    if (userGit) {
      const identity = this.checkIdentity(req);
      if (!identity) {
        this.sendJsonResponse(res, 401, { error: 'No valid token' });
        return true;
      }
      const target = decodeURIComponent(userGit[1]);
      if (!identity.isAdmin && identity.userName !== target) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }
      await this.handleUserGit(req, res, req.method ?? 'GET', target, userGit[2]);
      return true;
    }

    const userVfs = pathname.match(/^\/api\/users\/([^/]+)\/vfs\/([a-zA-Z]+)$/);
    if (userVfs) {
      const identity = this.checkIdentity(req);
      if (!identity) {
        this.sendJsonResponse(res, 401, { error: 'No valid token' });
        return true;
      }
      const target = decodeURIComponent(userVfs[1]);
      if (!identity.isAdmin && identity.userName !== target) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }
      return this.handleUserVfs(url, req, res, target, userVfs[2]);
    }

    // `/api/vfs/{operation}` — the caller's own space, without naming
    // themselves. Kept because it is what `RemoteFS` and the applications
    // already speak; it is the same handler with the user taken from the token.
    if (pathname.startsWith('/api/vfs/')) {
      const identity = this.checkIdentity(req);
      if (!identity) {
        this.sendJsonResponse(res, 401, { error: 'No valid token' });
        return true;
      }
      return this.handleUserVfs(
        url,
        req,
        res,
        identity.userName,
        pathname.slice('/api/vfs/'.length)
      );
    }

    return false;
  }

  /**
   * The file system contract, as MyCastle's backend serves it.
   *
   * Paths are relative to the user's own directory and the server prepends it
   * (`users/{userName}/…`): a client that built the prefix itself could swap
   * it. Which user's directory that is has already been decided by the caller
   * above — from the token, not from the path.
   *
   * File contents travel as **base64** in `data`, and a listing returns
   * `{ name, type }` with `1` for a file and `2` for a directory. Both are
   * MyCastle's, and they are kept because the pages moved from it read them:
   * base64 also means a PDF survives the trip, which plain text in JSON does
   * not.
   */
  private async handleUserVfs(
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
    userName: string,
    operation: string
  ): Promise<boolean> {
    const fs = this.options.fileSystem;
    const inHome = (p: string) => {
      const relative = pathInsideUserDir(p);
      return relative ? `users/${userName}/${relative}` : `users/${userName}`;
    };

    try {
      if (req.method === 'GET') {
        const path = url.searchParams.get('path') ?? '';

        if (operation === 'readdir') {
          const tree = await fs.listDirectory(inHome(path));
          // Flattened to one level, in MyCastle's shape: the page asks for
          // a directory, not for the subtree below it.
          // Neither a size nor a time: `DirectoryTree` carries neither,
          // and a zero would read as "this file is empty" rather than as
          // "nobody asked the disk".
          const entries = (tree?.children ?? []).map((child) => ({
            name: child.name,
            type: child.type === 'directory' ? DIR_TYPE : FILE_TYPE,
          }));
          this.sendJsonResponse(res, 200, { entries });
          return true;
        }

        if (operation === 'readFile') {
          const file = await fs.readFile(inHome(path));
          const data = Buffer.from(file.content ?? '', 'utf8').toString('base64');
          // `download=1` answers with the bytes and a filename, for a
          // browser that cannot carry an Authorization header through a
          // navigation — an Android WebView, which also ignores the
          // `download` attribute on a blob URL made in JavaScript.
          if (url.searchParams.get('download') === '1') {
            const name = path.split('/').filter(Boolean).pop() || 'file';
            const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
            const bytes = Buffer.from(file.content ?? '', 'utf8');
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
              'Content-Length': String(bytes.length),
              'Cache-Control': 'no-store',
            });
            res.end(bytes);
            return true;
          }
          this.sendJsonResponse(res, 200, { data });
          return true;
        }

        if (operation === 'stat') {
          const exists = await fs.exists(inHome(path));
          if (!exists) {
            this.sendJsonResponse(res, 404, { error: 'No such file' });
            return true;
          }
          const tree = await fs.listDirectory(inHome(path)).catch(() => null);
          this.sendJsonResponse(res, 200, { type: tree ? DIR_TYPE : FILE_TYPE });
          return true;
        }

        if (operation === 'exists') {
          this.sendJsonResponse(res, 200, { exists: await fs.exists(inHome(path)) });
          return true;
        }
      }

      if (req.method === 'POST') {
        const body = (await this.readJson(req)) as {
          path?: string;
          data?: string;
          content?: string;
          oldPath?: string;
          newPath?: string;
          source?: string;
          destination?: string;
          archive?: string;
          command?: string;
          args?: unknown[];
        };
        const path = url.searchParams.get('path') ?? body.path ?? '';

        if (operation === 'writeFile') {
          // `data` is base64, as MyCastle sends it; `content` is plain
          // text, which the Hestia applications already send. Both are
          // accepted so neither side had to be changed on the same day.
          const text =
            body.data !== undefined
              ? Buffer.from(body.data, 'base64').toString('utf8')
              : (body.content ?? '');
          this.sendJsonResponse(res, 200, await fs.writeFile(inHome(path), text));
          return true;
        }

        if (operation === 'mkdir') {
          // The file system has no directory of its own to create: a
          // directory exists once something is in it. A marker keeps the
          // folder visible until the first real file lands there.
          await fs.writeFile(`${inHome(path)}/.keep`, '');
          this.sendJsonResponse(res, 200, { ok: true });
          return true;
        }

        if (operation === 'delete') {
          const target = inHome(path);
          const isDirectory = await fs
            .listDirectory(target)
            .then(() => true)
            .catch(() => false);
          if (isDirectory) await fs.deleteDirectory(target);
          else await fs.deleteFile(target);
          this.sendJsonResponse(res, 200, { ok: true });
          return true;
        }

        // Packing happens on this side on purpose: zipping in the
        // browser means reading every file into memory first, and the
        // files are here already.
        if (operation === 'zip_pack') {
          await fs.zipPack(inHome(body.source ?? ''), inHome(body.destination ?? ''));
          this.sendJsonResponse(res, 200, { ok: true });
          return true;
        }

        if (operation === 'zip_unpack') {
          await fs.zipUnpack(inHome(body.archive ?? ''), inHome(body.destination ?? ''));
          this.sendJsonResponse(res, 200, { ok: true });
          return true;
        }

        /**
         * Starts a package-manager command in a project directory and
         * streams what it prints.
         *
         * `text/event-stream`, because an install takes minutes and
         * without lines as they come there is no telling "working" from
         * "hung". `X-Accel-Buffering: no` stops a proxy from holding
         * the whole stream back and delivering it as one parcel at the
         * end, which looks exactly like a hang.
         */
        if (operation === 'run_command') {
          const command = String(body.command ?? '');
          const args = Array.isArray(body.args) ? body.args.map(String) : [];
          const decision = decideCommand(command, args);
          if (!decision.ok) {
            this.sendJsonResponse(res, 400, { error: decision.reason });
            return true;
          }

          // The working directory goes through the same guard as
          // every read and write: a path that climbs out is refused.
          const cwd = fs.resolveInside(inHome(path));
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

          await new Promise<void>((resolve) => {
            // `shell: false` — an argument stays an argument. With a
            // shell, a script name is executable.
            const child = spawn(command, args, { cwd, shell: false });
            const forward = (chunk: Buffer) => {
              for (const line of chunk.toString('utf8').split('\n')) send({ type: 'line', line });
            };
            child.stdout.on('data', forward);
            child.stderr.on('data', forward);
            child.on('error', (err) => {
              send({ type: 'line', line: `${command}: ${err.message}` });
              send({ type: 'done', code: -1 });
              res.end();
              resolve();
            });
            child.on('close', (code) => {
              send({ type: 'done', code: code ?? -1 });
              res.end();
              resolve();
            });
            // Leaving the page kills the process: an install nobody
            // is watching still holds the directory it writes into.
            req.on('close', () => {
              child.kill();
            });
          });
          return true;
        }

        if (operation === 'rename' || operation === 'copy') {
          const from = inHome(body.oldPath ?? body.source ?? '');
          const to = inHome(body.newPath ?? body.destination ?? '');
          const file = await fs.readFile(from);
          await fs.writeFile(to, file.content ?? '');
          if (operation === 'rename') await fs.deleteFile(from);
          this.sendJsonResponse(res, 200, { ok: true });
          return true;
        }
      }
    } catch (error) {
      // A path that climbs out of the user's directory, a file that is not
      // there: the message says which, and the status says whose fault it is.
      const message = error instanceof Error ? error.message : String(error);
      const status = /outside the user directory/.test(message)
        ? 403
        : /not found|no such file|ENOENT/i.test(message)
          ? 404
          : 400;
      this.sendJsonResponse(res, status, { error: message });
      return true;
    }

    this.sendJsonResponse(res, 404, { error: `Unknown VFS operation: ${req.method} ${operation}` });
    return true;
  }

  /**
   * Source control for a `.repo.json` clone on the user's drive.
   *
   * The whole surface the git panel in `@hestia/ui-texteditor` speaks to:
   * info, changes, staging, diffs, commits, branches, the stash, the history
   * and conflict resolution. The path the client sends is the marker file or
   * a directory inside the clone; `GitService` finds the repository root from
   * it and refuses anything outside the user's own drive.
   */
  private async handleUserGit(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    userName: string,
    operation: string
  ): Promise<void> {
    if (!this.gitService) {
      this.sendJsonResponse(res, 503, { error: 'Git service unavailable' });
      return;
    }
    try {
      if (method === 'GET') {
        const urlObj = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
        const repoPath = urlObj.searchParams.get('path') ?? '';
        if (!repoPath) {
          this.sendJsonResponse(res, 400, { error: 'path is required' });
          return;
        }
        if (operation === 'info') {
          const result = await this.gitService.info(userName, repoPath);
          this.sendJsonResponse(res, 200, result);
          return;
        }
        if (operation === 'files') {
          const ref = urlObj.searchParams.get('ref') || undefined;
          const files = await this.gitService.listFiles(userName, repoPath, ref);
          this.sendJsonResponse(res, 200, { files });
          return;
        }
        this.sendJsonResponse(res, 404, { error: `Unknown git operation: ${operation}` });
        return;
      }
      if (method !== 'POST') {
        this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }
      const body = (await this.readJson(req)) as {
        path?: string;
        ref?: string;
        type?: 'branch' | 'tag';
        url?: string;
        remote?: string;
        branch?: string;
        token?: string;
        tokenSecretKey?: string | null;
        from?: string;
        to?: string;
        file?: string;
        message?: string;
        // Panel kontroli źródeł: zaznaczone pliki i parametry dziennika.
        paths?: string[];
        limit?: number;
        name?: string;
        // Łatki, schowek i konflikty.
        patch?: string;
        cached?: boolean;
        reverse?: boolean;
        action?: string;
        keepIndex?: boolean;
      };
      const repoPath = body.path ?? '';
      if (!repoPath) {
        this.sendJsonResponse(res, 400, { error: 'path is required' });
        return;
      }
      switch (operation) {
        case 'save': {
          const repo = await this.gitService.save(userName, repoPath, {
            url: body.url,
            remote: body.remote,
            branch: body.branch,
            token: body.token,
            tokenSecretKey: body.tokenSecretKey,
          });
          this.sendJsonResponse(res, 200, { ok: true, repo });
          return;
        }
        case 'clone': {
          const r = await this.gitService.clone(userName, repoPath);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'pull': {
          const r = await this.gitService.pull(userName, repoPath);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'push': {
          const r = await this.gitService.push(userName, repoPath);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        // Trzecia droga do repozytorium, obok clone'a i otwarcia katalogu
        // w istniejącym: założenie pustego na miejscu. Nazwa gałęzi jest
        // opcjonalna — bez niej `main`, jak w domyślnej konfiguracji gita.
        case 'init': {
          const r = await this.gitService.init(
            userName,
            repoPath,
            body.branch ? String(body.branch) : undefined
          );
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'checkout': {
          if (!body.ref) {
            this.sendJsonResponse(res, 400, { error: 'ref is required' });
            return;
          }
          const r = await this.gitService.checkout(
            userName,
            repoPath,
            body.ref,
            body.type === 'tag' ? 'tag' : 'branch'
          );
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'diff': {
          const r = await this.gitService.diff(userName, repoPath, {
            from: body.from || undefined,
            to: body.to || undefined,
            file: body.file || undefined,
          });
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'commit': {
          if (!body.message) {
            this.sendJsonResponse(res, 400, { error: 'message is required' });
            return;
          }
          const r = await this.gitService.commit(userName, repoPath, body.message);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        // ── Operacje dla panelu kontroli źródeł w edytorze ─────────────────
        //
        // `info` mówi tylko „są zmiany"; panel potrzebuje listy plików
        // z podziałem na indeks i katalog roboczy, żeby dało się zaznaczyć
        // pojedynczy plik do commita.
        case 'changes': {
          const changes = await this.gitService.changes(userName, repoPath);
          this.sendJsonResponse(res, 200, { ok: true, changes });
          return;
        }
        case 'stage':
        case 'unstage':
        case 'discard': {
          const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
          if (paths.length === 0) {
            this.sendJsonResponse(res, 400, { error: 'paths is required' });
            return;
          }
          const r =
            operation === 'stage'
              ? await this.gitService.stage(userName, repoPath, paths)
              : operation === 'unstage'
                ? await this.gitService.unstage(userName, repoPath, paths)
                : await this.gitService.discard(userName, repoPath, paths);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        // Treść pliku z rewizji — lewa strona widoku różnic. Różnicę liczy
        // sam edytor, więc wystarczy mu tekst „przed".
        case 'show': {
          if (!body.file) {
            this.sendJsonResponse(res, 400, { error: 'file is required' });
            return;
          }
          const content = await this.gitService.show(
            userName,
            repoPath,
            String(body.ref || 'HEAD'),
            String(body.file)
          );
          this.sendJsonResponse(res, 200, { ok: true, content });
          return;
        }
        // Treść pliku z katalogu roboczego — prawa strona widoku różnic.
        // Osobno od `show`, bo ten czyta z rewizji albo z indeksu, a żadne
        // z dwojga nie jest tym, co użytkownik właśnie napisał na dysku.
        case 'worktree': {
          if (!body.file) {
            this.sendJsonResponse(res, 400, { error: 'file is required' });
            return;
          }
          const content = await this.gitService.worktree(userName, repoPath, String(body.file));
          this.sendJsonResponse(res, 200, { ok: true, content });
          return;
        }
        case 'log': {
          // Filtr ścieżki idzie pod `file`, nie `path`: `path` w ciele żądania
          // wskazuje repozytorium (plik `.repo.json`), więc użycie go tutaj
          // filtrowałoby historię po pliku, którego w repozytorium nie ma —
          // i dziennik wracał pusty bez śladu, że pytanie było o coś innego.
          const entries = await this.gitService.log(userName, repoPath, {
            limit: body.limit ? Number(body.limit) : undefined,
            path: body.file ? String(body.file) : undefined,
          });
          this.sendJsonResponse(res, 200, { ok: true, entries });
          return;
        }
        case 'branch': {
          if (!body.name) {
            this.sendJsonResponse(res, 400, { error: 'name is required' });
            return;
          }
          const r = await this.gitService.createBranch(userName, repoPath, String(body.name));
          this.sendJsonResponse(res, 200, r);
          return;
        }
        // Łatka: przygotowanie części pliku i cofnięcie pojedynczej zmiany.
        // Składa ją edytor — tylko on wie, który fragment wskazał użytkownik.
        case 'apply': {
          if (!body.patch) {
            this.sendJsonResponse(res, 400, { error: 'patch is required' });
            return;
          }
          const r = await this.gitService.applyPatch(userName, repoPath, String(body.patch), {
            cached: !!body.cached,
            reverse: !!body.reverse,
          });
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'stash': {
          // Jedna trasa, bo to jedno pojęcie; `action` mówi, co z nim zrobić.
          const akcja = String(body.action ?? 'list');
          const r =
            akcja === 'list'
              ? { ok: true, entries: await this.gitService.stashList(userName, repoPath) }
              : akcja === 'push'
                ? await this.gitService.stashPush(
                    userName,
                    repoPath,
                    body.message,
                    !!body.keepIndex
                  )
                : akcja === 'pop'
                  ? await this.gitService.stashPop(userName, repoPath, body.ref)
                  : akcja === 'apply'
                    ? await this.gitService.stashApply(userName, repoPath, body.ref)
                    : akcja === 'drop'
                      ? await this.gitService.stashDrop(userName, repoPath, body.ref)
                      : null;
          if (!r) {
            this.sendJsonResponse(res, 400, { error: `Nieznana operacja schowka: ${akcja}` });
            return;
          }
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'conflict': {
          if (!body.file) {
            this.sendJsonResponse(res, 400, { error: 'file is required' });
            return;
          }
          const versions = await this.gitService.conflictVersions(
            userName,
            repoPath,
            String(body.file)
          );
          this.sendJsonResponse(res, 200, { ok: true, versions });
          return;
        }
        case 'resolve': {
          const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
          if (paths.length === 0) {
            this.sendJsonResponse(res, 400, { error: 'paths is required' });
            return;
          }
          const r = await this.gitService.markResolved(userName, repoPath, paths);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        case 'abort-merge': {
          const r = await this.gitService.abortMerge(userName, repoPath);
          this.sendJsonResponse(res, 200, r);
          return;
        }
        default:
          this.sendJsonResponse(res, 404, { error: `Unknown git operation: ${operation}` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error('The request body is not valid JSON');
    }
  }
}

/**
 * A path reduced to a form that certainly stays inside the user's directory.
 *
 * `FileSystem` itself only guards against leaving the **data root** — and
 * `../bob/note.json` appended to `users/alice/` normalises to
 * `users/bob/note.json`, which stays under the root and passes that check,
 * reading (or overwriting) somebody else's files. The boundary is the user's
 * directory, so it has to be guarded here, where that directory is known.
 *
 * Segments of `..` are rejected rather than normalised away: a path that climbs
 * out is not a client slip worth quietly repairing, and it is better for it to
 * end in an error than to land somewhere other than it asked for.
 */
/** A listing says `1` for a file and `2` for a directory — MyCastle's numbering. */
export const FILE_TYPE = 1;
export const DIR_TYPE = 2;

export function pathInsideUserDir(path: string): string {
  const cleaned = String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const segments = cleaned.split('/').filter((c) => c !== '' && c !== '.');
  if (segments.some((c) => c === '..')) {
    throw new Error('The path must not lead outside the user directory');
  }
  return segments.join('/');
}
