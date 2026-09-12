/**
 * Testy bloku „Callout" (wyróżnienie znane z Notion).
 *
 * Format zapisu to alerty w stylu GitHuba (`> [!NOTE]`), więc plik pozostaje
 * czytelny w surowym markdownie i poprawnie renderuje się poza edytorem.
 * Najważniejsze jest, żeby zwykłe cytaty NIE zamieniały się w callouty i żeby
 * treść wielolinijkowa (listy, kod) przetrwała round-trip.
 */
import { describe, it, expect } from 'vitest';
import {
  CALLOUT_VARIANTS, isCalloutVariant, parseCalloutMarker, calloutToMarkdown, extractCallouts,
} from './callout';

describe('CALLOUT_VARIANTS', () => {
  it('pokrywa zestaw alertów GitHuba', () => {
    expect(Object.keys(CALLOUT_VARIANTS)).toEqual(['note', 'tip', 'important', 'warning', 'caution']);
  });

  it('każdy wariant ma etykietę, kolor i emoji do podglądu', () => {
    for (const [key, v] of Object.entries(CALLOUT_VARIANTS)) {
      expect(v.label.length, key).toBeGreaterThan(2);
      expect(v.color, key).toMatch(/^#[0-9a-f]{6}$/i);
      expect(v.emoji.length, key).toBeGreaterThan(0);
    }
  });
});

describe('isCalloutVariant', () => {
  it('rozpoznaje znane typy bez względu na wielkość liter', () => {
    expect(isCalloutVariant('note')).toBe(true);
    expect(isCalloutVariant('WARNING')).toBe(true);
  });

  it('odrzuca nieznane', () => {
    expect(isCalloutVariant('info')).toBe(false);
    expect(isCalloutVariant('')).toBe(false);
  });
});

describe('parseCalloutMarker', () => {
  it('czyta znacznik z pierwszej linii cytatu', () => {
    expect(parseCalloutMarker('[!NOTE]')).toBe('note');
    expect(parseCalloutMarker('  [!Tip]  ')).toBe('tip');
  });

  it('linia z treścią obok znacznika też się liczy — GitHub na to pozwala', () => {
    expect(parseCalloutMarker('[!WARNING] uwaga')).toBe('warning');
  });

  it('zwykły cytat nie jest calloutem', () => {
    expect(parseCalloutMarker('Cytat z książki')).toBeNull();
    expect(parseCalloutMarker('[!INFO]')).toBeNull();
  });
});

describe('calloutToMarkdown', () => {
  it('składa znacznik i prefiksuje każdą linię treści', () => {
    expect(calloutToMarkdown('tip', 'Pierwsza\nDruga')).toBe('> [!TIP]\n> Pierwsza\n> Druga');
  });

  it('puste linie w środku zostają jako samo `>` — inaczej cytat by się urwał', () => {
    expect(calloutToMarkdown('note', 'A\n\nB')).toBe('> [!NOTE]\n> A\n>\n> B');
  });

  it('pusty callout to sam znacznik', () => {
    expect(calloutToMarkdown('caution', '   ')).toBe('> [!CAUTION]');
  });

  it('zachowuje wcięcia list i bloków kodu', () => {
    const body = '- jeden\n  - zagnieżdżony\n\n```js\nconst x = 1;\n```';
    expect(calloutToMarkdown('important', body)).toBe(
      '> [!IMPORTANT]\n> - jeden\n>   - zagnieżdżony\n>\n> ```js\n> const x = 1;\n> ```',
    );
  });
});

describe('extractCallouts', () => {
  it('wyciąga callout z dokumentu i zwraca jego treść bez prefiksów', () => {
    const md = 'Przed\n\n> [!TIP]\n> Rada pierwsza\n> Rada druga\n\nPo';
    const { result, callouts } = extractCallouts(md);

    expect(callouts).toHaveLength(1);
    expect(callouts[0]).toEqual({ variant: 'tip', body: 'Rada pierwsza\nRada druga' });
    expect(result).toBe('Przed\n\n%%CALLOUT0%%\n\nPo');
  });

  it('zostawia zwykłe cytaty nietknięte', () => {
    const md = '> To jest cytat\n> druga linia';
    expect(extractCallouts(md)).toEqual({ result: md, callouts: [] });
  });

  it('radzi sobie z kilkoma calloutami i treścią obok znacznika', () => {
    const md = '> [!NOTE] Zaraz po znaczniku\n\n> [!CAUTION]\n> Ostrożnie';
    const { callouts } = extractCallouts(md);

    expect(callouts.map((c) => c.variant)).toEqual(['note', 'caution']);
    expect(callouts[0].body).toBe('Zaraz po znaczniku');
    expect(callouts[1].body).toBe('Ostrożnie');
  });

  it('puste linie wewnątrz callouta przeżywają', () => {
    const { callouts } = extractCallouts('> [!NOTE]\n> A\n>\n> B');
    expect(callouts[0].body).toBe('A\n\nB');
  });

  it('round-trip: to, co złożone, daje się odczytać z powrotem', () => {
    const body = '- jeden\n  - zagnieżdżony\n\nakapit';
    const { callouts } = extractCallouts(calloutToMarkdown('warning', body));
    expect(callouts[0]).toEqual({ variant: 'warning', body });
  });
});
