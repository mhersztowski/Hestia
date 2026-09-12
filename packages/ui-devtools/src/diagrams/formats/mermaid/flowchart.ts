/**
 * flowchart.ts — Mermaid `flowchart`/`graph` ⇄ model diagramu.
 *
 * Parser jest liniowy i celowo wybaczający: rozpoznaje deklaracje węzłów,
 * krawędzie i podgrafy, a **wszystko inne** (style, `click`, `linkStyle`,
 * komentarze) zapisuje w `unknown` razem z numerem linii i oddaje przy zapisie.
 * Dzięki temu graficzna edycja diagramu nie kasuje tego, czego edytor nie umie
 * narysować.
 *
 * Świadomie nie sięgamy po parser Mermaida: jest częścią biblioteki
 * renderującej, zwraca strukturę pod render (a nie pod edycję) i nie zachowuje
 * nieznanych fragmentów.
 */
import {
  emptyDiagram, edgeId,
  type DiagramDocument, type DiagramDirection, type DiagramEdge, type DiagramNode,
  type EdgeArrowType, type EdgeLineStyle, type NodeShape, type UnknownLine,
} from '../../model/diagram';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';
import { FLOWCHART_SHAPES, decodeLabel, encodeLabel, syntaxForShape } from './shapes';
import { scanEdgeLine, type EdgeEndToken, type EdgeOperator } from './edgeScanner';

const DIRECTIONS: DiagramDirection[] = ['TB', 'BT', 'LR', 'RL'];

/** `flowchart LR` / `graph TD` — nagłówek diagramu. */
const HEADER = /^\s*(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*$/i;
/** `subgraph id [Etykieta]` albo `subgraph Etykieta`. */
const SUBGRAPH = /^\s*subgraph\s+(.+?)\s*$/i;
const END = /^\s*end\s*$/i;
/** Słowa, które same w linii nie są nazwą węzła. */
const KEYWORDS = new Set(['end', 'subgraph', 'direction', 'classdef', 'class', 'click', 'style', 'linkstyle']);

interface NodeDecl { id: string; label: string; shape: NodeShape }

/**
 * Rozbija stronę krawędzi na węzły rozdzielone `&`.
 *
 * Mermaid pozwala łączyć wiele węzłów naraz (`A & B --> C & D`) i rozwija to w
 * iloczyn. Rozdzielamy tylko ampersandy **poza nawiasami kształtu i poza
 * cudzysłowami** — inaczej etykieta „Kawa & herbata" rozpadłaby się na dwa
 * nieistniejące węzły.
 */
export function splitEdgeSide(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === '&' && depth === 0) {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Czyta `A[Etykieta]` / `A` — zwraca deklarację albo `null`, gdy to nie węzeł. */
export function parseNodeRef(raw: string): NodeDecl | null {
  const text = raw.trim();
  if (!text) return null;

  for (const { open, close, shape } of FLOWCHART_SHAPES) {
    const openAt = text.indexOf(open);
    if (openAt <= 0 || !text.endsWith(close)) continue;
    const id = text.slice(0, openAt).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(id)) continue;
    const label = text.slice(openAt + open.length, text.length - close.length);
    return { id, label: decodeLabel(label), shape };
  }

  return /^[A-Za-z0-9_.-]+$/.test(text) ? { id: text, label: '', shape: 'rectangle' } : null;
}

/** Zakończenie ze skanera na typ modelu (model nie zna „braku" jako strzałki). */
function arrowOf(end: EdgeEndToken): EdgeArrowType {
  return end === 'arrow' ? 'arrow' : end === 'circle' ? 'circle' : end === 'cross' ? 'cross' : 'none';
}

/**
 * Operator ze skanera na pola krawędzi.
 *
 * Model nie ma stylu „niewidzialny" (`~~~`) ani zakończenia u źródła — jedno i
 * drugie ląduje w `meta`, żeby zapis oddał dokładnie to, co było w źródle.
 */
function edgeFromOperator(op: EdgeOperator): Pick<DiagramEdge, 'lineStyle' | 'arrow' | 'label' | 'length' | 'meta'> {
  const meta: Record<string, string> = {};
  if (op.lineStyle === 'invisible') meta.invisible = 'true';
  if (op.start !== 'none') meta.startArrow = arrowOf(op.start);

  const lineStyle: EdgeLineStyle = op.lineStyle === 'dotted' ? 'dotted'
    : op.lineStyle === 'thick' ? 'thick'
      : 'solid';

  return {
    lineStyle,
    arrow: arrowOf(op.end),
    length: op.length,
    ...(op.label ? { label: op.label } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

export function parseFlowchart(text: string): ParseResult {
  const doc = emptyDiagram('flowchart');
  const issues: ParseIssue[] = [];
  // Front matter trzymamy osobno — przy zapisie musi wrócić na sam początek.
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };
  const lines = front.body.split('\n');
  /** Stos otwartych podgrafów — Mermaid pozwala je zagnieżdżać. */
  const groupStack: string[] = [];
  let seenHeader = false;

  const ensureNode = (decl: NodeDecl): DiagramNode => {
    // Odwołanie do istniejącego podgrafu nie tworzy węzła — krawędź celuje w grupę.
    const group = doc.groups.find((g) => g.id === decl.id);
    if (group) return { id: decl.id, label: group.label, shape: 'rectangle' };

    const existing = doc.nodes.find((n) => n.id === decl.id);
    const parentId = groupStack[groupStack.length - 1];
    if (existing) {
      // Późniejsza deklaracja z etykietą uzupełnia węzeł wprowadzony krawędzią.
      if (decl.label && !existing.label) existing.label = decl.label;
      if (decl.shape !== 'rectangle') existing.shape = decl.shape;
      return existing;
    }
    const node: DiagramNode = { id: decl.id, label: decl.label, shape: decl.shape, ...(parentId ? { parentId } : {}) };
    doc.nodes.push(node);
    return node;
  };

  /**
   * Nierozpoznane linie czekające na element, przed którym mają wrócić.
   *
   * Komentarz sekcji opisuje to, co po nim NASTĘPUJE, więc kotwiczymy go do
   * pierwszego elementu, który po nim powstanie.
   */
  let pending: UnknownLine[] = [];
  const anchorPending = (key: string) => {
    for (const line of pending) line.anchor = key;
    doc.unknown.push(...pending);
    pending = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader) {
      const header = HEADER.exec(line);
      if (header) {
        seenHeader = true;
        const dir = header[1]?.toUpperCase();
        // `TD` to synonim `TB` — model zna tylko jedną nazwę.
        doc.direction = dir === 'TD' ? 'TB' : (DIRECTIONS.find((d) => d === dir) ?? 'TB');
        return;
      }
    }

    if (END.test(trimmed) && groupStack.length > 0) {
      groupStack.pop();
      return;
    }

    const sub = SUBGRAPH.exec(trimmed);
    if (sub) {
      const rest = sub[1];
      const withLabel = /^(\S+)\s*\[(.*)\]$/.exec(rest);
      const id = withLabel ? withLabel[1] : rest.replace(/\s+/g, '_');
      const label = withLabel ? decodeLabel(withLabel[2]) : rest;
      // Podgraf i węzeł o tym samym id to jeden byt (do podgrafu można
      // prowadzić krawędzie). Duplikat rozsypałby widok, więc węzeł ustępuje.
      const existing = doc.nodes.findIndex((n) => n.id === id);
      if (existing >= 0) doc.nodes.splice(existing, 1);
      doc.groups.push({ id, label, ...(groupStack.length ? { parentId: groupStack[groupStack.length - 1] } : {}) });
      groupStack.push(id);
      anchorPending(`group:${id}`);
      return;
    }

    // Komentarz nigdy nie jest krawędzią, a `%% ==== opis ====` wyglądałby dla
    // skanera jak gruba linia.
    if (!trimmed.startsWith('%%')) {
      const chain = scanEdgeLine(trimmed);
      if (chain) {
        // `A & B --> C & D` znaczy „każdy z lewej do każdego z prawej", a
        // `A --> B --> C` to kolejne odcinki tego samego łańcucha.
        const stages = chain.sides.map((side) => splitEdgeSide(side).map(parseNodeRef));
        if (stages.some((stage) => !stage.length || stage.some((n) => !n))) {
          pending.push({ index, text: line });
          issues.push({ line: index, message: `Nie rozpoznano końców krawędzi: ${trimmed}` });
          return;
        }

        for (const stage of stages) for (const decl of stage) ensureNode(decl!);
        let first = '';
        for (let i = 0; i < chain.operators.length; i++) {
          const props = edgeFromOperator(chain.operators[i]);
          for (const from of stages[i]) {
            for (const to of stages[i + 1]) {
              const id = edgeId(doc, from!.id, to!.id);
              doc.edges.push({ id, source: from!.id, target: to!.id, ...props });
              first ||= id;
            }
          }
        }
        if (first) anchorPending(`edge:${first}`);
        return;
      }
    }

    const decl = parseNodeRef(trimmed);
    // Sama nazwa w linii też jest deklaracją węzła (`E`), byle nie była słowem
    // kluczowym — inaczej węzeł bez etykiety wewnątrz podgrafu ginąłby przy
    // każdym zapisie, bo serializer wypisuje go właśnie jako samą nazwę.
    if (decl && !KEYWORDS.has(trimmed.toLowerCase())) {
      anchorPending(`node:${ensureNode(decl).id}`);
      return;
    }

    // Wszystko inne zostaje nietknięte i wróci przy zapisie.
    pending.push({ index, text: line });
  });

  // Ogon pliku nie ma już elementu, przed którym mógłby stanąć.
  doc.unknown.push(...pending);

  return { document: doc, issues };
}

function nodeLine(node: DiagramNode): string {
  const syntax = syntaxForShape(node.shape);
  if (!node.label) return node.id;
  return `${node.id}${syntax.open}${encodeLabel(node.label)}${syntax.close}`;
}

/** Zakończenie modelu na znak Mermaida; `<` tylko dla strony źródłowej. */
function tipFor(arrow: EdgeArrowType | undefined, side: 'start' | 'end'): string {
  if (arrow === 'arrow') return side === 'end' ? '>' : '<';
  if (arrow === 'circle') return 'o';
  if (arrow === 'cross') return 'x';
  return '';
}

/**
 * Operator w zapisie: styl, długość i oba zakończenia.
 *
 * Długość linii wraca taka, jaka była w źródle (`---->` zostaje `---->`), bo w
 * Mermaidzie steruje ona układem — skrócenie przesunęłoby węzły.
 */
function edgeOperator(edge: DiagramEdge): string {
  if (edge.meta?.invisible === 'true') return '~~~';

  const head = tipFor(edge.meta?.startArrow as EdgeArrowType | undefined, 'start');
  const tail = tipFor(edge.arrow, 'end');

  if (edge.lineStyle === 'dotted') {
    // `-.-`, `-..-`, `-...-` — kropek jest o jedną mniej niż długość linii.
    const dots = '.'.repeat(Math.max(1, (edge.length ?? 2) - 1));
    return `${head}-${dots}-${tail}`;
  }
  const char = edge.lineStyle === 'thick' ? '=' : '-';
  return `${head}${char.repeat(Math.max(2, (edge.length ?? 1) + 1))}${tail}`;
}

export function serializeFlowchart(doc: DiagramDocument): string {
  const out: string[] = [`flowchart ${doc.direction}`];
  const written = new Set<string>();

  // Nierozpoznane linie wracają przed swoją kotwicą; te bez kotwicy na koniec.
  const byAnchor = new Map<string, UnknownLine[]>();
  const tail: UnknownLine[] = [];
  for (const line of [...doc.unknown].sort((a, b) => a.index - b.index)) {
    if (!line.anchor) { tail.push(line); continue; }
    const bucket = byAnchor.get(line.anchor);
    if (bucket) bucket.push(line);
    else byAnchor.set(line.anchor, [line]);
  }
  // Wcięcie bierzemy z miejsca, w którym linia ląduje, a nie z oryginału:
  // zapis może przenieść ją na inny poziom zagnieżdżenia.
  const flush = (key: string, indent = '  ') => {
    const bucket = byAnchor.get(key);
    if (!bucket) return;
    byAnchor.delete(key);
    for (const line of bucket) out.push(`${indent}${line.text.trim()}`);
  };

  const writeNode = (node: DiagramNode, indent: string) => {
    flush(`node:${node.id}`, indent);
    written.add(node.id);
    out.push(`${indent}${nodeLine(node)}`);
  };

  // Najpierw podgrafy — węzły muszą znaleźć się w środku, żeby zachować grupy.
  for (const group of doc.groups) {
    flush(`group:${group.id}`);
    out.push(`  subgraph ${group.id} [${encodeLabel(group.label)}]`);
    for (const node of doc.nodes.filter((n) => n.parentId === group.id)) writeNode(node, '    ');
    out.push('  end');
  }

  // Węzły z etykietą/kształtem poza grupami: deklarujemy je osobno, żeby opis
  // przetrwał nawet wtedy, gdy węzeł nie występuje w żadnej krawędzi.
  for (const node of doc.nodes) {
    if (written.has(node.id) || node.parentId) continue;
    if (!node.label && node.shape === 'rectangle') continue;
    writeNode(node, '  ');
  }

  for (const edge of doc.edges) {
    flush(`edge:${edge.id}`);
    const op = edgeOperator(edge);
    const label = edge.label ? `|${edge.label}|` : '';
    out.push(`  ${edge.source} ${op}${label} ${edge.target}`);
  }

  // Kotwice, których element zniknął (skasowany węzeł), oraz ogon pliku.
  for (const bucket of byAnchor.values()) for (const line of bucket) out.push(line.text);
  for (const line of tail) out.push(line.text);

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
