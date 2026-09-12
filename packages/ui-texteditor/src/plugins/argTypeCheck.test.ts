/**
 * Testy kontroli typów argumentów.
 *
 * Najważniejsza część to przypadki, w których kontrola MA MILCZEĆ: bez
 * kompilatora nie sposób orzekać o dziedziczeniu czy generykach, a fałszywy
 * alarm przy poprawnym kodzie uczy ignorowania ostrzeżeń.
 */
import { describe, it, expect } from 'vitest';
import { typesCompatible, normalizeType, unwrapPromise, checkCallArgs, formatIssues } from './argTypeCheck';

describe('normalizeType / unwrapPromise', () => {
  it('sprowadza zapis do postaci porównywalnej', () => {
    expect(normalizeType('  Map<string , number> ')).toBe('Map<string,number>');
    expect(normalizeType('readonly string[]')).toBe('string[]');
    expect(normalizeType('(string|number)')).toBe('string|number');
  });

  it('rozpakowuje Promise — wynik `await` ma typ wewnętrzny', () => {
    expect(unwrapPromise('Promise<string>')).toBe('string');
    expect(unwrapPromise('Promise<Map<string, number>>')).toBe('Map<string,number>');
    expect(unwrapPromise('string')).toBe('string');
  });
});

describe('typesCompatible — zgłasza tylko oczywiste sprzeczności', () => {
  it('wychwytuje niezgodne prymitywy', () => {
    expect(typesCompatible('number', 'string')).toBe(false);
    expect(typesCompatible('boolean', 'number')).toBe(false);
    expect(typesCompatible('string', 'string')).toBe(true);
  });

  it('prymityw kontra tablica lub kolekcja to błąd', () => {
    expect(typesCompatible('number', 'string[]')).toBe(false);
    expect(typesCompatible('string', 'Map<string, number>')).toBe(false);
    expect(typesCompatible('string[]', 'string')).toBe(false);
  });

  it('milczy, gdy nie wie: brak typu, any, typy nazwane', () => {
    expect(typesCompatible(undefined, 'string')).toBe(true);
    expect(typesCompatible('number', undefined)).toBe(true);
    expect(typesCompatible('any', 'number')).toBe(true);
    expect(typesCompatible('number', 'any')).toBe(true);
    // Dziedziczenia nie znamy — Sensor może rozszerzać Device.
    expect(typesCompatible('Device', 'Sensor')).toBe(true);
  });

  it('`unknown` działa kierunkowo, jak w TypeScripcie', () => {
    // Parametr typu unknown przyjmie każdą wartość…
    expect(typesCompatible('unknown', 'string')).toBe(true);
    expect(typesCompatible('unknown', 'Conn')).toBe(true);
    // …ale wartości `unknown` nie wolno podać tam, gdzie oczekiwany jest typ.
    // To realny przypadek: `let x: unknown` i `x as unknown` z bloczków.
    expect(typesCompatible('Conn', 'unknown')).toBe(false);
    expect(typesCompatible('string', 'unknown')).toBe(false);
    expect(typesCompatible('unknown', 'unknown')).toBe(true);
    expect(typesCompatible('any', 'unknown')).toBe(true);
  });

  it('nie kłóci się o null/undefined ani o generyki', () => {
    expect(typesCompatible('string', 'undefined')).toBe(true);
    expect(typesCompatible('string | undefined', 'string')).toBe(true);
    expect(typesCompatible('Array<T>', 'Array<string>')).toBe(true);
  });

  it('unia po stronie oczekiwanej wystarcza w jednym wariancie', () => {
    expect(typesCompatible('string | number', 'number')).toBe(true);
    expect(typesCompatible('string | number', 'boolean')).toBe(false);
  });

  it('unia po stronie wartości musi pasować cała', () => {
    expect(typesCompatible('string', 'string | number')).toBe(false);
    expect(typesCompatible('string | number', 'string | number')).toBe(true);
  });
});

describe('checkCallArgs', () => {
  const names = ['id', 'retries'];
  const types = ['string', 'number'];

  it('nie zgłasza nic dla poprawnego wywołania', () => {
    expect(checkCallArgs('Api.fetch', names, types, ['string', 'number'])).toEqual([]);
  });

  it('wskazuje indeks, nazwę i oba typy', () => {
    const [issue] = checkCallArgs('Api.fetch', names, types, ['string', 'string']);
    expect(issue).toMatchObject({ index: 1, paramName: 'retries', expected: 'number', actual: 'string' });
    expect(issue.message).toContain('argument 2');
  });

  it('pomija argumenty o nieznanym typie', () => {
    expect(checkCallArgs('Api.fetch', names, types, [undefined, undefined])).toEqual([]);
    expect(checkCallArgs('Api.fetch', names, [undefined, undefined], ['number', 'string'])).toEqual([]);
  });

  it('zbiera wiele problemów naraz', () => {
    expect(checkCallArgs('Api.fetch', names, types, ['number', 'boolean'])).toHaveLength(2);
  });
});

describe('formatIssues', () => {
  it('pusty wynik = brak tekstu ostrzeżenia', () => {
    expect(formatIssues([])).toBe('');
  });

  it('składa czytelną chmurkę z licznikiem', () => {
    const issues = checkCallArgs('Api.fetch', ['id', 'n'], ['string', 'number'], ['number', 'boolean']);
    const text = formatIssues(issues);
    expect(text).toContain('Niezgodne typy argumentów (2)');
    expect(text.split('\n')).toHaveLength(3);
  });
});
