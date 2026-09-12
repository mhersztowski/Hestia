import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph, topologicalOrder } from './formulaGraph';

const blocks = (...defs: Array<[string, string]>) =>
  defs.map(([id, body]) => parseFormulaBlock(id, body));

describe('kolejność obliczeń wynika z zależności', () => {
  it('sortuje topologicznie bez podawania kolejności ręcznie', () => {
    // Zapisane w kolejności odwrotnej do obliczeniowej — graf ma to naprawić.
    const graph = buildGraph(blocks(
      ['energy', 'E = m \\cdot g \\cdot h'],
      ['height', 'h = \\frac{1}{2} \\cdot g \\cdot t^2'],
    ));

    expect(topologicalOrder(graph)).toEqual(['height', 'energy']);
  });

  it('węzły niezależne zachowują kolejność z dokumentu', () => {
    const graph = buildGraph(blocks(['a', 'A = 2 \\cdot x'], ['b', 'B = 3 \\cdot y']));
    expect(topologicalOrder(graph)).toEqual(['a', 'b']);
  });

  it('parametry to symbole, których nie liczy żaden wzór', () => {
    const graph = buildGraph(blocks(
      ['period', 'T = 2\\pi\\sqrt{\\frac{L}{g}}', ],
    ));
    expect(graph.parameters.sort()).toEqual(['L', 'g']);
    expect(graph.computed).toEqual(['T']);
  });

  it('symbol liczony przez inny wzór przestaje być parametrem', () => {
    const graph = buildGraph(blocks(
      ['omega', '\\omega_0 = \\sqrt{\\frac{g}{L}}'],
      ['period', 'T = \\frac{2\\pi}{\\omega_0}'],
    ));
    expect(graph.parameters.sort()).toEqual(['L', 'g']);
    expect(topologicalOrder(graph)).toEqual(['omega', 'period']);
  });
});

describe('walidacja indeksu', () => {
  it('cykl jest błędem, nie zawieszeniem', () => {
    const graph = buildGraph(blocks(['a', 'A = B \\cdot 2'], ['b', 'B = A \\cdot 3']));
    expect(graph.issues.some((i) => /cykl/i.test(i.message))).toBe(true);
    // Sortowanie nadal musi coś zwrócić — dokument z błędem ma się wyświetlić.
    expect(() => topologicalOrder(graph)).not.toThrow();
  });

  it('duplikat identyfikatora jest błędem', () => {
    const graph = buildGraph(blocks(['a', 'A = 1'], ['a', 'B = 2']));
    expect(graph.issues.some((i) => /duplikat/i.test(i.message))).toBe(true);
  });

  it('wiszące @derivedFrom jest błędem', () => {
    const graph = buildGraph(blocks(['a', ['A = 1', '@derivedFrom nieistnieje'].join('\n')]));
    expect(graph.issues.some((i) => i.message.includes('nieistnieje'))).toBe(true);
  });

  it('poprawne @derivedFrom nie zgłasza nic', () => {
    const graph = buildGraph(blocks(['base', 'B = 1'], ['a', ['A = B', '@derivedFrom base'].join('\n')]));
    expect(graph.issues).toEqual([]);
  });

  it('dwa wzory liczące tę samą wielkość to błąd', () => {
    const graph = buildGraph(blocks(['a', 'T = 1'], ['b', 'T = 2']));
    expect(graph.issues.some((i) => i.message.includes('T'))).toBe(true);
  });
});

describe('analiza wymiarowa', () => {
  it('zgadza się dla poprawnego wzoru', () => {
    const graph = buildGraph(blocks(
      ['period', ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2'].join('\n')],
    ));
    expect(graph.issues).toEqual([]);
  });

  it('łapie niezgodność wymiarów obu stron', () => {
    // Bez pierwiastka wyjdzie s², a zadeklarowano s.
    const graph = buildGraph(blocks(
      ['period', ['T = 2\\pi\\cdot\\frac{L}{g}', '@vars T: s, L: m, g: m/s^2'].join('\n')].map(String) as [string, string],
    ));
    expect(graph.issues.some((i) => /wymiar/i.test(i.message))).toBe(true);
  });

  it('nie zgłasza nic, gdy jednostek nie podano', () => {
    const graph = buildGraph(blocks(['x', 'T = 2 \\cdot L']));
    expect(graph.issues).toEqual([]);
  });
});

describe('węzeł ODE w grafie', () => {
  const ode = [
    '@ode',
    '@state theta, omega',
    '@d theta = \\omega',
    '@d omega = -\\frac{g}{L}\\sin(\\theta)',
    '@init theta = \\theta_0, omega = 0',
    '@vars g: m/s^2, L: m, theta_0: rad',
  ].join('\n');

  it('zmienne stanu są wynikami węzła, nie parametrami', () => {
    const graph = buildGraph(blocks(['pendulum', ode]));
    expect(graph.computed.sort()).toEqual(['omega', 'theta']);
    expect(graph.parameters.sort()).toEqual(['L', 'g', 'theta_0']);
  });

  it('wzór korzystający ze zmiennej stanu liczy się po ODE', () => {
    const graph = buildGraph(blocks(
      ['energy', 'E = \\frac{1}{2} \\cdot m \\cdot L^2 \\cdot \\omega^2'],
      ['pendulum', ode],
    ));
    expect(topologicalOrder(graph)).toEqual(['pendulum', 'energy']);
  });
});
