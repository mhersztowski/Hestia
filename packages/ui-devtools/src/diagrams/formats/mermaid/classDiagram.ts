/**
 * classDiagram.ts — Mermaid `classDiagram` ⇄ model diagramu.
 *
 * Dwie rzeczy odróżniają ten adapter od flowchartu i diagramu stanów:
 *
 *  • **węzeł ma ciało.** Klasa to nie sama etykieta, tylko lista pól i metod.
 *    Składnia bywa bogatsza, niż model opisuje (generyki, wartości domyślne),
 *    więc każda składowa trzyma swój zapis źródłowy w `raw` — rozbiór na
 *    widoczność/nazwę/typ służy wyłącznie do wyświetlania i nigdy nie jest
 *    źródłem zapisu.
 *
 *  • **relacja ma dwa końce.** `Rodzic <|-- Dziecko` niesie zakończenie po
 *    stronie źródła i po stronie celu, a do tego krotności („1", „0..*").
 *    Strony modelu odpowiadają stronom zapisu — kierunku nie normalizujemy,
 *    bo przepisywałoby to `<|--` użytkownika na `--|>` i odwracało układ:
 *    Mermaid rysuje nadklasę nad podklasą właśnie dlatego, że stoi po lewej.
 */
import {
  emptyDiagram, edgeId,
  type ClassMember, type DiagramDocument, type DiagramDirection, type DiagramNode,
  type ClassRelationKind, type EdgeArrowType, type EdgeLineStyle, type MemberVisibility,
  type UnknownLine,
} from '../../model/diagram';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';
// Zapis składowej jest kanoniczną postacią z modelu — nie duplikujemy go tutaj.
import { formatMember } from '../../model/classMembers';

const HEADER = /^\s*classDiagram(?:-v2)?\s*$/i;
const DIRECTION = /^\s*direction\s+(TB|TD|BT|LR|RL)\s*$/i;
/** `class Nazwa {` albo `class Nazwa` */
const CLASS_OPEN = /^\s*class\s+([A-Za-z0-9_~[\]]+)\s*(\{)?\s*$/;
const BLOCK_CLOSE = /^\s*\}\s*$/;
/** `<<interface>>` — samo w ciele klasy. */
const ANNOTATION_INLINE = /^\s*<<\s*([A-Za-z0-9_ -]+)\s*>>\s*$/;
/** `<<interface>> Nazwa` — adnotacja poza ciałem. */
const ANNOTATION_STANDALONE = /^\s*<<\s*([A-Za-z0-9_ -]+)\s*>>\s*([A-Za-z0-9_]+)\s*$/;
/** `Nazwa : +String pole` — składowa dopisana bez otwierania bloku. */
const MEMBER_LINE = /^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/;

/**
 * Relacja: `A "1" <|--|> "0..*" B : opis`.
 *
 * Operator jest jedynym miejscem, gdzie mogą wystąpić `<|`, `*`, `o`, `>`, więc
 * rozpoznajemy go osobno od nazw klas i krotności.
 */
const RELATION = new RegExp(
  '^\\s*(?<left>[A-Za-z0-9_~[\\]]+)\\s*' +
  '(?:"(?<leftCard>[^"]*)"\\s*)?' +
  '(?<op>[<|*o]{0,2}\\.{2,}[|>*o]{0,2}|[<|*o]{0,2}-{2,}[|>*o]{0,2})' +
  '\\s*(?:"(?<rightCard>[^"]*)"\\s*)?' +
  '(?<right>[A-Za-z0-9_~[\\]]+)\\s*' +
  '(?::\\s*(?<label>.*))?$',
);

/** Znak widoczności UML na nazwę w modelu. */
const VISIBILITY: Record<string, MemberVisibility> = {
  '+': 'public', '-': 'private', '#': 'protected', '~': 'package',
};

/**
 * Rozbiera składową klasy.
 *
 * Zapis źródłowy zostaje w `raw` — to on wraca przy zapisie. Reszta pól to
 * wynik rozbioru „na tyle, na ile się da": nierozpoznany fragment nie jest
 * błędem, po prostu zostaje bez rozbicia.
 */
export function parseMember(raw: string): ClassMember {
  const text = raw.trim();
  const member: ClassMember = { raw: text, kind: text.includes('(') ? 'method' : 'field' };

  let rest = text;
  const visibility = VISIBILITY[rest[0]];
  if (visibility) { member.visibility = visibility; rest = rest.slice(1).trim(); }

  if (member.kind === 'method') {
    // `nazwa(parametry)$ typ` — modyfikator stoi tuż za nawiasem.
    const method = /^([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([*$])?\s*(.*)$/.exec(rest);
    if (method) {
      member.name = method[1];
      if (method[2].trim()) member.params = method[2].trim();
      if (method[3] === '$') member.isStatic = true;
      if (method[3] === '*') member.isAbstract = true;
      if (method[4].trim()) member.type = method[4].trim();
    }
    return member;
  }

  // Pole: `typ nazwa` (notacja Mermaida) albo sama nazwa.
  const withModifier = /^(.*?)\s*([*$])$/.exec(rest);
  if (withModifier) {
    rest = withModifier[1];
    if (withModifier[2] === '$') member.isStatic = true;
    else member.isAbstract = true;
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) { member.type = parts.slice(0, -1).join(' '); member.name = parts[parts.length - 1]; }
  else if (parts.length === 1) member.name = parts[0];
  return member;
}

/** Zakończenie relacji ze strony operatora. `side` mówi, którego końca szukamy. */
function endOf(op: string, side: 'left' | 'right'): EdgeArrowType {
  const token = side === 'left'
    ? op.slice(0, op.search(/[-.]/))
    : op.slice(op.search(/[-.](?!.*[-.])/) + 1);
  if (token.includes('|')) return 'triangle';
  if (token.includes('*')) return 'diamondFilled';
  if (token.includes('o')) return 'diamond';
  if (token.includes('>') || token.includes('<')) return 'arrow';
  return 'none';
}

/** Rodzaj relacji wynikający z zakończenia i stylu linii. */
function relationFromLook(end: EdgeArrowType, lineStyle: EdgeLineStyle): ClassRelationKind {
  const dotted = lineStyle === 'dotted';
  if (end === 'triangle') return dotted ? 'realization' : 'inheritance';
  if (end === 'diamondFilled') return 'composition';
  if (end === 'diamond') return 'aggregation';
  if (end === 'arrow') return dotted ? 'dependency' : 'association';
  return 'link';
}

/** Zapis zakończenia po danej stronie operatora. */
function tipOf(arrow: EdgeArrowType | undefined, side: 'left' | 'right'): string {
  switch (arrow) {
    case 'triangle': return side === 'left' ? '<|' : '|>';
    case 'diamondFilled': return '*';
    case 'diamond': return 'o';
    case 'arrow': return side === 'left' ? '<' : '>';
    default: return '';
  }
}

export function parseClassDiagram(text: string): ParseResult {
  const doc = emptyDiagram('class');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };
  const lines = front.body.split('\n');

  /** Klasa, której ciało jest właśnie otwarte. */
  let openClass: string | undefined;
  let seenHeader = false;

  const ensureClass = (id: string): DiagramNode => {
    const existing = doc.nodes.find((n) => n.id === id);
    if (existing) return existing;
    const node: DiagramNode = { id, label: id, shape: 'rectangle', members: [] };
    doc.nodes.push(node);
    return node;
  };

  let pending: UnknownLine[] = [];
  const anchorPending = (key: string) => {
    for (const line of pending) line.anchor = key;
    doc.unknown.push(...pending);
    pending = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; return; }

    const dir = DIRECTION.exec(trimmed);
    if (dir) {
      const value = dir[1].toUpperCase();
      doc.direction = (value === 'TD' ? 'TB' : value) as DiagramDirection;
      return;
    }

    if (openClass) {
      if (BLOCK_CLOSE.test(trimmed)) { openClass = undefined; return; }
      const annotation = ANNOTATION_INLINE.exec(trimmed);
      if (annotation) { ensureClass(openClass).stereotype = annotation[1].trim(); return; }
      ensureClass(openClass).members!.push(parseMember(trimmed));
      return;
    }

    const open = CLASS_OPEN.exec(trimmed);
    if (open) {
      const node = ensureClass(open[1]);
      if (open[2]) openClass = node.id;
      anchorPending(`node:${node.id}`);
      return;
    }

    const standalone = ANNOTATION_STANDALONE.exec(trimmed);
    if (standalone) {
      ensureClass(standalone[2]).stereotype = standalone[1].trim();
      anchorPending(`node:${standalone[2]}`);
      return;
    }

    // Relacja przed składową: `A --> B : opis` pasuje też do wzorca `Klasa : …`.
    const relation = trimmed.startsWith('%%') ? null : RELATION.exec(trimmed);
    if (relation?.groups) {
      const g = relation.groups;
      // Strony modelu odpowiadają stronom zapisu — bez normalizowania kierunku.
      // Przestawienie ich („grot zawsze przy celu") przepisywałoby `<|--` na
      // `--|>` i odwracało układ: Mermaid rysuje nadklasę NAD podklasą właśnie
      // dlatego, że stoi ona po lewej stronie relacji.
      const source = g.left;
      const target = g.right;
      const sourceCard = g.leftCard;
      const targetCard = g.rightCard;
      const arrow = endOf(g.op, 'right');
      const startArrow = endOf(g.op, 'left');

      ensureClass(source);
      ensureClass(target);
      const id = edgeId(doc, source, target);
      const lineStyle: EdgeLineStyle = g.op.includes('.') ? 'dotted' : 'solid';
      // Rodzaj relacji zapisujemy wprost: to on niesie znaczenie, a wygląd z
      // niego wynika. Bez tego każdy odbiorca modelu (np. generator kodu)
      // musiałby odgadywać relację z kombinacji grotu i stylu linii.
      const relationEnd: 'source' | 'target' = arrow === 'none' && startArrow !== 'none' ? 'source' : 'target';
      const relationKind = relationFromLook(relationEnd === 'source' ? startArrow : arrow, lineStyle);
      doc.edges.push({
        id,
        source,
        target,
        lineStyle,
        arrow,
        relation: relationKind,
        relationEnd,
        ...(startArrow !== 'none' ? { meta: { startArrow } } : {}),
        ...(sourceCard ? { sourceLabel: sourceCard } : {}),
        ...(targetCard ? { targetLabel: targetCard } : {}),
        ...(g.label?.trim() ? { label: g.label.trim() } : {}),
      });
      anchorPending(`edge:${id}`);
      return;
    }

    const member = trimmed.startsWith('%%') ? null : MEMBER_LINE.exec(trimmed);
    if (member) {
      ensureClass(member[1]).members!.push(parseMember(member[2]));
      anchorPending(`node:${member[1]}`);
      return;
    }

    pending.push({ index, text: line });
  });

  doc.unknown.push(...pending);
  return { document: doc, issues };
}

export function serializeClassDiagram(doc: DiagramDocument): string {
  const out: string[] = ['classDiagram'];
  if (doc.direction !== 'TB') out.push(`  direction ${doc.direction}`);

  // Nierozpoznane linie wracają przed swoją kotwicą; te bez kotwicy na koniec.
  const byAnchor = new Map<string, UnknownLine[]>();
  const tail: UnknownLine[] = [];
  for (const line of [...doc.unknown].sort((a, b) => a.index - b.index)) {
    if (!line.anchor) { tail.push(line); continue; }
    const bucket = byAnchor.get(line.anchor);
    if (bucket) bucket.push(line);
    else byAnchor.set(line.anchor, [line]);
  }
  const flush = (key: string) => {
    const bucket = byAnchor.get(key);
    if (!bucket) return;
    byAnchor.delete(key);
    for (const line of bucket) out.push(`  ${line.text.trim()}`);
  };

  for (const node of doc.nodes) {
    flush(`node:${node.id}`);
    const body = node.members ?? [];
    // Klasa bez ciała i bez adnotacji nie potrzebuje bloku — `class Pies`
    // wystarcza, a puste nawiasy to szum przy czytaniu kodu.
    if (!body.length && !node.stereotype) {
      out.push(`  class ${node.id}`);
      continue;
    }
    out.push(`  class ${node.id} {`);
    if (node.stereotype) out.push(`    <<${node.stereotype}>>`);
    for (const member of body) out.push(`    ${formatMember(member)}`);
    out.push('  }');
  }

  for (const edge of doc.edges) {
    flush(`edge:${edge.id}`);
    const startArrow = edge.meta?.startArrow as EdgeArrowType | undefined;
    const body = (edge.lineStyle as EdgeLineStyle) === 'dotted' ? '..' : '--';
    const op = `${tipOf(startArrow, 'left')}${body}${tipOf(edge.arrow, 'right')}`;
    const sourceCard = edge.sourceLabel ? `"${edge.sourceLabel}" ` : '';
    const targetCard = edge.targetLabel ? `"${edge.targetLabel}" ` : '';
    const label = edge.label ? ` : ${edge.label}` : '';
    out.push(`  ${edge.source} ${sourceCard}${op} ${targetCard}${edge.target}${label}`);
  }

  for (const bucket of byAnchor.values()) for (const line of bucket) out.push(`  ${line.text.trim()}`);
  for (const line of tail) out.push(`  ${line.text.trim()}`);

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
