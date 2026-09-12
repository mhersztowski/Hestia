/**
 * `@solver rosenbrock` — metoda dla układów sztywnych dostępna z dokumentu.
 *
 * Sztywność jest cechą **układu**, nie zadania numerycznego, więc autor
 * dokumentu ma prawo o niej nie wiedzieć. Dlatego dwie rzeczy muszą działać
 * razem: metoda jawna ma rozpoznać sztywność i powiedzieć wprost, czego użyć,
 * a wskazana metoda ma ten układ policzyć.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph, defaultValues } from './compileGraph';

/** Obwód RC ze źródłem: sztywny, gdy stała czasowa jest bardzo krótka. */
const rc = (extra: string[]) => compileGraph(buildGraph([parseFormulaBlock('rc', [
  '@ode',
  '@state U',
  '@d U = \\frac{E - U}{\\tau}',
  '@init U = 0',
  '@vars U: V, E: V, tau: s',
  ...extra,
].join('\n'))]));

const NASTAWY = { E: 5, tau: 1e-6 };

describe('wybór metody niejawnej', () => {
  it('liczy obwód o stałej czasowej mikrosekundy przez całą sekundę', () => {
    const m = rc(['@solver rosenbrock']);
    const wynik = m.run({ ...defaultValues(m), ...NASTAWY }, [0, 1], 0.01);

    // Po czasie tysiąckrotnie dłuższym od stałej czasowej napięcie jest równe
    // napięciu źródła — i to jest cała treść tego układu.
    expect(wynik.trajectory!.value('U', 1)).toBeCloseTo(5, 9);
    expect(wynik.error).toBeUndefined();
  });

  it('metoda jawna odmawia i wskazuje tę właściwą', () => {
    const m = rc(['@solver dopri5']);
    const wynik = m.run({ ...defaultValues(m), ...NASTAWY }, [0, 1], 0.01);

    expect(wynik.trajectory).toBeUndefined();
    expect(wynik.error).toMatch(/sztywny/i);
    expect(wynik.error).toMatch(/rosenbrock/i);
  });

  it('rozumie `stiff` jako nazwę mówiącą o układzie, nie o metodzie', () => {
    const m = rc(['@solver stiff']);
    expect(m.run({ ...defaultValues(m), ...NASTAWY }, [0, 1], 0.01).trajectory!.value('U', 1))
      .toBeCloseTo(5, 9);
  });

  it('odtwarza przebieg ładowania, nie tylko stan końcowy', () => {
    const m = rc(['@solver rosenbrock', '@tol 1e-8']);
    const wynik = m.run({ ...defaultValues(m), E: 5, tau: 0.1 }, [0, 1], 0.01);

    // U(t) = E(1 − e^(−t/τ)) — przy τ = 0,1 s układ nie jest jeszcze sztywny,
    // więc wynik da się porównać ze wzorem punkt po punkcie.
    for (const t of [0.05, 0.2, 0.5]) {
      expect(wynik.trajectory!.value('U', t)).toBeCloseTo(5 * (1 - Math.exp(-t / 0.1)), 6);
    }
  });
});

describe('zdarzenia przy metodzie niejawnej', () => {
  it('ostrzega, że chwila zdarzenia będzie przybliżona', () => {
    const m = rc(['@when U > 4', '@stop', '@solver rosenbrock']);
    expect(m.issues.join(' ')).toMatch(/przybliżon/i);
  });

  it('mimo to zatrzymuje symulację na progu', () => {
    const m = rc(['@when U > 4', '@stop', '@solver rosenbrock', '@tol 1e-8']);
    const wynik = m.run({ ...defaultValues(m), E: 5, tau: 0.1 }, [0, 1], 0.001);

    // U = 4 V przy t = −τ·ln(1 − 4/5) = 0,1·ln 5 ≈ 0,1609 s.
    expect(wynik.trajectory!.t1).toBeGreaterThan(0.15);
    expect(wynik.trajectory!.t1).toBeLessThan(0.18);
  });
});
