/**
 * erDiagram.ts — Mermaid `erDiagram` ⇄ model diagramu związków encji.
 *
 * Dwie rzeczy własne tego formatu:
 *
 *  • **liczebność jest lustrzana.** `KLIENT ||--o{ ZAMOWIENIE` zapisuje lewy
 *    koniec od zewnątrz do środka (`||`), a prawy od środka na zewnątrz (`o{`).
 *    Trzymamy więc liczebność jako pojęcie (`exactlyOne`, `zeroOrMore`…), a nie
 *    jako napis — inaczej przy zapisie trzeba by odgadywać, którą stronę odbić.
 *
 *  • **encja ma atrybuty**, a te niosą role kluczy i komentarz. Jak wszędzie,
 *    zapis źródłowy atrybutu zostaje w `raw` i wraca nietknięty, gdy rozbiór się
 *    nie powiódł.
 */
import {
  emptyDiagram, edgeId,
  type DiagramDocument, type DiagramNode, type EntityAttribute, type EntityKey,
  type ErCardinality, type UnknownLine,
} from '../../model/diagram';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*erDiagram\s*$/i;
/** Nazwa encji: Mermaid dopuszcza myślniki i podkreślenia. */
const NAME = '[A-Za-z0-9_-]+';
/** `KLIENT {` — otwarcie bloku atrybutów. */
const ENTITY_OPEN = new RegExp(`^\\s*(${NAME})\\s*\\{\\s*$`);
/** `ALARM_LOG` — encja zadeklarowana samą nazwą, bez bloku atrybutów. */
const ENTITY_BARE = new RegExp(`^\\s*(${NAME})\\s*$`);
const BLOCK_CLOSE = /^\s*\}\s*$/;

/**
 * Relacja: `KLIENT ||--o{ ZAMOWIENIE : sklada`.
 *
 * Operator to trzy części: liczebność lewa, rodzaj linii, liczebność prawa.
 */
const RELATION = new RegExp(
  `^\\s*(?<left>${NAME})\\s+` +
  '(?<leftCard>\\|o|\\|\\||\\}o|\\}\\|)' +
  '(?<line>--|\\.\\.)' +
  '(?<rightCard>o\\||\\|\\||o\\{|\\|\\{)\\s+' +
  `(?<right>${NAME})\\s*` +
  '(?::\\s*(?<label>.*))?$',
);

/** Zapis liczebności ⇄ pojęcie. Lewa strona jest odbiciem prawej. */
const LEFT_CARDINALITY: Record<string, ErCardinality> = {
  '|o': 'zeroOrOne', '||': 'exactlyOne', '}o': 'zeroOrMore', '}|': 'oneOrMore',
};
const RIGHT_CARDINALITY: Record<string, ErCardinality> = {
  'o|': 'zeroOrOne', '||': 'exactlyOne', 'o{': 'zeroOrMore', '|{': 'oneOrMore',
};
const LEFT_SYMBOL: Record<ErCardinality, string> = {
  zeroOrOne: '|o', exactlyOne: '||', zeroOrMore: '}o', oneOrMore: '}|',
};
const RIGHT_SYMBOL: Record<ErCardinality, string> = {
  zeroOrOne: 'o|', exactlyOne: '||', zeroOrMore: 'o{', oneOrMore: '|{',
};

const KEYS: EntityKey[] = ['PK', 'FK', 'UK'];

/**
 * Rozbiera atrybut: `string numer PK, FK "opis"`.
 *
 * Kolejność jest stała (typ, nazwa, klucze, komentarz), ale każda część poza
 * dwiema pierwszymi jest opcjonalna.
 */
export function parseAttribute(raw: string): EntityAttribute {
  const text = raw.trim();
  const attribute: EntityAttribute = { raw: text };

  let rest = text;
  const comment = /"([^"]*)"\s*$/.exec(rest);
  if (comment) {
    attribute.comment = comment[1];
    rest = rest.slice(0, comment.index).trim();
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return attribute;

  attribute.type = parts[0];
  attribute.name = parts[1];

  // Role kluczy bywają rozdzielone przecinkiem, z odstępem albo bez.
  const keys = parts.slice(2).join(' ').split(/[,\s]+/)
    .map((key) => key.trim().toUpperCase())
    .filter((key): key is EntityKey => (KEYS as string[]).includes(key));
  if (keys.length) attribute.keys = keys;
  return attribute;
}

/** Atrybut w zapisie Mermaida — z `raw`, jeśli rozbiór niczego nie dał. */
function attributeLine(attribute: EntityAttribute): string {
  if (!attribute.name || !attribute.type) return attribute.raw;
  const keys = attribute.keys?.length ? ` ${attribute.keys.join(', ')}` : '';
  const comment = attribute.comment ? ` "${attribute.comment}"` : '';
  return `${attribute.type} ${attribute.name}${keys}${comment}`;
}

export function parseErDiagram(text: string): ParseResult {
  const doc = emptyDiagram('er');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  let openEntity: string | undefined;
  let seenHeader = false;

  const ensureEntity = (id: string): DiagramNode => {
    const existing = doc.nodes.find((n) => n.id === id);
    if (existing) return existing;
    const node: DiagramNode = { id, label: id, shape: 'rectangle', attributes: [] };
    doc.nodes.push(node);
    return node;
  };

  let pending: UnknownLine[] = [];
  const anchorPending = (key: string) => {
    for (const line of pending) line.anchor = key;
    doc.unknown.push(...pending);
    pending = [];
  };

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; return; }

    if (openEntity) {
      if (BLOCK_CLOSE.test(trimmed)) { openEntity = undefined; return; }
      ensureEntity(openEntity).attributes!.push(parseAttribute(trimmed));
      return;
    }

    const open = ENTITY_OPEN.exec(trimmed);
    if (open) {
      const node = ensureEntity(open[1]);
      openEntity = node.id;
      anchorPending(`node:${node.id}`);
      return;
    }

    const relation = trimmed.startsWith('%%') ? null : RELATION.exec(trimmed);
    if (relation?.groups) {
      const g = relation.groups;
      ensureEntity(g.left);
      ensureEntity(g.right);
      const id = edgeId(doc, g.left, g.right);
      // Etykieta bywa w cudzysłowie; model trzyma sam tekst.
      const label = g.label?.trim().replace(/^"([\s\S]*)"$/, '$1');
      doc.edges.push({
        id,
        source: g.left,
        target: g.right,
        lineStyle: g.line === '..' ? 'dotted' : 'solid',
        arrow: 'none',
        erFrom: LEFT_CARDINALITY[g.leftCard],
        erTo: RIGHT_CARDINALITY[g.rightCard],
        erIdentifying: g.line === '--',
        ...(label ? { label } : {}),
      });
      anchorPending(`edge:${id}`);
      return;
    }

    const bare = trimmed.startsWith('%%') ? null : ENTITY_BARE.exec(trimmed);
    if (bare) {
      const node = ensureEntity(bare[1]);
      anchorPending(`node:${node.id}`);
      return;
    }

    pending.push({ index, text: line });
  });

  doc.unknown.push(...pending);
  return { document: doc, issues };
}

export function serializeErDiagram(doc: DiagramDocument): string {
  const out: string[] = ['erDiagram'];

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

  // Relacje najpierw — tak czyta się diagram ER: najpierw kto z kim, potem co
  // dana encja zawiera.
  for (const edge of doc.edges) {
    flush(`edge:${edge.id}`);
    const left = LEFT_SYMBOL[edge.erFrom ?? 'exactlyOne'];
    const right = RIGHT_SYMBOL[edge.erTo ?? 'zeroOrMore'];
    const line = edge.erIdentifying === false ? '..' : '--';
    // Mermaid wymaga etykiety relacji; pusta psuje składnię, więc dajemy `""`.
    const label = edge.label ? ` : ${edge.label}` : ' : ""';
    out.push(`  ${edge.source} ${left}${line}${right} ${edge.target}${label}`);
  }

  for (const node of doc.nodes) {
    flush(`node:${node.id}`);
    const attributes = node.attributes ?? [];
    // Encja bez atrybutów nie potrzebuje bloku — pusty jest szumem, a przy
    // relacji i tak zostanie zadeklarowana.
    if (!attributes.length) continue;
    out.push(`  ${node.id} {`);
    for (const attribute of attributes) out.push(`    ${attributeLine(attribute)}`);
    out.push('  }');
  }

  // Encja bez atrybutów i bez relacji zniknęłaby przy zapisie — musi zostać.
  for (const node of doc.nodes) {
    const attributes = node.attributes ?? [];
    const inRelation = doc.edges.some((e) => e.source === node.id || e.target === node.id);
    if (!attributes.length && !inRelation) out.push(`  ${node.id} {\n  }`);
  }

  for (const bucket of byAnchor.values()) for (const line of bucket) out.push(`  ${line.text.trim()}`);
  for (const line of tail) out.push(`  ${line.text.trim()}`);

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
