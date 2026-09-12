/**
 * Algebra liniowa jako typy grafu.
 *
 * Raport (§3.6c) chce, żeby wektor i macierz były **typami wielkości**, a nie
 * czymś dorysowanym skryptem per dokument. Wtedy `w = A \cdot v` samo wie, że
 * ma narysować dwie strzałki, dokładnie tak jak `T = 2\pi\sqrt{L/g}` samo wie,
 * że jest liczbą w sekundach.
 *
 * Testy sprawdzają matematykę wprost przez własności, które muszą zachodzić:
 * wyznacznik jako zmiana pola, wektory własne jako kierunki bez skręcenia,
 * rzut jako operacja idempotentna. Każda z nich jest widoczna na scenie, więc
 * błąd tutaj natychmiast kłamie czytelnikowi.
 */
import { describe, it, expect } from 'vitest';
import {
  apply, compose, det, eigen, identity, interpolate, inverse, rank,
  type Matrix2, type Vector2,
} from './matrix';

const OBROT = (kat: number): Matrix2 => [
  [Math.cos(kat), -Math.sin(kat)],
  [Math.sin(kat), Math.cos(kat)],
];
const SCINANIE: Matrix2 = [[1, 1], [0, 1]];
const SKALOWANIE: Matrix2 = [[3, 0], [0, 2]];
/** Rzut na oś x — traci wymiar, więc wyznacznik zero. */
const RZUT: Matrix2 = [[1, 0], [0, 0]];

describe('podstawowe operacje', () => {
  it('macierz przekształca wektor', () => {
    expect(apply(SKALOWANIE, [1, 1])).toEqual([3, 2]);
    expect(apply(SCINANIE, [0, 1])).toEqual([1, 1]);
  });

  it('obrót o 90° przenosi oś x na oś y', () => {
    const [x, y] = apply(OBROT(Math.PI / 2), [1, 0]);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
  });

  it('złożenie działa w kolejności „najpierw prawa"', () => {
    // `compose(A, B)` znaczy „najpierw B, potem A" — jak w zapisie A·B·v.
    // Odwrotna kolejność dałaby inny wynik i cicho przestawiła animację.
    const zlozenie = compose(SKALOWANIE, SCINANIE);
    expect(apply(zlozenie, [0, 1])).toEqual(apply(SKALOWANIE, apply(SCINANIE, [0, 1])));
  });
});

describe('wyznacznik', () => {
  it('mierzy zmianę pola', () => {
    expect(det(SKALOWANIE)).toBeCloseTo(6, 10);
    // Ścinanie przesuwa, ale nie zmienia pola — to widać na kwadracie
    // jednostkowym i jest najlepszą intuicją wyznacznika.
    expect(det(SCINANIE)).toBeCloseTo(1, 10);
    expect(det(OBROT(0.7))).toBeCloseTo(1, 10);
  });

  it('ujemny znaczy odwrócenie orientacji', () => {
    const odbicie: Matrix2 = [[1, 0], [0, -1]];
    expect(det(odbicie)).toBeCloseTo(-1, 10);
  });

  it('zero znaczy utratę wymiaru', () => {
    expect(det(RZUT)).toBeCloseTo(0, 10);
    expect(rank(RZUT)).toBe(1);
    expect(rank(SKALOWANIE)).toBe(2);
    expect(rank([[0, 0], [0, 0]])).toBe(0);
  });
});

describe('wektory własne', () => {
  it('kierunek własny nie skręca pod działaniem macierzy', () => {
    // To jest definicja i zarazem to, co widać na scenie: przeciągając wektor,
    // szukamy kierunku, w którym strzałka wyjściowa leży na wejściowej.
    const wynik = eigen(SKALOWANIE);
    expect(wynik.real).toBe(true);

    for (const { value, vector } of wynik.pairs) {
      const po = apply(SKALOWANIE, vector);
      expect(po[0]).toBeCloseTo(value * vector[0], 8);
      expect(po[1]).toBeCloseTo(value * vector[1], 8);
    }
  });

  it('znajduje obie wartości własne skalowania', () => {
    const wartosci = eigen(SKALOWANIE).pairs.map((p) => p.value).sort((a, b) => a - b);
    expect(wartosci[0]).toBeCloseTo(2, 8);
    expect(wartosci[1]).toBeCloseTo(3, 8);
  });

  it('obrót nie ma rzeczywistych kierunków własnych', () => {
    // Obrót skręca każdy kierunek — brak wektorów własnych jest tu prawdą o
    // zjawisku, nie awarią. Scena musi to umieć pokazać, więc model musi to
    // umieć powiedzieć.
    const wynik = eigen(OBROT(Math.PI / 3));
    expect(wynik.real).toBe(false);
    expect(wynik.pairs).toEqual([]);
  });

  it('ścinanie ma jeden kierunek własny, nie dwa', () => {
    // Macierz zdegenerowana: podwójna wartość własna z jednym kierunkiem.
    // Zwrócenie dwóch identycznych strzałek wyglądałoby jak błąd rysowania.
    const wynik = eigen(SCINANIE);
    expect(wynik.pairs).toHaveLength(1);
    expect(wynik.pairs[0].value).toBeCloseTo(1, 8);
    expect(Math.abs(wynik.pairs[0].vector[1])).toBeCloseTo(0, 8);
  });

  it('wektory własne są znormalizowane', () => {
    for (const { vector } of eigen(SKALOWANIE).pairs) {
      expect(Math.hypot(...vector)).toBeCloseTo(1, 8);
    }
  });
});

describe('odwracanie', () => {
  it('złożenie z odwrotnością daje identyczność', () => {
    const odwrotna = inverse(SCINANIE)!;
    const zlozenie = compose(SCINANIE, odwrotna);

    expect(zlozenie[0][0]).toBeCloseTo(1, 10);
    expect(zlozenie[0][1]).toBeCloseTo(0, 10);
    expect(zlozenie[1][1]).toBeCloseTo(1, 10);
  });

  it('macierz osobliwa nie ma odwrotności', () => {
    // `null`, nie wyjątek: rzut jest poprawną macierzą i dokument ma prawo go
    // pokazać — tylko nie da się go cofnąć.
    expect(inverse(RZUT)).toBeNull();
  });
});

describe('animacja przekształcenia', () => {
  it('zaczyna od identyczności i kończy na macierzy', () => {
    expect(interpolate(SKALOWANIE, 0)).toEqual(identity());
    expect(interpolate(SKALOWANIE, 1)).toEqual(SKALOWANIE);
  });

  it('w połowie jest w połowie drogi', () => {
    const polowa = interpolate(SKALOWANIE, 0.5);
    expect(polowa[0][0]).toBeCloseTo(2, 10);
    expect(polowa[1][1]).toBeCloseTo(1.5, 10);
  });

  it('nie przechodzi przez macierz osobliwą przy odbiciu', () => {
    // Interpolacja liniowa od identyczności do odbicia mija wyznacznik zero:
    // w połowie animacji cała płaszczyzna zapada się w prostą. To jest
    // prawda o odbiciu — nie da się go zrobić bez przejścia przez zero —
    // więc scena ma to pokazać, a nie ominąć.
    const odbicie: Matrix2 = [[1, 0], [0, -1]];
    expect(det(interpolate(odbicie, 0.5))).toBeCloseTo(0, 10);
  });
});
