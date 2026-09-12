/**
 * kanbanOps.ts — operacje edycyjne na tablicy kanban.
 *
 * Wszystkie działają na parze indeksów (kolumna, karta), bo tablica jest płaska
 * i nie ma tu zagnieżdżeń głębszych niż jeden poziom. Przenoszenie karty między
 * kolumnami to najczęstsza operacja na kanbanie, więc dostaje własną funkcję —
 * przez „usuń i wstaw" łatwo zgubić metadane.
 */
import type { DiagramDocument } from './diagram';
import { emptyKanban, type KanbanBoard, type KanbanCard, type KanbanColumn } from './kanban';

function withBoard(doc: DiagramDocument, change: (board: KanbanBoard) => KanbanBoard): DiagramDocument {
  return { ...doc, kanban: change(doc.kanban ?? emptyKanban()) };
}

/** Nazwa wolna w obrębie listy — powtórzona myli przy czytaniu tablicy. */
function freeLabel(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base} ${i}`;
  return name;
}

export function addColumn(doc: DiagramDocument, label = 'Nowa kolumna', after?: number): DiagramDocument {
  return withBoard(doc, (board) => {
    const column: KanbanColumn = { label: freeLabel(board.columns.map((c) => c.label), label), cards: [] };
    const columns = [...board.columns];
    columns.splice(after === undefined ? columns.length : after + 1, 0, column);
    return { ...board, columns };
  });
}

export function updateColumn(doc: DiagramDocument, index: number, patch: Partial<KanbanColumn>): DiagramDocument {
  return withBoard(doc, (board) => ({
    ...board,
    columns: board.columns.map((column, i) => (i === index ? { ...column, ...patch } : column)),
  }));
}

export function removeColumn(doc: DiagramDocument, index: number): DiagramDocument {
  return withBoard(doc, (board) => ({ ...board, columns: board.columns.filter((_, i) => i !== index) }));
}

export function moveColumn(doc: DiagramDocument, from: number, to: number): DiagramDocument {
  return withBoard(doc, (board) => {
    if (from < 0 || from >= board.columns.length || to < 0 || to >= board.columns.length || from === to) return board;
    const columns = [...board.columns];
    const [moved] = columns.splice(from, 1);
    columns.splice(to, 0, moved);
    return { ...board, columns };
  });
}

/** Dodaje kartę; z `after` wstawia tuż za wskazaną, inaczej na koniec kolumny. */
export function addCard(
  doc: DiagramDocument,
  columnIndex: number,
  label = 'Nowe zadanie',
  after?: number,
): DiagramDocument {
  return withBoard(doc, (board) => ({
    ...board,
    columns: board.columns.map((column, i) => {
      if (i !== columnIndex) return column;
      const card: KanbanCard = { label: freeLabel(column.cards.map((c) => c.label), label) };
      const cards = [...column.cards];
      cards.splice(after === undefined ? cards.length : after + 1, 0, card);
      return { ...column, cards };
    }),
  }));
}

export function updateCard(
  doc: DiagramDocument,
  columnIndex: number,
  cardIndex: number,
  patch: Partial<KanbanCard>,
): DiagramDocument {
  return withBoard(doc, (board) => ({
    ...board,
    columns: board.columns.map((column, i) => (i !== columnIndex ? column : {
      ...column,
      cards: column.cards.map((card, j) => {
        if (j !== cardIndex) return card;
        const next = { ...card, ...patch };
        // Puste pole znaczy „bez wartości", nie „wartość pusta" — inaczej do
        // zapisu trafiłoby `assigned: ''`.
        for (const key of ['assigned', 'ticket', 'priority'] as const) {
          if (next[key] === '' || next[key] === undefined) delete next[key];
        }
        return next;
      }),
    })),
  }));
}

export function removeCard(doc: DiagramDocument, columnIndex: number, cardIndex: number): DiagramDocument {
  return withBoard(doc, (board) => ({
    ...board,
    columns: board.columns.map((column, i) => (i !== columnIndex
      ? column
      : { ...column, cards: column.cards.filter((_, j) => j !== cardIndex) })),
  }));
}

/** Zmiana kolejności karty w obrębie jej kolumny. */
export function moveCard(
  doc: DiagramDocument,
  columnIndex: number,
  from: number,
  to: number,
): DiagramDocument {
  return withBoard(doc, (board) => ({
    ...board,
    columns: board.columns.map((column, i) => {
      if (i !== columnIndex) return column;
      if (from < 0 || from >= column.cards.length || to < 0 || to >= column.cards.length || from === to) return column;
      const cards = [...column.cards];
      const [moved] = cards.splice(from, 1);
      cards.splice(to, 0, moved);
      return { ...column, cards };
    }),
  }));
}

/**
 * Przenosi kartę do innej kolumny — sedno pracy z kanbanem.
 *
 * Karta zachowuje wszystko: identyfikator, przypisanie, zgłoszenie, priorytet i
 * metadane spoza modelu. Odtwarzanie jej „z nazwy" gubiłoby te dane po cichu.
 */
export function moveCardToColumn(
  doc: DiagramDocument,
  fromColumn: number,
  cardIndex: number,
  toColumn: number,
  toIndex?: number,
): DiagramDocument {
  return withBoard(doc, (board) => {
    const source = board.columns[fromColumn];
    const card = source?.cards[cardIndex];
    if (!card || !board.columns[toColumn] || fromColumn === toColumn) return board;

    return {
      ...board,
      columns: board.columns.map((column, i) => {
        if (i === fromColumn) return { ...column, cards: column.cards.filter((_, j) => j !== cardIndex) };
        if (i === toColumn) {
          const cards = [...column.cards];
          cards.splice(toIndex === undefined ? cards.length : toIndex, 0, card);
          return { ...column, cards };
        }
        return column;
      }),
    };
  });
}
