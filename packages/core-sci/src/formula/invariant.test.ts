/**
 * Dyrektywa `@invariant` — Etap 0 planu silnika.
 *
 * Autor deklaruje wielkość, która **ma zostać stała** (energia, pęd, moment
 * pędu). Deklaracja nie zmienia obliczeń: zmienia to, co silnik potrafi
 * o obliczeniach powiedzieć. Silnik gry takiej dyrektywy nie ma, bo nie ma
 * komu o niej meldować.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock, serializeFormulaBlock } from './parseFormula';

const OSCYLATOR = (extra: string[]) => parseFormulaBlock('oscylator', [
  '@ode',
  '@state x, v',
  '@d x = v',
  '@d v = -\\frac{k}{m} x',
  '@init x = A, v = 0',
  '@vars k: N/m, m: kg, x: m, v: m/s, A: m',
  ...extra,
].join('\n'));

describe('odczyt niezmiennika', () => {
  it('czyta nazwę i wyrażenie', () => {
    const block = OSCYLATOR(['@invariant E = \\frac{1}{2} m v^2 + \\frac{1}{2} k x^2']);

    expect(block.issues).toEqual([]);
    expect(block.invariants).toEqual({ E: '\\frac{1}{2} m v^2 + \\frac{1}{2} k x^2' });
  });

  it('przyjmuje kilka niezmienników — układ może zachowywać więcej niż jedną wielkość', () => {
    const block = OSCYLATOR([
      '@invariant E = \\frac{1}{2} m v^2 + \\frac{1}{2} k x^2',
      '@invariant p = m v',
    ]);

    expect(Object.keys(block.invariants ?? {})).toEqual(['E', 'p']);
  });

  it('melduje zapis bez znaku równości zamiast go połykać', () => {
    const block = OSCYLATOR(['@invariant energia całkowita']);

    expect(block.invariants).toBeUndefined();
    expect(block.issues.map((i) => i.message).join(' ')).toMatch(/@invariant nazwa = wyrażenie/);
  });
});

describe('zapis z powrotem do pliku', () => {
  it('nie gubi niezmiennika przy round-tripie', () => {
    const zapis = serializeFormulaBlock(OSCYLATOR(['@invariant E = \\frac{1}{2} m v^2 + \\frac{1}{2} k x^2']));

    expect(zapis).toContain('@invariant E = \\frac{1}{2} m v^2 + \\frac{1}{2} k x^2');
    // Powtórny odczyt musi dać to samo — inaczej samo otwarcie dokumentu
    // przepisywałoby autorowi blok.
    expect(parseFormulaBlock('oscylator', zapis).invariants)
      .toEqual({ E: '\\frac{1}{2} m v^2 + \\frac{1}{2} k x^2' });
  });

  it('blok bez niezmiennika nie dostaje pustej dyrektywy', () => {
    expect(serializeFormulaBlock(OSCYLATOR([]))).not.toContain('@invariant');
  });
});
