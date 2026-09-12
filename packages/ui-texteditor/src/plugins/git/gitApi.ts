/**
 * gitApi.ts — rozmowa panelu kontroli źródeł z backendem.
 *
 * Wszystkie operacje idą przez `/api/users/{u}/git/{op}` i wskazują repozytorium
 * **dowolną ścieżką w drive**: katalogiem gdzieś w jego środku albo znacznikiem
 * `*.repo.json`. Korzeń znajduje serwer, wspinając się w górę do `.git` — panel
 * ma działać wszędzie, gdzie działa `git status`, a nie tylko w katalogu ze
 * znacznikiem.
 *
 * Stąd jedyny stan tej warstwy: zapamiętany korzeń. Ścieżki w odpowiedziach gita
 * są względem korzenia, a ścieżki w edytorze — względem drive, więc bez niego nie
 * da się przeliczyć jednych na drugie, a pytanie o niego przy każdym pliku
 * oznaczałoby żądanie do serwera na każdy narysowany znacznik marginesu.
 */

/** Stan pliku po jednej stronie (indeks albo katalog roboczy). */
export type GitFileState =
    | 'unmodified' | 'modified' | 'added' | 'deleted'
    | 'renamed' | 'copied' | 'untracked' | 'ignored' | 'conflicted';

export interface GitChange {
    path: string;
    oldPath?: string;
    index: GitFileState;
    workTree: GitFileState;
    staged: boolean;
    unstaged: boolean;
    conflicted: boolean;
}

export interface GitRefInfo {
    branch: string | null;
    tag: string | null;
    ahead: number;
    behind: number;
    dirty: boolean;
}

export interface GitInfo {
    isRepo: boolean;
    url: string | null;
    branches: string[];
    remoteBranches: string[];
    tags: string[];
    status: GitRefInfo | null;
}

export interface GitStashEntry {
    /** Odwołanie w postaci `stash@{0}`. */
    ref: string;
    subject: string;
    date: string;
}

export interface GitLogEntry {
    hash: string;
    short: string;
    authorName: string;
    authorEmail: string;
    date: string;
    subject: string;
}

export interface GitApiOptions {
    userName: string;
    /** Token JWT; bez niego trasy zwracają 401. */
    token?: string;
    /**
     * Ścieżka względem drive użytkownika: katalog wewnątrz repozytorium,
     * plik w nim albo znacznik `*.repo.json`.
     */
    repoPath: string;
}

/** Wynik operacji zmieniającej stan repozytorium. */
export interface GitOpResult {
    ok: boolean;
    output?: string;
    stderr?: string;
}

export class GitApi {
    private korzen: string | null | undefined;

    constructor(private readonly opcje: GitApiOptions) { }

    get repoPath(): string {
        return this.opcje.repoPath;
    }

    /**
     * Korzeń repozytorium względem drive — to, wobec czego git podaje nazwy plików.
     *
     * Pytamy o niego raz na instancję. Instancja powstaje na jedno zadanie panelu
     * (`zbudujApi()` przy każdej komendzie), więc zmiana katalogu w Drive i tak
     * daje nową, a jednocześnie jedno kliknięcie nie wysyła dziesięciu pytań o to
     * samo.
     */
    async repoDir(): Promise<string> {
        if (this.korzen === undefined) await this.info();
        if (this.korzen === null || this.korzen === undefined) {
            throw new Error('Ta ścieżka nie leży w repozytorium git.');
        }
        return this.korzen;
    }

    private async wywolaj<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
        const res = await fetch(
            `/api/users/${encodeURIComponent(this.opcje.userName)}/git/${op}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.opcje.token ? { Authorization: `Bearer ${this.opcje.token}` } : {}),
                },
                body: JSON.stringify({ path: this.opcje.repoPath, ...body }),
            },
        );
        const dane = await res.json().catch(() => ({}));
        if (!res.ok) {
            // Komunikat serwera niesie powód (brak repozytorium, konflikt,
            // odmowa dostępu) — zgubienie go zostawia użytkownika z „coś poszło nie tak".
            throw new Error(String((dane as { error?: string }).error ?? `HTTP ${res.status}`));
        }
        return dane as T;
    }

    async info(): Promise<GitInfo> {
        const res = await fetch(
            `/api/users/${encodeURIComponent(this.opcje.userName)}/git/info`
            + `?path=${encodeURIComponent(this.opcje.repoPath)}`,
            { headers: this.opcje.token ? { Authorization: `Bearer ${this.opcje.token}` } : {} },
        );
        const dane = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String((dane as { error?: string }).error ?? `HTTP ${res.status}`));
        const odp = dane as { git: GitInfo; root?: string | null };
        this.korzen = odp.root ?? null;
        return odp.git;
    }

    async changes(): Promise<GitChange[]> {
        return (await this.wywolaj<{ changes: GitChange[] }>('changes')).changes;
    }

    stage(paths: string[]): Promise<GitOpResult> { return this.wywolaj('stage', { paths }); }
    unstage(paths: string[]): Promise<GitOpResult> { return this.wywolaj('unstage', { paths }); }
    discard(paths: string[]): Promise<GitOpResult> { return this.wywolaj('discard', { paths }); }

    commit(message: string): Promise<GitOpResult> { return this.wywolaj('commit', { message }); }
    pull(): Promise<GitOpResult> { return this.wywolaj('pull'); }
    push(): Promise<GitOpResult> { return this.wywolaj('push'); }

    checkout(ref: string, type: 'branch' | 'tag' = 'branch'): Promise<GitOpResult> {
        return this.wywolaj('checkout', { ref, type });
    }
    createBranch(name: string): Promise<GitOpResult> { return this.wywolaj('branch', { name }); }

    /**
     * Zakłada puste repozytorium w bieżącym katalogu.
     *
     * Bez adresu i bez pierwszego commita: historia zaczyna się na miejscu,
     * a co do niej trafi, decyduje użytkownik na liście zmian.
     */
    init(branch?: string): Promise<GitOpResult> { return this.wywolaj('init', { branch }); }

    /** Treść pliku z rewizji — lewa strona widoku różnic. */
    async show(file: string, ref = 'HEAD'): Promise<string> {
        return (await this.wywolaj<{ content: string }>('show', { file, ref })).content;
    }

    /**
     * Treść pliku z **katalogu roboczego** — prawa strona widoku różnic.
     *
     * `show()` czyta z rewizji i katalogu roboczego nie zna: `git show` umie
     * podać HEAD (`HEAD:plik`) i indeks (`:plik`), ale nie to, co naprawdę
     * leży na dysku. Dla pliku zmienionego i nieprzygotowanego indeks jest
     * równy HEAD, więc żadna z tych dwóch dróg nie pokazałaby zmiany.
     */
    async worktree(file: string): Promise<string> {
        return (await this.wywolaj<{ content: string }>('worktree', { file })).content;
    }

    /**
     * Historia commitów; `file` zawęża ją do jednego pliku.
     *
     * Filtr idzie pod `file`, a nie `path`, bo `path` w tym API zawsze znaczy
     * „które repozytorium" — nazwanie obu tak samo dawało pustą historię bez
     * śladu, że pytanie dotyczyło czegoś innego.
     */
    async log(limit = 50, file?: string): Promise<GitLogEntry[]> {
        return (await this.wywolaj<{ entries: GitLogEntry[] }>('log', { limit, file })).entries;
    }

    /** Surowa różnica między rewizjami — do listy plików commita. */
    async diffText(from?: string, to?: string, file?: string): Promise<string> {
        return (await this.wywolaj<{ diff: string }>('diff', { from, to, file })).diff;
    }

    /* ── Łatki: część pliku i cofanie zmian ──────────────────────────────── */

    /**
     * Nakłada łatkę na indeks (`cached`) albo na katalog roboczy.
     *
     * Łatkę składa edytor, bo tylko on wie, który fragment wskazał użytkownik —
     * serwer sprawdza jedynie, że repozytorium jest tym, o którym mowa.
     */
    applyPatch(patch: string, opts: { cached?: boolean; reverse?: boolean } = {}): Promise<GitOpResult> {
        return this.wywolaj('apply', { patch, ...opts });
    }

    /* ── Schowek ─────────────────────────────────────────────────────────── */

    async stashList(): Promise<GitStashEntry[]> {
        return (await this.wywolaj<{ entries: GitStashEntry[] }>('stash', { action: 'list' })).entries;
    }
    stashPush(message?: string, keepIndex = false): Promise<GitOpResult> {
        return this.wywolaj('stash', { action: 'push', message, keepIndex });
    }
    stashPop(ref?: string): Promise<GitOpResult> { return this.wywolaj('stash', { action: 'pop', ref }); }
    stashApply(ref?: string): Promise<GitOpResult> { return this.wywolaj('stash', { action: 'apply', ref }); }
    stashDrop(ref?: string): Promise<GitOpResult> { return this.wywolaj('stash', { action: 'drop', ref }); }

    /* ── Konflikty ───────────────────────────────────────────────────────── */

    /** Trzy wersje pliku w konflikcie: wyjściowa, nasza, przychodząca. */
    async conflictVersions(file: string): Promise<{ base: string; ours: string; theirs: string }> {
        return (await this.wywolaj<{ versions: { base: string; ours: string; theirs: string } }>('conflict', { file })).versions;
    }
    /** Oznacza pliki jako rozwiązane (dodaje do indeksu). */
    markResolved(paths: string[]): Promise<GitOpResult> { return this.wywolaj('resolve', { paths }); }
    abortMerge(): Promise<GitOpResult> { return this.wywolaj('abort-merge'); }
}
