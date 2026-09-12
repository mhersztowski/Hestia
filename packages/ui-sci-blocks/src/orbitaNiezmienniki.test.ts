/**
 * Orbita keplerowska jako sprawdzian etapu 0 — od dokumentu do meldunku.
 *
 * Dokument `orbita.md` twierdzi w tekście, że Verlet trzyma orbitę, a RK4 ją
 * powoli zwęża. Do tej pory było to zdanie, którego czytelnik musiał autorowi
 * uwierzyć: oba wykresy wyglądają tak samo. Test sprawdza, że twierdzenie
 * przeszło w **pomiar** — i przy okazji pilnuje, żeby dokument nie rozjechał
 * się z tym, co silnik faktycznie liczy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toSI } from '@hestia/core-sci';
import { buildSimSetup, scanFormulas } from './documentModel';

const DOKUMENT = readFileSync(resolve(__dirname, '../documents/orbita.md'), 'utf8');

/** Ten sam dokument, tylko z inną metodą całkowania — reszta bez zmian. */
const setupZMetoda = (metoda: string) => {
  const tekst = DOKUMENT.replace('@solver verlet', `@solver ${metoda}`);
  const formuly = scanFormulas(tekst);
  return buildSimSetup(formuly, JSON.stringify({
    G_N: '6.6743e-11 m^3/(kg s^2)',
    M: '5.972e24 kg',
    r_0: '7000 km',
    v_0: '7546 m/s',
  }));
};

/** Kilkadziesiąt obiegów — tyle wystarczy, żeby sprawdzić sam pomiar. */
const CZAS: [number, number] = [0, 200_000];

/**
 * Tysiąc obiegów — bo dokument mówi „po tysiącu obiegów", i to nie jest
 * przenośnia.
 *
 * Zmierzone: przy 343 obiegach obie metody są „stabilne", a RK4 jest wręcz
 * dokładniejszy (2,7e-10 wobec 6,2e-10) — jest przecież czwartego rzędu.
 * Dopiero powyżej tysiąca obiegów widać, że jego błąd **narasta**, a błąd
 * Verleta krąży wokół zera. Test na krótszym przebiegu potwierdzałby więc
 * tezę przeciwną do tej z dokumentu — i miałby rację.
 */
const TYSIĄC_OBIEGÓW: [number, number] = [0, 6_000_000];

describe('niezmienniki zadeklarowane w dokumencie', () => {
  it('są mierzone przy każdym przebiegu', () => {
    const { model, values } = setupZMetoda('verlet');
    const wynik = model.run(values, CZAS, 1);

    expect(wynik.invariants.map((i) => i.name)).toEqual(['E', 'L_z']);
  });

  it('energia właściwa startuje od wartości z wzoru na orbitę', () => {
    const { model, values } = setupZMetoda('verlet');
    const wynik = model.run(values, CZAS, 1);

    // E = v²/2 − μ/r, przy starcie prostopadle do promienia.
    const mu = 6.6743e-11 * 5.972e24;
    const oczekiwana = 7546 ** 2 / 2 - mu / toSI('7000 km');
    expect(wynik.invariants[0].initial).toBeCloseTo(oczekiwana, 0);
  });

  it('moment pędu jest zachowany niezależnie od metody — to prawo, nie własność solvera', () => {
    for (const metoda of ['verlet', 'rk4']) {
      const { model, values } = setupZMetoda(metoda);
      const pęd = model.run(values, CZAS, 1).invariants.find((i) => i.name === 'L_z')!;
      expect(pęd.relative).toBeLessThan(1e-6);
    }
  });
});

describe('twierdzenie dokumentu o wyborze metody', () => {
  it('po tysiącu obiegów błąd Verleta krąży, a błąd RK4 ucieka', () => {
    const { model: zVerletem, values } = setupZMetoda('verlet');
    const { model: zRk4 } = setupZMetoda('rk4');

    const verlet = zVerletem.run(values, TYSIĄC_OBIEGÓW, 10).invariants[0];
    const rk4 = zRk4.run(values, TYSIĄC_OBIEGÓW, 10).invariants[0];

    // Różnica jest w **rodzaju** błędu, nie w jego chwilowej wielkości: to
    // dlatego dokument mówi o zwężaniu się orbity, a nie o niedokładności.
    expect(verlet.trend).toBe('oscillation');
    expect(rk4.trend).toBe('drift');
    expect(rk4.relative).toBeGreaterThan(verlet.relative);
  }, 60_000);
});
