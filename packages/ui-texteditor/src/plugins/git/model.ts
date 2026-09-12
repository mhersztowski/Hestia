/**
 * model.ts — logika panelu kontroli źródeł, bez Reacta i bez sieci.
 *
 * Grupowanie zmian, znaczniki stanu i to, które przyciski mają sens przy danym
 * zaznaczeniu — wszystko, co da się pomylić, a czego nie widać po samym
 * wyglądzie panelu. Osobno, żeby dało się to sprawdzić testem.
 */

import type { GitChange, GitFileState } from './gitApi';

/** Sekcje listy, w tej samej kolejności, w jakiej pokazuje je panel. */
export interface GroupedChanges {
    /** Konflikty na górze: dopóki są, commit i tak nie przejdzie. */
    conflicts: GitChange[];
    staged: GitChange[];
    changes: GitChange[];
    untracked: GitChange[];
}

/**
 * Rozkłada zmiany na sekcje.
 *
 * Plik ze zmianami po obu stronach (`MM`) trafia do **dwóch** sekcji i tak ma
 * być: to jeden plik w dwóch stanach. Pokazanie go tylko raz znaczyłoby, że
 * użytkownik commituje mniej, niż widzi.
 */
export function groupChanges(zmiany: readonly GitChange[]): GroupedChanges {
    const wynik: GroupedChanges = { conflicts: [], staged: [], changes: [], untracked: [] };
    for (const z of zmiany) {
        if (z.conflicted) { wynik.conflicts.push(z); continue; }
        if (z.index === 'untracked' || z.workTree === 'untracked') { wynik.untracked.push(z); continue; }
        if (z.staged) wynik.staged.push(z);
        if (z.unstaged) wynik.changes.push(z);
    }
    return wynik;
}

/** Jednoliterowy znacznik obok nazwy pliku. */
export function statusLetter(zmiana: GitChange, sekcja: keyof GroupedChanges): string {
    if (zmiana.conflicted) return '!';
    const stan: GitFileState = sekcja === 'staged' ? zmiana.index : zmiana.workTree;
    switch (stan) {
        case 'added': return 'A';
        case 'deleted': return 'D';
        case 'renamed': return 'R';
        case 'copied': return 'C';
        case 'untracked': return 'U';
        default: return 'M';
    }
}

/** Kolor znacznika — te same znaczenia, co w innych narzędziach. */
export function statusColor(litera: string): string {
    switch (litera) {
        case 'A': case 'U': return '#4ade80';
        case 'D': return '#f87171';
        case 'R': case 'C': return '#60a5fa';
        case '!': return '#fb923c';
        default: return '#facc15';
    }
}

/** Ścieżka bez katalogu i sam katalog — panel pokazuje je osobno. */
export function splitPath(path: string): { name: string; dir: string } {
    const i = path.lastIndexOf('/');
    return i < 0 ? { name: path, dir: '' } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}

/**
 * Czy commit ma sens przy tym stanie.
 *
 * Odmowa z powodem zamiast wyszarzonego przycisku bez wyjaśnienia: „nie da się"
 * bez „dlaczego" zmusza do zgadywania, a przyczyny są tu trzy i każda wymaga
 * czego innego.
 */
export function commitBlocker(
    grupy: GroupedChanges, message: string,
): string | null {
    if (grupy.conflicts.length > 0) {
        return `Najpierw rozwiąż konflikty (${grupy.conflicts.length}) — git i tak odmówi commita.`;
    }
    if (!message.trim()) return 'Wpisz opis zmiany.';
    if (grupy.staged.length === 0) {
        return 'Nic nie jest przygotowane do commita — zaznacz pliki znakiem plus.';
    }
    return null;
}

/**
 * Liczba plików z poprawną odmianą: 1 plik, 3 pliki, 5 plików.
 *
 * Wchodzi do potwierdzeń operacji nieodwracalnych, a te trzeba przeczytać
 * i zrozumieć w sekundę. „Usunąć 1 plików" każe czytać drugi raz i podważa
 * zaufanie do reszty komunikatu — akurat tam, gdzie jest ono potrzebne
 * najbardziej.
 */
export function liczbaPlikow(n: number): string {
    if (n === 1) return '1 plik';
    const setki = n % 100;
    const dziesiatki = n % 10;
    const mnoga = setki >= 12 && setki <= 14 ? false : dziesiatki >= 2 && dziesiatki <= 4;
    return `${n} ${mnoga ? 'pliki' : 'plików'}`;
}

/** Podpis przycisku synchronizacji: ile commitów w którą stronę. */
export function syncLabel(ahead: number, behind: number): string {
    if (ahead === 0 && behind === 0) return 'Zsynchronizowane';
    const czesci: string[] = [];
    if (behind > 0) czesci.push(`↓ ${behind}`);
    if (ahead > 0) czesci.push(`↑ ${ahead}`);
    return czesci.join('  ');
}

/**
 * Skąd wziąć treść „po" dla widoku różnic i rozstrzygania konfliktów.
 *
 * Dwa źródła, bo plik bywa w dwóch stanach naraz. Otwarta zakładka niesie też
 * **niezapisane** zmiany — a pytanie „co ja tu zmieniłem" dotyczy zwykle
 * właśnie ich. Plik nieotwarty żadnej zakładki nie ma i wtedy prawdą jest to,
 * co leży na dysku.
 *
 * Wcześniej drugiego źródła nie było: brak modelu dawał pusty łańcuch. Skutek
 * był taki, że kliknięcie pliku w panelu — czyli **normalny** sposób
 * sprawdzenia zmiany, bez otwierania pliku — pokazywało cały plik na czerwono,
 * jako usunięty w całości. Wyglądało to jak błąd liczenia różnicy, a było
 * porównaniem z niczym.
 */
export interface WorkingContentSources {
    /**
     * Treść z otwartej zakładki albo `null`, gdy pliku nie ma w edytorze.
     *
     * `null`, a nie pusty łańcuch: plik opróżniony do zera to poprawna treść
     * i musi dać się odróżnić od „nie ma zakładki". Rozróżnienie po samej
     * pustce cofnęłoby ten błąd tylnymi drzwiami.
     */
    fromEditor(): string | null;
    /** Treść pliku z katalogu roboczego — czytana z serwera. */
    fromDisk(): Promise<string>;
}

export async function workingContent(sources: WorkingContentSources): Promise<string> {
    const otwarty = sources.fromEditor();
    return otwarty !== null ? otwarty : sources.fromDisk();
}

/**
 * Ścieżka pliku względem katalogu repozytorium.
 *
 * Edytor operuje ścieżkami w VFS (`/drive/projekt/src/a.ts`), a git — względem
 * korzenia repozytorium (`src/a.ts`). Bez tego przeliczenia panel pokazywałby
 * zmiany, ale kliknięcie w plik otwierałoby pustkę.
 */
export function toRepoRelative(vfsPath: string, repoDir: string): string | null {
    const znormalizowany = vfsPath.replace(/^\/+/, '');
    const katalog = repoDir.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!katalog) return znormalizowany;
    if (znormalizowany === katalog) return '';
    return znormalizowany.startsWith(`${katalog}/`) ? znormalizowany.slice(katalog.length + 1) : null;
}
