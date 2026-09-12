/**
 * Procedury krokowe algebry.
 *
 * Raport (§3.6c): eliminacja Gaussa i Gram-Schmidt „idealnie pasują do trybu
 * walkthrough — sekwencja kroków z widokiem po każdym". Dlatego procedury
 * zwracają **listę stanów pośrednich z opisem**, a nie sam wynik: wynikiem
 * lekcji jest droga, nie liczba na końcu.
 *
 * Testy sprawdzają jedno i drugie — że wynik jest poprawny i że kroki naprawdę
 * pokazują drogę, a nie skaczą od razu do odpowiedzi.
 */
import { describe, it, expect } from 'vitest';
import { gaussSteps, gramSchmidtSteps } from './procedures';
import type { Matrix2, Vector2 } from './matrix';

describe('eliminacja Gaussa', () => {
  const UKLAD: Matrix2 = [[2, 1], [4, 3]];
  const PRAWA: Vector2 = [5, 11];

  it('rozwiązuje układ', () => {
    // 2x + y = 5, 4x + 3y = 11 → x = 2, y = 1.
    const kroki = gaussSteps(UKLAD, PRAWA);
    const wynik = kroki[kroki.length - 1].solution;

    expect(wynik).toBeDefined();
    expect(wynik![0]).toBeCloseTo(2, 10);
    expect(wynik![1]).toBeCloseTo(1, 10);
  });

  it('pokazuje drogę, nie sam wynik', () => {
    const kroki = gaussSteps(UKLAD, PRAWA);

    expect(kroki.length).toBeGreaterThan(2);
    // Pierwszy krok to stan wyjściowy — czytelnik musi zobaczyć, od czego
    // zaczynamy, zanim cokolwiek się zmieni.
    expect(kroki[0].matrix).toEqual(UKLAD);
    expect(kroki.every((k) => k.description.length > 0)).toBe(true);
  });

  it('po eliminacji pod przekątną są zera', () => {
    const kroki = gaussSteps(UKLAD, PRAWA);
    const poEliminacji = kroki.find((k) => k.description.includes('odejm'));

    expect(poEliminacji).toBeDefined();
    expect(Math.abs(poEliminacji!.matrix[1][0])).toBeLessThan(1e-10);
  });

  it('zamienia wiersze, gdy na przekątnej stoi zero', () => {
    // Bez zamiany dzielenie przez zero dałoby NaN w każdym kolejnym kroku,
    // a czytelnik zobaczyłby tabelę „NaN" bez wyjaśnienia.
    const kroki = gaussSteps([[0, 1], [1, 0]], [3, 2]);
    expect(kroki.some((k) => k.description.includes('Zamien'))).toBe(true);

    const wynik = kroki[kroki.length - 1].solution!;
    expect(wynik[0]).toBeCloseTo(2, 10);
    expect(wynik[1]).toBeCloseTo(3, 10);
  });

  it('układ sprzeczny mówi wprost, że nie ma rozwiązania', () => {
    const kroki = gaussSteps([[1, 1], [2, 2]], [1, 5]);
    const ostatni = kroki[kroki.length - 1];

    expect(ostatni.solution).toBeUndefined();
    expect(ostatni.description).toMatch(/nie ma|sprzeczn/i);
  });

  it('układ nieoznaczony też nie udaje jednego rozwiązania', () => {
    const kroki = gaussSteps([[1, 1], [2, 2]], [1, 2]);
    const ostatni = kroki[kroki.length - 1];

    expect(ostatni.solution).toBeUndefined();
    expect(ostatni.description).toMatch(/nieskończenie|zależn/i);
  });
});

describe('Gram-Schmidt', () => {
  it('daje bazę ortonormalną', () => {
    const kroki = gramSchmidtSteps([2, 0], [1, 1]);
    const wynik = kroki[kroki.length - 1].vectors;

    const [e1, e2] = [wynik.e_1, wynik.e_2];
    expect(Math.hypot(...e1)).toBeCloseTo(1, 10);
    expect(Math.hypot(...e2)).toBeCloseTo(1, 10);
    // Prostopadłość to cały sens procedury.
    expect(e1[0] * e2[0] + e1[1] * e2[1]).toBeCloseTo(0, 10);
  });

  it('pierwszy kierunek zostaje bez zmian, tylko skrócony', () => {
    const kroki = gramSchmidtSteps([3, 0], [1, 1]);
    const e1 = kroki[kroki.length - 1].vectors.e_1;

    expect(e1[0]).toBeCloseTo(1, 10);
    expect(e1[1]).toBeCloseTo(0, 10);
  });

  it('pokazuje rzut jako osobny krok', () => {
    // Rzut drugiego wektora na pierwszy jest sednem procedury — bez niego
    // widać tylko dwie strzałki, które nagle stają się prostopadłe.
    const kroki = gramSchmidtSteps([2, 0], [1, 1]);
    expect(kroki.some((k) => k.description.includes('rzut'))).toBe(true);
    expect(kroki.some((k) => k.vectors.p !== undefined)).toBe(true);
  });

  it('wektory równoległe nie dają drugiego kierunku', () => {
    // Nie da się zbudować bazy z dwóch wektorów na jednej prostej — procedura
    // ma to powiedzieć, a nie zwrócić wektor zerowy udający kierunek.
    const kroki = gramSchmidtSteps([1, 0], [2, 0]);
    const ostatni = kroki[kroki.length - 1];

    expect(ostatni.vectors.e_2).toBeUndefined();
    expect(ostatni.description).toMatch(/równoległ|nie rozpina|zależn/i);
  });
});
