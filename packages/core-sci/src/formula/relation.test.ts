/**
 * Równanie, które nie jest przypisaniem.
 *
 * Podręcznik pisze (15-5) jako `d²x/dt² + (k/m)x = 0` — nie ma tu „wielkość =
 * wyrażenie", a mimo to tekst odsyła do tego równania trzykrotnie po numerze.
 * Bez własnego rodzaju bloku takie równanie albo zostawało obrazkiem bez
 * identyfikatora, albo parser zgłaszał je jako błędne.
 *
 * Rodzaj jest **deklarowany jawnie** (`@relation`), a nie zgadywany z kształtu
 * — inaczej literówka w przypisaniu („E m = …") przestałaby być błędem
 * i cicho zamieniłaby się w równanie.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from './parseFormula';
import { buildGraph } from '../graph/formulaGraph';

const RUCHU = [
  '@relation',
  '\\frac{d^2x}{dt^2} + \\frac{k}{m} x = 0',
  '@vars x: m, k: N/m, m: kg',
].join('\n');

describe('blok @relation', () => {
  it('przyjmuje równanie bez przypisania i nie zgłasza błędu', () => {
    const b = parseFormulaBlock('rh1-15-eq5', RUCHU);
    expect(b.kind).toBe('relation');
    expect(b.issues).toEqual([]);
    expect(b.latex).toBe('\\frac{d^2x}{dt^2} + \\frac{k}{m} x = 0');
  });

  it('bez @relation to samo jest nadal błędem', () => {
    // Ochrona przed literówką: brak deklaracji znaczy „to miało być przypisanie".
    const b = parseFormulaBlock('x', '\\frac{d^2x}{dt^2} + \\frac{k}{m} x = 0');
    expect(b.issues).toHaveLength(1);
  });

  it('puste równanie jest zgłaszane', () => {
    expect(parseFormulaBlock('x', '@relation').issues).toHaveLength(1);
  });

  it('nie wchodzi do grafu obliczeń', () => {
    // Nie ma czego z niego policzyć bez rozwiązania — ma być widoczne
    // i adresowalne, ale nie może udawać, że coś wylicza.
    const graf = buildGraph([parseFormulaBlock('rh1-15-eq5', RUCHU)]);
    expect(graf.issues).toEqual([]);
    expect(graf.computed).toEqual([]);
    expect(graf.parameters).toEqual([]);
  });
});
