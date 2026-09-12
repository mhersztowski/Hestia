/**
 * Goła liczba w bloku `sim` jako wartość w jednostce z `@vars`.
 *
 * Do tej pory `"k": 4` przy `@vars k: N/m` kończyło się uwagą „Wartość 4 nie
 * ma jednostki, a oczekiwano N/m". Rygor jest w rdzeniu jednostek słuszny —
 * „15" tam, gdzie ma być kąt, znaczy co innego niż „15 deg" — ale w bloku
 * uruchomienia autor **już zadeklarował** jednostkę wyżej, we wzorze. Powtarzanie
 * jej przy każdej wartości jest przepisywaniem tego samego dwa razy.
 *
 * Potknąłem się o to sam, pisząc przykłady do przeglądu, mimo że wcześniej
 * czytałem ten kod — a to najlepszy dowód, że komunikat trafiał za późno.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph } from './compileGraph';
import { applyOverrides } from './compileGraph';

const OSCYLATOR = [
  '@ode',
  '@state x, v',
  '@d x = v',
  '@d v = -\\frac{k}{m} x - \\frac{b}{m} v',
  '@init x = x_0, v = 0',
  '@vars x: m, v: m/s, k: N/m, m: kg, b: kg/s, x_0: m, t: s',
].join('\n');

const model = () => compileGraph(buildGraph([parseFormulaBlock('osc', OSCYLATOR)]));

describe('goła liczba przy zadeklarowanej jednostce', () => {
  it('jest przyjmowana jako wartość w tej jednostce', () => {
    const { values, issues } = applyOverrides(model(), { k: 4, m: 1, b: 0.2, x_0: 1 });

    expect(issues).toEqual([]);
    expect(values.k).toBe(4);
    expect(values.m).toBe(1);
  });

  it('daje ten sam wynik, co zapis z jednostką', () => {
    const bez = applyOverrides(model(), { k: 4 });
    const z = applyOverrides(model(), { k: '4 N/m' });
    expect(bez.values.k).toBe(z.values.k);
  });

  it('jednostka niepodstawowa nadal wymaga zapisu wprost', () => {
    // `"L": 7000` przy `@vars L: m` znaczy 7000 metrów. Kto chce kilometrów,
    // musi je napisać — i wtedy przelicznik działa jak dotąd.
    const kilometry = applyOverrides(model(), { x_0: '2 km' });
    expect(kilometry.values.x_0).toBe(2000);
  });
});

describe('rygor, który zostaje', () => {
  it('niezgodny wymiar jest nadal błędem', () => {
    // To nie jest brak jednostki, tylko zła jednostka — cicha konwersja
    // znaczyłaby zgodę na bezsens.
    const { issues } = applyOverrides(model(), { k: '4 s' });
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/wymiar|N\/m|s/i);
  });

  it('nieznany parametr jest nadal zgłaszany', () => {
    const { issues } = applyOverrides(model(), { nieistnieje: 1 });
    expect(issues[0]).toMatch(/nie występuje/);
  });

  it('tekst, który nie jest wielkością, jest nadal błędem', () => {
    const { issues } = applyOverrides(model(), { k: 'cztery' });
    expect(issues.length).toBe(1);
  });
});

describe('wielkości bezwymiarowe', () => {
  it('działają jak dotąd', () => {
    const bezwymiarowy = parseFormulaBlock('l', [
      '@ode',
      '@state x',
      '@d x = \\sigma \\cdot x',
      '@init x = 1',
      '@vars x: 1, sigma: 1, t: s',
    ].join('\n'));
    const { values, issues } = applyOverrides(compileGraph(buildGraph([bezwymiarowy])), { sigma: 10 });

    expect(issues).toEqual([]);
    expect(values.sigma).toBe(10);
  });
});
