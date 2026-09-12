/**
 * Testy rozpoznawania wiersza listy wyrażeń.
 *
 * Rozpoznanie dzieje się **raz**, przy wpisaniu, i to ono decyduje, którym
 * rendererem wiersz pójdzie dalej. Pomyłka na tym etapie nie objawia się
 * błędem, tylko wykresem, którego nikt nie zamawiał — stąd tyle przypadków
 * granicznych, w których dwa rodzaje różni jeden znak.
 */

import { describe, it, expect } from 'vitest';
import { parsePlotRow } from './parseRow';

describe('funkcje jawne', () => {
  it('y = f(x) jest wykresem względem x', () => {
    const row = parsePlotRow('y = x^2');
    expect(row.kind).toBe('explicit-y');
    expect(row.body).toBe('x^2');
  });

  it('samo wyrażenie ze zmienną x jest domyślnie y = …', () => {
    // Desmos tak właśnie czyta `sin(x)` — bez tego trzeba by pisać `y=` przy
    // każdym wierszu, co jest dokładnie tym, czego kalkulator ma oszczędzić.
    const row = parsePlotRow('\\sin(x)');
    expect(row.kind).toBe('explicit-y');
    expect(row.body).toBe('\\sin(x)');
  });

  it('x = g(y) jest wykresem względem y', () => {
    const row = parsePlotRow('x = y^2');
    expect(row.kind).toBe('explicit-x');
    expect(row.body).toBe('y^2');
  });

  it('x = 3 to pionowa prosta, a nie definicja stałej', () => {
    // Różnica wobec `a = 3` jest jedna: po lewej stoi zmienna osi. To rozróżnienie
    // decyduje, czy wiersz rysuje prostą, czy tylko wprowadza parametr.
    const row = parsePlotRow('x = 3');
    expect(row.kind).toBe('explicit-x');
    expect(row.body).toBe('3');
  });

  it('y = 3 to pozioma prosta', () => {
    expect(parsePlotRow('y = 3').kind).toBe('explicit-y');
  });

  it('wolne parametry trafiają na listę, bez x i y', () => {
    // To z nich powstaną suwaki, więc zmienne osi nie mogą się tam znaleźć.
    const row = parsePlotRow('y = a \\cdot \\sin(b x)');
    expect(row.freeSymbols.sort()).toEqual(['a', 'b']);
  });
});

describe('definicje', () => {
  it('a = 3 wprowadza stałą', () => {
    const row = parsePlotRow('a = 3');
    expect(row.kind).toBe('constant');
    expect(row.name).toBe('a');
    expect(row.body).toBe('3');
  });

  it('stała może zależeć od innej stałej', () => {
    const row = parsePlotRow('b = 2 a');
    expect(row.kind).toBe('constant');
    expect(row.freeSymbols).toEqual(['a']);
  });

  it('f(x) = … wprowadza funkcję wraz z argumentami', () => {
    const row = parsePlotRow('f(x) = x^2 + 1');
    expect(row.kind).toBe('function');
    expect(row.name).toBe('f');
    expect(row.params).toEqual(['x']);
  });

  it('funkcja wielu argumentów zapamiętuje ich kolejność', () => {
    const row = parsePlotRow('g(t, u) = t + u');
    expect(row.params).toEqual(['t', 'u']);
  });

  it('argumenty funkcji nie są parametrami do suwaka', () => {
    // `x` w `f(x) = a x` jest związane definicją; wolne zostaje samo `a`.
    const row = parsePlotRow('f(x) = a x');
    expect(row.freeSymbols).toEqual(['a']);
  });

  it('nie bierze polecenia LaTeX-a za nazwę funkcji', () => {
    // `\sin(x) = 0` to równanie do rozwiązania, nie definicja funkcji „sin".
    const row = parsePlotRow('\\sin(x) = 0');
    expect(row.kind).not.toBe('function');
  });
});

describe('krzywe uwikłane i nierówności', () => {
  it('równanie z obiema zmiennymi po lewej jest uwikłane', () => {
    const row = parsePlotRow('x^2 + y^2 = 4');
    expect(row.kind).toBe('implicit');
    expect(row.lhs).toBe('x^2 + y^2');
    expect(row.rhs).toBe('4');
  });

  it('nierówność zachowuje operator i obie strony', () => {
    const row = parsePlotRow('y < x^2');
    expect(row.kind).toBe('inequality');
    expect(row.relation).toBe('<');
    expect(row.lhs).toBe('y');
    expect(row.rhs).toBe('x^2');
  });

  it('nierówność nieostra z zapisu MathLive', () => {
    const row = parsePlotRow('x^2 + y^2 \\le 4');
    expect(row.kind).toBe('inequality');
    expect(row.relation).toBe('<=');
  });
});

describe('punkty i wartości', () => {
  it('para w nawiasie jest punktem', () => {
    const row = parsePlotRow('(2, 5)');
    expect(row.kind).toBe('point');
    expect(row.point).toEqual({ x: '2', y: '5' });
  });

  it('współrzędne punktu mogą być wyrażeniami', () => {
    const row = parsePlotRow('(a, \\sin(a))');
    expect(row.kind).toBe('point');
    expect(row.point?.y).toBe('\\sin(a)');
    expect(row.freeSymbols).toEqual(['a']);
  });

  it('wyrażenie bez zmiennych jest wartością do policzenia', () => {
    const row = parsePlotRow('2 + 2');
    expect(row.kind).toBe('value');
  });

  it('nawias z jednym składnikiem nie jest punktem', () => {
    // `(x+1)` to zwykłe wyrażenie w nawiasie — punkt wymaga dwóch współrzędnych.
    expect(parsePlotRow('(x + 1)').kind).toBe('explicit-y');
  });
});

describe('przypadki puste i nierozpoznane', () => {
  it('pusty wiersz ma własny rodzaj, a nie błąd', () => {
    // Lista Desmosa zawsze kończy się pustym wierszem — to normalny stan,
    // nie usterka do zgłoszenia.
    expect(parsePlotRow('').kind).toBe('blank');
    expect(parsePlotRow('   ').kind).toBe('blank');
    expect(parsePlotRow('').issues).toEqual([]);
  });

  it('zapis nie do odczytania zgłasza uwagę zamiast milczeć', () => {
    const row = parsePlotRow('\\frac{1}{');
    expect(row.kind).toBe('unknown');
    expect(row.issues.length).toBeGreaterThan(0);
  });

  it('relacja „różne od" nie jest rysowalna', () => {
    const row = parsePlotRow('y \\ne x');
    expect(row.kind).toBe('unknown');
    expect(row.issues.join(' ')).toContain('różne');
  });
});

describe('symbole zastrzeżone', () => {
  it('stała matematyczna nie jest parametrem do suwaka', () => {
    // `\pi` ma wartość; gdyby trafiło na listę wolnych symboli, kalkulator
    // pokazałby suwak pozwalający zmienić pi.
    const row = parsePlotRow('y = \\pi x');
    expect(row.freeSymbols).toEqual([]);
  });
});
