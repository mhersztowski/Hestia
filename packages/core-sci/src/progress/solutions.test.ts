import { describe, it, expect } from 'vitest';
import { emptyProgress } from './schedule';
import {
  recordSolution, solutionsFor, pruneSolutions, SOLUTION_HISTORY_LIMIT,
  type ProgressWithSolutions, type Solution,
} from './solutions';

const T = Date.UTC(2026, 7, 4);
const rozw = (at: number, mode: Solution['mode'] = 'md'): Solution =>
  ({ at, mode, content: `treść ${at}`, answer: '0,28 s' });

describe('historia rozwiązań', () => {
  it('zapisuje treść, tryb, odpowiedź i datę', () => {
    const p = recordSolution(emptyProgress(), 'Z.md:z1', rozw(T));
    const [s] = solutionsFor(p, 'Z.md:z1');
    expect(s).toMatchObject({ at: T, mode: 'md', answer: '0,28 s' });
    expect(s.content).toContain('treść');
  });

  it('najnowsze na początku', () => {
    let p: ProgressWithSolutions = recordSolution(emptyProgress(), 'k', rozw(T - 1000));
    p = recordSolution(p, 'k', rozw(T));
    expect(solutionsFor(p, 'k').map((s) => s.at)).toEqual([T, T - 1000]);
  });

  it('oba tryby zapisu żyją obok siebie', () => {
    let p: ProgressWithSolutions = recordSolution(emptyProgress(), 'k', rozw(T, 'md'));
    p = recordSolution(p, 'k', rozw(T + 1, 'ink'));
    expect(solutionsFor(p, 'k').map((s) => s.mode)).toEqual(['ink', 'md']);
  });

  /**
   * Pociągnięcia rysika ważą kilka kilobajtów na rozwiązanie, a plik postępów
   * wędruje między urządzeniami przy każdej próbie — bez limitu jedno często
   * powtarzane zadanie rozdęłoby zapis całej bazy.
   */
  it('historia jest przycinana do ostatnich podejść', () => {
    let p: ProgressWithSolutions = emptyProgress();
    for (let i = 0; i < SOLUTION_HISTORY_LIMIT + 5; i += 1) p = recordSolution(p, 'k', rozw(T + i));
    const h = solutionsFor(p, 'k');
    expect(h).toHaveLength(SOLUTION_HISTORY_LIMIT);
    expect(h[0].at).toBe(T + SOLUTION_HISTORY_LIMIT + 4); // najnowsze zostaje
  });

  it('historie różnych zadań się nie mieszają', () => {
    let p: ProgressWithSolutions = recordSolution(emptyProgress(), 'a', rozw(T));
    p = recordSolution(p, 'b', rozw(T + 1));
    expect(solutionsFor(p, 'a')).toHaveLength(1);
    expect(solutionsFor(p, 'b')).toHaveLength(1);
  });

  it('brak historii to pusta lista, nie undefined', () => {
    expect(solutionsFor(emptyProgress(), 'nieznane')).toEqual([]);
    expect(solutionsFor({ items: {}, version: 1 } as ProgressWithSolutions, 'x')).toEqual([]);
  });

  // Bez sprzątania zapis rośnie po każdej zmianie nazwy pliku i usuniętym zadaniu.
  it('sprzątanie usuwa historię zadań, których już nie ma', () => {
    let p: ProgressWithSolutions = recordSolution(emptyProgress(), 'żywe', rozw(T));
    p = recordSolution(p, 'usunięte', rozw(T));
    const po = pruneSolutions(p, ['żywe']);
    expect(Object.keys(po.solutions!)).toEqual(['żywe']);
  });

  it('sprzątanie starszego pliku bez historii niczego nie psuje', () => {
    const stary = { items: {}, version: 1 } as ProgressWithSolutions;
    expect(pruneSolutions(stary, [])).toBe(stary);
  });
});
