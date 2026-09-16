/**
 * GitService — backendowa obsługa repozytoriów git w drive użytkownika. Cienka
 * warstwa nad `GitRepoService` z `@mhersztowski/devtools`: resolwuje ścieżki
 * w obrębie drive (z ochroną przed path traversal), czyta/zapisuje `.repo.json`
 * i deleguje operacje git.
 *
 * Ścieżki przychodzą z frontendu jako RELATYWNE do drive użytkownika
 * (`data/Minis/Users/{userName}/drive/`) i mogą wskazywać **cokolwiek**:
 * znacznik `myrepo/.repo.json`, katalog `myrepo/src`, plik `myrepo/src/a.ts`.
 * Korzeń repozytorium wyszukuje `repoRoot.ts` — w górę do `.git`, ale nie wyżej
 * niż drive użytkownika.
 *
 * Znacznik `*.repo.json` pozostaje potrzebny do **założenia** clone'a (niesie
 * URL i klucz tokena) i do operacji zdalnych; do czytania i zmieniania stanu
 * repozytorium już nie.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GitRepoService,
  parseRepoJson,
  stringifyRepoJson,
  type RepoJson,
  type GitInfo,
} from '@hestia/node-devtools';
import { sciezkiMarkera, znajdzKorzenRepo } from './repoRoot.js';

/** Namespace współdzielony z Settings → Secrets (klucze: `token:{name}`). */

export interface GitRepoStatusResponse {
  /** RepoJson z zredagowanym tokenem (nie zwracamy sekretu na frontend). */
  repo: RepoJson;
  /** Stan git katalogu (gałęzie, tagi, status). */
  git: GitInfo;
  /** Korzeń repozytorium względem drive; null, gdy ścieżka w żadnym nie leży. */
  root: string | null;
}

export class GitService {
  private readonly git = new GitRepoService();
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  /** Zwraca rzeczywisty token do użycia: najpierw próbuje rozwiązać z SecretsService
   *  (gdy `tokenSecretKey` ustawiony), potem fallback na `token` w `.repo.json`. */
  private async resolveToken(_userName: string, repo: RepoJson): Promise<string | undefined> {
    // MyCastle also looked the token up in its secrets store when `.repo.json`
    // named a key there. This platform has no such store, so the file itself is
    // the only source — `tokenSecretKey` is then ignored rather than silently
    // resolving to nothing.
    return repo.token;
  }

  /** Resolwuje ścieżkę pliku `*.repo.json` do absolutnej + katalog repo.
   *  Wymusza, że ścieżka leży w drive użytkownika i kończy się na `.repo.json`.
   *  Katalog repo:
   *   • `.repo.json`           → katalog pliku (clone w tym katalogu),
   *   • `{nazwa}.repo.json`    → podkatalog `{nazwa}` obok pliku (clone tam),
   *     co pozwala trzymać kilka repo w jednym katalogu, a plik `.repo.json`
   *     nie zaśmieca statusu repo. */
  private resolve(userName: string, relPath: string): { repoJsonPath: string; dir: string } {
    if (!/^[A-Za-z0-9_-]+$/.test(userName)) throw new Error('Nieprawidłowa nazwa użytkownika');
    const driveRoot = path.resolve(this.rootDir, 'users', userName);
    const clean = String(relPath || '').replace(/^[/\\]+/, '');
    const abs = path.resolve(driveRoot, clean);
    if (abs !== driveRoot && !abs.startsWith(driveRoot + path.sep)) {
      throw new Error('Odmowa dostępu: ścieżka poza drive');
    }
    const base = path.basename(abs);
    if (!base.endsWith('.repo.json')) {
      throw new Error('Ścieżka musi wskazywać plik *.repo.json');
    }
    const prefix = base.slice(0, -'.repo.json'.length); // 'pubsub.repo.json'→'pubsub', '.repo.json'→''
    const dir = prefix ? path.resolve(path.dirname(abs), prefix) : path.dirname(abs);
    if (dir !== driveRoot && !dir.startsWith(driveRoot + path.sep)) {
      throw new Error('Odmowa dostępu: katalog repo poza drive');
    }
    return { repoJsonPath: abs, dir };
  }

  /**
   * Punkt startowy szukania repozytorium dla **dowolnej** ścieżki z drive:
   * katalogu, zwykłego pliku albo znacznika `*.repo.json`.
   *
   * Znacznik zachowuje swoje znaczenie (`nazwa.repo.json` → clone w podkatalogu
   * `nazwa`), bo to on decyduje, dokąd trafia `Clone` — a katalog może jeszcze
   * nie istnieć. Dla pozostałych ścieżek startem jest katalog: plik wskazuje
   * swój katalog, bo pytanie „w jakim repozytorium leży ten plik" jest pytaniem
   * o jego katalog.
   */
  private resolveAny(userName: string, relPath: string): { start: string; driveRoot: string } {
    if (!/^[A-Za-z0-9_-]+$/.test(userName)) throw new Error('Nieprawidłowa nazwa użytkownika');
    const driveRoot = path.resolve(this.rootDir, 'users', userName);
    const clean = String(relPath || '').replace(/^[/\\]+/, '');
    const abs = path.resolve(driveRoot, clean);
    if (abs !== driveRoot && !abs.startsWith(driveRoot + path.sep)) {
      throw new Error('Odmowa dostępu: ścieżka poza drive');
    }
    if (path.basename(abs).endsWith('.repo.json')) {
      return { start: this.resolve(userName, clean).dir, driveRoot };
    }
    let start = abs;
    try {
      if (!fs.statSync(abs).isDirectory()) start = path.dirname(abs);
    } catch {
      /* nie istnieje — traktuj jak katalog */
    }
    return { start, driveRoot };
  }

  /** Czyta `.repo.json` TOLERANCYJNIE: pusty/niepełny/niepoprawny plik daje
   *  domyślny rekord z pustym `url` (panel pokaże formularz konfiguracji),
   *  zamiast rzucać „Unexpected end of JSON input". */
  private read(repoJsonPath: string): RepoJson {
    let text = '';
    try {
      text = fs.readFileSync(repoJsonPath, 'utf8');
    } catch {
      /* brak pliku */
    }
    text = text.trim();
    const empty: RepoJson = { type: 'git-repo', version: 1, url: '', remote: 'origin' };
    if (!text) return empty;
    try {
      return parseRepoJson(text);
    } catch {
      // Niepełny JSON (np. świeżo utworzony pusty plik, którego edytor zapisał
      // częściowo) — spróbuj wyłuskać url, inaczej zwróć pusty rekord.
      try {
        const o = JSON.parse(text) as Partial<RepoJson>;
        return {
          type: 'git-repo',
          version: typeof o.version === 'number' ? o.version : 1,
          url: typeof o.url === 'string' ? o.url : '',
          branch: o.branch,
          tag: o.tag,
          remote: o.remote ?? 'origin',
          token: o.token,
          lastSync: o.lastSync,
        };
      } catch {
        return empty;
      }
    }
  }

  private write(repoJsonPath: string, repo: RepoJson): void {
    fs.writeFileSync(repoJsonPath, stringifyRepoJson(repo));
  }

  /** Redaguje token przed wysłaniem na frontend. */
  private redact(repo: RepoJson): RepoJson {
    return { ...repo, token: repo.token ? '***' : undefined };
  }

  /** Aktualizuje `.repo.json` o bieżący ref po operacji (branch/tag/lastSync). */
  private async syncRepoJson(repoJsonPath: string, dir: string): Promise<RepoJson> {
    const repo = this.read(repoJsonPath);
    try {
      const ref = await this.git.currentRef(dir);
      repo.branch = ref.branch ?? undefined;
      repo.tag = ref.tag ?? undefined;
    } catch {
      /* repo może jeszcze nie istnieć */
    }
    repo.lastSync = Date.now();
    this.write(repoJsonPath, repo);
    return repo;
  }

  /**
   * Pełny status: RepoJson + stan gita + **korzeń repozytorium**.
   *
   * `root` (ścieżka względem drive) jest w odpowiedzi, bo ścieżka pytania i
   * korzeń repozytorium to od teraz dwie różne rzeczy: pytać można z dowolnego
   * podkatalogu, a nazwy plików ze statusu są względem korzenia. Bez tego
   * frontend musiałby zgadywać, gdzie zaczyna się repozytorium — i mylił się
   * wszędzie poza katalogiem ze znacznikiem.
   */
  async info(userName: string, relPath: string): Promise<GitRepoStatusResponse> {
    const { start, driveRoot } = this.resolveAny(userName, relPath);
    const korzen = znajdzKorzenRepo(start, driveRoot);
    // Bez repozytorium wciąż odpowiadamy — panel pokazuje wtedy formularz
    // konfiguracji, a nie błąd; „nie ma repo" jest normalnym stanem katalogu.
    const dir = korzen ?? start;
    const jawny = path.basename(
      path.resolve(driveRoot, String(relPath || '').replace(/^[/\\]+/, ''))
    );
    const repoJsonPath = jawny.endsWith('.repo.json')
      ? this.resolve(userName, relPath).repoJsonPath
      : korzen
        ? (sciezkiMarkera(korzen).find(
            (k) => k.startsWith(driveRoot + path.sep) && fs.existsSync(k)
          ) ?? null)
        : null;
    const repo = repoJsonPath
      ? this.read(repoJsonPath)
      : { type: 'git-repo' as const, version: 1, url: '', remote: 'origin' };
    const git = await this.git.info(dir);
    const root =
      korzen === null ? null : path.relative(driveRoot, korzen).split(path.sep).join('/');
    return { repo: this.redact(repo), git, root };
  }

  /** Zapisuje konfigurację do `.repo.json` (URL/remote/branch/token). Gdy katalog
   *  jest już clone'em i zmienił się URL — aktualizuje też git remote. Zwraca
   *  RepoJson z zredagowanym tokenem. */
  async save(
    userName: string,
    relPath: string,
    patch: {
      url?: string;
      remote?: string;
      branch?: string;
      token?: string;
      tokenSecretKey?: string | null;
    }
  ): Promise<RepoJson> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const cur = this.read(repoJsonPath);
    const next: RepoJson = {
      type: 'git-repo',
      version: cur.version || 1,
      url: patch.url !== undefined ? patch.url.trim() : cur.url,
      remote: (patch.remote !== undefined ? patch.remote : cur.remote) || 'origin',
      branch: cur.branch,
      tag: cur.tag,
      // '***' to wartość zredagowana z frontu — nie nadpisuj nią realnego tokena.
      token:
        patch.token !== undefined && patch.token !== '***' ? patch.token || undefined : cur.token,
      // null = wyczyść; string = ustaw; undefined = zostaw jak było.
      tokenSecretKey:
        patch.tokenSecretKey !== undefined
          ? (patch.tokenSecretKey ?? undefined)
          : cur.tokenSecretKey,
      lastSync: cur.lastSync,
    };
    // Gdy ustawiono tokenSecretKey — wyczyść surowy token (nie trzymaj obu).
    if (next.tokenSecretKey) next.token = undefined;
    this.write(repoJsonPath, next);
    // Jeśli repo już istnieje, a URL się zmienił — zaktualizuj remote.
    if (next.url && (await this.git.isRepo(dir))) {
      try {
        await this.git.setRemoteUrl(dir, next.url, next.remote);
      } catch {
        /* ignore */
      }
    }
    return this.redact(next);
  }

  /**
   * Zakłada puste repozytorium w katalogu wskazanym ścieżką.
   *
   * Trzeci sposób, obok clone'a i otwarcia katalogu w istniejącym repozytorium.
   * Bez niego katalog bez `.git` w żadnym z rodziców kończył się komunikatem
   * „najpierw Clone" — a klonować nie ma czego, gdy historia ma się dopiero
   * zacząć.
   *
   * Dwie odmowy, obie o granicach:
   *
   *  • **katalog już leży w repozytorium** — założenie drugiego w środku
   *    pierwszego jest prawie zawsze pomyłką: pliki zniknęłyby z widoku tego
   *    zewnętrznego, a git nie powiedziałby o tym ani słowa;
   *  • **korzeń drive** — repozytorium obejmujące całe dane użytkownika to ta
   *    sama katastrofa, przed którą broni granica w `repoRoot.ts`: panel
   *    pokazałby tysiące plików gotowych do commita.
   */
  async init(
    userName: string,
    relPath: string,
    branch?: string
  ): Promise<{ ok: boolean; output: string }> {
    const { start, driveRoot } = this.resolveAny(userName, relPath);

    if (start === driveRoot) {
      return {
        ok: false,
        output: 'Nie zakładam repozytorium na całym drive — wejdź do katalogu projektu.',
      };
    }

    const korzen = znajdzKorzenRepo(start, driveRoot);
    if (korzen) {
      const wzgledny = path.relative(driveRoot, korzen).split(path.sep).join('/') || '/';
      return { ok: false, output: `Ten katalog już leży w repozytorium „${wzgledny}".` };
    }

    const r = await this.git.init(start, branch ? { branch } : {});
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Clone repo z URL z `.repo.json` do katalogu pliku (init+fetch+checkout). */
  async clone(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    if (!repo.url) throw new Error('Brak URL repozytorium — najpierw ustaw i zapisz URL');
    if (await this.git.isRepo(dir)) throw new Error('Katalog jest już repozytorium git');
    const token = await this.resolveToken(userName, repo);
    const r = await this.git.cloneInto(dir, repo.url, {
      branch: repo.branch,
      token,
      remote: repo.remote,
    });
    if (r.ok) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Checkout brancha lub tagu. */
  async checkout(
    userName: string,
    relPath: string,
    ref: string,
    type: 'branch' | 'tag'
  ): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir, repo } = this.kontekst(userName, relPath);
    try {
      await this.git.checkout(dir, ref, { type, remote: repo.remote });
      if (repoJsonPath) await this.syncRepoJson(repoJsonPath, dir);
      return { ok: true, output: `checkout ${ref}` };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Pull z remote. */
  async pull(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir, repo } = this.kontekst(userName, relPath);
    const token = await this.resolveToken(userName, repo);
    const r = await this.git.pull(dir, { remote: repo.remote, branch: repo.branch, token });
    if (r.ok && repoJsonPath) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Lista plików śledzonych przez git na podanym ref (lub working tree gdy ref puste). */
  async listFiles(userName: string, relPath: string, ref?: string): Promise<string[]> {
    let dir: string;
    try {
      dir = await this.repoDir(userName, relPath);
    } catch {
      return [];
    }
    return this.git.listFiles(dir, ref);
  }

  /** Unified diff między refami lub ref vs working tree.
   *  `to` = undefined → porównanie `from` z working tree (filesystem backendu).
   *  `to` = ref → `git diff from..to`. */
  async diff(
    userName: string,
    relPath: string,
    opts: { from?: string; to?: string; file?: string }
  ): Promise<{ ok: boolean; diff: string }> {
    const dir = await this.repoDir(userName, relPath);
    try {
      const text = await this.git.diff(dir, { ...opts, maxLines: 5000 });
      return { ok: true, diff: text };
    } catch (e) {
      return { ok: false, diff: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Stage all + commit. */
  async commit(
    userName: string,
    relPath: string,
    message: string
  ): Promise<{ ok: boolean; output: string }> {
    const dir = await this.repoDir(userName, relPath);
    const r = await this.git.commit(dir, message, { authorName: userName });
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Push do remote (ustawia upstream gdy go brak). */
  /**
   * Katalog repozytorium dla dowolnej ścieżki z drive.
   *
   * Panel ma działać tak jak w VS Code — w każdym katalogu leżącym wewnątrz
   * repozytorium, nie tylko w tym, w którym leży `.repo.json`. Dlatego szukamy
   * korzenia wspinając się w górę, ale **z granicą na drive użytkownika**:
   * `data/` leży wewnątrz repozytorium MyCastle, więc wspinaczka bez granicy
   * (a taką robi sam git) odpowiadałaby o monorepo i pozwoliłaby je zacommitować
   * z panelu przekonanego, że pracuje na projekcie użytkownika.
   */
  private async repoDir(userName: string, relPath: string): Promise<string> {
    const { start, driveRoot } = this.resolveAny(userName, relPath);
    const korzen = znajdzKorzenRepo(start, driveRoot);
    if (!korzen) {
      throw new Error('Katalog nie jest repozytorium git ani nie leży w żadnym (najpierw Clone)');
    }
    return korzen;
  }

  /**
   * Korzeń repozytorium jako ścieżka **względna do drive** — tym mówi o nim
   * frontend, bo tak samo adresuje pliki w VFS. Null, gdy repozytorium nie ma.
   */
  async repoRoot(userName: string, relPath: string): Promise<string | null> {
    const { start, driveRoot } = this.resolveAny(userName, relPath);
    const korzen = znajdzKorzenRepo(start, driveRoot);
    return korzen === null ? null : path.relative(driveRoot, korzen).split(path.sep).join('/');
  }

  /**
   * Repozytorium wskazane ścieżką razem z jego konfiguracją.
   *
   * Ścieżka bywa znacznikiem `.repo.json` (wtedy konfiguracja jest wprost), ale
   * bywa też zwykłym katalogiem gdzieś w środku repozytorium — a `pull`/`push`
   * i tak potrzebują URL-a i tokena. Dlatego marker jest **doszukiwany** przy
   * korzeniu; gdy go nie ma (repozytorium założone spoza Drive), zostaje pusta
   * konfiguracja i operacje zdalne idą przez `remote` zapisany w repozytorium.
   */
  private kontekst(
    userName: string,
    relPath: string
  ): {
    dir: string;
    repoJsonPath: string | null;
    repo: RepoJson;
  } {
    const { start, driveRoot } = this.resolveAny(userName, relPath);
    const dir = znajdzKorzenRepo(start, driveRoot);
    if (!dir)
      throw new Error('Katalog nie jest repozytorium git ani nie leży w żadnym (najpierw Clone)');
    const jawny = path.basename(
      path.resolve(driveRoot, String(relPath || '').replace(/^[/\\]+/, ''))
    );
    if (jawny.endsWith('.repo.json')) {
      const { repoJsonPath } = this.resolve(userName, relPath);
      return { dir, repoJsonPath, repo: this.read(repoJsonPath) };
    }
    for (const kandydat of sciezkiMarkera(dir)) {
      if (kandydat.startsWith(driveRoot + path.sep) && fs.existsSync(kandydat)) {
        return { dir, repoJsonPath: kandydat, repo: this.read(kandydat) };
      }
    }
    return {
      dir,
      repoJsonPath: null,
      repo: { type: 'git-repo', version: 1, url: '', remote: 'origin' },
    };
  }

  /**
   * Lista zmienionych plików z podziałem na indeks i katalog roboczy.
   *
   * `info` mówi tylko „są zmiany" — to wystarczy na pasek stanu, ale nie na
   * listę, w której zaznacza się pojedyncze pliki do commita.
   */
  async changes(userName: string, relPath: string) {
    return this.git.changes(await this.repoDir(userName, relPath));
  }

  async stage(userName: string, relPath: string, paths: string[]) {
    return this.git.stage(await this.repoDir(userName, relPath), paths);
  }

  async unstage(userName: string, relPath: string, paths: string[]) {
    return this.git.unstage(await this.repoDir(userName, relPath), paths);
  }

  async discard(userName: string, relPath: string, paths: string[]) {
    return this.git.discard(await this.repoDir(userName, relPath), paths);
  }

  /** Treść pliku z rewizji — lewa strona widoku różnic. */
  async show(userName: string, relPath: string, ref: string, file: string) {
    return this.git.show(await this.repoDir(userName, relPath), ref, file);
  }

  /**
   * Treść pliku z **katalogu roboczego** — prawa strona widoku różnic.
   *
   * `show()` tego nie zastąpi: `git show` sięga do rewizji (`HEAD:plik`) albo
   * do indeksu (`:plik`), a dla pliku zmienionego i nieprzygotowanego indeks
   * jest równy HEAD — obie drogi pokazałyby stan sprzed zmiany. Katalog roboczy
   * to zwykły plik na dysku i tylko tak da się go przeczytać.
   *
   * Nazwa pliku przychodzi od klienta, więc granica repozytorium jest
   * sprawdzana **po** rozwinięciu ścieżki: `..` w środku nazwy przechodzi przez
   * kontrolę tekstową, a przez `path.resolve` już nie.
   *
   * Brak pliku daje pustą treść, a nie błąd: plik usunięty w katalogu roboczym
   * naprawdę nie ma zawartości i widok różnic ma go pokazać jako usuniętego.
   */
  async worktree(userName: string, relPath: string, file: string): Promise<string> {
    const dir = await this.repoDir(userName, relPath);
    const abs = path.resolve(dir, file);
    if (abs !== dir && !abs.startsWith(dir + path.sep)) {
      throw new Error('Ścieżka pliku wychodzi poza repozytorium');
    }
    try {
      return await fs.promises.readFile(abs, 'utf-8');
    } catch {
      return '';
    }
  }

  async log(userName: string, relPath: string, opts: { limit?: number; path?: string } = {}) {
    return this.git.log(await this.repoDir(userName, relPath), opts);
  }

  /**
   * Nakłada łatkę — tędy idzie przygotowanie części pliku i cofnięcie zmiany.
   *
   * Łatkę składa edytor, bo tylko on wie, który fragment użytkownik wskazał.
   * Serwer sprawdza jedno: że repozytorium jest tym, o którym mowa.
   */
  async applyPatch(
    userName: string,
    relPath: string,
    patch: string,
    opts: { cached?: boolean; reverse?: boolean }
  ) {
    return this.git.applyPatch(await this.repoDir(userName, relPath), patch, opts);
  }

  async stashList(userName: string, relPath: string) {
    return this.git.stashList(await this.repoDir(userName, relPath));
  }

  async stashPush(userName: string, relPath: string, message?: string, keepIndex?: boolean) {
    return this.git.stashPush(await this.repoDir(userName, relPath), message, { keepIndex });
  }

  async stashPop(userName: string, relPath: string, ref?: string) {
    return this.git.stashPop(await this.repoDir(userName, relPath), ref);
  }

  async stashApply(userName: string, relPath: string, ref?: string) {
    return this.git.stashApply(await this.repoDir(userName, relPath), ref);
  }

  async stashDrop(userName: string, relPath: string, ref?: string) {
    return this.git.stashDrop(await this.repoDir(userName, relPath), ref);
  }

  /** Trzy wersje pliku w konflikcie — do rozstrzygnięcia sporu w edytorze. */
  async conflictVersions(userName: string, relPath: string, file: string) {
    return this.git.conflictVersions(await this.repoDir(userName, relPath), file);
  }

  async markResolved(userName: string, relPath: string, paths: string[]) {
    return this.git.markResolved(await this.repoDir(userName, relPath), paths);
  }

  async abortMerge(userName: string, relPath: string) {
    return this.git.abortMerge(await this.repoDir(userName, relPath));
  }

  async createBranch(userName: string, relPath: string, name: string) {
    return this.git.createBranch(await this.repoDir(userName, relPath), name);
  }

  async push(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir, repo } = this.kontekst(userName, relPath);
    const ref = await this.git.currentRef(dir);
    const r = await this.git.push(dir, {
      remote: repo.remote,
      branch: ref.branch ?? repo.branch,
      token: await this.resolveToken(userName, repo),
      setUpstream: true,
    });
    if (r.ok && repoJsonPath) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }
}
