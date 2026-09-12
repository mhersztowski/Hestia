/**
 * Dokument o trzech ciałach — sprawdzian etapu 4.
 *
 * Pokazuje obie drogi naraz: wzory w dokumencie są **do czytania i sprawdzania
 * rachunkiem**, a dwanaście równań ruchu przychodzi z biblioteki, bo ich
 * wypisywanie niczego by nie nauczyło.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSimSetup, scanFormulas } from './documentModel';

const DOKUMENT = readFileSync(resolve(__dirname, '../documents/trzy-ciala.md'), 'utf8');
const SIM = /```sim(?::[\w-]+)?\n([\s\S]*?)```/.exec(DOKUMENT)![1];
const setup = () => buildSimSetup(DOKUMENT, SIM);

/** Wartości z dokumentu: trzy masy Słońca w odległości 1 AU od środka. */
const G = 6.6743e-11;
const M = 1.989e30;
const R = 1.496e11;

describe('wzory do czytania', () => {
  it('prędkość w dokumencie zgadza się z wartościami w bloku', () => {
    const v = Math.sqrt((G * M) / (Math.sqrt(3) * R));
    // W bloku wpisano 22634 m/s.
    expect(v).toBeGreaterThan(22500);
    expect(v).toBeLessThan(22750);
  });

  it('dokument ma wzory, choć fizykę bierze z biblioteki', () => {
    expect(scanFormulas(DOKUMENT).map((f) => f.id)).toEqual(['trzy-predkosc', 'trzy-okres']);
  });
});

describe('symulacja z biblioteki', () => {
  it('buduje się bez uwag', () => {
    expect(setup().issues).toEqual([]);
  });

  it('trójkąt zachowuje kształt przez cały przebieg', () => {
    const s = setup();
    const traj = s.model.run(s.values, [0, 6e7], 2e4).trajectory!;
    const bok = Math.sqrt(3) * R;

    for (const t of [0, 2e7, 4e7, 6e7]) {
      const zmierzony = Math.hypot(
        traj.value('x0', t) - traj.value('x1', t),
        traj.value('y0', t) - traj.value('y1', t),
      );
      /**
       * Promil zapasu, nie zero.
       *
       * Konfiguracja Lagrange'a jest **niestabilna**: odchyłka warunków
       * początkowych narasta, zamiast się gubić. Dane w bloku podano z pięcioma
       * cyframi po przecinku właśnie dlatego — zaokrąglone do pełnych metrów na
       * sekundę dawały rozjazd o 0,7 % w ciągu półtora obiegu.
       */
      expect(Math.abs(zmierzony - bok) / bok).toBeLessThan(0.001);
    }
  }, 30_000);

  it('energia całkowita nie ucieka', () => {
    const s = setup();
    const wynik = s.model.run(s.values, [0, 6e7], 2e4);

    expect(wynik.invariants.find((i) => i.name === 'E')!.trend).not.toBe('drift');
  }, 30_000);

  it('okres z wzoru zgadza się z obiegiem policzonym', () => {
    const s = setup();
    const T = (2 * Math.PI * R) / 22634;
    const traj = s.model.run(s.values, [0, T], 1e4).trajectory!;

    // Po pełnym okresie pierwsze ciało wraca na swoje miejsce.
    expect(traj.value('x0', T) / R).toBeCloseTo(1, 2);
    expect(traj.value('y0', T) / R).toBeCloseTo(0, 2);
  }, 30_000);
});
