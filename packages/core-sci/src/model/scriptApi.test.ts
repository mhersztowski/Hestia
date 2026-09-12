/**
 * API bloku `simscript` — Etap 5 planu silnika.
 *
 * Blok `simscript` jest ujściem dla zjawisk, których nie da się zapisać
 * równaniami w dokumencie. Żeby to ujście było użyteczne, musi mieć pod ręką
 * **cały** rdzeń: solvery adaptacyjne, metodę dla układów sztywnych, zdarzenia,
 * pomiar jakości i bibliotekę gotowych zjawisk. Inaczej autor skryptu pisze
 * własny solver — i traci wszystko, co przez cztery etapy zostało zmierzone.
 *
 * Osobna sprawa to **deklaracje dla edytora**. `SCRIPT_API_TYPES` jest ręcznie
 * utrzymywanym lustrem prawdziwego API, a rozjazd lustra z rzeczywistością myli
 * bardziej niż brak podpowiedzi: autor pisze funkcję, którą Monaco podkreśla na
 * zielono, a która nie istnieje. Dlatego spójność jest tu testowana, a nie
 * pilnowana obietnicą.
 */
import { describe, it, expect } from 'vitest';
import { defaultScriptApi, runScript, SCRIPT_API_TYPES } from './runScript';

describe('deklaracje dla edytora', () => {
  const nazwy = Object.keys(defaultScriptApi());

  it('każdy symbol z API ma deklarację', () => {
    // `class` obok `function` i `const`, bo `Trajectory` jest klasą — skrypt
    // dostaje ją razem z konstruktorem, nie tylko jako typ.
    const brakujące = nazwy.filter(
      (name) => !new RegExp(`declare (function|const|class) ${name}\\b`).test(SCRIPT_API_TYPES),
    );
    expect(brakujące, `bez deklaracji: ${brakujące.join(', ')}`).toEqual([]);
  });

  it('żadna deklaracja nie opisuje symbolu, którego nie ma', () => {
    const zadeklarowane = [...SCRIPT_API_TYPES.matchAll(/declare (?:function|const|class) (\w+)/g)].map((m) => m[1]);
    const nadmiarowe = zadeklarowane.filter((name) => !nazwy.includes(name));
    expect(nadmiarowe, `deklaracje bez pokrycia: ${nadmiarowe.join(', ')}`).toEqual([]);
  });
});

describe('solvery w skrypcie', () => {
  it('skrypt może użyć metody adaptacyjnej', () => {
    const { model, issues } = runScript(`
      return defineModel({
        parameters: [{ name: 'omega', value: 2, unit: 's^-1' }],
        observables: [{ name: 'x', unit: 'm' }, { name: 'v', unit: 'm/s' }],
        derivativePairs: [['x', 'v']],
        run: ({ omega }, tSpan, dt) => ({
          trajectory: dopri5(
            (t, [x, v]) => [v, -omega * omega * x],
            [1, 0], tSpan, { rtol: 1e-9, dt, stateNames: ['x', 'v'] },
          ),
        }),
      });
    `);

    expect(issues).toEqual([]);
    expect(model!.run({ omega: 2 }, [0, 5], 0.01).trajectory!.value('x', 5))
      .toBeCloseTo(Math.cos(10), 6);
  });

  it('skrypt może sięgnąć po metodę dla układów sztywnych', () => {
    const { model, issues } = runScript(`
      return defineModel({
        parameters: [{ name: 'k', value: 1e6, unit: '1/s' }],
        observables: [{ name: 'y' }],
        run: ({ k }, tSpan, dt) => ({
          trajectory: rosenbrock((t, [y]) => [-k * (y - 1)], [0], tSpan, { rtol: 1e-6, dt, stateNames: ['y'] }),
        }),
      });
    `);

    expect(issues).toEqual([]);
    // Po czasie tysiąckrotnie dłuższym od stałej czasowej y osiąga jedynkę.
    expect(model!.run({ k: 1e6 }, [0, 1], 0.01).trajectory!.value('y', 1)).toBeCloseTo(1, 9);
  });

  it('skrypt może rozwiązywać zdarzenia, a nie tylko wypatrywać ich po kroku', () => {
    const { model, issues } = runScript(`
      return defineModel({
        parameters: [{ name: 'g', value: 10, unit: 'm/s^2' }, { name: 'h', value: 5, unit: 'm' }],
        observables: [{ name: 'y', unit: 'm' }, { name: 'v', unit: 'm/s' }],
        derivativePairs: [['y', 'v']],
        run: ({ g, h }, tSpan, dt) => ({
          trajectory: dopri5((t, [y, v]) => [v, -g], [h, 0], tSpan, {
            rtol: 1e-9, dt, stateNames: ['y', 'v'],
            events: [{ name: 'ziemia', g: (t, [y]) => y, direction: 'down', stop: true }],
          }),
        }),
      });
    `);

    expect(issues).toEqual([]);
    // Spadek z 5 m przy g = 10 trwa dokładnie sekundę.
    expect(model!.run({ g: 10, h: 5 }, [0, 10], 0.01).trajectory!.t1).toBeCloseTo(1, 8);
  });
});

describe('pomiar jakości w skrypcie', () => {
  it('skrypt może zmierzyć własny niezmiennik', () => {
    const { model, issues } = runScript(`
      return defineModel({
        parameters: [{ name: 'omega', value: 1, unit: 's^-1' }],
        observables: [{ name: 'x' }, { name: 'v' }],
        invariants: [{ name: 'E', of: ([x, v], t, { omega }) => 0.5 * (v * v + omega * omega * x * x) }],
        run: ({ omega }, tSpan, dt) => ({
          trajectory: euler((t, [x, v]) => [v, -omega * omega * x], [1, 0], tSpan, { dt, stateNames: ['x', 'v'] }),
        }),
      });
    `);

    expect(issues).toEqual([]);
    // Euler pompuje energię — i skrypt dowiaduje się o tym tą samą drogą
    // co model z dokumentu.
    expect(model!.run({ omega: 1 }, [0, 50], 0.01).invariants[0].trend).toBe('drift');
  });

  it('skrypt może zbadać rząd własnej metody', () => {
    const { model, issues } = runScript(`
      const badanie = studyConvergence(
        (dt) => rk4((t, [x, v]) => [v, -x], [1, 0], [0, 5], { dt }),
        { dt: 0.2 },
      );
      return defineModel({
        parameters: [{ name: 'nic', value: 1 }],
        observables: [{ name: 'rzad', kind: 'scalar' }],
        dynamic: false,
        run: () => ({ scalars: { rzad: badanie.order } }),
      });
    `);

    expect(issues).toEqual([]);
    expect(model!.run({}).scalars.rzad).toBeCloseTo(4, 0);
  });
});

describe('biblioteka zjawisk w skrypcie', () => {
  it('skrypt może wziąć gotowe zjawisko zamiast pisać je od nowa', () => {
    const { model, issues } = runScript(`
      const { model: wahadlo } = buildModel('wahadlo', { smallAngle: true });
      return wahadlo;
    `);

    expect(issues).toEqual([]);
    expect(model!.parameters.map((p) => p.name)).toContain('L');
  });

  /**
   * Ścieżka awansu z raportu: eksperyment zaczyna życie jako `simscript`,
   * a po dopracowaniu trafia do biblioteki. Ma to być **przeniesienie pliku**,
   * a nie przepisywanie — więc ten sam kod musi dać ten sam model po obu
   * stronach granicy.
   */
  it('ten sam kod działa jako skrypt i jako wpis w bibliotece', () => {
    const kod = `
      defineModel({
        parameters: [{ name: 'a', value: 3, unit: 'm/s^2' }],
        observables: [{ name: 'x', unit: 'm' }, { name: 'v', unit: 'm/s' }],
        derivativePairs: [['x', 'v']],
        run: ({ a }, tSpan, dt) => ({
          trajectory: rk4((t, [x, v]) => [v, a], [0, 0], tSpan, { dt, stateNames: ['x', 'v'] }),
        }),
      })
    `;

    // Przypisanie do `model`, a nie `return`: kod zaczyna się od nowej linii,
    // więc „return" na końcu wiersza kończyłby instrukcję i skrypt zwracałby
    // `undefined`. To jest zwykła pułapka JS-a, ale warto, żeby test pokazywał
    // obie wspierane formy — druga jest na nią odporna.
    const zeSkryptu = runScript(`model = ${kod};`).model!;
    const zRejestru = runScript(`
      const off = registerModel({ name: 'awans-test', summary: 'Ruch jednostajnie przyspieszony.', build: () => ${kod} });
      const wynik = buildModel('awans-test');
      off();
      model = wynik.model;
    `).model!;

    const wynik = (m: typeof zeSkryptu) => m.run({ a: 3 }, [0, 2], 0.001).trajectory!.value('x', 2);
    // s = ½·a·t² = 6 m — po obu stronach ta sama liczba.
    expect(wynik(zeSkryptu)).toBeCloseTo(6, 6);
    expect(wynik(zRejestru)).toBeCloseTo(wynik(zeSkryptu), 12);
  });
});
