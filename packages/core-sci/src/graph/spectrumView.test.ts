/**
 * Widok widma — dobierany inaczej niż pozostałe.
 *
 * Reguła w tym pakiecie brzmi „widok wynika z wymiarów, nie z nazw", ale widmo
 * nie da się z wymiarów wyprowadzić: o tym, czy warto je pokazać, decyduje
 * **kształt rozwiązania**, a ten jest znany dopiero po policzeniu. Dlatego
 * widmo pojawia się tylko wtedy, gdy autor o nie poprosi.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph } from './compileGraph';
import { suggestViews } from './visualization';

const model = () => compileGraph(buildGraph([parseFormulaBlock('osc', [
  '@ode',
  '@state x, v',
  '@d x = v',
  '@d v = -x',
  '@init x = 1, v = 0',
  '@vars x: m, v: m/s',
].join('\n'))]));

describe('widmo na żądanie', () => {
  it('nie pojawia się samo z siebie', () => {
    expect(suggestViews(model()).map((v) => v.kind)).not.toContain('spectrum');
  });

  it('pojawia się, gdy blok o nie prosi', () => {
    const widoki = suggestViews(model(), ['spectrum']);

    expect(widoki).toHaveLength(1);
    expect(widoki[0].kind).toBe('spectrum');
  });

  it('bierze te same przebiegi co wykres czasowy', () => {
    const czasowy = suggestViews(model(), ['timeseries'])[0];
    const widmowy = suggestViews(model(), ['spectrum'])[0];

    expect(widmowy.kind === 'spectrum' && czasowy.kind === 'timeseries'
      && widmowy.names).toEqual(czasowy.kind === 'timeseries' ? czasowy.names : []);
  });

  it('model bez przebiegów nie dostaje widma, choćby prosił', () => {
    const statyczny = compileGraph(buildGraph([parseFormulaBlock('okres', [
      'T = 2\\pi\\sqrt{\\frac{m}{k}}',
      '@vars T: s, m: kg, k: N/m',
    ].join('\n'))]));

    expect(suggestViews(statyczny, ['spectrum'])).toEqual([]);
  });
});
