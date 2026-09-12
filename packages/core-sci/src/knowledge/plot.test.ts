/**
 * Rysunek liczony ze wzoru.
 *
 * Rys. 15-6 i 15-7 u Resnicka są w całości wykresami `x = A cos(ωt+φ)` i jej
 * pochodnych — nie ma w nich elementu schematycznego. Skan takiego rysunku jest
 * stratą: nie skaluje się, nie ma naszej typografii i nie da się go poprawić
 * razem ze wzorem.
 *
 * Blok opisuje **panele i krzywe**, bo tak zbudowany jest rysunek w książce
 * (15-6 ma trzy panele po dwie krzywe). Osie są bez skal liczbowych — podręcznik
 * podpisuje je `A` i `T`, żeby czytelnik patrzył na kształt, nie na wartości.
 */
import { describe, it, expect } from 'vitest';
import { parseFigureBlock } from './blocks';

const RYS = [
  '@caption **Rys. 15-6.** Różne rozwiązania.',
  '@domain t: 0..2.2',
  '@axis t, x',
  '@panel a',
  '@curve I: \\cos(2\\pi t)',
  '@curve II: \\cos(2\\pi t + \\pi/4) | dashed',
  '@panel b',
  '@curve I: \\cos(2\\pi t)',
  '@curve III: 0.5\\cos(2\\pi t) | dashed',
].join('\n');

describe('rysunek z krzywych', () => {
  it('czyta panele i krzywe', () => {
    const r = parseFigureBlock('rh1-15-rys6', RYS);
    expect(r.issues).toEqual([]);
    expect(r.plot?.panels).toHaveLength(2);
    expect(r.plot?.panels[0].name).toBe('a');
    expect(r.plot?.panels[0].curves).toHaveLength(2);
  });

  it('czyta podpis krzywej, wzór i styl', () => {
    const [panel] = parseFigureBlock('x', RYS).plot!.panels;
    expect(panel.curves[0]).toMatchObject({ label: 'I', expression: '\\cos(2\\pi t)', dashed: false });
    expect(panel.curves[1]).toMatchObject({ label: 'II', dashed: true });
  });

  it('czyta dziedzinę i nazwy osi', () => {
    const p = parseFigureBlock('x', RYS).plot!;
    expect(p.variable).toBe('t');
    expect(p.from).toBe(0);
    expect(p.to).toBeCloseTo(2.2);
    expect(p.axisX).toBe('t');
    expect(p.axisY).toBe('x');
  });

  it('krzywa bez panelu trafia do panelu domyślnego', () => {
    // Rysunek jednopanelowy nie powinien wymagać deklarowania panelu.
    const r = parseFigureBlock('x', '@domain t: 0..1\n@curve x: \\cos(t)');
    expect(r.plot?.panels).toHaveLength(1);
    expect(r.plot?.panels[0].name).toBeUndefined();
  });

  it('krzywe bez dziedziny są zgłaszane', () => {
    const r = parseFigureBlock('x', '@curve I: \\cos(t)');
    expect(r.issues.some((i) => /dziedzin/i.test(i.message))).toBe(true);
  });

  it('rysunek z krzywymi nie jest obrazem ani skryptem', () => {
    const r = parseFigureBlock('x', RYS);
    expect(r.image).toBeUndefined();
    expect(r.script).toBeUndefined();
  });
});
