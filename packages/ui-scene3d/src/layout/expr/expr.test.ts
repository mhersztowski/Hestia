/**
 * Testy charakteryzujące język wyrażeń, przeniesiony z Rysika.
 *
 * Parser jest pisany ręcznie, więc błąd w priorytecie operatora nie wywala się
 * głośno — po cichu liczy co innego. Te testy opisują zachowanie **sprzed**
 * przeniesienia, żeby dało się je porównać po zmianach.
 */
import { describe, it, expect } from 'vitest';
import { evalExpr, exprDeps, isValidExpr, ExprError } from './expr';

describe('arytmetyka i kolejność działań', () => {
  it('mnożenie przed dodawaniem', () => {
    expect(evalExpr('2 + 3 * 4')).toBe(14);
  });

  it('nawiasy zmieniają kolejność', () => {
    expect(evalExpr('(2 + 3) * 4')).toBe(20);
  });

  it('potęgowanie wiąże mocniej niż mnożenie', () => {
    expect(evalExpr('2 * 3 ^ 2')).toBe(18);
  });

  it('potęgowanie jest prawostronne', () => {
    // 2^(3^2) = 512, nie (2^3)^2 = 64.
    expect(evalExpr('2 ^ 3 ^ 2')).toBe(512);
  });

  it('minus jednoargumentowy', () => {
    expect(evalExpr('-3 + 5')).toBe(2);
    expect(evalExpr('-(2 + 3)')).toBe(-5);
  });

  it('dzielenie i reszta', () => {
    expect(evalExpr('7 / 2')).toBe(3.5);
    expect(evalExpr('7 % 3')).toBe(1);
  });
});

describe('wiele parametrów naraz', () => {
  it('liczy z kilku zmiennych', () => {
    expect(evalExpr('dlugosc * 2 + margines', { dlugosc: 40, margines: 5 })).toBe(85);
  });

  it('wymienia wszystkie zależności, nie pierwszą', () => {
    expect(exprDeps('a * 2 + b - c')).toEqual(['a', 'b', 'c']);
  });

  it('nie zgłasza stałych wbudowanych jako zależności', () => {
    expect(exprDeps('pi * r ^ 2')).toEqual(['r']);
  });

  it('nazwa z kropką jest jednym identyfikatorem', () => {
    // To jest podstawa odwołań do innych obiektów: `panel.szerokosc`.
    expect(exprDeps('panel.szerokosc / 2')).toEqual(['panel.szerokosc']);
    expect(evalExpr('panel.szerokosc / 2', { 'panel.szerokosc': 80 })).toBe(40);
  });
});

describe('funkcje', () => {
  it('podstawowe', () => {
    expect(evalExpr('max(3, 7)')).toBe(7);
    expect(evalExpr('sqrt(16)')).toBe(4);
    expect(evalExpr('round(3.14159, 2)')).toBe(3.14);
  });

  it('trygonometria w stopniach — dla geometrii', () => {
    expect(evalExpr('sind(90)')).toBeCloseTo(1, 12);
    expect(evalExpr('cosd(0)')).toBe(1);
    expect(evalExpr('deg(pi)')).toBeCloseTo(180, 12);
  });

  it('atan2 przyjmuje dwa argumenty', () => {
    expect(evalExpr('deg(atan2(1, 1))')).toBeCloseTo(45, 12);
  });
});

describe('porównania i warunek', () => {
  it('operator warunkowy', () => {
    expect(evalExpr('a > 5 ? 10 : 20', { a: 7 })).toBe(10);
    expect(evalExpr('a > 5 ? 10 : 20', { a: 2 })).toBe(20);
  });

  it('operatory logiczne', () => {
    expect(evalExpr('a > 1 && a < 5', { a: 3 })).toBe(true);
    expect(evalExpr('a < 1 || a > 5', { a: 3 })).toBe(false);
  });
});

describe('błędy', () => {
  it('nieznany znak', () => {
    expect(() => evalExpr('2 @ 3')).toThrow(ExprError);
  });

  it('niezamknięty nawias', () => {
    expect(() => evalExpr('(2 + 3')).toThrow(ExprError);
  });

  it('sprawdzenie poprawności bez liczenia', () => {
    expect(isValidExpr('a + b')).toBe(true);
    expect(isValidExpr('a +')).toBe(false);
  });

  it('zależności zepsutego wyrażenia to pusta lista, nie wyjątek', () => {
    // Panel edycji pyta o zależności przy każdym naciśnięciu klawisza, więc
    // wyrażenie bywa niedokończone.
    expect(exprDeps('a +')).toEqual([]);
  });
});
