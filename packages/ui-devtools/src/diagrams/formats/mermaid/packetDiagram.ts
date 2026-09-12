/**
 * packetDiagram.ts — Mermaid `packet` ⇄ model mapy bitów.
 *
 * Format jest prosty: nagłówek, opcjonalny tytuł i lista pól `od-do: "opis"`.
 * Cała subtelność siedzi w tym, że pole jednobitowe zapisuje się jednym
 * numerem (`8: "Flaga"`), a nie zakresem — model normalizuje to do `start` i
 * `end`, żeby reszta kodu nie musiała rozróżniać dwóch przypadków.
 *
 * Mermaid nazywa ten diagram `packet-beta` (starsze wersje) albo `packet`.
 * Przyjmujemy oba, a przy zapisie oddajemy nagłówek, który przyszedł — inaczej
 * diagram przestałby się renderować u kogoś ze starszą biblioteką.
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import { emptyPacket, type PacketField, type PacketSpec } from '../../model/packet';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*packet(-beta)?\s*$/i;
const TITLE = /^\s*title\s+(.+?)\s*$/i;
/** `0-15: "Port źródłowy"` albo `8: "Flaga"`; cudzysłowy są opcjonalne. */
const FIELD = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*:\s*(.*?)\s*$/;

/** Który nagłówek zapisać — ten, który przyszedł w źródle. */
const HEADER_KEY = 'packetHeader';

export function parsePacketDiagram(text: string): ParseResult {
  const doc = emptyDiagram('packet');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  const spec: PacketSpec = emptyPacket();
  let seenHeader = false;

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader) {
      const header = HEADER.exec(line);
      if (header) {
        seenHeader = true;
        doc.meta = { ...doc.meta, [HEADER_KEY]: header[1] ? 'packet-beta' : 'packet' };
        return;
      }
    }

    const title = TITLE.exec(trimmed);
    if (title) { spec.title = title[1]; return; }

    const field = trimmed.startsWith('%%') ? null : FIELD.exec(trimmed);
    if (field) {
      const start = Number(field[1]);
      // Brak drugiej liczby znaczy pole jednobitowe.
      const end = field[2] !== undefined ? Number(field[2]) : start;
      const label = field[3].replace(/^"([\s\S]*)"$/, '$1');
      spec.fields.push({ start, end, label });
      return;
    }

    spec.unknown.push({ index, text: line });
  });

  doc.packet = spec;
  return { document: doc, issues };
}

/** Pole w zapisie Mermaida — jednobitowe bez zakresu, tak jak w źródle. */
function fieldLine(field: PacketField): string {
  const range = field.start === field.end ? `${field.start}` : `${field.start}-${field.end}`;
  return `${range}: "${field.label}"`;
}

export function serializePacketDiagram(doc: DiagramDocument): string {
  const spec = doc.packet ?? emptyPacket();
  // Nagłówek oddajemy taki, jaki przyszedł: `packet` nie działa w starszych
  // wersjach Mermaida, a `packet-beta` w najnowszych bywa oznaczany jako
  // przestarzały — wybór należy do autora diagramu, nie do nas.
  const out: string[] = [doc.meta?.[HEADER_KEY] ?? 'packet-beta'];
  if (spec.title) out.push(`title ${spec.title}`);

  // Nierozpoznane linie wracają na swoje miejsce względem pól.
  const unknownBefore = new Map<number, string[]>();
  for (const line of [...spec.unknown].sort((a, b) => a.index - b.index)) {
    const bucket = unknownBefore.get(line.index);
    if (bucket) bucket.push(line.text.trim());
    else unknownBefore.set(line.index, [line.text.trim()]);
  }

  // Kolejność pól w zapisie odpowiada kolejności w modelu; nierozpoznane linie
  // wstawiamy tam, gdzie stały względem sąsiadów.
  const wszystkie = [
    ...spec.fields.map((field, order) => ({ order, text: fieldLine(field) })),
    ...[...unknownBefore.entries()].flatMap(([index, texts]) =>
      texts.map((text) => ({ order: index - 1000, text }))),
  ].sort((a, b) => a.order - b.order);

  for (const item of wszystkie) out.push(item.text);
  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
