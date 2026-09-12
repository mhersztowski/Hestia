/**
 * Zdarzenia i wybór metody całkowania — Etap 1 raportu.
 *
 * Wzorce znów analityczne: pocisk bez oporu ma znany zasięg, a odbicie ze
 * współczynnikiem restytucji ma znaną wysokość po odbiciu.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph, defaultValues } from './compileGraph';

const modelOf = (...defs: Array<[string, string]>) =>
  compileGraph(buildGraph(defs.map(([id, body]) => parseFormulaBlock(id, body))));

const FALL = (extra: string[]) => modelOf(['fall', [
  '@ode',
  '@state y, v_y',
  '@d y = v_y',
  '@d v_y = -g',
  '@init y = h_0, v_y = 0',
  '@vars g: m/s^2, y: m, v_y: m/s, h_0: m',
  ...extra,
].join('\n')]);

describe('zdarzenie kończące symulację', () => {
  it('zatrzymuje całkowanie na progu', () => {
    const model = FALL(['@when y < 0', '@stop']);
    const result = model.run({ ...defaultValues(model), g: 10, h_0: 5 }, [0, 10], 0.001);

    // Spadek z 5 m przy g = 10 trwa 1 s — dalej nie ma czego liczyć.
    expect(result.trajectory!.t1).toBeCloseTo(1, 2);
    expect(result.trajectory!.value('y', result.trajectory!.t1)).toBeLessThan(0.01);
  });

  it('bez zdarzenia ciało leci dalej pod ziemię', () => {
    const model = FALL([]);
    const result = model.run({ ...defaultValues(model), g: 10, h_0: 5 }, [0, 10], 0.001);
    expect(result.trajectory!.value('y', 10)).toBeLessThan(-100);
  });
});

describe('zdarzenie zmieniające stan', () => {
  it('odbicie z zachowaniem energii zawraca ciało na tę samą wysokość', () => {
    const model = modelOf(['bounce', [
      '@ode',
      '@state y, v_y',
      '@d y = v_y',
      '@d v_y = -g',
      '@init y = h_0, v_y = 0',
      '@when y < 0',
      '@then v_y = -v_y, y = 0',
      '@vars g: m/s^2, y: m, v_y: m/s, h_0: m',
    ].join('\n')]);

    const result = model.run({ ...defaultValues(model), g: 10, h_0: 5 }, [0, 3], 0.0002);
    const wysokosci = result.series.y.map(([, y]) => y);

    expect(Math.min(...wysokosci)).toBeGreaterThan(-0.05);
    // Odbicie sprężyste wraca na tę samą wysokość — z dokładnością kroku.
    expect(Math.max(...wysokosci.slice(wysokosci.length / 2))).toBeCloseTo(5, 1);
  });

  it('odbicie z tłumieniem obniża kolejne odbicia', () => {
    const model = modelOf(['bounce', [
      '@ode',
      '@state y, v_y',
      '@d y = v_y',
      '@d v_y = -g',
      '@init y = h_0, v_y = 0',
      '@when y < 0',
      '@then v_y = -k \\cdot v_y, y = 0',
      '@vars g: m/s^2, y: m, v_y: m/s, h_0: m, k: 1',
    ].join('\n')]);

    const result = model.run({ ...defaultValues(model), g: 10, h_0: 5, k: 0.7 }, [0, 6], 0.0005);
    const y = result.series.y.map(([, value]) => value);

    const pierwszaPolowa = Math.max(...y.slice(0, Math.floor(y.length / 3)));
    const ostatnia = Math.max(...y.slice(Math.floor((2 * y.length) / 3)));
    expect(ostatnia).toBeLessThan(pierwszaPolowa * 0.6);
  });
});

describe('zdarzenie źle zapisane', () => {
  it('warunek niebędący porównaniem jest zgłaszany', () => {
    const model = FALL(['@when y', '@stop']);
    model.run(defaultValues(model), [0, 1], 0.01);
    expect(model.issues.join(' ')).toMatch(/porównaniem/);
  });

  it('zdarzenie bez skutku jest zgłaszane przy parsowaniu', () => {
    const block = parseFormulaBlock('x', ['@ode', '@state y', '@d y = 1', '@when y < 0'].join('\n'));
    expect(block.issues.some((i) => /nic nie robi/.test(i.message))).toBe(true);
  });

  it('zdarzenie zmieniające coś spoza stanu jest zgłaszane', () => {
    const block = parseFormulaBlock('x', ['@ode', '@state y', '@d y = 1', '@when y < 0', '@then g = 0'].join('\n'));
    expect(block.issues.some((i) => i.message.includes('g'))).toBe(true);
  });
});

describe('wybór metody całkowania', () => {
  const OSCILLATOR = (solver: string[]) => modelOf(['osc', [
    '@ode',
    '@state x, v',
    '@d x = v',
    '@d v = -\\omega_0^2 \\cdot x',
    '@init x = 1, v = 0',
    '@vars x: m, v: m/s, omega_0: s^-1',
    ...solver,
  ].join('\n')]);

  it('Verlet trzyma energię w bardzo długiej symulacji', () => {
    const model = OSCILLATOR(['@solver verlet']);
    expect(model.issues).toEqual([]);

    const result = model.run({ ...defaultValues(model), omega_0: 1 }, [0, 400], 0.01);
    const energia = result.trajectory!.samples.map(({ y }) => {
      const [x, v] = y;
      return 0.5 * v * v + 0.5 * x * x;
    });
    expect((Math.max(...energia) - Math.min(...energia)) / Math.max(...energia)).toBeLessThan(1e-3);
  });

  it('Verlet przy stanie bez par mówi wprost, że nie może i wraca do RK4', () => {
    const model = modelOf(['decay', [
      '@ode', '@state n', '@d n = -\\lambda \\cdot n', '@init n = 1',
      '@vars n: 1, lambda: s^-1', '@solver verlet',
    ].join('\n')]);

    expect(model.issues.join(' ')).toMatch(/Verlet wymaga/);
    // Mimo uwagi model liczy dalej — rozpad wykładniczy z RK4.
    const result = model.run({ ...defaultValues(model), lambda: 1 }, [0, 1], 0.001);
    expect(result.trajectory!.value('n', 1)).toBeCloseTo(Math.exp(-1), 5);
  });

  it('nieznana metoda jest zgłaszana', () => {
    expect(OSCILLATOR(['@solver magia']).issues.join(' ')).toMatch(/Nieznana metoda/);
  });

  it('metoda przeżywa zapis bloku', () => {
    const block = parseFormulaBlock('x', ['@ode', '@state x, v', '@d x = v', '@d v = 0', '@solver verlet'].join('\n'));
    expect(block.solver).toBe('verlet');
  });
});
