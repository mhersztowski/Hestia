import { describe, it, expect } from 'vitest';
import { znajdzKorzenRepo, sciezkiMarkera } from './repoRoot.js';

/**
 * Wejściem jest zbiór ścieżek, pod którymi „istnieje `.git`" — dzięki temu test
 * opisuje układ katalogów, a nie zachowanie systemu plików.
 */
const maGit = (sciezki: string[]) => (p: string) => sciezki.includes(p);

describe('znajdzKorzenRepo', () => {
    const drive = '/data/Minis/Users/ala/drive';

    it('znajduje repozytorium, gdy start jest jego korzeniem', () => {
        expect(znajdzKorzenRepo(`${drive}/projekt`, drive, maGit([`${drive}/projekt/.git`])))
            .toBe(`${drive}/projekt`);
    });

    it('wspina się przez katalogi pośrednie', () => {
        expect(znajdzKorzenRepo(`${drive}/projekt/src/moduł`, drive, maGit([`${drive}/projekt/.git`])))
            .toBe(`${drive}/projekt`);
    });

    it('bierze repozytorium najbliższe startowi, a nie najdalsze', () => {
        // Podmoduł albo repo w repo: pracuje się w tym bliższym.
        const gdzie = maGit([`${drive}/zewn/.git`, `${drive}/zewn/wewn/.git`]);
        expect(znajdzKorzenRepo(`${drive}/zewn/wewn/src`, drive, gdzie)).toBe(`${drive}/zewn/wewn`);
    });

    it('uznaje `.git` będące plikiem — tak wygląda worktree i podmoduł', () => {
        // Funkcja dostaje samo „istnieje", więc plik i katalog są nierozróżnialne
        // z jej punktu widzenia; to sprawdzenie pilnuje, że nie dołożymy warunku
        // na katalog, który wyciąłby oba te przypadki.
        expect(znajdzKorzenRepo(`${drive}/wt`, drive, maGit([`${drive}/wt/.git`]))).toBe(`${drive}/wt`);
    });

    it('zatrzymuje się na korzeniu drive i nie sięga wyżej', () => {
        // Całe MyCastle jest repozytorium git, a `data/` leży w środku. Bez tej
        // granicy panel pokazywałby zmiany monorepo gotowe do commita z Drive.
        expect(znajdzKorzenRepo(`${drive}/projekt`, drive, maGit(['/data/.git', '/.git'])))
            .toBeNull();
    });

    it('sam drive też może być repozytorium', () => {
        expect(znajdzKorzenRepo(`${drive}/a/b`, drive, maGit([`${drive}/.git`]))).toBe(drive);
    });

    it('brak repozytorium to null, nie zgadywanie', () => {
        expect(znajdzKorzenRepo(`${drive}/a/b`, drive, maGit([]))).toBeNull();
    });

    it('start poza drive nie szuka niczego', () => {
        expect(znajdzKorzenRepo('/inne/miejsce', drive, maGit(['/inne/miejsce/.git']))).toBeNull();
    });
});

describe('sciezkiMarkera', () => {
    it('podaje oba znaczenia nazwy markera', () => {
        expect(sciezkiMarkera('/drive/projekt')).toEqual([
            '/drive/projekt/.repo.json',
            '/drive/projekt.repo.json',
        ]);
    });
});
