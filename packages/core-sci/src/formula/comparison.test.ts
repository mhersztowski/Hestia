/**
 * Warunek zdarzenia → funkcja zmieniająca znak.
 *
 * `@when y < 0` mówi „kiedy piłka jest pod ziemią", a solver potrzebuje „ile
 * wynosi wysokość" — bo dopiero funkcja o znanym znaku pozwala **rozwiązać**
 * równanie zdarzenia zamiast wypatrywać go po kroku. Zamiana jednego w drugie
 * to odjęcie stron porównania, a kierunek przejścia bierze się z operatora.
 */
import { describe, it, expect } from 'vitest';
import { compileComparison } from './expression';

describe('rozkład warunku na funkcję i kierunek', () => {
  it('czyta „y < 0" jako wysokość malejącą do zera', () => {
    const c = compileComparison('y < 0', ['y'])!;

    expect(c.direction).toBe('down');
    expect(c.value({ y: 5 })).toBeCloseTo(5, 12);
    expect(c.value({ y: -2 })).toBeCloseTo(-2, 12);
  });

  it('odejmuje strony, gdy próg nie jest zerem', () => {
    const c = compileComparison('h > h_{max}', ['h', 'h_max'])!;

    expect(c.direction).toBe('up');
    expect(c.value({ h: 12, h_max: 10 })).toBeCloseTo(2, 12);
  });

  it('traktuje „≤" i „≥" tak samo jak ostre nierówności', () => {
    expect(compileComparison('y \\leq 0', ['y'])!.direction).toBe('down');
    expect(compileComparison('y \\ge 0', ['y'])!.direction).toBe('up');
  });

  it('równość jest przejściem w dowolną stronę', () => {
    expect(compileComparison('\\theta = \\pi', ['theta'])!.direction).toBe('any');
  });

  it('radzi sobie z wyrażeniem po obu stronach', () => {
    const c = compileComparison('\\frac{v^2}{2} > g \\cdot h', ['v', 'g', 'h'])!;
    expect(c.value({ v: 4, g: 10, h: 0.5 })).toBeCloseTo(8 - 5, 12);
  });
});

describe('czego nie umiemy rozłożyć', () => {
  it('warunek złożony zostaje bez rozkładu', () => {
    // Koniunkcja nie ma jednej funkcji zmieniającej znak — i lepiej powiedzieć
    // to wprost, niż wybrać jeden człon i po cichu zgubić drugi.
    expect(compileComparison('y < 0 \\land v < 0', ['y', 'v'])).toBeUndefined();
  });

  it('zapis bez porównania zostaje bez rozkładu', () => {
    expect(compileComparison('y + 1', ['y'])).toBeUndefined();
  });

  it('melduje wyrażenie, którego nie da się skompilować', () => {
    const c = compileComparison('y < \\sqrtt{2}', ['y']);
    expect(c?.issues.length ?? 1).toBeGreaterThan(0);
  });
});
