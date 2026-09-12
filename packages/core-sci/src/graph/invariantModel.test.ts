/**
 * Niezmiennik zadeklarowany w dokumencie → pomiar w wyniku modelu.
 *
 * Domknięcie etapu 0: autor pisze jedną linijkę `@invariant E = …`, a czytelnik
 * dostaje przy symulacji informację, czy energia została zachowana. Cała
 * wartość tej ścieżki polega na tym, że deklaracja stoi **przy równaniach**,
 * a nie w nastawach bloku `sim` — ta sama fizyka opisana raz.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph, defaultValues } from './compileGraph';

const OSCYLATOR = (extra: string[]) => compileGraph(buildGraph([parseFormulaBlock('osc', [
  '@ode',
  '@state x, v',
  '@d x = v',
  '@d v = -\\frac{k}{m} x',
  '@init x = A, v = 0',
  '@vars k: N/m, m: kg, x: m, v: m/s, A: m, E: J',
  ...extra,
].join('\n'))]));

const NASTAWY = { k: 1, m: 1, A: 1 };
const ENERGIA = '@invariant E = \\frac{1}{2} m v^2 + \\frac{1}{2} k x^2';

describe('pomiar niezmiennika przy okazji liczenia modelu', () => {
  it('mierzy energię zadeklarowaną w bloku wzoru', () => {
    const model = OSCYLATOR([ENERGIA]);
    const wynik = model.run({ ...defaultValues(model), ...NASTAWY }, [0, 10], 0.001);

    expect(wynik.invariants).toHaveLength(1);
    expect(wynik.invariants![0].name).toBe('E');
    // ½·m·v² + ½·k·x² przy x=1, v=0, k=m=1 daje dokładnie ½.
    expect(wynik.invariants![0].initial).toBeCloseTo(0.5, 9);
  });

  it('pokazuje, że Euler pompuje energię — to jest cała treść tej dyrektywy', () => {
    const model = OSCYLATOR([ENERGIA, '@solver euler']);
    const wynik = model.run({ ...defaultValues(model), ...NASTAWY }, [0, 50], 0.01);

    expect(wynik.invariants![0].trend).toBe('drift');
    expect(wynik.invariants![0].ratePerUnitTime).toBeGreaterThan(0);
  });

  it('pokazuje, że Verlet trzyma ją w ryzach', () => {
    const model = OSCYLATOR([ENERGIA, '@solver verlet']);
    const wynik = model.run({ ...defaultValues(model), ...NASTAWY }, [0, 50], 0.01);

    expect(wynik.invariants![0].trend).toBe('oscillation');
    expect(wynik.invariants![0].relative).toBeLessThan(1e-3);
  });

  it('mierzy każdy zadeklarowany niezmiennik osobno', () => {
    const model = OSCYLATOR([ENERGIA, '@invariant p = m v']);
    const wynik = model.run({ ...defaultValues(model), ...NASTAWY }, [0, 10], 0.001);

    expect(wynik.invariants!.map((i) => i.name)).toEqual(['E', 'p']);
  });
});

describe('gdy mierzyć nie ma czego', () => {
  it('model bez deklaracji dostaje pustą listę, nie brak pola', () => {
    const wynik = OSCYLATOR([]).run({ ...defaultValues(OSCYLATOR([])), ...NASTAWY });
    expect(wynik.invariants).toEqual([]);
  });

  it('niezmiennik odwołujący się do nieznanej wielkości jest zgłaszany przy kompilacji', () => {
    const model = OSCYLATOR(['@invariant E = \\frac{1}{2} m \\upsilon^2']);
    expect(model.issues.join(' ')).toMatch(/E/);
  });

  it('model bez równania ruchu nie udaje, że coś zmierzył', () => {
    const model = compileGraph(buildGraph([parseFormulaBlock('okres', [
      'T = 2\\pi\\sqrt{\\frac{m}{k}}',
      '@vars m: kg, k: N/m, T: s',
      '@invariant T = T',
    ].join('\n'))]));

    expect(model.run(defaultValues(model)).invariants).toEqual([]);
  });
});
