/**
 * Testy rozdzielania relacji — warstwa czysto tekstowa, bez silnika wyrażeń.
 *
 * To jedyny fragment rozpoznawania wiersza, który da się sprawdzić bez
 * kompilacji, i jednocześnie ten, w którym najłatwiej o cichą pomyłkę: znak
 * `=` bywa częścią zapisu, a nie relacją.
 */

import { describe, it, expect } from 'vitest';
import { splitRelation } from './relation';

describe('splitRelation', () => {
  it('dzieli równanie na dwie strony', () => {
    expect(splitRelation('y = x^2')).toEqual({ lhs: 'y', op: '=', rhs: 'x^2' });
  });

  it('radzi sobie bez spacji', () => {
    expect(splitRelation('y=x^2')).toEqual({ lhs: 'y', op: '=', rhs: 'x^2' });
  });

  it('rozpoznaje nierówności ostre', () => {
    expect(splitRelation('y < x^2')).toEqual({ lhs: 'y', op: '<', rhs: 'x^2' });
    expect(splitRelation('y > x^2')).toEqual({ lhs: 'y', op: '>', rhs: 'x^2' });
  });

  it('rozpoznaje nierówności nieostre w zapisie MathLive', () => {
    // MathLive wstawia `\le` i `\ge`, nie `<=`.
    expect(splitRelation('y \\le x^2')).toEqual({ lhs: 'y', op: '<=', rhs: 'x^2' });
    expect(splitRelation('y \\geq x^2')).toEqual({ lhs: 'y', op: '>=', rhs: 'x^2' });
  });

  it('rozpoznaje nierówności nieostre wpisane z klawiatury', () => {
    expect(splitRelation('y <= x^2')).toEqual({ lhs: 'y', op: '<=', rhs: 'x^2' });
    expect(splitRelation('y >= x^2')).toEqual({ lhs: 'y', op: '>=', rhs: 'x^2' });
  });

  it('nie myli `\\le` z gołym `<`', () => {
    // Gdyby podział szedł po pierwszym `<`, `\le` rozpadłoby się na `\` i `e`.
    const wynik = splitRelation('a \\le b');
    expect(wynik?.op).toBe('<=');
    expect(wynik?.rhs).toBe('b');
  });

  it('pomija znak równości wewnątrz nawiasów klamrowych', () => {
    // `\sum_{i=1}^{n}` ma `=` w indeksie — to nie jest relacja wiersza.
    const wynik = splitRelation('S = \\sum_{i=1}^{n} i');
    expect(wynik).toEqual({ lhs: 'S', op: '=', rhs: '\\sum_{i=1}^{n} i' });
  });

  it('pomija znak równości wewnątrz nawiasów okrągłych', () => {
    const wynik = splitRelation('f(x) = g(x)');
    expect(wynik?.lhs).toBe('f(x)');
    expect(wynik?.rhs).toBe('g(x)');
  });

  it('dzieli po pierwszej relacji najwyższego poziomu', () => {
    // Podwójna nierówność (`-1 < x < 1`) to osobne zagadnienie; tutaj ważne
    // jest, żeby podział był przewidywalny, a nie żeby zgadywać intencję.
    const wynik = splitRelation('-1 < x < 1');
    expect(wynik?.lhs).toBe('-1');
    expect(wynik?.op).toBe('<');
    expect(wynik?.rhs).toBe('x < 1');
  });

  it('wyrażenie bez relacji zwraca undefined', () => {
    expect(splitRelation('\\sin(x)')).toBeUndefined();
    expect(splitRelation('2 + 2')).toBeUndefined();
  });

  it('nie bierze `\\ne` za relację rysowalną', () => {
    // Nierówność „różne od" nie ma sensownego obrazu na płaszczyźnie —
    // lepiej zgłosić ją jako nieznaną, niż narysować coś przypadkowego.
    expect(splitRelation('y \\ne x')).toBeUndefined();
  });

  it('obcina białe znaki po obu stronach', () => {
    expect(splitRelation('  y   =   x  ')).toEqual({ lhs: 'y', op: '=', rhs: 'x' });
  });
});
