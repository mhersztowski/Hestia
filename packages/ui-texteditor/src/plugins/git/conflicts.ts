/**
 * conflicts.ts — czytanie i rozwiązywanie konfliktów scalania.
 *
 * Git wstawia w plik znaczniki `<<<<<<<`, `=======` i `>>>>>>>`, a przy
 * `merge.conflictStyle = diff3` dokłada `|||||||` z wersją wyjściową. Tekst
 * między nimi to trzy wersje tego samego fragmentu — i dopóki ktoś nie wybierze,
 * plik nie jest kodem, tylko zapisem sporu.
 *
 * ## Dlaczego parser, a nie „edytuj ręcznie"
 *
 * Ręczne usuwanie znaczników działa, dopóki nie zostawi się jednego przez
 * przeoczenie. Taki plik zwykle się kompiluje (znacznik ląduje w komentarzu albo
 * w napisie) i trafia do repozytorium — a wychodzi na jaw tygodnie później.
 * Parser pozwala wybrać stronę jednym kliknięciem i sprawdzić, że nic nie zostało.
 */

/** Jeden konflikt w pliku, z numerami wierszy liczonymi od 1. */
export interface Conflict {
  /** Wiersz ze znacznikiem `<<<<<<<`. */
  startLine: number;
  /** Wiersz ze znacznikiem `>>>>>>>`. */
  endLine: number;
  /** Etykieta z linii otwierającej — zwykle `HEAD`. */
  oursLabel: string;
  /** Etykieta z linii zamykającej — zwykle nazwa gałęzi albo commit. */
  theirsLabel: string;
  ours: string[];
  theirs: string[];
  /** Wersja wyjściowa; obecna tylko przy stylu `diff3`. */
  base?: string[];
}

const RE_START = /^<{7} ?(.*)$/;
const RE_BASE = /^\|{7} ?(.*)$/;
const RE_SEP = /^={7}$/;
const RE_END = /^>{7} ?(.*)$/;

/**
 * Znajduje konflikty w treści pliku.
 *
 * Niedomknięty konflikt (otwarcie bez zamknięcia) jest **pomijany**, a nie
 * zgłaszany jako konflikt do końca pliku: taki plik ktoś już ruszał ręcznie,
 * a potraktowanie reszty pliku jako jednej strony sporu skasowałoby jego pracę
 * przy pierwszym kliknięciu „weź moje".
 */
export function parseConflicts(content: string): Conflict[] {
  const wiersze = content.split('\n');
  const wynik: Conflict[] = [];

  for (let i = 0; i < wiersze.length; i++) {
    const start = RE_START.exec(wiersze[i]);
    if (!start) continue;

    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let sekcja: 'ours' | 'base' | 'theirs' = 'ours';
    let maBase = false;
    let koniec = -1;
    let theirsLabel = '';

    for (let j = i + 1; j < wiersze.length; j++) {
      const wiersz = wiersze[j];
      if (RE_BASE.test(wiersz)) {
        sekcja = 'base';
        maBase = true;
        continue;
      }
      if (RE_SEP.test(wiersz)) {
        sekcja = 'theirs';
        continue;
      }
      const end = RE_END.exec(wiersz);
      if (end) {
        koniec = j;
        theirsLabel = end[1].trim();
        break;
      }
      // Zagnieżdżony konflikt to znak, że plik był już edytowany —
      // przerywamy, zamiast zgadywać, gdzie kończy się który.
      if (RE_START.test(wiersz)) break;
      (sekcja === 'ours' ? ours : sekcja === 'base' ? base : theirs).push(wiersz);
    }

    if (koniec < 0) continue;
    wynik.push({
      startLine: i + 1,
      endLine: koniec + 1,
      oursLabel: start[1].trim() || 'HEAD',
      theirsLabel: theirsLabel || 'przychodzące',
      ours,
      theirs,
      ...(maBase ? { base } : {}),
    });
    i = koniec;
  }
  return wynik;
}

/** Którą wersję wstawić w miejsce konfliktu. */
export type Resolution = 'ours' | 'theirs' | 'both' | 'base';

/**
 * Zwraca treść pliku z rozwiązanym jednym konfliktem.
 *
 * `both` wstawia obie wersje po kolei — tak jak „Accept Both Changes":
 * najczęściej trafne przy dopisanych obok siebie importach albo pozycjach listy,
 * gdzie obie strony mają rację.
 */
export function resolveConflict(content: string, conflict: Conflict, wybor: Resolution): string {
  const wiersze = content.split('\n');
  const zamiennik =
    wybor === 'ours'
      ? conflict.ours
      : wybor === 'theirs'
        ? conflict.theirs
        : wybor === 'base'
          ? (conflict.base ?? [])
          : [...conflict.ours, ...conflict.theirs];
  return [
    ...wiersze.slice(0, conflict.startLine - 1),
    ...zamiennik,
    ...wiersze.slice(conflict.endLine),
  ].join('\n');
}

/** Rozwiązuje wszystkie konflikty w pliku tą samą decyzją. */
export function resolveAll(content: string, wybor: Resolution): string {
  let tresc = content;
  // Od końca, żeby numery wierszy wcześniejszych konfliktów nie przesunęły się
  // po podmianie późniejszych.
  for (const konflikt of parseConflicts(content).reverse()) {
    tresc = resolveConflict(tresc, konflikt, wybor);
  }
  return tresc;
}

/**
 * Czy w treści zostały jakiekolwiek znaczniki.
 *
 * Sprawdzane przed zapisaniem rozwiązania: plik ze znacznikiem zwykle się
 * kompiluje i trafia do repozytorium, a wychodzi na jaw dużo później.
 */
export function hasConflictMarkers(content: string): boolean {
  return content
    .split('\n')
    .some((w) => RE_START.test(w) || RE_SEP.test(w) || RE_END.test(w) || RE_BASE.test(w));
}
