/**
 * kanbanDiagram.ts — Mermaid `kanban` ⇄ model tablicy.
 *
 * Format opiera się na **wcięciu**: pierwszy poziom to kolumna, drugi to karta.
 * Nie ma tu żadnych strzałek ani zakresów — cała struktura wynika z tego, ile
 * spacji stoi przed wierszem, więc parser musi je liczyć zamiast dopasowywać
 * wzorce do treści.
 *
 * Metadane karty (`@{ ticket: MC-1, priority: 'High' }`) rozbieramy na znane
 * klucze, a resztę przenosimy bez zmian — tak jak wszędzie indziej, czego nie
 * rozumiemy, tego nie kasujemy.
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import {
  emptyKanban, isPriority,
  type KanbanBoard, type KanbanCard, type KanbanColumn,
} from '../../model/kanban';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*kanban\s*$/i;
/**
 * `id[Etykieta]` z opcjonalnym `@{ … }`.
 *
 * Identyfikator rozpoznajemy WYŁĄCZNIE przed nawiasem. Wzorzec dopuszczający
 * „id, a potem reszta" zjadał pierwsze słowo etykiety pisanej bez nawiasów:
 * „W trakcie" stawało się kolumną „trakcie" o identyfikatorze „W".
 */
const BRACKETED = /^(?<id>[A-Za-z0-9_-]+)?\[(?<label>[\s\S]*?)\]\s*(?:@\{(?<meta>[\s\S]*)\})?\s*$/;
/** Sama etykieta, bez nawiasów — wtedy CAŁA linia jest nazwą. */
const BARE = /^(?<label>[^[\]@]+?)\s*(?:@\{(?<meta>[\s\S]*)\})?\s*$/;

/** Rozbiera `ticket: MC-1, assigned: 'knsv', priority: 'High'`. */
export function parseCardMeta(text: string): Pick<KanbanCard, 'assigned' | 'ticket' | 'priority' | 'extra'> {
  const result: Pick<KanbanCard, 'assigned' | 'ticket' | 'priority' | 'extra'> = {};
  const extra: Record<string, string> = {};

  for (const part of text.split(',')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    // Wartości bywają w apostrofach, cudzysłowach albo bez niczego.
    const value = part.slice(at + 1).trim().replace(/^['"]([\s\S]*)['"]$/, '$1');
    if (!key) continue;

    if (key === 'assigned') result.assigned = value;
    else if (key === 'ticket') result.ticket = value;
    else if (key === 'priority' && isPriority(value)) result.priority = value;
    else extra[key] = value;
  }

  if (Object.keys(extra).length) result.extra = extra;
  return result;
}

/** Ile spacji stoi przed treścią — od tego zależy poziom w strukturze. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

export function parseKanbanDiagram(text: string): ParseResult {
  const doc = emptyDiagram('kanban');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  const board: KanbanBoard = emptyKanban();
  let seenHeader = false;
  /**
   * Wcięcie pierwszej napotkanej kolumny wyznacza poziom bazowy.
   *
   * Mermaid nie narzuca liczby spacji — jedni piszą dwie, inni cztery — więc
   * o poziomie decyduje porównanie z pierwszym wierszem, a nie stała.
   */
  let columnIndent: number | undefined;

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; return; }
    if (trimmed.startsWith('%%')) { board.unknown.push({ index, text: line }); return; }

    const match = BRACKETED.exec(trimmed) ?? BARE.exec(trimmed);
    if (!match?.groups) { board.unknown.push({ index, text: line }); return; }

    const g = match.groups;
    const label = (g.label ?? '').trim();
    if (!label) { board.unknown.push({ index, text: line }); return; }

    const indent = indentOf(line);
    if (columnIndent === undefined) columnIndent = indent;

    if (indent <= columnIndent || !board.columns.length) {
      const column: KanbanColumn = { ...(g.id ? { id: g.id } : {}), label, cards: [] };
      board.columns.push(column);
      return;
    }

    const card: KanbanCard = {
      ...(g.id ? { id: g.id } : {}),
      label,
      ...(g.meta ? parseCardMeta(g.meta) : {}),
    };
    board.columns[board.columns.length - 1].cards.push(card);
  });

  doc.kanban = board;
  return { document: doc, issues };
}

/** Metadane karty w zapisie Mermaida; pusta lista znika. */
function metaText(card: KanbanCard): string {
  const parts: string[] = [];
  if (card.ticket) parts.push(`ticket: ${card.ticket}`);
  if (card.assigned) parts.push(`assigned: '${card.assigned}'`);
  if (card.priority) parts.push(`priority: '${card.priority}'`);
  for (const [key, value] of Object.entries(card.extra ?? {})) parts.push(`${key}: ${value}`);
  return parts.length ? `@{ ${parts.join(', ')} }` : '';
}

/** Element w zapisie: `id[Etykieta]` albo sama etykieta w nawiasach. */
function itemText(item: { id?: string; label: string }): string {
  return item.id ? `${item.id}[${item.label}]` : `[${item.label}]`;
}

export function serializeKanbanDiagram(doc: DiagramDocument): string {
  const board = doc.kanban ?? emptyKanban();
  const out: string[] = ['kanban'];

  for (const column of board.columns) {
    out.push(`  ${itemText(column)}`);
    for (const card of column.cards) {
      out.push(`    ${itemText(card)}${metaText(card)}`);
    }
  }

  // Nierozpoznane linie (komentarze) wracają na koniec — w kanbanie ich pozycja
  // nie zmienia struktury, bo ta wynika wyłącznie z wcięć elementów.
  for (const line of [...board.unknown].sort((a, b) => a.index - b.index)) out.push(line.text.trim());

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
