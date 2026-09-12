/**
 * Porównanie kilku przebiegów tego samego modelu.
 *
 * Dziś, żeby zestawić wahadło przy dwóch długościach, trzeba postawić obok
 * siebie dwa bloki `sim` — a wtedy wykresy mają osobne osie i osobne skale,
 * więc porównuje się je na oko. Tymczasem „co się zmieni, gdy zmienię ten
 * parametr" jest **najczęstszym pytaniem** zadawanym symulacji w dokumencie
 * dydaktycznym.
 *
 * Warstwa rdzenia liczy przebiegi i układa je w jeden komplet serii; wykres
 * jest już zwykłym wykresem wielu serii, który mamy.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph } from './compileGraph';
import { compareRuns, type ComparisonRun } from './porownanie';

const WAHADLO = [
  '@ode',
  '@state \\theta, \\omega',
  '@d \\theta = \\omega',
  '@d \\omega = -\\frac{g}{L} \\sin(\\theta)',
  '@init \\theta = \\theta_0, \\omega = 0',
  '@vars \\theta: rad, \\omega: rad/s, g: m/s^2, L: m, \\theta_0: rad, t: s',
].join('\n');

const model = () => compileGraph(buildGraph([parseFormulaBlock('wahadlo', WAHADLO)]));

const PRZEBIEGI: ComparisonRun[] = [
  { label: 'krótkie', values: { L: 0.5 } },
  { label: 'długie', values: { L: 2 } },
];

describe('compareRuns', () => {
  const wynik = compareRuns(model(), PRZEBIEGI, { duration: 4 });

  it('liczy tyle przebiegów, ile podano', () => {
    expect(wynik.runs).toHaveLength(2);
    expect(wynik.runs.map((r) => r.label)).toEqual(['krótkie', 'długie']);
  });

  it('każdy przebieg ma własne serie', () => {
    for (const run of wynik.runs) {
      expect(Object.keys(run.result.series).length).toBeGreaterThan(0);
    }
  });

  it('różne parametry dają różne wyniki', () => {
    // Gdyby przebiegi wyszły identyczne, znaczyłoby to, że wartości nie doszły
    // do modelu — a wykres wyglądałby wtedy jak jedna krzywa i nikt by nie
    // zauważył.
    const [krotkie, dlugie] = wynik.runs.map((r) => r.result.series.theta ?? []);
    expect(krotkie.length).toBeGreaterThan(2);
    const roznica = krotkie.some(([t, v], i) => Math.abs(v - (dlugie[i]?.[1] ?? v)) > 1e-6 && t > 0);
    expect(roznica).toBe(true);
  });

  it('składa serie do jednego kompletu z nazwami po etykiecie', () => {
    // To jest cały sens bloku: jedna oś i jedna skala, więc porównanie jest
    // porównaniem, a nie zestawieniem dwóch obrazków.
    expect(Object.keys(wynik.series)).toContain('theta (krótkie)');
    expect(Object.keys(wynik.series)).toContain('theta (długie)');
  });

  it('bierze tylko wielkości, które są we wszystkich przebiegach', () => {
    expect(Object.keys(wynik.series).every((name) => /\((krótkie|długie)\)$/.test(name))).toBe(true);
  });

  it('zgłasza uwagi z każdego przebiegu razem z jego etykietą', () => {
    const zeZlym = compareRuns(model(), [{ label: 'zły', values: { nieistnieje: 1 } }], { duration: 1 });
    expect(zeZlym.issues[0]).toContain('zły');
  });

  it('pusta lista przebiegów daje pusty wynik, a nie wyjątek', () => {
    const pusty = compareRuns(model(), [], { duration: 1 });
    expect(pusty.runs).toEqual([]);
    expect(pusty.series).toEqual({});
  });

  it('jeden przebieg też działa — to zwykły wykres', () => {
    const jeden = compareRuns(model(), [{ label: 'a', values: {} }], { duration: 2 });
    expect(jeden.runs).toHaveLength(1);
    expect(Object.keys(jeden.series).length).toBeGreaterThan(0);
  });
});

describe('wybór wielkości', () => {
  it('`only` zawęża do wskazanych wielkości', () => {
    // Model o pięciu wielkościach razy trzy przebiegi to piętnaście krzywych —
    // wykres przestaje wtedy cokolwiek pokazywać.
    const wynik = compareRuns(model(), PRZEBIEGI, { duration: 2, only: ['theta'] });
    expect(Object.keys(wynik.series).sort()).toEqual(['theta (długie)', 'theta (krótkie)']);
  });

  it('nieznana wielkość w `only` jest zgłaszana, a nie przemilczana', () => {
    const wynik = compareRuns(model(), PRZEBIEGI, { duration: 2, only: ['nie-ma'] });
    expect(wynik.issues.some((i) => i.includes('nie-ma'))).toBe(true);
  });
});
