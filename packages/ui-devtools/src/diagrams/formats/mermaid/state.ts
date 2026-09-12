/**
 * state.ts — Mermaid `stateDiagram-v2` ⇄ model diagramu.
 *
 * Różnice wobec flowchartu, które decydują o kształcie tego kodu:
 *  • `[*]` nie jest nazwą stanu, tylko pseudostanem — po lewej stronie przejścia
 *    znaczy „start", po prawej „koniec". W modelu każde wystąpienie dostaje
 *    własny węzeł (`start`/`end`) z wygenerowanym id, bo dwa różne wyjścia z
 *    automatu to dwa różne punkty, a nie jeden wspólny;
 *  • stan złożony (`state X { … }`) to grupa z zawartością;
 *  • opis stanu bywa podany na trzy sposoby (`state "opis" as id`, `id : opis`,
 *    oraz sama nazwa), więc parser scala je w jedno pole `label`.
 */
import {
  emptyDiagram, edgeId,
  type DiagramDocument, type DiagramDirection, type DiagramGroup, type DiagramNode,
  type NodeShape, type UnknownLine,
} from '../../model/diagram';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';
import { decodeLabel } from './shapes';

const HEADER = /^\s*stateDiagram(?:-v2)?\s*$/i;
const DIRECTION = /^\s*direction\s+(TB|TD|BT|LR|RL)\s*$/i;
/** `state "opis" as id` */
const STATE_ALIAS = /^\s*state\s+"([^"]*)"\s+as\s+([A-Za-z0-9_.-]+)\s*$/i;
/** `state id <<choice>>` */
const STATE_KIND = /^\s*state\s+([A-Za-z0-9_.-]+)\s*<<\s*(choice|fork|join|end)\s*>>\s*$/i;
/** `state id {` — otwarcie stanu złożonego */
const STATE_OPEN = /^\s*state\s+(?:"([^"]*)"\s+as\s+)?([A-Za-z0-9_.-]+)\s*\{\s*$/i;
const BLOCK_CLOSE = /^\s*\}\s*$/;
/** `id : opis` (ale nie przejście, bo tam jest strzałka) */
const STATE_DESCRIPTION = /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$/;
/**
 * `id:::klasa` — przypisanie klasy stylu wprost przy stanie.
 *
 * Musi być sprawdzone PRZED opisem: `OtaUpdate:::error` pasuje też do wzorca
 * `id : opis`, więc parser robił z niego stan o opisie `::error` — nazwa stanu
 * znikała z diagramu, a jej miejsce zajmował fragment składni stylowania.
 */
const STATE_INLINE_CLASS = /^\s*([A-Za-z0-9_.-]+):::([A-Za-z0-9_-]+)\s*$/;
/** `A --> B` z opcjonalnym `: opis` */
const TRANSITION = /^\s*(\[\*\]|[A-Za-z0-9_.-]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_.-]+)\s*(?::\s*(.*))?$/;

const PSEUDO = '[*]';

export function parseStateDiagram(text: string): ParseResult {
  const doc = emptyDiagram('state');
  const issues: ParseIssue[] = [];
  // Front matter trzymamy osobno — przy zapisie musi wrócić na sam początek.
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };
  const lines = front.body.split('\n');
  const groupStack: string[] = [];
  let seenHeader = false;
  let pseudoCounter = 0;

  const parentId = () => groupStack[groupStack.length - 1];

  const ensureNode = (id: string, shape: NodeShape = 'rectangle', label = ''): DiagramNode => {
    // Odwołanie do istniejącej grupy (stanu złożonego) nie tworzy węzła —
    // przejście ma trafić w grupę.
    const group = doc.groups.find((g) => g.id === id);
    if (group) return { id, label: group.label, shape: 'rectangle' };

    const existing = doc.nodes.find((n) => n.id === id);
    if (existing) {
      if (label && !existing.label) existing.label = label;
      if (shape !== 'rectangle') existing.shape = shape;
      return existing;
    }
    const parent = parentId();
    const node: DiagramNode = { id, label, shape, ...(parent ? { parentId: parent } : {}) };
    doc.nodes.push(node);
    return node;
  };

  /**
   * Pseudostan `[*]` → własny węzeł.
   *
   * Każde wystąpienie jest osobne: `A --> [*]` i `B --> [*]` to dwa niezależne
   * zakończenia, a nie jedno wspólne. Id jest generowane, ale przy zapisie
   * i tak wraca `[*]`, więc nie wycieka do tekstu.
   */
  const pseudoNode = (role: 'start' | 'end'): string => {
    const id = `__${role}${pseudoCounter++}`;
    const parent = parentId();
    doc.nodes.push({ id, label: '', shape: role, ...(parent ? { parentId: parent } : {}) });
    return id;
  };

  /**
   * Nierozpoznane linie czekające na element, przed którym mają wrócić.
   *
   * Separator regionów współbieżnych (`--`) musi zostać W ŚRODKU stanu
   * złożonego — dopisany na końcu pliku zmieniłby znaczenie diagramu albo
   * wprost zepsuł składnię.
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

    if (!seenHeader && HEADER.test(line)) { seenHeader = true; return; }

    const dir = DIRECTION.exec(trimmed);
    if (dir) {
      const value = dir[1].toUpperCase();
      const parsed = (value === 'TD' ? 'TB' : value) as DiagramDirection;
      // Wewnątrz stanu złożonego kierunek dotyczy TEGO stanu, nie diagramu —
      // inaczej `direction TB` z wnętrza kasowało `direction LR` z nagłówka.
      const open = groupStack[groupStack.length - 1];
      if (open) {
        const group = doc.groups.find((g) => g.id === open);
        if (group) group.direction = parsed;
      } else {
        doc.direction = parsed;
      }
      return;
    }

    if (BLOCK_CLOSE.test(trimmed) && groupStack.length > 0) { groupStack.pop(); return; }

    const open = STATE_OPEN.exec(trimmed);
    if (open) {
      const [, label, id] = open;
      // Stan złożony jest JEDNYM bytem: stanem, do którego prowadzą przejścia,
      // i pojemnikiem na stany wewnętrzne. Jeśli wcześniejsze przejście zdążyło
      // utworzyć zwykły węzeł o tym id, zamieniamy go w grupę — dwa elementy o
      // tym samym identyfikatorze rozsypałyby widok i zapis.
      const existing = doc.nodes.findIndex((n) => n.id === id);
      const inheritedLabel = existing >= 0 ? doc.nodes[existing].label : '';
      if (existing >= 0) doc.nodes.splice(existing, 1);

      doc.groups.push({
        id,
        label: label ? decodeLabel(label) : (inheritedLabel || id),
        ...(parentId() ? { parentId: parentId() } : {}),
      });
      groupStack.push(id);
      anchorPending(`group:${id}`);
      return;
    }

    const kind = STATE_KIND.exec(trimmed);
    if (kind) {
      const shape = kind[2].toLowerCase();
      ensureNode(kind[1], (shape === 'end' ? 'end' : shape) as NodeShape);
      anchorPending(`node:${kind[1]}`);
      return;
    }

    const alias = STATE_ALIAS.exec(trimmed);
    if (alias) {
      ensureNode(alias[2], 'rectangle', decodeLabel(alias[1]));
      anchorPending(`node:${alias[2]}`);
      return;
    }

    const transition = TRANSITION.exec(trimmed);
    if (transition) {
      const [, rawFrom, rawTo, label] = transition;
      const from = rawFrom === PSEUDO ? pseudoNode('start') : ensureNode(rawFrom).id;
      const to = rawTo === PSEUDO ? pseudoNode('end') : ensureNode(rawTo).id;
      const id = edgeId(doc, from, to);
      doc.edges.push({
        id,
        source: from,
        target: to,
        lineStyle: 'solid',
        arrow: 'arrow',
        ...(label?.trim() ? { label: label.trim() } : {}),
      });
      anchorPending(`edge:${id}`);
      return;
    }

    const inlineClass = STATE_INLINE_CLASS.exec(trimmed);
    if (inlineClass) {
      ensureNode(inlineClass[1]).className = inlineClass[2];
      anchorPending(`node:${inlineClass[1]}`);
      return;
    }

    const description = STATE_DESCRIPTION.exec(trimmed);
    // `note right of X: …` też pasuje do wzorca opisu, więc odsiewamy słowa kluczowe.
    if (description && !/^(note|state|direction|class|click)\b/i.test(trimmed)) {
      ensureNode(description[1], 'rectangle', decodeLabel(description[2]));
      anchorPending(`node:${description[1]}`);
      return;
    }

    pending.push({ index, text: line });
  });

  // Ogon pliku nie ma już elementu, przed którym mógłby stanąć.
  doc.unknown.push(...pending);

  return { document: doc, issues };
}

/** Cudzysłowy w opisie zamykałyby napis w połowie — Mermaid czyta encję `#quot;`. */
function escapeQuotes(text: string): string {
  return text.replace(/"/g, '#quot;');
}

/** Nazwa węzła w składni Mermaida — pseudostany wracają jako `[*]`. */
function refOf(doc: DiagramDocument, id: string): string {
  const node = doc.nodes.find((n) => n.id === id);
  return node && (node.shape === 'start' || node.shape === 'end') ? PSEUDO : id;
}

/**
 * Pojemnik, w którym leży dany element — grupa albo `undefined` dla poziomu
 * głównego. Stan złożony jest jednocześnie grupą i celem przejść, więc trzeba
 * pytać o oba rejestry.
 */
function containerOf(doc: DiagramDocument, id: string): string | undefined {
  return doc.nodes.find((n) => n.id === id)?.parentId
    ?? doc.groups.find((g) => g.id === id)?.parentId;
}

/** Łańcuch pojemników od najbliższego do korzenia (korzeń jako `undefined`). */
function containerChain(doc: DiagramDocument, id: string): Array<string | undefined> {
  const chain: Array<string | undefined> = [];
  let current = containerOf(doc, id);
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    chain.push(current);
    current = containerOf(doc, current);
  }
  chain.push(undefined);
  return chain;
}

/**
 * Blok, w którym ma stanąć przejście: najbliższy wspólny pojemnik obu końców.
 *
 * Bez tego przejście trafiało do każdej grupy, której dotykał choć jeden koniec
 * — przy zagnieżdżeniu dawało to duplikaty, a przejścia między poziomami
 * lądowały w złym bloku.
 */
function edgeContainer(doc: DiagramDocument, source: string, target: string): string | undefined {
  const targetChain = containerChain(doc, target);
  for (const candidate of containerChain(doc, source)) {
    if (targetChain.includes(candidate)) return candidate;
  }
  return undefined;
}

export function serializeStateDiagram(doc: DiagramDocument): string {
  const out: string[] = ['stateDiagram-v2'];
  if (doc.direction !== 'TB') out.push(`  direction ${doc.direction}`);

  const SPECIAL: Partial<Record<NodeShape, string>> = { choice: 'choice', fork: 'fork', join: 'join' };
  const isPseudo = (n: DiagramNode) => n.shape === 'start' || n.shape === 'end';

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
  const flush = (key: string, indent = '') => {
    const bucket = byAnchor.get(key);
    if (!bucket) return;
    byAnchor.delete(key);
    for (const line of bucket) out.push(`${indent}${line.text.trim()}`);
  };

  const writeNode = (node: DiagramNode, indent: string) => {
    flush(`node:${node.id}`, indent);
    const special = SPECIAL[node.shape];
    if (special) out.push(`${indent}state ${node.id} <<${special}>>`);
    // Opis zapisujemy tylko wtedy, gdy różni się od identyfikatora — `state
    // "Idle" as Idle` to szum, który myli przy czytaniu kodu.
    else if (node.label && node.label !== node.id) {
      out.push(`${indent}state "${escapeQuotes(node.label)}" as ${node.id}`);
    }
    // Klasa stylu przypisana wprost przy stanie.
    if (node.className) out.push(`${indent}${node.id}:::${node.className}`);
  };

  const writeEdge = (edge: typeof doc.edges[number], indent: string) => {
    flush(`edge:${edge.id}`, indent);
    const label = edge.label ? `: ${edge.label}` : '';
    out.push(`${indent}${refOf(doc, edge.source)} --> ${refOf(doc, edge.target)}${label}`);
  };

  /**
   * Zawartość jednego poziomu: stany, zagnieżdżone stany złożone, przejścia.
   *
   * Rekurencja jest konieczna — wcześniej grupy szły płasko, więc stan złożony
   * wewnątrz innego stanu złożonego wychodził po zapisie jako jego sąsiad i
   * struktura automatu się rozpadała.
   */
  const writeLevel = (container: string | undefined, indent: string) => {
    for (const node of doc.nodes) {
      if (node.parentId !== container || isPseudo(node)) continue;
      writeNode(node, indent);
    }
    for (const group of doc.groups) {
      if (group.parentId !== container) continue;
      writeGroup(group, indent);
    }
    for (const edge of doc.edges) {
      if (edgeContainer(doc, edge.source, edge.target) !== container) continue;
      writeEdge(edge, indent);
    }
  };

  function writeGroup(group: DiagramGroup, indent: string) {
    flush(`group:${group.id}`, indent);
    // Opis ramki zapisujemy formą z aliasem — bez tego zmiana nazwy stanu
    // złożonego w edytorze nie miała żadnego odbicia w kodzie.
    const header = group.label && group.label !== group.id
      ? `state "${escapeQuotes(group.label)}" as ${group.id}`
      : `state ${group.id}`;
    out.push(`${indent}${header} {`);
    if (group.direction) out.push(`${indent}  direction ${group.direction}`);
    writeLevel(group.id, `${indent}  `);
    out.push(`${indent}}`);
  }

  writeLevel(undefined, '  ');

  // Kotwice, których element zniknął (skasowany stan), oraz ogon pliku.
  for (const bucket of byAnchor.values()) for (const line of bucket) out.push(line.text);
  for (const line of tail) out.push(line.text);

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
