/**
 * Układ N ciał — zjawisko, dla którego rejestr w ogóle powstał.
 *
 * Liczba równań wynika tu z liczby ciał, więc nie da się ich wypisać w bloku
 * `formula`: trzy ciała to dwanaście równań pierwszego rzędu, dziesięć — już
 * czterdzieści. Sprawdziany są za to klasyczne i ostre, bo ruch kołowy
 * i zachowanie pędu mają postać zamkniętą.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './registry';
import './builtin';

/** Jednostki umowne: G = 1, masa centralna 1, promień 1 → prędkość 1, okres 2π. */
const ORBITA = {
  bodies: [
    { name: 'centrum', mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
    { name: 'satelita', mass: 1e-6, x: 1, y: 0, vx: 0, vy: 1 },
  ],
};

describe('dwa ciała', () => {
  it('satelita wraca po okresie w to samo miejsce', () => {
    const { model } = buildModel('nbody', ORBITA);
    const wynik = model!.run({ G: 1, softening: 0 }, [0, 2 * Math.PI], 1e-4);

    expect(wynik.trajectory!.value('x1', 2 * Math.PI)).toBeCloseTo(1, 4);
    expect(wynik.trajectory!.value('y1', 2 * Math.PI)).toBeCloseTo(0, 4);
  });

  it('po ćwierci okresu jest tam, gdzie każe geometria', () => {
    const { model } = buildModel('nbody', ORBITA);
    const wynik = model!.run({ G: 1, softening: 0 }, [0, Math.PI / 2], 1e-4);

    expect(wynik.trajectory!.value('x1', Math.PI / 2)).toBeCloseTo(0, 4);
    expect(wynik.trajectory!.value('y1', Math.PI / 2)).toBeCloseTo(1, 4);
  });

  it('energia całkowita nie ucieka — Verlet trzyma orbitę', () => {
    const { model } = buildModel('nbody', ORBITA);
    const wynik = model!.run({ G: 1, softening: 0 }, [0, 200], 1e-3);

    const energia = wynik.invariants.find((i) => i.name === 'E')!;
    expect(energia.trend).not.toBe('drift');
    expect(energia.relative).toBeLessThan(1e-6);
  });
});

describe('trzy ciała', () => {
  /**
   * Konfiguracja Lagrange'a: trzy równe masy w wierzchołkach trójkąta
   * równobocznego obracają się jak sztywna całość. Rozwiązanie ścisłe, więc
   * dobry sprawdzian dla oddziaływań **każdy z każdym** — dwa ciała nie
   * wykryłyby błędu w sumowaniu par.
   */
  it('trójkąt Lagrange\'a obraca się bez zmiany kształtu', () => {
    const r = 1;
    const v = Math.sqrt(1 / Math.sqrt(3));
    const ciała = [0, 1, 2].map((i) => {
      const kąt = (2 * Math.PI * i) / 3;
      return {
        mass: 1,
        x: r * Math.cos(kąt),
        y: r * Math.sin(kąt),
        vx: -v * Math.sin(kąt),
        vy: v * Math.cos(kąt),
      };
    });

    const { model } = buildModel('nbody', { bodies: ciała });
    const wynik = model!.run({ G: 1, softening: 0 }, [0, 3], 1e-4);
    const traj = wynik.trajectory!;

    // Bok trójkąta ma zostać równy √3 przez cały czas.
    for (const t of [0, 1, 2, 3]) {
      const bok = Math.hypot(
        traj.value('x0', t) - traj.value('x1', t),
        traj.value('y0', t) - traj.value('y1', t),
      );
      expect(bok).toBeCloseTo(Math.sqrt(3), 3);
    }
  });
});

describe('co zgłasza, gdy dane są niepełne', () => {
  it('bez ciał nie udaje, że coś policzy', () => {
    expect(buildModel('nbody', {}).issues.join(' ')).toMatch(/dwa ciała/i);
  });

  it('ciało bez masy jest wskazane po numerze', () => {
    const { issues } = buildModel('nbody', { bodies: [{ mass: 1, x: 0 }, { x: 1 }] });
    expect(issues.join(' ')).toMatch(/nr 2/);
  });
});
