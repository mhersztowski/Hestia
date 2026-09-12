/**
 * Niezmienniki w modelu pisanym ręcznie (blok `simscript`).
 *
 * Ta sama zasada co przy grafie wzorów: model ręczny **zwraca to samo**, co
 * skompilowany z dokumentu. Gdyby pomiar energii działał tylko dla jednej z tych
 * dróg, panel jakości musiałby znać dwa przypadki — a wtedy druga droga
 * przestaje być drugą drogą i staje się drugim systemem.
 */
import { describe, it, expect } from 'vitest';
import { defineModel } from './defineModel';
import { euler, verlet } from '../numeric/solvers';

/** Oscylator liczony wprost, bez grafu — dokładnie tak pisze się `simscript`. */
const model = (metoda: 'euler' | 'verlet') => defineModel({
  parameters: [{ name: 'k', value: 1 }, { name: 'm', value: 1 }, { name: 'A', value: 1 }],
  observables: [{ name: 'x' }, { name: 'v' }],
  invariants: [{ name: 'E', of: ([x, v]) => 0.5 * (v * v + x * x) }],
  run: ({ A }, tSpan, dt) => ({
    trajectory: metoda === 'euler'
      ? euler((_t, [x, v]) => [v, -x], [A, 0], tSpan, { dt, stateNames: ['x', 'v'] })
      : verlet((_t, x) => x.map((xi) => -xi), [A], [0], tSpan, { dt, stateNames: ['x', 'v'] }),
  }),
});

describe('deklaracja niezmiennika w modelu ręcznym', () => {
  it('mierzy go na trajektorii zwróconej przez skrypt', () => {
    const wynik = model('euler').run({}, [0, 50], 0.01);

    expect(wynik.invariants).toHaveLength(1);
    expect(wynik.invariants[0].name).toBe('E');
    expect(wynik.invariants[0].trend).toBe('drift');
  });

  it('odróżnia metodę symplektyczną tak samo jak w modelu z grafu', () => {
    expect(model('verlet').run({}, [0, 50], 0.01).invariants[0].trend).toBe('oscillation');
  });

  it('model bez trajektorii i bez deklaracji zwraca pustą listę, nie brak pola', () => {
    const stały = defineModel({
      parameters: [{ name: 'a', value: 2 }],
      observables: [{ name: 'y', kind: 'scalar' }],
      dynamic: false,
      run: ({ a }) => ({ scalars: { y: a * 2 } }),
    });

    expect(stały.run({}).invariants).toEqual([]);
  });

  it('melduje deklarację niezmiennika w modelu, który nie liczy trajektorii', () => {
    const bezRuchu = defineModel({
      parameters: [{ name: 'a', value: 1 }],
      observables: [{ name: 'y', kind: 'scalar' }],
      invariants: [{ name: 'E', of: () => 1 }],
      dynamic: false,
      run: ({ a }) => ({ scalars: { y: a } }),
    });

    expect(bezRuchu.issues.join(' ')).toMatch(/niezmiennik/i);
  });
});
