/**
 * `@solver dopri5` — adaptacyjny krok dostępny z dokumentu.
 *
 * Dotąd autor pisał `@solver rk4` albo `verlet` i dostawał stały krok, którego
 * wielkość ustalał ktoś inny (blok `sim` przez `duration`). Teraz może napisać
 * `@tol 1e-9` i powiedzieć, **jak dokładnie** ma być policzone — a ile kroków
 * to zajmie, jest już sprawą solvera.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph, defaultValues } from './compileGraph';
import { Trajectory } from '../numeric/trajectory';

const model = (extra: string[]) => compileGraph(buildGraph([parseFormulaBlock('osc', [
  '@ode',
  '@state x, v',
  '@d x = v',
  '@d v = -x',
  '@init x = 1, v = 0',
  '@vars x: m, v: m/s',
  ...extra,
].join('\n'))]));

describe('wybór metody adaptacyjnej', () => {
  it('liczy oscylator dokładnie, choć podany krok jest zgrubny', () => {
    // dt = 0,5 to dla metody o stałym kroku katastrofa; tutaj jest tylko
    // wskazówką startową, którą sterowanie natychmiast poprawia.
    const wynik = model(['@solver dopri5']).run({}, [0, 10], 0.5);

    // Domyślne `rtol` to 1e-6, ale tolerancja dotyczy **kroku**; po kilkudziesięciu
    // krokach błąd globalny jest kilkakrotnie większy. Oczekiwanie równe rtol
    // byłoby więc oczekiwaniem czegoś, czego żaden solver z kontrolą błędu
    // lokalnego nie obiecuje.
    expect(wynik.trajectory!.value('x', 10)).toBeCloseTo(Math.cos(10), 5);
  });

  /**
   * Tolerancja jest kontraktem „nie gorzej niż", a nie „najlepiej jak się da".
   *
   * Zmierzone na tym oscylatorze: RK4 z dt = 0,01 daje błąd 4,5e-10, a dopri5
   * z domyślnym `rtol` = 1e-6 tylko 1,2e-6 — i to jest poprawne zachowanie,
   * bo o więcej nikt nie prosił. Adaptacja nie obiecuje większej dokładności,
   * tylko **żądaną dokładność mniejszym kosztem**; kto chce dokładniej, pisze
   * `@tol`. Test pilnuje obu połówek tego zdania.
   */
  it('płaci tylko za żądaną dokładność', () => {
    const luźny = model(['@solver dopri5', '@tol 1e-6']).run({}, [0, 10], 0.01);
    const stały = model(['@solver rk4']).run({}, [0, 10], 0.01);

    expect(luźny.trajectory!.length).toBeLessThan(stały.trajectory!.length / 4);
  });

  it('a poproszony o dokładność stałego kroku — dorównuje mu', () => {
    const ciasny = model(['@solver dopri5', '@tol 1e-10']).run({}, [0, 10], 0.01);
    const stały = model(['@solver rk4']).run({}, [0, 10], 0.01);

    const błąd = (traj: typeof stały.trajectory) => Math.abs(traj!.value('x', 10) - Math.cos(10));
    expect(błąd(ciasny.trajectory)).toBeLessThan(błąd(stały.trajectory));
  });

  it('zaostrzenie @tol zmniejsza błąd', () => {
    const błąd = (tol: string[]) => Math.abs(
      model(['@solver dopri5', ...tol]).run({}, [0, 30], 0.1).trajectory!.value('x', 30) - Math.cos(30),
    );

    expect(błąd(['@tol 1e-10'])).toBeLessThan(błąd(['@tol 1e-4']) / 50);
  });

  it('rozumie zapis `rk45` jako drugą nazwę tej samej metody', () => {
    const wynik = model(['@solver rk45']).run({}, [0, 5], 0.5);
    expect(wynik.trajectory!.value('x', 5)).toBeCloseTo(Math.cos(5), 6);
  });

  it('odczyt między próbkami korzysta z dense output, a nie z cięciwy', () => {
    const traj = model(['@solver dopri5', '@tol 1e-4']).run({}, [0, 10], 0.5).trajectory!;
    const cięciwa = new Trajectory(traj.samples, traj.stateNames);

    // Środek pierwszego kroku: przy luźnej tolerancji krok jest długi, więc
    // różnica między wielomianem a odcinkiem jest największa.
    const t = (traj.samples[0].t + traj.samples[1].t) / 2;
    const dokładna = Math.cos(t);

    expect(Math.abs(traj.value('x', t) - dokładna))
      .toBeLessThan(Math.abs(cięciwa.value('x', t) - dokładna) / 20);
  });
});

describe('gdy adaptacja nie wystarcza', () => {
  it('melduje sztywność zamiast wywracać cały dokument', () => {
    const sztywny = compileGraph(buildGraph([parseFormulaBlock('sztywny', [
      '@ode',
      '@state y',
      '@d y = -k \\cdot y',
      '@init y = 1',
      '@vars y: 1, k: 1/s',
      '@solver dopri5',
    ].join('\n'))]));

    const wynik = sztywny.run({ ...defaultValues(sztywny), k: 1e7 }, [0, 100], 0.1);

    // Wynik wraca bez trajektorii, ale **z wyjaśnieniem** — inaczej blok
    // w dokumencie przestałby się renderować przez jeden nieudany przebieg.
    expect(wynik.trajectory).toBeUndefined();
    expect(wynik.error).toMatch(/sztywn|kroków/i);
  }, 20_000);
});

describe('zdarzenia przy adaptacyjnym kroku', () => {
  const spadek = (extra: string[]) => compileGraph(buildGraph([parseFormulaBlock('spadek', [
    '@ode',
    '@state y, v',
    '@d y = v',
    '@d v = -g',
    '@init y = 5, v = 0',
    '@vars y: m, v: m/s, g: m/s^2',
    ...extra,
  ].join('\n'))]));

  const ZIEMIA = ['@when y < 0'];

  it('trafia w chwilę zdarzenia dokładnie, nie z dokładnością kroku', () => {
    // Spadek z 5 m przy g = 10 trwa dokładnie 1 s. Przed etapem 2 ta sama
    // symulacja meldowała lądowanie po 3,1 s.
    const m = spadek([...ZIEMIA, '@stop', '@solver dopri5']);
    const wynik = m.run({ ...defaultValues(m), g: 10 }, [0, 10], 0.01);

    expect(wynik.trajectory!.t1).toBeCloseTo(1, 8);
  });

  it('nie ostrzega już o przybliżonej chwili, bo jej nie przybliża', () => {
    expect(spadek([...ZIEMIA, '@stop', '@solver dopri5']).issues.join(' ')).not.toMatch(/przybliżon/i);
  });

  it('wykonuje odbicie w chwili zdarzenia, więc wysokość zgadza się z e²h', () => {
    const m = spadek([...ZIEMIA, '@then v = -0.8 \\cdot v', '@solver dopri5', '@tol 1e-10']);
    const wynik = m.run({ ...defaultValues(m), g: 10 }, [0, 1.9], 0.01);

    let max = 0;
    for (let t = 1; t <= 1.9; t += 0.002) max = Math.max(max, wynik.trajectory!.value('y', t));
    expect(max).toBeCloseTo(3.2, 4);
  });

  it('zapisuje zdarzenia w trajektorii, z warunkiem jako nazwą', () => {
    const m = spadek([...ZIEMIA, '@stop', '@solver dopri5']);
    const zdarzenia = m.run({ ...defaultValues(m), g: 10 }, [0, 10], 0.01).trajectory!.events!;

    expect(zdarzenia).toHaveLength(1);
    expect(zdarzenia[0].name).toBe('y < 0');
    expect(zdarzenia[0].t).toBeCloseTo(1, 8);
  });

  it('warunek złożony wraca do trybu przybliżonego — i mówi o tym', () => {
    const m = spadek(['@when y < 0 \\land v < 0', '@stop', '@solver dopri5']);

    expect(m.issues.join(' ')).toMatch(/przybliżon/i);
    // Nadal liczy, tylko z dokładnością ograniczonego kroku.
    const wynik = m.run({ ...defaultValues(m), g: 10 }, [0, 10], 0.01);
    expect(wynik.trajectory!.t1).toBeGreaterThan(0.9);
    expect(wynik.trajectory!.t1).toBeLessThan(1.1);
  });

  it('metody o stałym kroku działają jak dotąd', () => {
    const m = spadek([...ZIEMIA, '@stop', '@solver rk4']);
    const wynik = m.run({ ...defaultValues(m), g: 10 }, [0, 10], 0.001);

    expect(wynik.trajectory!.t1).toBeGreaterThan(0.99);
    expect(wynik.trajectory!.t1).toBeLessThan(1.01);
  });
});
