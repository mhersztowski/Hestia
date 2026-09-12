/**
 * Rejestr zjawisk — Etap 4 planu silnika.
 *
 * Dotąd fizyka mogła przyjść tylko z bloków `formula` stojących w tym samym
 * dokumencie. To jest mocna zasada — dokument jest wtedy jedynym źródłem prawdy
 * — ale ma granicę: N ciał oddziałujących grawitacyjnie nie zapisze się jako
 * dziesięć bloków `@ode`, bo liczba równań zależy od liczby ciał.
 *
 * Rejestr jest drugą drogą, **tym samym kontraktem**: wpis zwraca
 * `PhenomenonModel`, więc widoki, suwaki, niezmienniki i zadania nie wiedzą,
 * czy model powstał z dokumentu, czy z biblioteki.
 */
import { describe, it, expect } from 'vitest';
import { buildModel, knownModels, registerModel } from './registry';
// Import dla efektu ubocznego — to on wpisuje wbudowane zjawiska do rejestru.
// Pakiet robi to samo w `index.ts`, więc użytkownik nie musi o tym pamiętać.
import './builtin';
import { defineModel } from '../model/defineModel';

describe('rejestrowanie', () => {
  it('udostępnia zarejestrowane zjawisko po nazwie', () => {
    const off = registerModel({
      name: 'test-liniowy',
      summary: 'Ruch jednostajny, do testów.',
      build: () => defineModel({
        parameters: [{ name: 'v', value: 2, unit: 'm/s' }],
        observables: [{ name: 'x', unit: 'm' }],
        run: ({ v }, tSpan, dt) => ({
          series: { x: [[tSpan[0], 0], [tSpan[1], v * (tSpan[1] - tSpan[0])]] },
        }),
      }),
    });

    const { model, issues } = buildModel('test-liniowy');
    expect(issues).toEqual([]);
    expect(model!.parameters.map((p) => p.name)).toEqual(['v']);

    off();
    expect(buildModel('test-liniowy').issues.join(' ')).toMatch(/nie znam/i);
  });

  it('wymienia zjawiska z opisami — z tego powstaje katalog', () => {
    const nazwy = knownModels().map((m) => m.name);
    expect(nazwy).toContain('oscylator');
    expect(nazwy).toContain('wahadlo');
    for (const wpis of knownModels()) expect(wpis.summary.length).toBeGreaterThan(10);
  });

  it('nieznaną nazwę zgłasza razem z listą znanych, zamiast milczeć', () => {
    const { model, issues } = buildModel('wahadełko');

    expect(model).toBeUndefined();
    expect(issues.join(' ')).toMatch(/wahadlo/);
  });

  it('błąd w budowie zjawiska nie wywraca dokumentu', () => {
    const off = registerModel({
      name: 'test-wadliwy',
      summary: 'Zawsze rzuca — sprawdzenie odporności.',
      build: () => { throw new Error('brak danych'); },
    });

    const { model, issues } = buildModel('test-wadliwy');
    expect(model).toBeUndefined();
    expect(issues.join(' ')).toMatch(/brak danych/);
    off();
  });
});

describe('oscylator', () => {
  const model = () => buildModel('oscylator').model!;

  it('bez tłumienia ma okres 2π√(m/k)', () => {
    const m = model();
    const wynik = m.run({ m: 1, k: 4, c: 0, F_0: 0, x_0: 0.1, v_0: 0 }, [0, 10], 0.001);

    // T = 2π√(1/4) = π. Po jednym okresie wychylenie wraca do wartości startowej.
    expect(wynik.trajectory!.value('x', Math.PI)).toBeCloseTo(0.1, 5);
    expect(wynik.trajectory!.value('x', Math.PI / 2)).toBeCloseTo(-0.1, 5);
  });

  it('tłumienie zabiera energię', () => {
    const wynik = model().run({ m: 1, k: 4, c: 0.5, F_0: 0, x_0: 0.1, v_0: 0 }, [0, 20], 0.001);

    const energia = wynik.invariants.find((i) => i.name === 'E')!;
    expect(energia.trend).toBe('drift');
    expect(energia.ratePerUnitTime).toBeLessThan(0);
  });

  it('bez tłumienia energia zostaje — i to jest zadeklarowane, nie przypadkowe', () => {
    const wynik = model().run({ m: 1, k: 4, c: 0, F_0: 0, x_0: 0.1, v_0: 0 }, [0, 20], 0.001);
    expect(wynik.invariants.find((i) => i.name === 'E')!.relative).toBeLessThan(1e-6);
  });

  it('w rezonansie amplituda rośnie ponad wychylenie startowe', () => {
    // Ω = ω₀ = 2 rad/s, tłumienie małe: amplituda narasta liniowo.
    const wynik = model().run({ m: 1, k: 4, c: 0.02, F_0: 0.5, x_0: 0, v_0: 0 }, [0, 40], 0.001);

    let max = 0;
    for (let t = 30; t <= 40; t += 0.01) max = Math.max(max, Math.abs(wynik.trajectory!.value('x', t)));
    // Amplituda ustalona w rezonansie: F₀/(c·ω₀) = 0,5/(0,02·2) = 12,5 m.
    expect(max).toBeGreaterThan(2);
  });
});

describe('wahadło', () => {
  it('dla małych wychyleń okres zgadza się ze wzorem szkolnym', () => {
    const model = buildModel('wahadlo').model!;
    const wynik = model.run({ L: 1, g: 9.81, theta_0: 0.05 }, [0, 10], 0.001);

    // T = 2π√(L/g) ≈ 2,006 s.
    const T = 2 * Math.PI * Math.sqrt(1 / 9.81);
    expect(wynik.trajectory!.value('theta', T)).toBeCloseTo(0.05, 3);
  });

  /**
   * To jest powód, dla którego wahadło jest w bibliotece jako **pełne**
   * równanie, a nie jako przybliżenie.
   */
  it('dla dużego wychylenia okres jest dłuższy niż szkolny', () => {
    const model = buildModel('wahadlo').model!;
    const wynik = model.run({ L: 1, g: 9.81, theta_0: 2 }, [0, 10], 0.0005);

    // Przy θ₀ = 2 rad (115°) okres jest o ponad 30 % dłuższy od 2π√(L/g),
    // więc po czasie T wahadło jest jeszcze daleko od punktu zwrotnego.
    const T = 2 * Math.PI * Math.sqrt(1 / 9.81);
    expect(wynik.trajectory!.value('theta', T)).toBeLessThan(1.5);
  });

  it('wersja z przybliżeniem małych kątów daje szkolny okres nawet przy dużym wychyleniu', () => {
    const model = buildModel('wahadlo', { smallAngle: true }).model!;
    const wynik = model.run({ L: 1, g: 9.81, theta_0: 2 }, [0, 10], 0.0005);

    const T = 2 * Math.PI * Math.sqrt(1 / 9.81);
    expect(wynik.trajectory!.value('theta', T)).toBeCloseTo(2, 2);
  });

  it('podaje położenie ciężarka, żeby dało się je narysować', () => {
    const model = buildModel('wahadlo').model!;
    const nazwy = model.observables.map((o) => o.name);

    expect(nazwy).toContain('x');
    expect(nazwy).toContain('y');
  });
});
