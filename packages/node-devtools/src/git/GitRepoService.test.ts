import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitRepoService } from './GitRepoService';

/**
 * Testy chodzą po prawdziwym gicie w katalogu tymczasowym.
 *
 * Atrapa procesu sprawdzałaby tylko, czy składamy argumenty tak, jak sami
 * założyliśmy — a wszystkie usterki, które te ścieżki miały (nagłówek łatki
 * liczony o wiersz za dużo, stopnie indeksu przy konflikcie), brały się
 * właśnie z tego, że git rozumiał wejście inaczej niż my.
 */
describe('GitRepoService na prawdziwym repozytorium', () => {
    let dir: string;
    const git = new GitRepoService();

    const sh = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'gitsvc-'));
        sh('init', '-q', '-b', 'main');
        sh('config', 'user.email', 'test@example.com');
        sh('config', 'user.name', 'Test');
        writeFileSync(join(dir, 'a.txt'), 'raz\ndwa\ntrzy\n');
        sh('add', '-A');
        sh('commit', '-q', '-m', 'start');
    });

    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('przygotowuje sam fragment łatki, zostawiając resztę w katalogu roboczym', async () => {
        writeFileSync(join(dir, 'a.txt'), 'GORA\nraz\ndwa\ntrzy\nDOL\n');
        const patch = [
            'diff --git a/a.txt b/a.txt',
            '--- a/a.txt',
            '+++ b/a.txt',
            '@@ -1,2 +1,3 @@',
            '+GORA',
            ' raz',
            ' dwa',
            '',
        ].join('\n');

        const wynik = await git.applyPatch(dir, patch, { cached: true });
        expect(wynik.ok).toBe(true);

        const wIndeksie = execFileSync('git', ['show', ':a.txt'], { cwd: dir, encoding: 'utf8' });
        expect(wIndeksie).toContain('GORA');
        expect(wIndeksie).not.toContain('DOL');

        const zmiany = await git.changes(dir);
        expect(zmiany).toHaveLength(1);
        expect(zmiany[0].staged).toBe(true);
        expect(zmiany[0].unstaged).toBe(true);
    });

    it('cofa fragment odwrotnym nałożeniem łatki', async () => {
        writeFileSync(join(dir, 'a.txt'), 'raz\ndwa\ntrzy\nDOL\n');
        const patch = [
            'diff --git a/a.txt b/a.txt',
            '--- a/a.txt',
            '+++ b/a.txt',
            '@@ -3,1 +3,2 @@',
            ' trzy',
            '+DOL',
            '',
        ].join('\n');

        const wynik = await git.applyPatch(dir, patch, { reverse: true });
        expect(wynik.ok).toBe(true);
        expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('raz\ndwa\ntrzy\n');
    });

    it('zgłasza odrzuconą łatkę zamiast udawać powodzenie', async () => {
        const patch = [
            'diff --git a/a.txt b/a.txt',
            '--- a/a.txt',
            '+++ b/a.txt',
            '@@ -1,1 +1,2 @@',
            ' czegoś takiego tam nie ma',
            '+nowe',
            '',
        ].join('\n');
        const wynik = await git.applyPatch(dir, patch);
        expect(wynik.ok).toBe(false);
        expect(wynik.stderr).toBeTruthy();
    });

    it('odkłada zmiany na półkę i przywraca je z powrotem', async () => {
        writeFileSync(join(dir, 'a.txt'), 'zmienione\n');
        writeFileSync(join(dir, 'nowy.txt'), 'nieśledzony\n');

        expect((await git.stashPush(dir, 'moja półka')).ok).toBe(true);
        expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('raz\ndwa\ntrzy\n');

        const lista = await git.stashList(dir);
        expect(lista).toHaveLength(1);
        expect(lista[0].ref).toBe('stash@{0}');
        expect(lista[0].subject).toContain('moja półka');

        expect((await git.stashPop(dir)).ok).toBe(true);
        expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('zmienione\n');
        // --include-untracked: nowy plik też ma wrócić, inaczej półka gubi pracę.
        expect(readFileSync(join(dir, 'nowy.txt'), 'utf8')).toBe('nieśledzony\n');
        expect(await git.stashList(dir)).toHaveLength(0);
    });

    it('zdejmuje wpis z półki bez przywracania zmian', async () => {
        writeFileSync(join(dir, 'a.txt'), 'zmienione\n');
        await git.stashPush(dir, 'do wyrzucenia');
        expect((await git.stashDrop(dir)).ok).toBe(true);
        expect(await git.stashList(dir)).toHaveLength(0);
        expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('raz\ndwa\ntrzy\n');
    });

    it('pusta półka to pusta lista, a nie błąd', async () => {
        expect(await git.stashList(dir)).toEqual([]);
    });

    it('daje trzy wersje pliku z konfliktu i pozwala go zamknąć', async () => {
        sh('checkout', '-q', '-b', 'obok');
        writeFileSync(join(dir, 'a.txt'), 'raz\nICH\ntrzy\n');
        sh('commit', '-qam', 'ich');
        sh('checkout', '-q', 'main');
        writeFileSync(join(dir, 'a.txt'), 'raz\nMOJE\ntrzy\n');
        sh('commit', '-qam', 'moje');
        try { sh('merge', 'obok'); } catch { /* konflikt jest tu celem */ }

        const zmiany = await git.changes(dir);
        expect(zmiany.map((z) => z.path)).toEqual(['a.txt']);

        const { base, ours, theirs } = await git.conflictVersions(dir, 'a.txt');
        expect(base).toBe('raz\ndwa\ntrzy\n');
        expect(ours).toBe('raz\nMOJE\ntrzy\n');
        expect(theirs).toBe('raz\nICH\ntrzy\n');

        writeFileSync(join(dir, 'a.txt'), 'raz\nMOJE\ntrzy\n');
        expect((await git.markResolved(dir, ['a.txt'])).ok).toBe(true);
        const po = await git.changes(dir);
        expect(po.every((z) => !z.conflicted)).toBe(true);
    });

    it('przerwanie scalania wraca do stanu sprzed konfliktu', async () => {
        sh('checkout', '-q', '-b', 'obok');
        writeFileSync(join(dir, 'a.txt'), 'raz\nICH\ntrzy\n');
        sh('commit', '-qam', 'ich');
        sh('checkout', '-q', 'main');
        writeFileSync(join(dir, 'a.txt'), 'raz\nMOJE\ntrzy\n');
        sh('commit', '-qam', 'moje');
        try { sh('merge', 'obok'); } catch { /* konflikt jest tu celem */ }

        expect((await git.abortMerge(dir)).ok).toBe(true);
        expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('raz\nMOJE\ntrzy\n');
        expect(await git.changes(dir)).toEqual([]);
    });

    it('rozpoznaje repozytorium wskazane przez symlink', async () => {
        // Katalog danych bywa za dowiązaniem (wolumen w kontenerze, `/tmp` na
        // macOS). `rev-parse --show-toplevel` odpowiada ścieżką rzeczywistą, więc
        // porównanie tekstowe uznawało repozytorium za „nie repozytorium" i cały
        // panel odmawiał działania komunikatem o braku clone'a.
        const link = `${dir}-link`;
        symlinkSync(realpathSync(dir), link);
        try {
            expect(await git.isRepo(link)).toBe(true);
        } finally {
            rmSync(link, { force: true });
        }
    });

    it('na pliku bez konfliktu wersje z indeksu są puste, nie wybuchają', async () => {
        expect(await git.conflictVersions(dir, 'a.txt')).toEqual({ base: '', ours: '', theirs: '' });
    });
});
