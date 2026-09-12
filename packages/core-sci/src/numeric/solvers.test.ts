/**
 * Testy solverów opierają się na tym, że fizyka daje darmowe wzorce: oscylator
 * harmoniczny i ruch jednostajny mają rozwiązania analityczne, a rząd metody
 * widać w tempie spadku błędu przy zagęszczaniu kroku.
 *
 * To najlepiej testowalny kod w projekcie i jednocześnie ten, na którym stoi
 * cała reszta — stąd tak dokładne sprawdzenie.
 */
import { describe, it, expect } from 'vitest';
import { rk4, euler, verlet, solve } from './solvers';
import { Trajectory } from './trajectory';

/** Oscylator harmoniczny: x'' = -ω²x, czyli y = [x, v]. */
const oscillator = (omega: number) => (_t: number, [x, v]: number[]) => [v, -omega * omega * x];

/** Rozwiązanie analityczne dla x(0)=1, v(0)=0. */
const exactOscillator = (omega: number, t: number) => Math.cos(omega * t);

describe('RK4', () => {
  it('odtwarza oscylator harmoniczny', () => {
    const omega = 2;
    const traj = rk4(oscillator(omega), [1, 0], [0, 5], { dt: 0.001 });

    for (const t of [0.5, 1, 2.5, 5]) {
      expect(traj.value('y0', t)).toBeCloseTo(exactOscillator(omega, t), 5);
    }
  });

  it('jest czwartego rzędu — dwa razy mniejszy krok to ~16 razy mniejszy błąd', () => {
    const omega = 1;
    const errorFor = (dt: number) => {
      const traj = rk4(oscillator(omega), [1, 0], [0, 10], { dt });
      return Math.abs(traj.value('y0', 10) - exactOscillator(omega, 10));
    };

    const coarse = errorFor(0.1);
    const fine = errorFor(0.05);
    // Teoretycznie 16×; przyjmujemy szeroki przedział, bo przy bardzo małych
    // błędach zaczyna dominować arytmetyka zmiennoprzecinkowa.
    expect(coarse / fine).toBeGreaterThan(10);
    expect(coarse / fine).toBeLessThan(25);
  });

  it('całkuje ruch jednostajnie przyspieszony dokładnie', () => {
    // Wielomian stopnia 2 leży w klasie, którą RK4 odtwarza bez błędu metody.
    const traj = rk4((_t, [, v]) => [v, 3], [0, 0], [0, 2], { dt: 0.1 });
    expect(traj.value('y0', 2)).toBeCloseTo(0.5 * 3 * 4, 9);
  });
});

describe('Euler', () => {
  it('jest pierwszego rzędu — dwa razy mniejszy krok to ~2 razy mniejszy błąd', () => {
    const errorFor = (dt: number) => {
      const traj = euler(oscillator(1), [1, 0], [0, 5], { dt });
      return Math.abs(traj.value('y0', 5) - exactOscillator(1, 5));
    };

    const ratio = errorFor(0.01) / errorFor(0.005);
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.6);
  });

  it('rozbiega energetycznie — to jest powód, dla którego zostaje tylko dydaktyczny', () => {
    const traj = euler(oscillator(1), [1, 0], [0, 50], { dt: 0.01 });
    const [x, v] = traj.at(50);
    // Energia ~ x² + v²; dla dokładnego rozwiązania stała i równa 1.
    expect(x * x + v * v).toBeGreaterThan(1.2);
  });
});

describe('Verlet', () => {
  /** Wahadło w przybliżeniu małych kątów: a(x) = -ω²x. */
  const acceleration = (omega: number) => (_t: number, x: number[]) => x.map((xi) => -omega * omega * xi);

  it('odtwarza oscylator', () => {
    const traj = verlet(acceleration(2), [1], [0], [0, 5], { dt: 0.001 });
    for (const t of [0.5, 2, 5]) {
      expect(traj.value('x0', t)).toBeCloseTo(exactOscillator(2, t), 4);
    }
  });

  it('trzyma energię w długiej symulacji — tego RK4 nie gwarantuje', () => {
    const omega = 1;
    const traj = verlet(acceleration(omega), [1], [0], [0, 200], { dt: 0.01 });

    const energyAt = (t: number) => {
      const [x, v] = traj.at(t);
      return 0.5 * v * v + 0.5 * omega * omega * x * x;
    };
    const start = energyAt(0.5);
    const end = energyAt(199.5);

    // Verlet nie zachowuje energii dokładnie, ale jej błąd oscyluje wokół
    // stałej zamiast narastać — po 200 s odchyłka wciąż jest znikoma.
    expect(Math.abs(end - start) / start).toBeLessThan(1e-3);
  });

  it('nazywa zmienne stanu położeniami i prędkościami', () => {
    const traj = verlet(acceleration(1), [1, 2], [0, 0], [0, 1], { dt: 0.01 });
    expect(traj.stateNames).toEqual(['x0', 'x1', 'v0', 'v1']);
  });
});

describe('wspólny interfejs', () => {
  it('solve wybiera metodę po nazwie', () => {
    const traj = solve('rk4', oscillator(1), [1, 0], [0, 1], { dt: 0.01 });
    expect(traj).toBeInstanceOf(Trajectory);
    expect(traj.value('y0', 1)).toBeCloseTo(Math.cos(1), 6);
  });

  it('próbkowanie rzadsze niż krok całkowania', () => {
    const gęsta = rk4(oscillator(1), [1, 0], [0, 1], { dt: 0.001 });
    const rzadka = rk4(oscillator(1), [1, 0], [0, 1], { dt: 0.001, sampleEvery: 10 });

    expect(rzadka.length).toBeLessThan(gęsta.length / 5);
    // Rzadsze próbkowanie nie może pogorszyć wyniku — krok solvera jest ten sam.
    expect(rzadka.value('y0', 1)).toBeCloseTo(gęsta.value('y0', 1), 9);
  });

  it('trajektoria interpoluje między próbkami zamiast skakać', () => {
    const traj = rk4((_t, [x]) => [x], [1], [0, 1], { dt: 0.5 });
    const mid = traj.value('y0', 0.25);
    expect(mid).toBeGreaterThan(traj.value('y0', 0));
    expect(mid).toBeLessThan(traj.value('y0', 0.5));
  });

  it('poza policzonym przedziałem zwraca skrajną próbkę, nie ekstrapoluje', () => {
    const traj = rk4((_t, [x]) => [x], [1], [0, 1], { dt: 0.1 });
    expect(traj.value('y0', 5)).toBe(traj.value('y0', 1));
    expect(traj.value('y0', -5)).toBe(traj.value('y0', 0));
  });
});
