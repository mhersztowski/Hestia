/**
 * Zapis funkcyjny i łańcuch równości — czyli to, co naprawdę stoi w książce.
 *
 * Resnick pisze `U(x) = ½kx²` i `F(x) = −dU/dx = −d(½kx²)/dx = −kx`. Nasz blok
 * przyjmował tylko `U = …`, więc dokument pokazywał `F = −k·x` — wynik bez
 * drogi, którą autor do niego doszedł. Dla podręcznika **wyprowadzenie jest
 * treścią**, nie ozdobą, więc skrót był realną stratą.
 *
 * Nawias z argumentem jest **wyłącznie zapisem**: wielkością pozostaje `F`,
 * więc graf obliczeń nie zmienia się ani o krok.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock, serializeFormulaBlock } from './parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';

const EQ4 = [
  'F(x) = -\\frac{\\mathrm{d}U}{\\mathrm{d}x} = -\\frac{\\mathrm{d}(\\frac{1}{2}kx^2)}{\\mathrm{d}x} = -k x',
  '@vars F: N, k: N/m, x: m',
].join('\n');

describe('zapis funkcyjny', () => {
  it('wielkością jest sama nazwa, nawias to tylko zapis', () => {
    const b = parseFormulaBlock('rh1-15-eq4', EQ4);
    expect(b.issues).toEqual([]);
    expect(b.target).toBe('F');
    expect(b.targetLatex).toBe('F(x)');
  });

  it('prosty przypadek bez nawiasu działa jak dotąd', () => {
    const b = parseFormulaBlock('x', 'U = \\frac{1}{2} k x^2\n@vars U: J, k: N/m, x: m');
    expect(b.target).toBe('U');
    expect(b.targetLatex).toBe('U');
  });

  it('liczy z ostatniego członu łańcucha', () => {
    // Człony pośrednie to zapis wyprowadzenia; silnik nie różniczkuje, więc
    // policzalny jest tylko ostatni.
    const b = parseFormulaBlock('rh1-15-eq4', EQ4);
    expect(b.chain).toHaveLength(3);
    expect(b.expression).toBe('-k x');
  });

  it('graf widzi zwykłą definicję F z parametrów k i x', () => {
    const g = buildGraph([parseFormulaBlock('rh1-15-eq4', EQ4)]);
    expect(g.issues).toEqual([]);
    expect(g.computed).toEqual(['F']);
    expect(g.parameters.sort()).toEqual(['k', 'x']);
    expect(compileGraph(g).issues).toEqual([]);
  });

  it('model liczy poprawnie', () => {
    const model = compileGraph(buildGraph([parseFormulaBlock('rh1-15-eq4', EQ4)]));
    expect(model.run({ k: 8, x: 0.5 }).scalars.F).toBeCloseTo(-4, 10);
  });

  it('zapis wraca w tej samej postaci', () => {
    const b = parseFormulaBlock('rh1-15-eq4', EQ4);
    expect(serializeFormulaBlock(b)).toContain('F(x) = -\\frac{\\mathrm{d}U}{\\mathrm{d}x}');
  });

  it('nawias z argumentem nie myli się z mnożeniem', () => {
    // `E (m + 1) = …` to nie jest funkcja — nazwa musi przylegać do nawiasu.
    expect(parseFormulaBlock('x', 'E (m + 1) = 2').issues).toHaveLength(1);
  });
});
