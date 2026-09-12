/**
 * Przetłumiony obwód RLC — sprawdzian etapu 3 na dokumencie.
 *
 * Sztywność jest tu **fizyczna, a nie wymyślona na potrzeby testu**: przy
 * R = 100 kΩ prąd ustala się w dwieście nanosekund, a wymuszenie ma okres
 * sześciuset mikrosekund. Trzy tysiące razy dłuższa skala czasu, którą trzeba
 * przejść, i trzy tysiące razy krótsza, która narzuca krok metodzie jawnej.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSimSetup, scanFormulas } from './documentModel';

const DOKUMENT = readFileSync(resolve(__dirname, '../documents/uklad-sztywny.md'), 'utf8');

const setup = (solver: string) => {
  const tekst = DOKUMENT.replace('\n@solver rosenbrock\n', `\n@solver ${solver}\n`);
  return buildSimSetup(scanFormulas(tekst), JSON.stringify({
    R: '100000 ohm',
    L: '0.01 H',
    C: '1e-6 F',
    U_0: '5 V',
    Omega: '10000 s^-1',
  }));
};

/** W rezonansie reaktancje się znoszą, więc |Z| = R i amplituda prądu = U₀/R. */
const AMPLITUDA = 5 / 100000;

describe('obwód przetłumiony', () => {
  it('metoda niejawna liczy go do końca', () => {
    const { model, values } = setup('rosenbrock');
    const wynik = model.run(values, [0, 0.005], 1e-5);

    expect(wynik.error).toBeUndefined();
    expect(wynik.trajectory).toBeDefined();
  });

  it('amplituda prądu w stanie ustalonym wynosi U₀/R', () => {
    const { model, values } = setup('rosenbrock');
    const traj = model.run(values, [0, 0.005], 1e-5).trajectory!;

    // Maksimum po ostatnim okresie wymuszenia — transjent dawno wygasł.
    let max = 0;
    for (let t = 0.004; t <= 0.005; t += 1e-6) max = Math.max(max, Math.abs(traj.value('I', t)));

    expect(max).toBeGreaterThan(AMPLITUDA * 0.9);
    expect(max).toBeLessThan(AMPLITUDA * 1.1);
  }, 30_000);

  it('metoda jawna adaptacyjna rozpoznaje sztywność i odsyła do właściwej', () => {
    const { model, values } = setup('dopri5');
    const wynik = model.run(values, [0, 0.005], 1e-5);

    expect(wynik.trajectory).toBeUndefined();
    expect(wynik.error).toMatch(/sztywny/i);
    expect(wynik.error).toMatch(/rosenbrock/i);
  });

  /**
   * Najlepsza ilustracja tego, czym jest sztywność — i po co cały etap 0.
   *
   * Metoda o stałym kroku nie ma czym zauważyć, że przekroczyła granicę
   * stabilności: liczy szybciej niż obie pozostałe (milisekunda wobec
   * siedemdziesięciu) i zwraca wynik, który nie jest liczbą. Bez pomiaru
   * jakości ten wykres wyglądałby po prostu na pusty.
   */
  it('metoda o stałym kroku liczy najszybciej ze wszystkich i zwraca NaN', () => {
    const { model, values } = setup('rk4');
    const traj = model.run(values, [0, 0.005], 1e-5).trajectory!;

    // Krok 10 µs wobec granicy stabilności 0,28 µs — trzydzieści pięć razy
    // za dużo, więc rozwiązanie narasta wykładniczo aż do przepełnienia.
    expect(Number.isFinite(traj.value('I', 0.004))).toBe(false);
  });
});
