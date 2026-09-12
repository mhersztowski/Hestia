/**
 * Reguły edycji tekstu na diagramie.
 *
 * Chodzi o to, żeby przypadkowe wyczyszczenie pola nie zamieniło stanu w
 * bezimienny prostokąt, a jednocześnie żeby dało się skasować opis przejścia —
 * bo tam pusty tekst jest poprawną wartością.
 */
import { describe, it, expect } from 'vitest';
import { resolveInlineEdit, inlineEditKey, initialEditValue } from './inlineEdit';

describe('resolveInlineEdit', () => {
  it('zmieniony tekst trafia do modelu', () => {
    expect(resolveInlineEdit('Idle', 'Oczekiwanie', false)).toEqual({ changed: true, value: 'Oczekiwanie' });
  });

  it('ten sam tekst nie generuje zmiany — nie chcemy pustych wpisów w historii', () => {
    expect(resolveInlineEdit('Idle', 'Idle', false).changed).toBe(false);
  });

  it('białe znaki na brzegach są obcinane', () => {
    expect(resolveInlineEdit('Idle', '  Praca  ', false)).toEqual({ changed: true, value: 'Praca' });
  });

  it('pusty tekst tam, gdzie nazwa jest wymagana, przywraca poprzednią', () => {
    expect(resolveInlineEdit('Idle', '   ', false)).toEqual({ changed: false, value: 'Idle' });
  });

  it('pusty tekst w opisie przejścia znaczy „usuń opis"', () => {
    expect(resolveInlineEdit('start', '', true)).toEqual({ changed: true, value: '' });
  });

  it('pusty opis, którego i tak nie było, nie jest zmianą', () => {
    expect(resolveInlineEdit('', '', true).changed).toBe(false);
  });
});

describe('inlineEditKey', () => {
  it('Enter zatwierdza, Escape cofa', () => {
    expect(inlineEditKey({ key: 'Enter' })).toBe('commit');
    expect(inlineEditKey({ key: 'Escape' })).toBe('cancel');
  });

  it('Shift+Enter zostawia edycję otwartą — dla wieloliniowych opisów', () => {
    expect(inlineEditKey({ key: 'Enter', shiftKey: true })).toBe('continue');
  });

  it('zwykłe znaki nie kończą edycji', () => {
    expect(inlineEditKey({ key: 'a' })).toBe('continue');
  });
});

describe('initialEditValue', () => {
  it('istniejąca wartość jest punktem wyjścia', () => {
    expect(initialEditValue('Praca', 'Stan1', true)).toBe('Praca');
  });

  it('gdy etykiety brak, edycja startuje od widocznego identyfikatora', () => {
    // Klik w napis „WifiConnect" musi otworzyć pole z tym tekstem, a nie puste.
    expect(initialEditValue('', 'WifiConnect', true)).toBe('WifiConnect');
  });

  it('zachęta („+ opis") nie jest wartością — pole zostaje puste', () => {
    expect(initialEditValue('', '+ opis', false)).toBe('');
  });
});
