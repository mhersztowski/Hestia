import { describe, it, expect } from 'vitest';
import { parseCalloutBlock } from './callout';

const blok = (tresc: string) => parseCalloutBlock('rh1-nota-probna', tresc);

describe('notka kontekstowa', () => {
  it('czyta tytuł, rodzaj, treść i miejsce w książce', () => {
    const n = blok([
      '@kind device',
      'Komora pęcherzykowa',
      '@body Zbudował ją Donald Glaser w 1952 roku.',
      '@source 3-1, s. 43',
    ].join('\n'));

    expect(n.id).toBe('rh1-nota-probna');
    expect(n.kind).toBe('device');
    expect(n.title).toBe('Komora pęcherzykowa');
    expect(n.body).toBe('Zbudował ją Donald Glaser w 1952 roku.');
    expect(n.source).toBe('3-1, s. 43');
    expect(n.issues).toEqual([]);
  });

  // Notka bywa dłuższa niż wiersz pliku, a dokumenty bazy są zawijane na 80
  // kolumn — bez sklejania kontynuacji zostałoby z niej pierwsze zdanie.
  // Ta sama pułapka zjadła kiedyś połowę uwag redakcyjnych w liście punktowanej.
  it('wiersz wcięty kontynuuje treść', () => {
    const n = blok([
      '@kind person',
      'Newton',
      '@body Pierwsze zdanie notki,',
      '  które ciągnie się dalej',
      '  i jeszcze dalej.',
    ].join('\n'));

    expect(n.body).toBe('Pierwsze zdanie notki, które ciągnie się dalej i jeszcze dalej.');
  });

  /**
   * Rodzaj jest deklarowany, a nie zgadywany z treści. Gdyby parser zgadywał,
   * literówka w `@kind` cicho zamieniłaby notkę o prawie w notkę o osobie —
   * ta sama zasada, dla której `formula` wymaga jawnego `@relation`.
   */
  it('nieznany rodzaj jest błędem, a nie domysłem', () => {
    const n = blok(['@kind wynalazca', 'X', '@body Y.'].join('\n'));
    expect(n.kind).toBeUndefined();
    expect(n.issues.map((i) => i.message).join(' ')).toMatch(/kind/);
  });

  it('brak rodzaju, tytułu albo treści jest zgłaszany', () => {
    expect(blok('Sam tytuł').issues.length).toBeGreaterThan(0);
    expect(blok('@kind law\n@body Bez tytułu.').issues.map((i) => i.message).join(' '))
      .toMatch(/tytuł/i);
    expect(blok('@kind law\nTytuł bez treści').issues.map((i) => i.message).join(' '))
      .toMatch(/@body/);
  });

  it('nierozpoznana dyrektywa nie ginie po cichu', () => {
    const n = blok(['@kind law', 'Prawo Hooke\'a', '@body Treść.', '@zrodlo Wikipedia'].join('\n'));
    expect(n.unknown).toContain('@zrodlo Wikipedia');
  });

  it('przyjmuje wszystkie trzy rodzaje z planu', () => {
    for (const kind of ['law', 'person', 'device'] as const) {
      const n = blok(`@kind ${kind}\nTytuł\n@body Treść.`);
      expect(n.kind, kind).toBe(kind);
      expect(n.issues, kind).toEqual([]);
    }
  });
});
