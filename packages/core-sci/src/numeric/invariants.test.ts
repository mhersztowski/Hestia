/**
 * Pomiar dryfu niezmiennika — Etap 0 planu silnika.
 *
 * Rzecz, dla której cały ten moduł powstaje: **Euler, RK4 i Verlet psują
 * energię na trzy różne sposoby**, i to rozróżnienie ma trafić do czytelnika,
 * a nie zostać w komentarzu w kodzie solvera.
 *
 *  • Euler — energia narasta systematycznie (dryf),
 *  • Verlet — oscyluje wokół stałej i nie ucieka (oscylacja),
 *  • RK4 z małym krokiem — zmiana poniżej progu (stabilny).
 */
import { describe, it, expect } from 'vitest';
import { euler, rk4, verlet } from './solvers';
import { measureInvariant } from './invariants';

/** Oscylator jednostkowy: ω = 1, m = 1, k = 1 — energia E = ½(v² + x²) = ½. */
const oscillator = (_t: number, [x, v]: number[]) => [v, -x];
const acceleration = (_t: number, x: number[]) => x.map((xi) => -xi);
const energy = ([x, v]: number[]) => 0.5 * (v * v + x * x);

describe('rozpoznanie sposobu, w jaki metoda psuje niezmiennik', () => {
  it('u Eulera widzi narastanie', () => {
    const raport = measureInvariant(euler(oscillator, [1, 0], [0, 50], { dt: 0.01 }), energy, { name: 'E' });

    expect(raport.name).toBe('E');
    expect(raport.trend).toBe('drift');
    // Energia rośnie, więc znak trendu jest dodatni — kierunek też jest wiedzą.
    expect(raport.ratePerUnitTime).toBeGreaterThan(0);
    expect(raport.relative).toBeGreaterThan(0.1);
  });

  it('u Verleta widzi oscylację, nie ucieczkę', () => {
    const raport = measureInvariant(
      verlet(acceleration, [1], [0], [0, 200], { dt: 0.01 }),
      ([x, v]) => 0.5 * (v * v + x * x),
      { name: 'E' },
    );

    expect(raport.trend).toBe('oscillation');
    // Odchylenie istnieje, ale jest ograniczone — na tym polega symplektyczność.
    expect(raport.relative).toBeLessThan(1e-3);
  });

  it('u RK4 z małym krokiem nie widzi nic — i tak to nazywa', () => {
    const raport = measureInvariant(rk4(oscillator, [1, 0], [0, 20], { dt: 0.001 }), energy, { name: 'E' });

    expect(raport.trend).toBe('stable');
    expect(raport.relative).toBeLessThan(1e-9);
  });
});

describe('liczby w raporcie', () => {
  it('podaje wartość początkową niezmiennika', () => {
    const raport = measureInvariant(rk4(oscillator, [1, 0], [0, 10], { dt: 0.001 }), energy);
    expect(raport.initial).toBeCloseTo(0.5, 9);
  });

  it('tempo liczy na jednostkę czasu, nie na krok — inaczej zależałoby od nastaw solvera', () => {
    const gęsty = measureInvariant(euler(oscillator, [1, 0], [0, 20], { dt: 0.005 }), energy);
    const rzadki = measureInvariant(euler(oscillator, [1, 0], [0, 20], { dt: 0.01 }), energy);

    // Błąd Eulera na jednostkę czasu jest proporcjonalny do kroku, więc
    // dwukrotnie większy krok to około dwukrotnie szybszy dryf.
    const iloraz = rzadki.ratePerUnitTime / gęsty.ratePerUnitTime;
    expect(iloraz).toBeGreaterThan(1.5);
    expect(iloraz).toBeLessThan(2.5);
  });

  it('zwraca przebieg niezmiennika do narysowania', () => {
    const raport = measureInvariant(rk4(oscillator, [1, 0], [0, 10], { dt: 0.01 }), energy, { samples: 50 });

    expect(raport.values.length).toBeLessThanOrEqual(50);
    expect(raport.values[0][0]).toBe(0);
    expect(raport.values[raport.values.length - 1][0]).toBeCloseTo(10, 6);
  });

  it('największe odchylenie jest bezwzględne — spadek energii to też błąd', () => {
    // Sztuczny przebieg: niezmiennik maleje. Miara nie może tego przeoczyć.
    const traj = rk4(oscillator, [1, 0], [0, 10], { dt: 0.01 });
    const raport = measureInvariant(traj, (_state, t) => 1 - 0.01 * t);

    expect(raport.maxDeviation).toBeCloseTo(0.1, 3);
    expect(raport.trend).toBe('drift');
    expect(raport.ratePerUnitTime).toBeLessThan(0);
  });
});

describe('przypadki zdegenerowane', () => {
  it('niezmiennik równy zeru nie wywraca błędu względnego', () => {
    const raport = measureInvariant(rk4(oscillator, [1, 0], [0, 5], { dt: 0.01 }), () => 0);

    expect(Number.isFinite(raport.relative)).toBe(true);
    expect(raport.trend).toBe('stable');
  });

  it('melduje, gdy niezmiennik przestaje być liczbą', () => {
    const raport = measureInvariant(
      rk4(oscillator, [1, 0], [0, 5], { dt: 0.01 }),
      (_state, t) => (t > 2 ? Number.NaN : 1),
    );

    expect(raport.issues.join(' ')).toMatch(/nie jest liczbą|NaN/i);
  });
});
