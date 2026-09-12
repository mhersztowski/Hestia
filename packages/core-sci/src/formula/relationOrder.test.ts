/**
 * `@relation` niezależnie od miejsca w bloku.
 *
 * Parser czytał blok liniowo i dyrektywa działała **tylko wtedy, gdy stała
 * przed wzorem**. Postawiona pod spodem — a tam trafiają wszystkie pozostałe
 * dyrektywy, więc autor stawia ją tam odruchowo — powodowała, że wzór lądował
 * wśród nierozpoznanych linii, a blok zgłaszał „równanie nie ma treści".
 *
 * Komunikat był przy tym mylący podwójnie: treść była, tylko została
 * przeczytana nie tam, gdzie trzeba, a przyczyną była kolejność, o której
 * nigdzie nie napisano.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from './parseFormula';

const WZOR = '\\frac{\\mathrm{d}^2 x}{\\mathrm{d}t^2} + \\frac{k}{m} x = 0';

describe('@relation przed wzorem', () => {
  const block = parseFormulaBlock('r', ['@relation', WZOR, '@vars x: m, k: N/m, m: kg'].join('\n'));

  it('daje równanie z treścią', () => {
    expect(block.kind).toBe('relation');
    expect(block.latex).toBe(WZOR);
    expect(block.issues).toEqual([]);
  });
});

describe('@relation po wzorze', () => {
  const block = parseFormulaBlock('r', [WZOR, '@relation', '@vars x: m, k: N/m, m: kg'].join('\n'));

  it('daje dokładnie to samo co zapis odwrotny', () => {
    expect(block.kind).toBe('relation');
    expect(block.latex).toBe(WZOR);
  });

  it('nie zgłasza uwag ani nierozpoznanych linii', () => {
    expect(block.issues).toEqual([]);
    expect(block.unknown).toEqual([]);
  });

  it('czyta jednostki tak samo', () => {
    expect(block.vars?.x).toBe('m');
    expect(block.vars?.k).toBe('N/m');
  });
});

describe('@relation po wzorze wyglądającym na przypisanie', () => {
  // `E = mc^2` rozbiera się jako definicja. Dyrektywa pod spodem musi to
  // cofnąć — autor mówi wprost, że nie chce liczyć tej wielkości.
  const block = parseFormulaBlock('r', ['E = m c^2', '@relation'].join('\n'));

  it('przestaje być definicją', () => {
    expect(block.kind).toBe('relation');
    expect(block.target).toBeUndefined();
  });

  it('zachowuje pełny zapis, nie samą prawą stronę', () => {
    expect(block.latex).toBe('E = m c^2');
  });
});

describe('@relation z wieloliniowym zapisem', () => {
  const block = parseFormulaBlock('r', [
    '\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}',
    '@relation',
  ].join('\n'));

  it('czyta całość', () => {
    expect(block.latex).toBe('\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}');
    expect(block.issues).toEqual([]);
  });
});

describe('pusty blok z samą dyrektywą', () => {
  it('nadal zgłasza brak treści', () => {
    // To jedyny przypadek, w którym komunikat jest prawdziwy.
    const block = parseFormulaBlock('r', '@relation');
    expect(block.issues.some((i) => /nie ma treści/.test(i.message))).toBe(true);
  });
});
