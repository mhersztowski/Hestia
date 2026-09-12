/**
 * Edycja tablicy kanban.
 *
 * Najważniejsza operacja to przeniesienie karty między kolumnami — na tym
 * polega praca z kanbanem. Test pilnuje przede wszystkim tego, żeby karta nie
 * gubiła po drodze metadanych.
 */
import { describe, it, expect } from 'vitest';
import { parseKanbanDiagram, serializeKanbanDiagram } from '../formats/mermaid/kanbanDiagram';
import {
  addColumn, updateColumn, removeColumn, moveColumn,
  addCard, updateCard, removeCard, moveCard, moveCardToColumn,
} from './kanbanOps';
import { cardCount } from './kanban';
import type { DiagramDocument } from './diagram';

const doc = () => parseKanbanDiagram([
  'kanban',
  '  Todo',
  '    [Pierwsze]',
  "    id2[Drugie]@{ ticket: MC-1, assigned: 'ala', priority: 'High' }",
  '  W trakcie',
  '    [Trzecie]',
  '  Gotowe',
].join('\n')).document;
const kolumny = (d: DiagramDocument) => d.kanban!.columns;
const zapis = (d: DiagramDocument) => serializeKanbanDiagram(d);

describe('kolumny', () => {
  it('dodaje na koniec', () => {
    expect(kolumny(addColumn(doc())).map((c) => c.label)).toEqual(['Todo', 'W trakcie', 'Gotowe', 'Nowa kolumna']);
  });

  it('dodaje za wskazaną', () => {
    expect(kolumny(addColumn(doc(), 'Przeglad', 0))[1].label).toBe('Przeglad');
  });

  it('zmiana nazwy wychodzi do Mermaida', () => {
    expect(zapis(updateColumn(doc(), 0, { label: 'Backlog' }))).toContain('[Backlog]');
  });

  it('usunięcie zabiera też karty', () => {
    const after = removeColumn(doc(), 0);
    expect(kolumny(after)).toHaveLength(2);
    expect(cardCount(after.kanban!)).toBe(1);
  });

  it('przesunięcie zmienia kolejność', () => {
    expect(kolumny(moveColumn(doc(), 2, 0))[0].label).toBe('Gotowe');
  });
});

describe('karty', () => {
  it('dodaje na koniec kolumny', () => {
    expect(kolumny(addCard(doc(), 0))[0].cards).toHaveLength(3);
  });

  it('dodaje za wskazaną kartą', () => {
    const after = addCard(doc(), 0, 'Wstawione', 0);
    expect(kolumny(after)[0].cards.map((c) => c.label)).toEqual(['Pierwsze', 'Wstawione', 'Drugie']);
  });

  it('nie powiela nazw', () => {
    const after = addCard(addCard(doc(), 0), 0);
    const nazwy = kolumny(after)[0].cards.map((c) => c.label);
    expect(new Set(nazwy).size).toBe(nazwy.length);
  });

  it('zmiana priorytetu wychodzi do Mermaida', () => {
    expect(zapis(updateCard(doc(), 0, 0, { priority: 'Very High' }))).toContain("priority: 'Very High'");
  });

  it('puste pole usuwa metadaną zamiast zapisywać pustkę', () => {
    const after = updateCard(doc(), 0, 1, { assigned: '' });
    expect(kolumny(after)[0].cards[1].assigned).toBeUndefined();
    expect(zapis(after)).not.toContain("assigned: ''");
  });

  it('usuwa wskazaną kartę', () => {
    expect(kolumny(removeCard(doc(), 0, 0))[0].cards.map((c) => c.label)).toEqual(['Drugie']);
  });

  it('zmienia kolejność w kolumnie', () => {
    expect(kolumny(moveCard(doc(), 0, 1, 0))[0].cards[0].label).toBe('Drugie');
  });
});

describe('przeniesienie karty między kolumnami', () => {
  it('karta znika ze źródła i pojawia się w celu', () => {
    const after = moveCardToColumn(doc(), 0, 0, 2);
    expect(kolumny(after)[0].cards.map((c) => c.label)).toEqual(['Drugie']);
    expect(kolumny(after)[2].cards.map((c) => c.label)).toEqual(['Pierwsze']);
  });

  it('zachowuje wszystkie metadane', () => {
    const after = moveCardToColumn(doc(), 0, 1, 2);
    expect(kolumny(after)[2].cards[0]).toMatchObject({
      id: 'id2', ticket: 'MC-1', assigned: 'ala', priority: 'High',
    });
  });

  it('metadane przeżywają zapis', () => {
    const out = zapis(moveCardToColumn(doc(), 0, 1, 2));
    expect(out).toContain("id2[Drugie]@{ ticket: MC-1, assigned: 'ala', priority: 'High' }");
  });

  it('wstawia na wskazaną pozycję', () => {
    const after = moveCardToColumn(doc(), 0, 0, 1, 0);
    expect(kolumny(after)[1].cards.map((c) => c.label)).toEqual(['Pierwsze', 'Trzecie']);
  });

  it('liczba kart na tablicy się nie zmienia', () => {
    expect(cardCount(moveCardToColumn(doc(), 0, 0, 2).kanban!)).toBe(3);
  });

  it('przeniesienie do tej samej kolumny nic nie robi', () => {
    expect(kolumny(moveCardToColumn(doc(), 0, 0, 0))[0].cards).toHaveLength(2);
  });
});
