/**
 * Ścieżka spoza grafu: model ręczny i skrypt w dokumencie.
 *
 * Najważniejszy test: model ze skryptu ma **ten sam kontrakt**, co model
 * skompilowany z grafu. Gdyby się różnił, każdy widok musiałby znać dwa
 * przypadki i druga ścieżka stałaby się drugim systemem.
 */
import { describe, it, expect } from 'vitest';
import { defineModel } from './defineModel';
import { runScript, stripTypes } from './runScript';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';
import { suggestViews } from '../graph/visualization';

describe('model ręczny', () => {
  const model = defineModel({
    parameters: [{ name: 'a', unit: 'm/s^2', value: 2, min: 0, max: 10 }],
    observables: [{ name: 'x', kind: 'series', unit: 'm' }, { name: 'droga', kind: 'scalar', unit: 'm' }],
    run: (values, tSpan, dt) => {
      const series: Array<[number, number]> = [];
      for (let t = tSpan[0]; t <= tSpan[1]; t += dt) series.push([t, 0.5 * values.a * t * t]);
      return { series: { x: series }, scalars: { droga: series[series.length - 1][1] } };
    },
  });

  it('powstaje bez uwag i liczy', () => {
    expect(model.issues).toEqual([]);
    const result = model.run({ a: 2 }, [0, 3], 0.01);
    expect(result.scalars.droga).toBeCloseTo(9, 1);
  });

  it('uzupełnia brakujące pola parametru', () => {
    const p = model.parameters[0];
    expect(p.step).toBeGreaterThan(0);
    expect(p.unit).toBe('m/s^2');
  });

  it('wartości domyślne działają bez podania parametrów', () => {
    expect(model.run({}, [0, 1], 0.01).scalars.droga).toBeCloseTo(1, 1);
  });

  it('literówka w parze pochodnych jest zgłaszana', () => {
    const zly = defineModel({
      parameters: [{ name: 'a' }],
      observables: [{ name: 'x' }],
      run: () => ({ scalars: {}, series: {} }),
      derivativePairs: [['x', 'nieistnieje']],
    });
    expect(zly.issues.join(' ')).toMatch(/spoza modelu/);
  });

  it('model bez wielkości do pokazania jest zgłaszany', () => {
    const pusty = defineModel({ parameters: [{ name: 'a' }], observables: [], run: () => ({ scalars: {}, series: {} }) });
    expect(pusty.issues.join(' ')).toMatch(/wielkości do pokazania/);
  });
});

describe('skrypt w TypeScripcie', () => {
  const SKRYPT = `
interface Kula { x: number; v: number }

const zderzenie = (a: Kula, b: Kula): void => {
  const v = a.v;
  a.v = b.v;
  b.v = v;
};

return defineModel({
  parameters: [{ name: 'v0', unit: 'm/s', value: 1, min: 0, max: 5 }],
  observables: [{ name: 'x1', kind: 'series', unit: 'm' }],
  run: (values: Record<string, number>, tSpan: [number, number], dt: number) => {
    const a: Kula = { x: 0, v: values.v0 };
    const b: Kula = { x: 5, v: -values.v0 };
    const series: Array<[number, number]> = [];

    for (let t = tSpan[0]; t <= tSpan[1]; t += dt) {
      a.x += a.v * dt;
      b.x += b.v * dt;
      if (a.x >= b.x) zderzenie(a, b);
      series.push([t, a.x]);
    }
    return { series: { x1: series }, scalars: {} };
  },
});
`;

  it('typy są usuwane, a kod działa', () => {
    const { model, issues } = runScript(SKRYPT);
    expect(issues).toEqual([]);
    expect(model).toBeDefined();
    expect(model!.run({ v0: 1 }, [0, 4], 0.01).series.x1.length).toBeGreaterThan(100);
  });

  it('sam transpilator usuwa typy, nie sprawdza ich', () => {
    // Typecheck jest rolą edytora; runtime ma tylko wykonać kod.
    const { js, error } = stripTypes('const x: number = "napis"; return x;');
    expect(error).toBeUndefined();
    expect(js).toContain('const x = "napis"');
  });

  it('interfejsy, generyki i typy zwracane przechodzą', () => {
    const { model, issues } = runScript(`
      type Para<T> = { a: T; b: T };
      const suma = (p: Para<number>): number => p.a + p.b;
      return defineModel({
        parameters: [{ name: 'k', value: 3 }],
        observables: [{ name: 'w', kind: 'scalar' }],
        run: (v: Record<string, number>) => ({ scalars: { w: suma({ a: v.k, b: 1 }) }, series: {} }),
      });
    `);
    expect(issues).toEqual([]);
    expect(model!.run({ k: 3 }, [0, 1], 0.1).scalars.w).toBe(4);
  });

  it('błąd składni wskazuje na składnię, nie na wykonanie', () => {
    const { issues } = runScript('const x: = 1;');
    expect(issues[0]).toMatch(/składni/i);
  });

  it('błąd wykonania jest odróżniony od błędu składni', () => {
    const { issues } = runScript('return defineModel({ parameters: [], observables: [], run: () => { throw new Error("bum"); } });');
    const model = runScript('return defineModel({ parameters: [{name:"a"}], observables: [{name:"x"}], run: () => { throw new Error("bum"); } });').model;
    expect(issues.join(' ')).not.toMatch(/składni/i);
    expect(() => model!.run({}, [0, 1], 0.1)).toThrow(/bum/);
  });

  it('skrypt bez modelu mówi, czego brakuje', () => {
    expect(runScript('const x = 1;').issues[0]).toMatch(/defineModel/);
  });

  it('przypisanie do `model` działa tak samo jak `return`', () => {
    const { model, issues } = runScript(`
      model = defineModel({
        parameters: [{ name: 'a', value: 1 }],
        observables: [{ name: 'x', kind: 'scalar' }],
        run: () => ({ scalars: { x: 42 }, series: {} }),
      });
    `);
    expect(issues).toEqual([]);
    expect(model!.run({}, [0, 1], 0.1).scalars.x).toBe(42);
  });

  it('przeglądarka jest zasłonięta — model fizyczny nie sięga po nią przez pomyłkę', () => {
    const { issues } = runScript('return defineModel({ parameters: [{name:"a"}], observables: [{name:"x"}], run: () => { fetch("/x"); return { scalars: {}, series: {} }; } });');
    expect(issues).toEqual([]);

    const model = runScript('return defineModel({ parameters: [{name:"a"}], observables: [{name:"x"}], run: () => { fetch("/x"); return { scalars: {}, series: {} }; } });').model;
    expect(() => model!.run({}, [0, 1], 0.1)).toThrow(/fetch is not a function|undefined/);
  });

  it('losowanie jest deterministyczne', () => {
    const script = `
      return defineModel({
        parameters: [{ name: 'seed', value: 7 }],
        observables: [{ name: 'suma', kind: 'scalar' }],
        run: (v: Record<string, number>) => {
          const r = random(v.seed);
          let suma = 0;
          for (let i = 0; i < 100; i += 1) suma += r();
          return { scalars: { suma }, series: {} };
        },
      });
    `;
    const a = runScript(script).model!.run({ seed: 7 }, [0, 1], 0.1).scalars.suma;
    const b = runScript(script).model!.run({ seed: 7 }, [0, 1], 0.1).scalars.suma;
    expect(a).toBe(b);
  });

  it('rdzeń numeryczny jest dostępny w skrypcie', () => {
    const { model, issues } = runScript(`
      return defineModel({
        parameters: [{ name: 'omega', value: 2 }],
        observables: [{ name: 'x', kind: 'series' }],
        run: (v: Record<string, number>, tSpan: [number, number], dt: number) => {
          const traj = rk4((t: number, y: number[]) => [y[1], -v.omega * v.omega * y[0]], [1, 0], tSpan, { dt });
          return { series: { x: traj.series('y0') }, scalars: {} };
        },
      });
    `);
    expect(issues).toEqual([]);
    const series = model!.run({ omega: 2 }, [0, 1], 0.001).series.x;
    expect(series[series.length - 1][1]).toBeCloseTo(Math.cos(2), 4);
  });
});

describe('ten sam kontrakt co model z grafu', () => {
  const zGrafu = compileGraph(buildGraph([
    parseFormulaBlock('ode', ['@ode', '@state x, v', '@d x = v', '@d v = -x',
      '@init x = 1, v = 0', '@vars x: m, v: m/s'].join('\n')),
  ]));

  const zeSkryptu = runScript(`
    return defineModel({
      parameters: [{ name: 'x0', unit: 'm', value: 1 }],
      observables: [{ name: 'x', kind: 'series', unit: 'm' }, { name: 'v', kind: 'series', unit: 'm/s' }],
      derivativePairs: [['x', 'v']],
      run: (values: Record<string, number>, tSpan: [number, number], dt: number) => {
        const traj = rk4((t: number, y: number[]) => [y[1], -y[0]], [values.x0, 0], tSpan, { dt, stateNames: ['x', 'v'] });
        return { series: { x: traj.series('x'), v: traj.series('v') }, scalars: {} };
      },
    });
  `).model!;

  it('oba dostają widoki z tej samej funkcji', () => {
    // Widok nie wie, skąd pochodzi model — i to jest cały sens wspólnego kontraktu.
    expect(suggestViews(zGrafu).some((v) => v.kind === 'phase')).toBe(true);
    expect(suggestViews(zeSkryptu).some((v) => v.kind === 'phase')).toBe(true);
  });

  it('oba liczą to samo zjawisko', () => {
    const a = zGrafu.run({}, [0, 3], 0.001).series.x;
    const b = zeSkryptu.run({ x0: 1 }, [0, 3], 0.001).series.x;
    expect(b[b.length - 1][1]).toBeCloseTo(a[a.length - 1][1], 3);
  });

  it('oba mają ten sam kształt wyniku', () => {
    const a = zGrafu.run({}, [0, 1], 0.01);
    const b = zeSkryptu.run({}, [0, 1], 0.01);
    expect(Object.keys(a)).toEqual(expect.arrayContaining(['scalars', 'series']));
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['scalars', 'series']));
  });
});
