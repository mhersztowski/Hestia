import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { walkthrough, knownAfter } from './walkthrough';

const graphOf = (...defs: Array<[string, string]>) =>
  buildGraph(defs.map(([id, body]) => parseFormulaBlock(id, body)));

const REZONANS = graphOf(
  ['amplituda', ['A = \\frac{F_0}{m \\cdot (\\omega_0^2 - \\Omega^2)}',
    '@vars A: m, F_0: N, m: kg, Omega: s^-1, omega_0: s^-1',
    '@derivedFrom oscylator', '@assume stan-ustalony'].join('\n')],
  ['oscylator', ['@ode', '@state x, v', '@d x = v', '@d v = -\\omega_0^2 \\cdot x',
    '@init x = 0, v = 0', '@vars x: m, v: m/s, omega_0: s^-1'].join('\n')],
  ['czestosc', ['\\omega_0 = \\sqrt{\\frac{k}{m}}', '@vars omega_0: s^-1, k: N/m, m: kg'].join('\n')],
);

describe('wyprowadzenie krok po kroku', () => {
  it('idzie w kolejności obliczeń, nie w kolejności zapisu', () => {
    // W dokumencie amplituda stoi pierwsza, ale wynika z dwóch pozostałych.
    expect(walkthrough(REZONANS).map((s) => s.formulaId)).toEqual(['czestosc', 'oscylator', 'amplituda']);
  });

  it('pochodzenie wzoru przesuwa go w wykładzie, choć obliczeniowo jest niezależny', () => {
    // Amplituda liczy się z samych parametrów — solver mógłby ją policzyć
    // pierwszą. Ale wywodzi się z równania ruchu i tak musi być opowiedziana.
    const bezWywodu = graphOf(
      ['amplituda', ['A = \\frac{F_0}{m}', '@vars A: m, F_0: N, m: kg'].join('\n')],
      ['oscylator', ['@ode', '@state x, v', '@d x = v', '@d v = -x', '@init x = 1, v = 0',
        '@vars x: m, v: m/s'].join('\n')],
    );
    expect(walkthrough(bezWywodu).map((s) => s.formulaId)).toEqual(['amplituda', 'oscylator']);

    const zWywodem = graphOf(
      ['amplituda', ['A = \\frac{F_0}{m}', '@vars A: m, F_0: N, m: kg', '@derivedFrom oscylator'].join('\n')],
      ['oscylator', ['@ode', '@state x, v', '@d x = v', '@d v = -x', '@init x = 1, v = 0',
        '@vars x: m, v: m/s'].join('\n')],
    );
    expect(walkthrough(zWywodem).map((s) => s.formulaId)).toEqual(['oscylator', 'amplituda']);
  });

  it('każdy krok mówi, co wnosi i czego potrzebuje', () => {
    const steps = walkthrough(REZONANS);
    expect(steps[0]).toMatchObject({ produces: ['omega_0'], kind: 'definition' });
    expect(steps[1]).toMatchObject({ produces: ['x', 'v'], kind: 'ode' });
    expect(steps[1].dependsOn).toContain('omega_0');
  });

  it('niesie założenia i pochodzenie wzoru', () => {
    const ostatni = walkthrough(REZONANS)[2];
    expect(ostatni.assumptions).toEqual(['stan-ustalony']);
    expect(ostatni.derivedFrom).toEqual(['oscylator']);
  });

  it('wiedza narasta z krokami', () => {
    const steps = walkthrough(REZONANS);
    expect(knownAfter(steps, 0)).toEqual([]);
    expect(knownAfter(steps, 1)).toEqual(['omega_0']);
    expect(knownAfter(steps, 2).sort()).toEqual(['omega_0', 'v', 'x']);
    expect(knownAfter(steps, 3)).toContain('A');
  });

  it('dokument z jednym wzorem ma jeden krok', () => {
    expect(walkthrough(graphOf(['x', 'T = 2 \\cdot L'])).length).toBe(1);
  });

  it('cykl nie zawiesza wyprowadzenia', () => {
    const graph = graphOf(['a', 'A = B \\cdot 2'], ['b', 'B = A \\cdot 3']);
    expect(() => walkthrough(graph)).not.toThrow();
    expect(walkthrough(graph).length).toBe(2);
  });
});
