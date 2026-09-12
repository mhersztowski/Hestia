/**
 * solutions.ts — treść rozwiązania, nie tylko jego wynik.
 *
 * `schedule.ts` pamięta, **jak poszło** (ile prób, kiedy wrócić). To za mało dla
 * zadania rachunkowego: za tydzień czytelnik chce zobaczyć **jak to liczył**,
 * a nie że raz mu wyszło. Stąd osobne pole na treść — w tym samym pliku
 * postępów, bo drugi plik znaczyłby drugie miejsce do zsynchronizowania.
 *
 * Dwa tryby, bo zadanie rozwiązuje się dwoma sposobami i żaden nie zastępuje
 * drugiego: `md` to tekst z LaTeX-em (da się przeszukać, poprawić, skopiować),
 * `ink` to pociągnięcia rysika (szybsze przy rachunku, wierne temu, co ręka
 * naprawdę zrobiła). Zapisujemy to, czego czytelnik użył.
 *
 * **Historia jest przycinana.** Pociągnięcia rysika ważą kilka kilobajtów na
 * rozwiązanie, a plik postępów wędruje między telefonem a komputerem przy
 * każdej próbie — bez limitu jedno często powtarzane zadanie rozdęłoby zapis
 * całej bazy. Zostaje ostatnie kilkanaście podejść; starsze i tak nikt nie
 * ogląda.
 */
import type { Quality } from './schedule';
import type { ProgressWithRevision } from './revision';

/** Czym zapisano rozwiązanie. */
export type SolutionMode = 'md' | 'ink';

export interface Solution {
  /** Kiedy wykonano (ms epoch). */
  at: number;
  mode: SolutionMode;
  /** `md`: markdown z LaTeX-em. `ink`: pociągnięcia z `serializeInk`. */
  content: string;
  /** Wpisana albo rozpoznana odpowiedź — to ją sprawdza klucz zadania. */
  answer?: string;
  /** Jak poszło, jeżeli sprawdzono. */
  quality?: Quality;
}

/** Postępy rozszerzone o treść rozwiązań; starsze pliki nie mają tego pola. */
export interface ProgressWithSolutions extends ProgressWithRevision {
  /** Klucz jak w `items`: `dokument:zadanie`. */
  solutions?: Record<string, Solution[]>;
}

/** Ile podejść zostaje w historii jednego zadania. */
export const SOLUTION_HISTORY_LIMIT = 15;

/** Dopisuje rozwiązanie na początek historii, od najnowszego. */
export function recordSolution<T extends ProgressWithSolutions>(
  progress: T,
  key: string,
  solution: Solution,
  limit: number = SOLUTION_HISTORY_LIMIT,
): T {
  const solutions = progress.solutions ?? {};
  const historia = [solution, ...(solutions[key] ?? [])].slice(0, Math.max(1, limit));
  return { ...progress, solutions: { ...solutions, [key]: historia } };
}

/** Historia jednego zadania, od najnowszego. Brak = pusta lista, nie `undefined`. */
export function solutionsFor(progress: ProgressWithSolutions, key: string): Solution[] {
  return progress.solutions?.[key] ?? [];
}

/**
 * Usuwa historię zadań, których nie ma już w bazie.
 *
 * Bez tego zapis rośnie po każdej zmianie nazwy pliku i po każdym usuniętym
 * zadaniu — a to jedyne miejsce, gdzie trzymamy dane liczone w kilobajtach.
 */
export function pruneSolutions<T extends ProgressWithSolutions>(progress: T, żywe: string[]): T {
  if (!progress.solutions) return progress;
  const zostaje = new Set(żywe);
  const solutions: Record<string, Solution[]> = {};
  for (const [key, historia] of Object.entries(progress.solutions)) {
    if (zostaje.has(key)) solutions[key] = historia;
  }
  return { ...progress, solutions };
}
