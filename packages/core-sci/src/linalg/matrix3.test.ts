/**
 * Algebra liniowa w trzech wymiarach.
 *
 * Trzeci wymiar dokłada dwie rzeczy, których w płaszczyźnie nie ma i które są
 * powodem, dla którego w ogóle warto go pokazywać:
 *
 *  • **oś obrotu** — obrót 3D ma kierunek własny, którego obrót 2D nie ma,
 *  • **podprzestrzenie o różnych wymiarach** — jądro i obraz mogą być prostą
 *    albo płaszczyzną, więc „utrata wymiaru" przestaje być abstrakcją.
 *
 * Wartości własne wymagają tu rozwiązania równania sześciennego, więc testy są
 * analityczne z rozmysłem: sprawdzamy własności, które muszą zachodzić, a nie
 * konkretne liczby zwrócone przez konkretną implementację.
 */
import { describe, it, expect } from 'vitest';
import {
  applyM3, composeM3, detM3, eigenM3, identityM3, interpolateM3, inverseM3,
  kernelBasis, rankM3, type Matrix3, type Vector3,
} from './matrix3';

/** Obrót wokół osi z o zadany kąt. */
const OBROT_Z = (kat: number): Matrix3 => [
  [Math.cos(kat), -Math.sin(kat), 0],
  [Math.sin(kat), Math.cos(kat), 0],
  [0, 0, 1],
];

const SKALOWANIE: Matrix3 = [[2, 0, 0], [0, 3, 0], [0, 0, 4]];
/** Rzut na płaszczyznę xy — traci jeden wymiar. */
const RZUT_XY: Matrix3 = [[1, 0, 0], [0, 1, 0], [0, 0, 0]];
/** Rzut na oś x — traci dwa wymiary. */
const RZUT_X: Matrix3 = [[1, 0, 0], [0, 0, 0], [0, 0, 0]];

describe('operacje podstawowe', () => {
  it('macierz przekształca wektor', () => {
    expect(applyM3(SKALOWANIE, [1, 1, 1])).toEqual([2, 3, 4]);
  });

  it('obrót o 90° wokół z przenosi oś x na oś y', () => {
    const [x, y, z] = applyM3(OBROT_Z(Math.PI / 2), [1, 0, 0]);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it('złożenie działa w kolejności „najpierw prawa"', () => {
    const A = OBROT_Z(0.5);
    const B = SKALOWANIE;
    const v: Vector3 = [1, 2, 3];
    expect(applyM3(composeM3(A, B), v)).toEqual(applyM3(A, applyM3(B, v)));
  });
});

describe('wyznacznik i rząd', () => {
  it('wyznacznik mierzy zmianę objętości', () => {
    expect(detM3(SKALOWANIE)).toBeCloseTo(24, 10);
    // Obrót zachowuje objętość i orientację.
    expect(detM3(OBROT_Z(1.1))).toBeCloseTo(1, 10);
  });

  it('rząd liczy zachowane wymiary', () => {
    expect(rankM3(SKALOWANIE)).toBe(3);
    expect(rankM3(RZUT_XY)).toBe(2);
    expect(rankM3(RZUT_X)).toBe(1);
    expect(rankM3([[0, 0, 0], [0, 0, 0], [0, 0, 0]])).toBe(0);
  });

  it('ujemny wyznacznik znaczy odwrócenie orientacji', () => {
    const odbicie: Matrix3 = [[1, 0, 0], [0, 1, 0], [0, 0, -1]];
    expect(detM3(odbicie)).toBeCloseTo(-1, 10);
  });
});

describe('jądro — to, co ginie', () => {
  it('rzut na płaszczyznę ma jądro będące prostą', () => {
    // Utrata wymiaru przestaje być abstrakcją: widać dokładnie, który kierunek
    // został zgnieciony do zera.
    const jadro = kernelBasis(RZUT_XY);
    expect(jadro).toHaveLength(1);
    expect(Math.abs(jadro[0][2])).toBeCloseTo(1, 8);
  });

  it('rzut na prostą ma jądro będące płaszczyzną', () => {
    const jadro = kernelBasis(RZUT_X);
    expect(jadro).toHaveLength(2);
    // Oba kierunki muszą naprawdę ginąć.
    for (const v of jadro) {
      const obraz = applyM3(RZUT_X, v);
      expect(Math.hypot(...obraz)).toBeLessThan(1e-8);
    }
  });

  it('przekształcenie odwracalne nie gubi niczego', () => {
    expect(kernelBasis(SKALOWANIE)).toEqual([]);
  });
});

describe('wartości własne', () => {
  it('skalowanie ma trzy wartości własne wzdłuż osi', () => {
    const wartosci = eigenM3(SKALOWANIE).pairs.map((p) => p.value).sort((a, b) => a - b);
    expect(wartosci[0]).toBeCloseTo(2, 6);
    expect(wartosci[1]).toBeCloseTo(3, 6);
    expect(wartosci[2]).toBeCloseTo(4, 6);
  });

  it('obrót ma dokładnie jeden kierunek własny — swoją oś', () => {
    // To jest najważniejszy przykład 3D: obrót w płaszczyźnie nie ma wektorów
    // własnych wcale, a obrót w przestrzeni ma jeden i jest nim **oś obrotu**.
    const wynik = eigenM3(OBROT_Z(Math.PI / 3));
    expect(wynik.pairs).toHaveLength(1);
    expect(wynik.pairs[0].value).toBeCloseTo(1, 6);

    // Kierunek własny to oś z.
    const [x, y, z] = wynik.pairs[0].vector;
    expect(Math.abs(z)).toBeCloseTo(1, 6);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  it('kierunek własny naprawdę nie skręca', () => {
    for (const { value, vector } of eigenM3(SKALOWANIE).pairs) {
      const po = applyM3(SKALOWANIE, vector);
      for (let i = 0; i < 3; i += 1) {
        expect(po[i]).toBeCloseTo(value * vector[i], 6);
      }
    }
  });

  it('wektory własne są znormalizowane', () => {
    for (const { vector } of eigenM3(SKALOWANIE).pairs) {
      expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
    }
  });

  it('rzut ma wartość własną zero — to kierunek, który ginie', () => {
    const wartosci = eigenM3(RZUT_XY).pairs.map((p) => p.value);
    expect(wartosci.some((v) => Math.abs(v) < 1e-6)).toBe(true);
  });
});

describe('odwracanie', () => {
  it('złożenie z odwrotnością daje identyczność', () => {
    const odwrotna = inverseM3(SKALOWANIE)!;
    const zlozenie = composeM3(SKALOWANIE, odwrotna);
    const I = identityM3();

    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        expect(zlozenie[i][j]).toBeCloseTo(I[i][j], 10);
      }
    }
  });

  it('rzut nie ma odwrotności', () => {
    expect(inverseM3(RZUT_XY)).toBeNull();
  });
});

describe('animacja', () => {
  it('zaczyna od identyczności i kończy na macierzy', () => {
    expect(interpolateM3(SKALOWANIE, 0)).toEqual(identityM3());
    expect(interpolateM3(SKALOWANIE, 1)).toEqual(SKALOWANIE);
  });

  it('w połowie jest w połowie drogi', () => {
    expect(interpolateM3(SKALOWANIE, 0.5)[0][0]).toBeCloseTo(1.5, 10);
  });
});
