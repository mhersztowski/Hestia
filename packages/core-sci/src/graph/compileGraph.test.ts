/**
 * Test spike'u: dokument z wahadłem ma policzyć to samo, co fizyka.
 *
 * Wzorce są analityczne, więc test nie sprawdza „czy się nie wywala", tylko
 * czy wynik jest prawdziwy: okres małych drgań, zachowanie energii i to, że
 * amplituda nie zmienia okresu (dopóki kąty są małe).
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph, defaultValues, applyOverrides } from './compileGraph';

const PENDULUM = [
  ['pendulum-ode', [
    '@ode',
    '@state theta, omega',
    '@d theta = \\omega',
    '@d omega = -\\frac{g}{L}\\sin(\\theta)',
    '@init theta = \\theta_0, omega = 0',
    '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s',
  ].join('\n')],
  ['pendulum-period', [
    'T = 2\\pi\\sqrt{\\frac{L}{g}}',
    '@vars T: s, L: m, g: m/s^2',
    '@derivedFrom pendulum-ode',
    '@assume small-angles',
  ].join('\n')],
  ['pendulum-energy', [
    'E = \\frac{1}{2} \\cdot m \\cdot L^2 \\cdot \\omega^2 + m \\cdot g \\cdot L \\cdot (1 - \\cos(\\theta))',
    '@vars E: J, m: kg, L: m, g: m/s^2',
  ].join('\n')],
] as Array<[string, string]>;

const model = () => compileGraph(buildGraph(PENDULUM.map(([id, body]) => parseFormulaBlock(id, body))));

describe('model skompilowany z dokumentu', () => {
  it('powstaje bez uwag', () => {
    expect(model().issues).toEqual([]);
  });

  it('parametry rozpoznają się same, bez deklarowania ich gdziekolwiek', () => {
    expect(model().parameters.map((p) => p.name).sort()).toEqual(['L', 'g', 'm', 'theta_0']);
  });

  it('g dostaje wartość ziemską jako podpowiedź, nie jako przymus', () => {
    const g = model().parameters.find((p) => p.name === 'g')!;
    expect(g.value).toBeCloseTo(9.80665, 5);
    expect(g.max).toBeGreaterThan(g.value);
  });

  it('rozróżnia wielkości stałe od zmieniających się w czasie', () => {
    const observables = model().observables;
    expect(observables.find((o) => o.name === 'T')?.kind).toBe('scalar');
    expect(observables.find((o) => o.name === 'E')?.kind).toBe('series');
    expect(observables.find((o) => o.name === 'theta')?.kind).toBe('series');
  });
});

describe('wyniki zgadzają się z fizyką', () => {
  it('okres małych drgań wychodzi ze wzoru', () => {
    const result = model().run({ ...defaultValues(model()), L: 1, g: 9.81, m: 1, theta_0: 0.05 });
    expect(result.scalars.T).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.81), 9);
  });

  it('symulacja odtwarza ten sam okres, co wzór analityczny', () => {
    const m = model();
    const values = { ...defaultValues(m), L: 1, g: 9.81, m: 1, theta_0: 0.05 };
    const result = m.run(values, [0, 10], 0.002);

    // Okres z symulacji: odstęp między przejściami przez zero w tę samą stronę.
    const theta = result.series.theta!;
    const crossings: number[] = [];
    for (let i = 1; i < theta.length; i += 1) {
      if (theta[i - 1][1] < 0 && theta[i][1] >= 0) crossings.push(theta[i][0]);
    }
    expect(crossings.length).toBeGreaterThan(2);

    const measured = crossings[crossings.length - 1] - crossings[0];
    const periods = crossings.length - 1;
    expect(measured / periods).toBeCloseTo(result.scalars.T, 2);
  });

  it('energia całkowita się zachowuje — standardowy test każdego modelu mechaniki', () => {
    const m = model();
    const result = m.run({ ...defaultValues(m), L: 1, g: 9.81, m: 2, theta_0: 0.4 }, [0, 20], 0.002);

    const energy = result.series.E!.map(([, value]) => value);
    const min = Math.min(...energy);
    const max = Math.max(...energy);
    expect((max - min) / max).toBeLessThan(1e-4);
  });

  it('przy dużej amplitudzie okres rośnie — wzór małych drgań przestaje wystarczać', () => {
    const m = model();
    const okresZSymulacji = (theta0: number) => {
      const result = m.run({ ...defaultValues(m), L: 1, g: 9.81, m: 1, theta_0: theta0 }, [0, 20], 0.002);
      const theta = result.series.theta!;
      const crossings: number[] = [];
      for (let i = 1; i < theta.length; i += 1) {
        if (theta[i - 1][1] < 0 && theta[i][1] >= 0) crossings.push(theta[i][0]);
      }
      return (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
    };

    // To jest dokładnie ta obserwacja, dla której warto mieć symulację obok
    // wzoru: przybliżenie małych kątów widać, gdy przestaje działać.
    expect(okresZSymulacji(1.5)).toBeGreaterThan(okresZSymulacji(0.05) * 1.05);
  });
});

describe('parametry z dokumentu', () => {
  it('czyta wartości z jednostkami', () => {
    const { values, issues } = applyOverrides(model(), { L: '50 cm', theta_0: '15 deg' });
    expect(issues).toEqual([]);
    expect(values.L).toBeCloseTo(0.5, 9);
    expect(values.theta_0).toBeCloseTo(Math.PI / 12, 9);
  });

  it('zły wymiar jest zgłaszany, nie połykany', () => {
    expect(applyOverrides(model(), { L: '5 kg' }).issues.length).toBe(1);
  });

  it('parametr spoza dokumentu jest zgłaszany', () => {
    expect(applyOverrides(model(), { nieistnieje: 1 }).issues[0]).toMatch(/nie występuje/);
  });
});

describe('stała fizyczna jako podpowiedź, nie przechwycenie symbolu', () => {
  it('nie podstawia stałej pod parametr o innym wymiarze', () => {
    // `sigma` w równaniach Lorenza jest bezwymiarowa i znaczy liczbę Prandtla.
    // Podstawienie stałej Stefana-Boltzmanna (5,67e-8 W/(m²K⁴)) daje układ,
    // który zbiega do punktu zamiast krążyć wokół dwóch skrzydeł atraktora.
    const model = compileGraph(buildGraph([
      parseFormulaBlock('lorenz', [
        '@ode', '@state x, y, z',
        '@d x = \\sigma \\cdot (y - x)',
        '@d y = x \\cdot (\\rho - z) - y',
        '@d z = x \\cdot y - \\beta \\cdot z',
        '@init x = 1, y = 1, z = 1',
        '@vars x: 1, y: 1, z: 1, sigma: 1, rho: 1, beta: 1',
      ].join('\n')),
    ]));

    const sigma = model.parameters.find((p) => p.name === 'sigma')!;
    expect(sigma.value).toBe(1);
  });

  it('podstawia stałą, gdy wymiar się zgadza', () => {
    const model = compileGraph(buildGraph([
      parseFormulaBlock('promieniowanie', [
        'P = \\sigma \\cdot A \\cdot T^4',
        '@vars P: W, sigma: W/(m^2 K^4), A: m^2, T: K',
      ].join('\n')),
    ]));

    expect(model.parameters.find((p) => p.name === 'sigma')!.value).toBeCloseTo(5.670374419e-8, 15);
  });
});
