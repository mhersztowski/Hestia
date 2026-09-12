/**
 * Blok `sim` z biblioteki zjawisk — Etap 4, druga połowa.
 *
 * Dotąd treść bloku wskazywała wzory stojące w dokumencie. Teraz może zamiast
 * tego podać nazwę zjawiska z biblioteki — a wszystko poza tą jedną linijką
 * (suwaki, widoki, animacja, panel jakości) działa bez zmian, bo po obu
 * stronach jest ten sam `PhenomenonModel`.
 */
import { describe, it, expect } from 'vitest';
import { buildSimSetup } from './documentModel';

/** Dokument bez ani jednego bloku formula — cała fizyka pochodzi z biblioteki. */
const PUSTY = '# Dokument o wahadle\n\nTreść.\n';

describe('wskazanie zjawiska z biblioteki', () => {
  it('buduje model, choć w dokumencie nie ma żadnego wzoru', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({ model: 'wahadlo' }));

    expect(setup.issues).toEqual([]);
    expect(setup.model.parameters.map((p) => p.name)).toContain('L');
  });

  it('nadpisania parametrów działają tak samo jak dla modelu z dokumentu', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({
      model: 'wahadlo',
      L: '2 m',
      theta_0: '30 deg',
    }));

    expect(setup.issues).toEqual([]);
    expect(setup.values.L).toBeCloseTo(2, 12);
    // Stopnie zamieniają się na radiany — jednostki obowiązują tak samo.
    expect(setup.values.theta_0).toBeCloseTo(Math.PI / 6, 12);
  });

  it('opcje zjawiska nie są mylone z parametrami', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({ model: 'wahadlo', smallAngle: true }));

    // `smallAngle` kształtuje model, więc nie może wylądować wśród nadpisań
    // i zostać zgłoszone jako nieznany parametr.
    expect(setup.issues).toEqual([]);
    expect(setup.model.parameters.some((p) => p.name === 'smallAngle')).toBe(false);
  });

  it('opcja naprawdę zmienia fizykę, a nie tylko przechodzi bez protestu', () => {
    // Kąt z jednostką: gołej liczby analiza wymiarowa nie przyjmie tam, gdzie
    // parametr zadeklarowano w radianach — i dobrze, bo „2" może znaczyć
    // stopnie albo radiany.
    const pełne = buildSimSetup(PUSTY, JSON.stringify({ model: 'wahadlo', theta_0: '2 rad' }));
    const przybliżone = buildSimSetup(PUSTY, JSON.stringify({
      model: 'wahadlo', smallAngle: true, theta_0: '2 rad',
    }));

    const T = 2 * Math.PI * Math.sqrt(1 / 9.81);
    const kąt = (s: typeof pełne) => s.model.run(s.values, [0, 5], 0.001).trajectory!.value('theta', T);

    expect(kąt(przybliżone)).toBeCloseTo(2, 2);
    expect(kąt(pełne)).toBeLessThan(1.5);
  });

  it('nieznana nazwa zjawiska nie kasuje bloku, tylko go wyjaśnia', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({ model: 'wahadelko' }));

    expect(setup.issues.join(' ')).toMatch(/wahadlo/);
    expect(setup.model.parameters).toEqual([]);
  });

  it('literówka w nazwie parametru nadal jest wyłapywana', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({ model: 'wahadlo', dlugosc: 2 }));
    expect(setup.issues.join(' ')).toMatch(/dlugosc/);
  });
});

describe('N ciał z bloku', () => {
  it('przyjmuje listę ciał jako opcję i liczy orbitę', () => {
    const setup = buildSimSetup(PUSTY, JSON.stringify({
      model: 'nbody',
      bodies: [
        { mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
        { mass: 1e-6, x: 1, y: 0, vx: 0, vy: 1 },
      ],
      // Jednostki umowne (G = 1, masa = 1, promień = 1) zapisane jawnie:
      // wymiar musi się zgadzać, choćby wartość była wybrana dla wygody.
      G: '1 m^3/(kg s^2)',
      duration: 6.283185307179586,
    }));

    expect(setup.issues).toEqual([]);
    const traj = setup.model.run(setup.values, [0, 2 * Math.PI], 1e-4).trajectory!;
    expect(traj.value('x1', 2 * Math.PI)).toBeCloseTo(1, 4);
  });
});

describe('współistnienie obu dróg', () => {
  it('bez „model" nadal buduje z wzorów dokumentu', () => {
    const dokument = [
      '```formula:osc',
      '@ode',
      '@state x, v',
      '@d x = v',
      '@d v = -x',
      '@init x = 1, v = 0',
      '@vars x: m, v: m/s',
      '```',
    ].join('\n');

    const setup = buildSimSetup(dokument, '{}');
    expect(setup.usedFormulas.map((f) => f.id)).toEqual(['osc']);
    expect(setup.model.run(setup.values, [0, 1], 0.001).trajectory!.value('x', 1))
      .toBeCloseTo(Math.cos(1), 5);
  });
});
