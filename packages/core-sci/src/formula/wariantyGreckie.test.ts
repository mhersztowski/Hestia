import { describe, it, expect } from 'vitest';
import { parseFormulaBlock, symbolName } from './parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';

/**
 * Warianty greckich liter (`\varkappa`, `\vartheta`, …) są w podręczniku
 * zwykłymi oznaczeniami wielkości — Resnick pisze moment kierujący jako `ϰ`.
 *
 * Compute Engine nazywa je jednak inaczej, niż wyglądają: `\varkappa` to
 * `kappaSymbol`, a nie `varkappa`. Nasza normalizacja usuwała sam backslash,
 * więc `@vars \varkappa` deklarowało wielkość o nazwie, której w wyrażeniu nie
 * było — wzór zgłaszał brakujący symbol i nie dawał się policzyć.
 */
describe('warianty greckich liter', () => {
  it('nazwa symbolu zgadza się z tym, co widzi silnik', () => {
    expect(symbolName('\\varkappa')).toBe('kappaSymbol');
    expect(symbolName('\\vartheta')).toBe('thetaSymbol');
    expect(symbolName('\\varepsilon')).toBe('epsilonSymbol');
    expect(symbolName('\\varrho')).toBe('rhoSymbol');
    expect(symbolName('\\varpi')).toBe('piSymbol');
  });

  it('indeks przy wariancie zostaje nietknięty', () => {
    expect(symbolName('\\vartheta_0')).toBe('thetaSymbol_0');
    expect(symbolName('\\varkappa_{1}')).toBe('kappaSymbol_1');
  });

  it('zwykłe litery greckie zostają jak były', () => {
    expect(symbolName('\\kappa')).toBe('kappa');
    expect(symbolName('\\omega_0')).toBe('omega_0');
    expect(symbolName('T')).toBe('T');
  });

  it('wzór z wariantem się kompiluje', () => {
    const blok = parseFormulaBlock(
      'rh1-15-eq24',
      'T = 2\\pi\\sqrt{\\frac{I}{\\varkappa}}\n@vars T: s, I: kg*m^2, \\varkappa: N*m',
    );
    expect(blok.issues).toEqual([]);
    expect(compileGraph(buildGraph([blok])).issues).toEqual([]);
  });

  /**
   * `\varphi` jest wyjątkiem, którego nie da się zmapować: Compute Engine czyta
   * je jako **złoty podział**, czyli stałą 1,618 — wzór nie tyle się psuje, co
   * po cichu liczy z podstawioną liczbą. Dlatego zgłaszamy to jako błąd bloku,
   * zamiast pozwolić autorowi na milczącą pomyłkę.
   */
  it('varphi jest zgłoszone, bo silnik czyta je jako złoty podział', () => {
    const blok = parseFormulaBlock('x', 'x = A\\cos(\\omega t + \\varphi)\n@vars x: m, A: m, omega: 1/s, t: s, \\varphi: 1');
    expect(blok.issues.map((i) => i.message).join(' ')).toMatch(/varphi.*złot|złot.*varphi/i);
  });

  it('blok bez wariantów nie dostaje żadnego ostrzeżenia', () => {
    const blok = parseFormulaBlock('x', 'x = A\\cos(\\omega t + \\phi)\n@vars x: m, A: m, omega: 1/s, t: s, phi: 1');
    expect(blok.issues).toEqual([]);
  });
});

/**
 * Prim u Resnicka oznacza **inną wielkość** (`ω′` to częstość ruchu tłumionego),
 * a dla silnika matematycznego jest pochodną: `\omega'` czyta się jako
 * `Prime(omega)`. Zapis nie przechodzi więc cicho — ale komunikat „wzór musi
 * być przypisaniem" niczego autorowi nie mówi, bo przypisanie tam przecież jest.
 */
describe('prim w nazwie wielkości', () => {
  it('blok mówi wprost, na czym polega kłopot, i co zrobić', () => {
    const blok = parseFormulaBlock('rh1-15-eq39', "\\omega' = 2\\pi\\nu'\n@vars omega': 1/s, nu': Hz");
    const komunikaty = blok.issues.map((i) => i.message).join(' ');
    expect(komunikaty).toMatch(/prim/i);
    expect(komunikaty).toMatch(/pochodn/i);
    expect(komunikaty).toMatch(/@relation/);
  });

  it('wzór bez primu dostaje dawny komunikat', () => {
    const blok = parseFormulaBlock('x', 'k + m = 2\n@vars k: 1, m: 1');
    expect(blok.issues.map((i) => i.message).join(' ')).toMatch(/musi być przypisaniem/);
  });
});
