/**
 * Scenariusz dla niezależnego solvera.
 *
 * Testy pilnują tego, co decyduje o wartości cross-walidacji: czy Python
 * dostanie **ten sam** układ, i czy rozjazd w tłumaczeniu wyjdzie zanim
 * zacznie się całkowanie.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { exportScenario } from './scenario';

const WAHADLO = parseFormulaBlock('wahadlo-ode', [
  '@ode',
  '@state theta, omega',
  '@d theta = \\omega',
  '@d omega = -\\frac{g}{L}\\sin(\\theta)',
  '@init theta = \\theta_0, omega = 0',
  '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s',
].join('\n'));

const PARAMETRY = { g: 9.81, L: 1.2, theta_0: 0.3 };

describe('exportScenario', () => {
  const scenariusz = exportScenario(WAHADLO, { parameters: PARAMETRY, tSpan: [0, 5] });

  it('zachowuje kolejność zmiennych stanu', () => {
    // Wektor stanu ma tę samą kolejność po obu stronach — inaczej SciPy
    // całkowałby inny układ i rozbieżność wskazywałaby na solver zamiast na
    // pomyłkę w eksporcie.
    expect(scenariusz.state).toEqual(['theta', 'omega']);
  });

  it('tłumaczy prawe strony na Pythona', () => {
    expect(scenariusz.issues).toEqual([]);
    expect(scenariusz.derivatives.omega).not.toContain('\\');
    expect(scenariusz.derivatives.omega).toContain('sin');
  });

  it('liczy warunki początkowe z dokumentu', () => {
    // `@init theta = \theta_0` jest wyrażeniem, nie liczbą — Python dostaje
    // gotową wartość, bo parametry są znane dopiero przy eksporcie.
    expect(scenariusz.initial.theta).toBeCloseTo(0.3, 12);
    expect(scenariusz.initial.omega).toBe(0);
  });

  it('punkty kontrolne mają różne wartości zmiennych', () => {
    // Gdyby wszystkie zmienne miały tę samą wartość, zamiana ich miejscami w
    // wektorze stanu przeszłaby niezauważona.
    const rozne = scenariusz.checkpoints.some((p) => p.state.theta !== p.state.omega);
    expect(rozne).toBe(true);
  });

  it('punkty kontrolne niosą wartości pochodnych z naszego silnika', () => {
    // To jest sedno: Python odtwarza te liczby własnym tłumaczeniem, zanim
    // zacznie całkować. Rozjazd tutaj to inna diagnoza niż rozjazd trajektorii.
    for (const punkt of scenariusz.checkpoints) {
      // dθ/dt = ω — najprostsza zależność, którą da się sprawdzić wprost.
      expect(punkt.derivatives.theta).toBeCloseTo(punkt.state.omega, 12);
      // dω/dt = -(g/L)·sin(θ)
      expect(punkt.derivatives.omega)
        .toBeCloseTo(-(PARAMETRY.g / PARAMETRY.L) * Math.sin(punkt.state.theta), 12);
    }
  });

  it('blok, który nie jest układem ODE, jest odrzucany', () => {
    const wzor = parseFormulaBlock('okres', 'T = 2\\pi\\sqrt{\\frac{L}{g}}\n@vars T: s, L: m, g: m/s^2');
    expect(exportScenario(wzor, { parameters: PARAMETRY }).issues.join(' ')).toMatch(/ODE/);
  });

  it('scenariusz przechodzi przez JSON bez strat', () => {
    // Trafia do repozytorium jako plik i wraca po miesiącach — round-trip jest
    // warunkiem, żeby fixture dało się w ogóle odtworzyć.
    expect(JSON.parse(JSON.stringify(scenariusz))).toEqual(scenariusz);
  });
});
