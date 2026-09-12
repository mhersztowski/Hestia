/**
 * Test na prawdziwym dokumencie: to samo wejście, które czyta edytor.
 *
 * Sprawdza pełną drogę spike'u — od tekstu markdown, przez skan bloków, graf
 * wzorów i kompilację, po wyniki liczbowe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanFormulas, buildSimSetup } from './documentModel';

const DOCUMENT = readFileSync(resolve(__dirname, '../documents/wahadlo.md'), 'utf8');
const SIM_BODY = /```sim:pendulum\n([\s\S]*?)```/.exec(DOCUMENT)![1];

describe('dokument o wahadle', () => {
  it('ma trzy wzory: układ ODE, okres i energię', () => {
    const formulas = scanFormulas(DOCUMENT);
    expect(formulas.map((f) => f.id)).toEqual(['pendulum-ode', 'pendulum-period', 'pendulum-energy']);
    expect(formulas[0].kind).toBe('ode');
  });

  it('buduje model bez ani jednej uwagi', () => {
    expect(buildSimSetup(DOCUMENT, SIM_BODY).issues).toEqual([]);
  });

  it('parametry i ich wartości przychodzą z dokumentu', () => {
    const setup = buildSimSetup(DOCUMENT, SIM_BODY);
    expect(setup.model.parameters.map((p) => p.name).sort()).toEqual(['L', 'g', 'm', 'theta_0']);
    expect(setup.values.L).toBeCloseTo(1, 9);
    expect(setup.values.theta_0).toBeCloseTo(Math.PI / 12, 9);
    // `g` nie stoi w bloku sim — bierze wartość podpowiedzianą ze stałych.
    expect(setup.values.g).toBeCloseTo(9.80665, 5);
  });

  it('liczy okres zgodny ze wzorem analitycznym', () => {
    const setup = buildSimSetup(DOCUMENT, SIM_BODY);
    const result = setup.model.run(setup.values, [0, 12], 0.004);
    expect(result.scalars.T).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.80665), 6);
  });

  it('daje przebiegi do wykresu i zachowuje energię', () => {
    const setup = buildSimSetup(DOCUMENT, SIM_BODY);
    const result = setup.model.run(setup.values, [0, 12], 0.004);

    expect(result.series.theta.length).toBeGreaterThan(100);
    const energy = result.series.E.map(([, value]) => value);
    const spread = (Math.max(...energy) - Math.min(...energy)) / Math.max(...energy);
    expect(spread).toBeLessThan(1e-4);
  });

  it('zapowiedziana w tekście obserwacja jest prawdziwa: przy 90° okres odbiega od wzoru', () => {
    // Dokument obiecuje czytelnikowi, że zobaczy rozjazd — test pilnuje, żeby
    // obietnica z treści nie rozminęła się z tym, co liczy symulacja.
    const setup = buildSimSetup(DOCUMENT, SIM_BODY);
    const okres = (theta0: number) => {
      const result = setup.model.run({ ...setup.values, theta_0: theta0 }, [0, 20], 0.002);
      const theta = result.series.theta;
      const crossings: number[] = [];
      for (let i = 1; i < theta.length; i += 1) {
        if (theta[i - 1][1] < 0 && theta[i][1] >= 0) crossings.push(theta[i][0]);
      }
      return (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
    };

    const analityczny = setup.model.run(setup.values, [0, 1], 0.01).scalars.T;
    expect(okres(Math.PI / 12)).toBeCloseTo(analityczny, 1);
    expect(okres(Math.PI / 2)).toBeGreaterThan(analityczny * 1.15);
  });
});

describe('wybór wzorów dla symulacji', () => {
  /**
   * Rozdział podręcznika to **wiele zjawisk**, nie jedno.
   *
   * W rozdziale o drganiach siła `F` ma osobny wzór dla sprężyny i osobny dla
   * wahadła — to nie jest błąd autora, tylko normalny sposób wykładania fizyki.
   * Graf jednego zjawiska widzi w tym niejednoznaczność i słusznie, więc blok
   * `sim` musi umieć powiedzieć, o którym układzie mówi.
   */
  const ROZDZIAL = [
    '```formula:sprezyna',
    '@ode',
    '@state x, v',
    '@d x = v',
    '@d v = -\\frac{k}{m} \\cdot x',
    '@init x = A, v = 0',
    '@vars x: m, v: m/s, k: N/m, m: kg, A: m',
    '```',
    '',
    '```formula:sila-sprezyny',
    'F = -k \\cdot x',
    '@vars F: N, k: N/m, x: m',
    '```',
    '',
    '```formula:sila-wahadla',
    'F = -m \\cdot g \\cdot \\sin(\\theta)',
    '@vars F: N, m: kg, g: m/s^2, theta: rad',
    '```',
  ].join('\n');

  it('bez wskazania wzorów zgłasza niejednoznaczność', () => {
    // Zachowanie dotychczasowe zostaje: dokument o jednym zjawisku nie musi
    // niczego deklarować, a dokument o wielu dowiaduje się, że ma problem.
    const setup = buildSimSetup(ROZDZIAL, '{}');
    expect(setup.issues.join(' ')).toMatch(/liczą dwa wzory/);
  });

  it('wskazane wzory budują model bez konfliktu', () => {
    const setup = buildSimSetup(ROZDZIAL, '{"formulas": ["sprezyna", "sila-sprezyny"]}');

    expect(setup.issues).toEqual([]);
    expect(setup.model.parameters.map((p) => p.name).sort()).toEqual(['A', 'k', 'm']);
  });

  it('ten sam dokument daje różne modele dla różnych wyborów', () => {
    // To jest sedno: jeden rozdział, wiele niezależnych symulacji.
    const wahadlo = buildSimSetup(ROZDZIAL, '{"formulas": ["sila-wahadla"]}');
    expect(wahadlo.issues).toEqual([]);
    expect(wahadlo.model.parameters.map((p) => p.name).sort()).toEqual(['g', 'm', 'theta']);
  });

  it('nieznany identyfikator jest zgłaszany, nie pomijany', () => {
    // Literówka w nazwie dałaby model zbudowany z mniejszej liczby wzorów —
    // symulacja by ruszyła i pokazała coś innego, niż autor chciał.
    const setup = buildSimSetup(ROZDZIAL, '{"formulas": ["sprezyna", "literowka"]}');
    expect(setup.issues.join(' ')).toMatch(/literowka/);
  });

  it('pusta lista znaczy „wszystkie", jak brak listy', () => {
    expect(buildSimSetup(ROZDZIAL, '{"formulas": []}').issues.join(' ')).toMatch(/liczą dwa wzory/);
  });
});

describe('model dla workera', () => {
  /**
   * Worker buduje model **u siebie**, z opisu przesłanego przez blok. Jeśli
   * dostanie pełną listę wzorów dokumentu zamiast wybranego podzbioru, policzy
   * inny model niż ten, który widać na ekranie — a że robi to w tle, rozjazd
   * objawia się pustym wykresem bez żadnego komunikatu.
   */
  const DWA_ZJAWISKA = [
    '```formula:a-ode',
    '@ode', '@state x, v', '@d x = v', '@d v = -\\frac{k}{m} \\cdot x',
    '@init x = A, v = 0',
    '@vars x: m, v: m/s, k: N/m, m: kg, A: m',
    '```',
    '```formula:b-inne-x',
    'x = 2 \\cdot k',
    '@vars x: m, k: N/m',
    '```',
  ].join('\n');

  it('podaje dokładnie te wzory, z których zbudowano model', () => {
    const setup = buildSimSetup(DWA_ZJAWISKA, '{"formulas": ["a-ode"]}');

    expect(setup.usedFormulas.map((f) => f.id)).toEqual(['a-ode']);
    expect(setup.issues).toEqual([]);
  });

  it('bez wyboru podaje wszystkie', () => {
    expect(buildSimSetup(DWA_ZJAWISKA, '{}').usedFormulas).toHaveLength(2);
  });
});
