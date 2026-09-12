/**
 * Powierzchnie `z = f(x, y)` w kalkulatorze wykresów.
 *
 * Kalkulator liczy dotąd wyłącznie na płaszczyźnie. Tymczasem powierzchnia jest
 * jedynym sposobem pokazania rzeczy, których rzut płaski nie pokazuje: siodła,
 * ekstremów lokalnych, tego jak wygląda funkcja dwóch zmiennych. Silnik 3D
 * w pakiecie już jest (`LinAlgStage3D`), więc dochodzi tu tylko rozpoznanie
 * zapisu i próbkowanie.
 */
import { describe, it, expect } from 'vitest';
import { parsePlotRow } from './parseRow';
import { sampleSurface } from './surface';

describe('rozpoznanie zapisu', () => {
  it('`z = f(x, y)` jest powierzchnią', () => {
    expect(parsePlotRow('z = x^2 - y^2').kind).toBe('surface');
  });

  it('`z` zależne tylko od jednej zmiennej też jest powierzchnią', () => {
    // `z = x^2` to rynna — powierzchnia stała wzdłuż `y`. Wymaganie obu
    // zmiennych odrzucałoby poprawny i pouczający przypadek.
    expect(parsePlotRow('z = x^2').kind).toBe('surface');
  });

  it('nie myli się z wykresem płaskim', () => {
    expect(parsePlotRow('y = x^2').kind).toBe('explicit-y');
    expect(parsePlotRow('x = y^2').kind).toBe('explicit-x');
  });

  it('nie bierze `z` za parametr', () => {
    // `z = 3` bez zmiennych jest stałą, nie powierzchnią — inaczej suwak `z`
    // przestałby działać.
    expect(parsePlotRow('z = 3').kind).toBe('constant');
  });

  it('zapamiętuje wolne symbole do suwaków', () => {
    const row = parsePlotRow('z = a \\cdot \\sin(x) \\cdot \\cos(y)');
    expect(row.freeSymbols).toContain('a');
    expect(row.freeSymbols).not.toContain('x');
    expect(row.freeSymbols).not.toContain('y');
  });
});

describe('sampleSurface', () => {
  const zakres = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };

  it('daje siatkę o zadanej rozdzielczości', () => {
    const siatka = sampleSurface('x + y', zakres, {}, 8);
    expect(siatka.n).toBe(8);
    expect(siatka.values).toHaveLength(8 * 8);
  });

  it('liczy wartości zgodnie z wyrażeniem', () => {
    const siatka = sampleSurface('x + y', zakres, {}, 3);
    // Narożnik (xMin, yMin) = (-1, -1) → -2; przeciwległy → 2.
    expect(siatka.values[0]).toBeCloseTo(-2, 9);
    expect(siatka.values[siatka.values.length - 1]).toBeCloseTo(2, 9);
  });

  it('podaje zakres wartości — do wyskalowania osi i barwy', () => {
    // Nieparzysta liczba punktów, żeby środek `(0, 0)` leżał na siatce:
    // przy parzystej minimum `x² + y²` wypada między próbkami i nie jest zerem.
    const siatka = sampleSurface('x^2 + y^2', zakres, {}, 17);
    expect(siatka.min).toBeCloseTo(0, 6);
    expect(siatka.max).toBeCloseTo(2, 6);
  });

  it('podstawia parametry', () => {
    const siatka = sampleSurface('a \\cdot x', zakres, { a: 3 }, 3);
    expect(siatka.values[2]).toBeCloseTo(3, 9);
  });

  it('miejsca nieokreślone zostają jako NaN, a nie zerem', () => {
    // Zero byłoby kłamstwem: `1/x` w zerze nie ma wartości, a płaska plama
    // w środku wykresu wyglądałaby na własność funkcji.
    const siatka = sampleSurface('\\frac{1}{x}', { xMin: -1, xMax: 1, yMin: 0, yMax: 1 }, {}, 3);
    expect(siatka.values.some((v) => Number.isNaN(v) || !Number.isFinite(v))).toBe(true);
  });

  it('zakres wartości pomija punkty nieokreślone', () => {
    const siatka = sampleSurface('\\frac{1}{x}', { xMin: -1, xMax: 1, yMin: 0, yMax: 1 }, {}, 5);
    expect(Number.isFinite(siatka.min)).toBe(true);
    expect(Number.isFinite(siatka.max)).toBe(true);
  });

  it('niepoprawne wyrażenie daje pustą siatkę z uwagą', () => {
    const siatka = sampleSurface('\\frac{1}{', zakres, {}, 4);
    expect(siatka.issues.length).toBeGreaterThan(0);
    expect(siatka.values).toHaveLength(0);
  });
});
