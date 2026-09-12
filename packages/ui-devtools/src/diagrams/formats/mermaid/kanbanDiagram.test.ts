/**
 * Mermaid `kanban` ⇄ model.
 *
 * Cała struktura wynika z **wcięcia**: pierwszy poziom to kolumna, drugi karta.
 * Nie ma strzałek ani zakresów, więc parser liczy spacje zamiast dopasowywać
 * wzorce do treści — i to jest tu główne źródło pomyłek.
 */
import { describe, it, expect } from 'vitest';
import { parseKanbanDiagram, serializeKanbanDiagram, parseCardMeta } from './kanbanDiagram';

const parse = (text: string) => parseKanbanDiagram(text).document;
const board = (text: string) => parse(text).kanban!;
const roundTrip = (text: string) => serializeKanbanDiagram(parse(text));

const TABLICA = [
  'kanban',
  '  Todo',
  '    [Napisz dokumentacje]',
  '    docs[Wpis na blogu]',
  '  id6[W trakcie]',
  '    id7[Renderer]@{ assigned: \'knsv\', priority: \'High\' }',
  '  id11[Gotowe]',
  '    id5[definicja getData]',
  '    id3[Aktualizacja bazy]@{ ticket: MC-2037, assigned: knsv, priority: \'High\' }',
].join('\n');

describe('struktura z wcięć', () => {
  const b = board(TABLICA);

  it('nagłówek daje dokument rodzaju `kanban`', () => {
    expect(parse(TABLICA).kind).toBe('kanban');
  });

  it('czyta wszystkie kolumny', () => {
    expect(b.columns.map((c) => c.label)).toEqual(['Todo', 'W trakcie', 'Gotowe']);
  });

  it('karty trafiają do właściwych kolumn', () => {
    expect(b.columns[0].cards.map((c) => c.label)).toEqual(['Napisz dokumentacje', 'Wpis na blogu']);
    expect(b.columns[1].cards).toHaveLength(1);
    expect(b.columns[2].cards).toHaveLength(2);
  });

  it('kolumna bez nawiasów też jest kolumną', () => {
    expect(b.columns[0].label).toBe('Todo');
  });

  it('identyfikatory są zachowane', () => {
    expect(b.columns[1].id).toBe('id6');
    expect(b.columns[0].cards[1].id).toBe('docs');
  });

  it('karta bez identyfikatora go nie dostaje', () => {
    expect(b.columns[0].cards[0].id).toBeUndefined();
  });

  it('cztery spacje wcięcia działają tak samo jak dwie', () => {
    const szerokie = board('kanban\n    Todo\n        [Zadanie]\n    Gotowe');
    expect(szerokie.columns.map((c) => c.label)).toEqual(['Todo', 'Gotowe']);
    expect(szerokie.columns[0].cards).toHaveLength(1);
  });
});

describe('metadane karty', () => {
  it('czyta przypisanie i priorytet', () => {
    expect(parseCardMeta("assigned: 'knsv', priority: 'High'"))
      .toMatchObject({ assigned: 'knsv', priority: 'High' });
  });

  it('czyta numer zgłoszenia', () => {
    expect(parseCardMeta('ticket: MC-2037').ticket).toBe('MC-2037');
  });

  it('przyjmuje wartość bez cudzysłowów', () => {
    expect(parseCardMeta('assigned: knsv').assigned).toBe('knsv');
  });

  it('nieznany priorytet nie trafia do modelu', () => {
    expect(parseCardMeta("priority: 'Sredni'").priority).toBeUndefined();
  });

  it('nieznane klucze są przenoszone bez interpretacji', () => {
    expect(parseCardMeta('sprint: 42').extra).toEqual({ sprint: '42' });
  });

  it('metadane wracają przy zapisie', () => {
    const out = roundTrip(TABLICA);
    expect(out).toContain("ticket: MC-2037");
    expect(out).toContain("assigned: 'knsv'");
    expect(out).toContain("priority: 'High'");
  });
});

describe('zachowanie treści', () => {
  it('drugi zapis jest identyczny z pierwszym', () => {
    const once = roundTrip(TABLICA);
    expect(serializeKanbanDiagram(parseKanbanDiagram(once).document)).toBe(once);
  });

  it('nie gubi żadnej karty', () => {
    expect(board(roundTrip(TABLICA)).columns.reduce((n, c) => n + c.cards.length, 0)).toBe(5);
  });

  it('zachowuje komentarz', () => {
    expect(roundTrip('kanban\n  %% komentarz\n  Todo\n    [Zadanie]')).toContain('%% komentarz');
  });

  it('kolumna bez kart przeżywa zapis', () => {
    expect(board(roundTrip('kanban\n  Todo\n  Gotowe')).columns).toHaveLength(2);
  });

  it('nieznane metadane wracają nietknięte', () => {
    expect(roundTrip('kanban\n  Todo\n    [Z]@{ sprint: 42 }')).toContain('sprint: 42');
  });
});

/**
 * Etykiety bez nawiasów.
 *
 * Wzorzec „identyfikator, a potem reszta" zjadał pierwsze słowo: „W trakcie"
 * stawało się kolumną „trakcie" o identyfikatorze „W". Bez nawiasów CAŁA linia
 * jest nazwą.
 */
describe('etykieta bez nawiasów', () => {
  it('wieloczłonowa nazwa kolumny zostaje w całości', () => {
    expect(board('kanban\n  W trakcie\n    [Zadanie]').columns[0].label).toBe('W trakcie');
  });

  it('taka kolumna nie dostaje identyfikatora', () => {
    expect(board('kanban\n  W trakcie').columns[0].id).toBeUndefined();
  });

  it('jednoczłonowa nazwa też zostaje etykietą, nie identyfikatorem', () => {
    const kolumna = board('kanban\n  Todo').columns[0];
    expect(kolumna.label).toBe('Todo');
    expect(kolumna.id).toBeUndefined();
  });

  it('nazwa z nawiasem nadal daje identyfikator', () => {
    expect(board('kanban\n  id6[W trakcie]').columns[0]).toMatchObject({ id: 'id6', label: 'W trakcie' });
  });

  it('karta bez nawiasów z metadanymi', () => {
    const card = board("kanban\n  Todo\n    Zrobic cos@{ priority: 'High' }").columns[0].cards[0];
    expect(card).toMatchObject({ label: 'Zrobic cos', priority: 'High' });
  });
});
