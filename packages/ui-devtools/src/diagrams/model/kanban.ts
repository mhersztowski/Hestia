/**
 * kanban.ts — model tablicy kanban.
 *
 * Struktura jest płytka: kolumny, w nich karty. Znaczenie niesie **przynależność
 * karty do kolumny** i jej kolejność, a nie żadna geometria — dlatego model nie
 * ma tu współrzędnych, a widok układa wszystko z samej struktury.
 *
 * Karta bywa opisana metadanymi (`@{ ticket: MC-1, priority: 'High' }`).
 * Rozpoznajemy trzy znane klucze, a resztę przenosimy bez interpretacji, żeby
 * nie zgubić tego, czego jeszcze nie umiemy pokazać.
 */

/** Priorytety, które Mermaid rozumie i rysuje kolorem. */
export const KANBAN_PRIORITIES = ['Very High', 'High', 'Low', 'Very Low'] as const;
export type KanbanPriority = typeof KANBAN_PRIORITIES[number];

export interface KanbanCard {
  /** Identyfikator z zapisu (`id4[…]`); bez niego karta nie ma nazwy w kodzie. */
  id?: string;
  label: string;
  assigned?: string;
  ticket?: string;
  priority?: KanbanPriority;
  /** Metadane spoza modelu — wracają nietknięte przy zapisie. */
  extra?: Record<string, string>;
}

export interface KanbanColumn {
  id?: string;
  label: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  /** Nierozpoznane linie z numerem, żeby wróciły na swoje miejsce. */
  unknown: Array<{ index: number; text: string }>;
}

export function emptyKanban(): KanbanBoard {
  return { columns: [], unknown: [] };
}

/** Czy tekst jest jednym ze znanych priorytetów. */
export function isPriority(value: string): value is KanbanPriority {
  return (KANBAN_PRIORITIES as readonly string[]).includes(value);
}

/** Liczba kart na tablicy — do podsumowania w interfejsie. */
export function cardCount(board: KanbanBoard): number {
  return board.columns.reduce((sum, column) => sum + column.cards.length, 0);
}

/** Gdzie leży karta o danym identyfikatorze; `undefined`, gdy jej nie ma. */
export function findCard(board: KanbanBoard, columnIndex: number, cardIndex: number): KanbanCard | undefined {
  return board.columns[columnIndex]?.cards[cardIndex];
}
