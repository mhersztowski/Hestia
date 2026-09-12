/**
 * Uwagi z rozbioru diagramu, pokazywane autorowi.
 *
 * `ParseResult.issues` istniało w kontrakcie od początku i nie było wyświetlane
 * nigdzie: krawędź do nieistniejącego węzła, nieznana dyrektywa czy zły kształt
 * macierzy ginęły po cichu, a autor widział tylko, że diagram wygląda inaczej,
 * niż napisał.
 *
 * Numer linii w modelu jest liczony od zera (tak indeksuje się tablicę), a
 * człowiek liczy od jedynki — zamiana należy do warstwy, która pokazuje.
 */
import { describe, it, expect } from 'vitest';
import { formatIssue, issueSummary } from './diagramIssues';

describe('formatIssue', () => {
  it('dokłada numer linii liczony od jedynki', () => {
    expect(formatIssue({ line: 0, message: 'Nieznany węzeł C' })).toBe('linia 1: Nieznany węzeł C');
    expect(formatIssue({ line: 3, message: 'Nieznany węzeł C' })).toBe('linia 4: Nieznany węzeł C');
  });

  it('bez numeru linii zostawia sam komunikat', () => {
    expect(formatIssue({ message: 'Diagram nie ma treści' })).toBe('Diagram nie ma treści');
  });
});

describe('issueSummary', () => {
  it('milczy, gdy nie ma uwag', () => {
    expect(issueSummary([])).toBeUndefined();
  });

  it('jedna uwaga w liczbie pojedynczej', () => {
    expect(issueSummary([{ message: 'a' }])).toBe('1 uwaga');
  });

  it('dwie, trzy, cztery — liczba mnoga bliższa', () => {
    expect(issueSummary([{ message: 'a' }, { message: 'b' }])).toBe('2 uwagi');
    expect(issueSummary([1, 2, 3, 4].map((n) => ({ message: String(n) })))).toBe('4 uwagi');
  });

  it('pięć i więcej — dopełniacz', () => {
    expect(issueSummary([1, 2, 3, 4, 5].map((n) => ({ message: String(n) })))).toBe('5 uwag');
    expect(issueSummary(Array.from({ length: 12 }, (_, n) => ({ message: String(n) })))).toBe('12 uwag');
  });

  it('liczebniki od 22 wzwyż wracają do formy bliższej', () => {
    // Po polsku „22 uwagi", ale „12 uwag" — decyduje ostatnia cyfra przy
    // dziesiątce innej niż 1.
    expect(issueSummary(Array.from({ length: 22 }, (_, n) => ({ message: String(n) })))).toBe('22 uwagi');
    expect(issueSummary(Array.from({ length: 25 }, (_, n) => ({ message: String(n) })))).toBe('25 uwag');
  });
});
