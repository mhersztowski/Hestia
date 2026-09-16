/**
 * porcelain.ts — czytanie `git status --porcelain=v1 -z`.
 *
 * Rozbite na osobny plik, bo to jedyna część obsługi gita, którą da się (i warto)
 * sprawdzić testem bez repozytorium: format jest ustalony, a pomyłka w nim
 * pokazuje użytkownikowi plik w złej sekcji — czyli namawia go do zacommitowania
 * czegoś, czego nie chciał.
 *
 * ## Dlaczego `-z`, a nie zwykłe wiersze
 *
 * Nazwy plików mogą zawierać spacje, cudzysłowy i znaki nowej linii. Bez `-z`
 * git albo cytuje takie nazwy (i trzeba je odkodować), albo — przy nowej linii —
 * rozbija jeden plik na dwa wiersze. Rozdzielenie bajtem zerowym usuwa oba
 * problemy naraz.
 *
 * ## Dwa znaki, dwa różne stany
 *
 * Kod `XY` to **para**: `X` mówi o indeksie (co pójdzie do commita), `Y`
 * o katalogu roboczym (co jest zmienione, ale niezastage'owane). Plik potrafi
 * być w obu naraz — `MM` znaczy „część zmian zastage'owana, część nie" — i to
 * właśnie dlatego lista zmian w VS Code pokazuje go w dwóch sekcjach.
 */

/** Stan pojedynczej ścieżki po jednej stronie (indeks albo katalog roboczy). */
export type GitFileState =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

export interface GitChange {
  /** Ścieżka względem korzenia repozytorium. */
  path: string;
  /** Poprzednia nazwa przy zmianie nazwy albo kopii. */
  oldPath?: string;
  /** Co pójdzie do commita. */
  index: GitFileState;
  /** Co jest w katalogu roboczym poza indeksem. */
  workTree: GitFileState;
  /** Obie strony zmienione — plik trafia do dwóch sekcji listy. */
  staged: boolean;
  unstaged: boolean;
  /** Konflikt scalania; wymaga rozwiązania przed commitem. */
  conflicted: boolean;
}

const ZNAKI: Record<string, GitFileState> = {
  ' ': 'unmodified',
  M: 'modified',
  T: 'modified', // zmiana typu pliku — dla listy zmian to samo co modyfikacja
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflicted',
  '?': 'untracked',
  '!': 'ignored',
};

/**
 * Czy para kodów oznacza konflikt scalania.
 *
 * Git nie ma jednego znaku na konflikt: `DD`, `AU`, `UD`, `UA`, `DU`, `AA`, `UU`
 * to siedem osobnych kombinacji, a każda znaczy inny rodzaj zderzenia. Dla listy
 * zmian różnica jest bez znaczenia — liczy się, że pliku nie wolno zacommitować,
 * zanim ktoś tego nie rozstrzygnie.
 */
function toKonflikt(x: string, y: string): boolean {
  const para = `${x}${y}`;
  return para === 'DD' || para === 'AA' || x === 'U' || y === 'U';
}

/**
 * Rozbiera wyjście `git status --porcelain=v1 -z`.
 *
 * Wpis ze zmianą nazwy niesie **dwie** ścieżki rozdzielone bajtem zerowym:
 * najpierw nowa, potem stara. Pominięcie tego przesuwa cały dalszy odczyt
 * o jedno pole i reszta listy wychodzi bez sensu.
 */
export function parsePorcelain(output: string): GitChange[] {
  const pola = output.split('\0');
  const zmiany: GitChange[] = [];

  for (let i = 0; i < pola.length; i++) {
    const wpis = pola[i];
    if (wpis.length < 4) continue; // ostatnie pole bywa puste

    const x = wpis[0];
    const y = wpis[1];
    const sciezka = wpis.slice(3);
    const index = ZNAKI[x] ?? 'modified';
    const workTree = ZNAKI[y] ?? 'modified';
    const conflicted = toKonflikt(x, y);

    let oldPath: string | undefined;
    if (x === 'R' || x === 'C') {
      oldPath = pola[++i]; // stara nazwa idzie zaraz po nowej
    }

    zmiany.push({
      path: sciezka,
      oldPath,
      index,
      workTree,
      // Nieśledzony plik nie jest „zastage'owany", choć `X` to `?`.
      staged: !conflicted && index !== 'unmodified' && index !== 'untracked' && index !== 'ignored',
      unstaged: !conflicted && (workTree !== 'unmodified' || index === 'untracked'),
      conflicted,
    });
  }
  return zmiany;
}

/** Podział na sekcje listy zmian — tak, jak pokazuje je edytor. */
export interface GroupedChanges {
  staged: GitChange[];
  changes: GitChange[];
  untracked: GitChange[];
  conflicts: GitChange[];
}

/**
 * Grupuje zmiany do wyświetlenia.
 *
 * Plik ze zmianami po obu stronach (`MM`) trafia do **dwóch** grup — i tak ma
 * być: to jeden plik w dwóch stanach, a nie pomyłka. Ukrycie jednej z połówek
 * znaczyłoby, że użytkownik commituje mniej, niż widzi.
 */
export function groupChanges(zmiany: readonly GitChange[]): GroupedChanges {
  const wynik: GroupedChanges = { staged: [], changes: [], untracked: [], conflicts: [] };
  for (const z of zmiany) {
    if (z.conflicted) {
      wynik.conflicts.push(z);
      continue;
    }
    if (z.index === 'untracked' || z.workTree === 'untracked') {
      wynik.untracked.push(z);
      continue;
    }
    if (z.staged) wynik.staged.push(z);
    if (z.unstaged) wynik.changes.push(z);
  }
  return wynik;
}

/** Jednoliterowy znacznik do listy — jak w VS Code. */
export function statusLetter(state: GitFileState): string {
  switch (state) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'untracked':
      return 'U';
    case 'conflicted':
      return '!';
    case 'ignored':
      return 'I';
    default:
      return 'M';
  }
}
