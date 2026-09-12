import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from './formulaGraph';
import { compileGraph } from './compileGraph';
import { suggestViews } from './visualization';

const modelOf = (...defs: Array<[string, string]>) =>
  compileGraph(buildGraph(defs.map(([id, body]) => parseFormulaBlock(id, body))));

const PENDULUM: [string, string] = ['ode', [
  '@ode',
  '@state theta, omega',
  '@d theta = \\omega',
  '@d omega = -\\frac{g}{L}\\sin(\\theta)',
  '@init theta = \\theta_0, omega = 0',
  '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s',
].join('\n')];

const PROJECTILE: [string, string] = ['ode', [
  '@ode',
  '@state x, y, vx, vy',
  '@d x = v_x',
  '@d y = v_y',
  '@d vx = 0',
  '@d vy = -g',
  '@init x = 0, y = 0, vx = v_0, vy = v_0',
  '@vars g: m/s^2, x: m, y: m, vx: m/s, vy: m/s, v_0: m/s',
].join('\n')];

describe('widok wynika z rodzaju wielkości, nie z nazwy zjawiska', () => {
  it('zmienna kątowa i długość dają widok ramienia obrotowego', () => {
    const views = suggestViews(modelOf(PENDULUM));
    const angular = views.find((v) => v.kind === 'angular2d');
    expect(angular).toBeDefined();
    expect(angular?.angle).toBe('theta');
    expect(angular?.radius).toBe('L');
  });

  it('dwie zmienne stanu o wymiarze długości dają tor w płaszczyźnie', () => {
    const views = suggestViews(modelOf(PROJECTILE));
    const path = views.find((v) => v.kind === 'path2d');
    expect(path).toMatchObject({ x: 'x', y: 'y' });
  });

  it('zmienna i jej pochodna dają przestrzeń fazową', () => {
    const phase = suggestViews(modelOf(PENDULUM)).find((v) => v.kind === 'phase');
    // `omega` jest pochodną `theta` — to widać z równań, nie z nazw.
    expect(phase).toMatchObject({ x: 'theta', y: 'omega' });
  });

  it('każdy model z trajektorią dostaje przebieg czasowy', () => {
    expect(suggestViews(modelOf(PENDULUM)).some((v) => v.kind === 'timeseries')).toBe(true);
    expect(suggestViews(modelOf(PROJECTILE)).some((v) => v.kind === 'timeseries')).toBe(true);
  });

  it('model bez dynamiki dostaje same wartości', () => {
    const views = suggestViews(modelOf(['t', ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2'].join('\n')]));
    expect(views.map((v) => v.kind)).toEqual(['scalars']);
  });

  it('wielkości skalarne pojawiają się obok wykresu, gdy są', () => {
    const views = suggestViews(modelOf(PENDULUM, ['t', ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s'].join('\n')]));
    expect(views.some((v) => v.kind === 'scalars')).toBe(true);
  });
});

describe('trzeci wymiar', () => {
  it('trzy zmienne o wymiarze długości dają tor w przestrzeni', () => {
    const orbit = modelOf(['ode', [
      '@ode', '@state x, y, z, v_x, v_y, v_z',
      '@d x = v_x', '@d y = v_y', '@d z = v_z',
      '@d v_x = -x', '@d v_y = -y', '@d v_z = -z',
      '@init x = 1, y = 0, z = 0, v_x = 0, v_y = 1, v_z = 0',
      '@vars x: m, y: m, z: m, v_x: m/s, v_y: m/s, v_z: m/s',
    ].join('\n')]);

    expect(suggestViews(orbit).find((v) => v.kind === 'path3d')).toMatchObject({ x: 'x', y: 'y', z: 'z' });
    expect(suggestViews(orbit).some((v) => v.kind === 'path2d')).toBe(false);
  });

  it('układ bezwymiarowy o trzech zmiennych też dostaje tor 3D', () => {
    // Lorenz nie ma jednostek, ale jego wykres w przestrzeni jest sednem.
    const lorenz = modelOf(['ode', [
      '@ode', '@state x, y, z',
      '@d x = \\sigma \\cdot (y - x)',
      '@d y = x \\cdot (\\rho - z) - y',
      '@d z = x \\cdot y - \\beta \\cdot z',
      '@init x = 1, y = 1, z = 1',
      '@vars x: 1, y: 1, z: 1, sigma: 1, rho: 1, beta: 1',
    ].join('\n')]);

    expect(lorenz.issues).toEqual([]);
    expect(suggestViews(lorenz).find((v) => v.kind === 'path3d')).toMatchObject({ x: 'x', y: 'y', z: 'z' });
  });
});

describe('kolejność widoków', () => {
  it('najpierw obraz zjawiska, potem przebiegi, na końcu liczby', () => {
    const kinds = suggestViews(modelOf(PENDULUM)).map((v) => v.kind);
    expect(kinds.indexOf('angular2d')).toBeLessThan(kinds.indexOf('timeseries'));
    expect(kinds.indexOf('timeseries')).toBeLessThan(kinds.indexOf('phase'));
  });
});

describe('wybór autora ma pierwszeństwo', () => {
  it('lista `view` zawęża widoki do wskazanych', () => {
    const views = suggestViews(modelOf(PENDULUM), ['phase']);
    expect(views.map((v) => v.kind)).toEqual(['phase']);
  });

  it('nieznana nazwa widoku jest pomijana, a nie wywraca dokumentu', () => {
    const views = suggestViews(modelOf(PENDULUM), ['nieistniejacy', 'timeseries']);
    expect(views.map((v) => v.kind)).toEqual(['timeseries']);
  });
});
