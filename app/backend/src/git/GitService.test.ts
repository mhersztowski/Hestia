import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitService } from './GitService.js';

/**
 * Sprawdzamy to na prawdziwym drzewie katalogów, bo cała rzecz polega na tym,
 * gdzie leży `.git` względem katalogu danych — a tego nie da się udawać atrapą,
 * nie udając przy okazji odpowiedzi, którą chcemy zweryfikować.
 */
describe('GitService — repozytorium spod dowolnego podkatalogu', () => {
    let root: string;
    let drive: string;
    let svc: GitService;

    const gitW = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'gitsvc-be-'));
        // This platform lays a user's drive out as `users/{name}`; MyCastle's
        // `Minis/Users/{name}/drive` was its own arrangement.
        drive = join(root, 'users', 'ala');
        mkdirSync(drive, { recursive: true });
        svc = new GitService(root);
    });

    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    const zalozRepo = (rel: string) => {
        const dir = join(drive, rel);
        mkdirSync(dir, { recursive: true });
        gitW(dir, 'init', '-q', '-b', 'main');
        gitW(dir, 'config', 'user.email', 'test@example.com');
        gitW(dir, 'config', 'user.name', 'Test');
        writeFileSync(join(dir, 'plik.txt'), 'treść\n');
        gitW(dir, 'add', '-A');
        gitW(dir, 'commit', '-q', '-m', 'start');
        return dir;
    };

    /*
     * Operacje zbiorcze z nagłówków sekcji panelu.
     *
     * Panel wysyła listę ścieżek całej sekcji jednym wywołaniem, więc liczy się
     * to, że `stage` przyjmuje pliki **nieśledzone** — a nie tylko zmiany
     * w śledzonych. `git add -u` by ich nie wziął i przycisk „Dodaj wszystkie
     * do commita" nad sekcją „Nieśledzone" nie robiłby nic, bez śladu.
     */
    it('przygotowuje wszystkie nieśledzone pliki naraz', async () => {
        const repo = zalozRepo('projekt');
        mkdirSync(join(repo, 'src'), { recursive: true });
        writeFileSync(join(repo, 'src', 'a.ts'), 'export {};\n');
        writeFileSync(join(repo, 'src', 'b.ts'), 'export {};\n');

        const przed = await svc.changes('ala', 'projekt');
        const nieslecone = przed.filter((z) => z.index === 'untracked' || z.workTree === 'untracked');
        expect(nieslecone).toHaveLength(2);

        const r = await svc.stage('ala', 'projekt', nieslecone.map((z) => z.path));
        expect(r.ok).toBe(true);

        const po = await svc.changes('ala', 'projekt');
        expect(po.filter((z) => z.staged).map((z) => z.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
        expect(po.some((z) => z.index === 'untracked' || z.workTree === 'untracked')).toBe(false);
    });

    // Ten sam przycisk co przy plikach śledzonych robi tu co innego: nie
    // przywraca treści, tylko kasuje plik (`git clean`). Potwierdzenie w panelu
    // mówi właśnie to i musi mówić prawdę.
    it('porzucenie nieśledzonego pliku kasuje go z dysku', async () => {
        const repo = zalozRepo('projekt');
        writeFileSync(join(repo, 'smiec.txt'), 'do usunięcia\n');

        const r = await svc.discard('ala', 'projekt', ['smiec.txt']);
        expect(r.ok).toBe(true);
        expect(existsSync(join(repo, 'smiec.txt'))).toBe(false);
    });

    it('porzucenie śledzonego pliku przywraca treść, a nie kasuje', async () => {
        const repo = zalozRepo('projekt');
        writeFileSync(join(repo, 'plik.txt'), 'zepsute\n');

        expect((await svc.discard('ala', 'projekt', ['plik.txt'])).ok).toBe(true);
        expect(existsSync(join(repo, 'plik.txt'))).toBe(true);
        expect(await svc.worktree('ala', 'projekt', 'plik.txt')).toBe('treść\n');
    });

    /*
     * Trzecia droga do repozytorium: założenie pustego na miejscu.
     *
     * Katalog bez `.git` w żadnym z rodziców kończył się komunikatem „najpierw
     * Clone" — a klonować nie ma czego, gdy historia ma się dopiero zacząć.
     */
    it('zakłada puste repozytorium w katalogu bez .git', async () => {
        const dir = join(drive, 'nowy-projekt');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'plik.txt'), 'treść\n');

        const przed = await svc.info('ala', 'nowy-projekt');
        expect(przed.git.isRepo).toBe(false);

        const r = await svc.init('ala', 'nowy-projekt');
        expect(r.ok).toBe(true);

        // Świeże repozytorium ma nienarodzony HEAD i to jest stan poprawny:
        // panel ma pokazać plik jako nieśledzony, a nie odmówić działania.
        const po = await svc.info('ala', 'nowy-projekt');
        expect(po.git.isRepo).toBe(true);
        expect(po.root).toBe('nowy-projekt');
        const zmiany = await svc.changes('ala', 'nowy-projekt');
        expect(zmiany.some((z) => z.path === 'plik.txt')).toBe(true);
    });

    /*
     * Kontrakt, na którym stoi ekran „nie ma tu repozytorium" w panelu.
     *
     * `info` odpowiada także bez repozytorium, ale `changes` w tym stanie
     * odmawia — i słusznie, bo nie ma czego wyliczać. Panel musi więc pytać
     * o jedno i drugie **osobno**: zapytane razem, odmowa `changes` przewracała
     * całe odświeżenie i zamiast ekranu z przyciskami („Utwórz repozytorium",
     * „Klonuj") pokazywał się surowy komunikat „najpierw Clone".
     */
    it('bez repozytorium info odpowiada, a changes odmawia', async () => {
        mkdirSync(join(drive, 'pusty'), { recursive: true });
        const i = await svc.info('ala', 'pusty');
        expect(i.git.isRepo).toBe(false);
        expect(i.root).toBeNull();
        await expect(svc.changes('ala', 'pusty')).rejects.toThrow(/nie jest repozytorium/);
    });

    it('pierwsza gałąź nazywa się tak, jak podano', async () => {
        mkdirSync(join(drive, 'z-galezia'), { recursive: true });
        expect((await svc.init('ala', 'z-galezia', 'trunk')).ok).toBe(true);
        const info = await svc.info('ala', 'z-galezia');
        expect(info.git.status?.branch).toBe('trunk');
    });

    // Repozytorium w repozytorium jest prawie zawsze pomyłką: pliki znikają
    // z widoku tego zewnętrznego, a git nie mówi o tym ani słowa.
    it('odmawia założenia repozytorium wewnątrz istniejącego', async () => {
        const repo = zalozRepo('projekt');
        mkdirSync(join(repo, 'src'), { recursive: true });
        const r = await svc.init('ala', 'projekt/src');
        expect(r.ok).toBe(false);
        expect(r.output).toMatch(/już leży w repozytorium/);
    });

    // Repozytorium obejmujące całe dane użytkownika to ta sama katastrofa,
    // przed którą broni granica w repoRoot.ts.
    it('odmawia założenia repozytorium na korzeniu drive', async () => {
        const r = await svc.init('ala', '');
        expect(r.ok).toBe(false);
        expect(r.output).toMatch(/całym drive/);
    });

    /*
     * Prawa strona widoku różnic.
     *
     * `show()` czyta z rewizji albo z indeksu, a dla pliku zmienionego
     * i nieprzygotowanego indeks jest równy HEAD — obie drogi pokazałyby stan
     * sprzed zmiany. Bez odczytu z katalogu roboczego panel porównywał zmieniony
     * plik z pustką i malował go w całości na czerwono.
     */
    it('czyta plik z katalogu roboczego, nie z rewizji', async () => {
        const repo = zalozRepo('projekt');
        writeFileSync(join(repo, 'plik.txt'), 'treśćX\n');

        expect(await svc.show('ala', 'projekt', 'HEAD', 'plik.txt')).toBe('treść\n');
        expect(await svc.worktree('ala', 'projekt', 'plik.txt')).toBe('treśćX\n');
    });

    it('plik usunięty w katalogu roboczym daje pustą treść, a nie błąd', async () => {
        const repo = zalozRepo('projekt');
        rmSync(join(repo, 'plik.txt'));
        expect(await svc.worktree('ala', 'projekt', 'plik.txt')).toBe('');
    });

    // Nazwa pliku przychodzi od klienta. Kontrola tekstowa przepuściłaby `..`
    // w środku ścieżki, dlatego granica sprawdzana jest po `path.resolve`.
    it('odmawia odczytu spoza repozytorium', async () => {
        zalozRepo('projekt');
        writeFileSync(join(drive, 'sekret.txt'), 'nie dla ciebie\n');
        await expect(svc.worktree('ala', 'projekt', '../sekret.txt')).rejects.toThrow(/poza repozytorium/);
    });

    it('widzi zmiany, gdy pytanie idzie z głębokiego podkatalogu', async () => {
        const repo = zalozRepo('projekt');
        mkdirSync(join(repo, 'src', 'moduł'), { recursive: true });
        writeFileSync(join(repo, 'src', 'moduł', 'nowy.ts'), 'export {};\n');

        const zmiany = await svc.changes('ala', 'projekt/src/moduł');
        expect(zmiany.map((z) => z.path)).toEqual(['src/moduł/nowy.ts']);
        expect(await svc.repoRoot('ala', 'projekt/src/moduł')).toBe('projekt');
    });

    it('ścieżka pliku pyta o repozytorium jego katalogu', async () => {
        const repo = zalozRepo('projekt');
        writeFileSync(join(repo, 'plik.txt'), 'zmienione\n');
        expect(await svc.repoRoot('ala', 'projekt/plik.txt')).toBe('projekt');
        expect((await svc.changes('ala', 'projekt/plik.txt')).map((z) => z.path)).toEqual(['plik.txt']);
    });

    it('działa bez `.repo.json` — sam katalog wystarczy', async () => {
        zalozRepo('bezmarkera');
        const info = await svc.info('ala', 'bezmarkera');
        expect(info.git.isRepo).toBe(true);
        expect(info.root).toBe('bezmarkera');
        expect((await svc.commit('ala', 'bezmarkera', 'pusty')).ok).toBe(false); // nic do commita
    });

    it('bierze repozytorium najbliższe, nie to nadrzędne', async () => {
        zalozRepo('zewn');
        zalozRepo('zewn/wewn');
        expect(await svc.repoRoot('ala', 'zewn/wewn')).toBe('zewn/wewn');
    });

    it('NIE wychodzi poza drive, choćby wyżej leżało repozytorium', async () => {
        // Odpowiednik prawdziwego układu: `data/` siedzi w repozytorium MyCastle.
        gitW(root, 'init', '-q');
        mkdirSync(join(drive, 'zwykly'), { recursive: true });

        expect(await svc.repoRoot('ala', 'zwykly')).toBeNull();
        await expect(svc.changes('ala', 'zwykly')).rejects.toThrow(/nie jest repozytorium/i);
        expect((await svc.info('ala', 'zwykly')).root).toBeNull();
    });

    it('odmawia ścieżki wyprowadzającej poza drive', async () => {
        await expect(svc.repoRoot('ala', '../../../..')).rejects.toThrow(/poza drive/);
    });

    it('znacznik `.repo.json` dalej wskazuje swój podkatalog', async () => {
        zalozRepo('klon');
        writeFileSync(join(drive, 'klon.repo.json'), JSON.stringify({ type: 'git-repo', version: 1, url: 'https://example.invalid/x.git' }));
        expect(await svc.repoRoot('ala', 'klon.repo.json')).toBe('klon');
        // …a pytanie z wnętrza repozytorium odnajduje ten sam znacznik, więc
        // `pull`/`push` z podkatalogu mają skąd wziąć URL i token.
        expect((await svc.info('ala', 'klon')).repo.url).toBe('https://example.invalid/x.git');
    });

    it('znacznik w korzeniu repozytorium też jest znajdowany', async () => {
        const repo = zalozRepo('projekt');
        writeFileSync(join(repo, '.repo.json'), JSON.stringify({ type: 'git-repo', version: 1, url: 'https://example.invalid/y.git' }));
        expect((await svc.info('ala', 'projekt/plik.txt')).repo.url).toBe('https://example.invalid/y.git');
    });
});
