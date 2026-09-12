/**
 * c4Diagram.ts — Mermaid `C4Context`/`C4Container`/… ⇄ model diagramu.
 *
 * C4 nie dostaje własnej struktury: element to węzeł, granica to grupa, relacja
 * to krawędź. Nowe jest tylko znaczenie, które siedzi w polach `c4` (patrz
 * `model/c4.ts`).
 *
 * Dwie rzeczy trzeba tu robić uważnie:
 *
 *  • **Liczba argumentów zależy od rodzaju.** `System(alias, label, descr)` ma
 *    trzy, a `Container(alias, label, techn, descr)` cztery — trzeci argument
 *    znaczy w nich co innego. Pomyłka przesuwa opis w miejsce technologii i
 *    nikt tego nie zauważa, dopóki nie spojrzy na rysunek.
 *
 *  • **Przecinek bywa w treści.** „Java, Spring Boot" to jeden argument, więc
 *    dzielenia nie da się zrobić zwykłym `split(',')`.
 */
import { emptyDiagram, type DiagramDocument, type DiagramEdge, type DiagramNode, type UnknownLine } from '../../model/diagram';
import {
  c4BoundaryCallName, c4CallName, hasTechnology,
  type C4BoundaryInfo, type C4ElementKind, type C4NodeInfo, type C4Variant, type C4Variant4,
} from '../../model/c4';
import type { ParseIssue, ParseResult } from '../../model/format';
import { splitFrontMatter, withFrontMatter } from './frontMatter';

const HEADER = /^\s*(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\s*$/i;
const TITLE = /^\s*title\s+(.*?)\s*$/i;
/** `Nazwa(argumenty)` z opcjonalną klamrą otwierającą granicę. */
const CALL = /^\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?<args>[\s\S]*)\)\s*(?<open>\{)?\s*$/;
const BLOCK_CLOSE = /^\s*\}\s*$/;

/** Element: rodzaj + wariant + zewnętrzność, sklejone w jedną nazwę. */
const ELEMENT = /^(?<base>Person|System|Container|Component|Node)(?<variant>Db|Queue)?(?:_(?<placement>[LR]))?(?<ext>_Ext)?$/;
/** Granica: `Enterprise_Boundary`, `System_Boundary`, `Container_Boundary`, `Boundary`. */
const BOUNDARY = /^(?:(?<prefix>Enterprise|System|Container)_)?Boundary$/;
/** Relacja z opcjonalnym przyrostkiem kierunku. */
const REL = /^(?<bi>Bi)?Rel(?:_(?<suffix>U|Up|D|Down|L|Left|R|Right|Back))?$/;

const BASE_KIND: Record<string, C4ElementKind> = {
  Person: 'person', System: 'system', Container: 'container', Component: 'component', Node: 'node',
};

/** Który nagłówek zapisać — ten, który przyszedł w źródle. */
const HEADER_KEY = 'c4Kind';

/**
 * Dzieli listę argumentów na części, pomijając przecinki w cudzysłowach.
 *
 * Cudzysłowy zdejmujemy, bo są zapisem, nie treścią; przy zapisie wracają
 * wokół każdego argumentu poza pierwszym (aliasem).
 */
export function splitArgs(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of text) {
    if (char === '"') { inQuotes = !inQuotes; current += char; continue; }
    if (char === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);

  return parts.map((part) => part.trim().replace(/^"([\s\S]*)"$/, '$1'));
}

/** Argument w zapisie Mermaida — alias bez cudzysłowów, reszta w nich. */
function quote(value: string): string {
  return `"${value}"`;
}

export function parseC4Diagram(text: string): ParseResult {
  const doc = emptyDiagram('c4');
  const issues: ParseIssue[] = [];
  const front = splitFrontMatter(text);
  if (front.frontMatter) doc.meta = { ...doc.meta, frontMatter: front.frontMatter };

  /** Stos otwartych granic — element trafia do tej na wierzchu. */
  const open: string[] = [];
  const parent = () => (open.length ? open[open.length - 1] : undefined);

  let pending: UnknownLine[] = [];
  const anchorPending = (key: string) => {
    for (const line of pending) line.anchor = key;
    doc.unknown.push(...pending);
    pending = [];
  };

  /** Relacja może wskazywać element zapisany niżej albo wcale — zakładamy go. */
  const ensureNode = (id: string): DiagramNode => {
    const existing = doc.nodes.find((n) => n.id === id);
    if (existing) return existing;
    const node: DiagramNode = {
      id, label: id, shape: 'rectangle',
      c4: { kind: 'system', variant: 'plain', external: false },
    };
    doc.nodes.push(node);
    return node;
  };

  front.body.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const header = HEADER.exec(trimmed);
    if (header) { doc.meta = { ...doc.meta, [HEADER_KEY]: header[1] }; return; }

    const title = TITLE.exec(trimmed);
    if (title) { doc.meta = { ...doc.meta, title: title[1] }; return; }

    if (BLOCK_CLOSE.test(trimmed)) { open.pop(); return; }

    const call = trimmed.startsWith('%%') ? null : CALL.exec(trimmed);
    if (!call?.groups) { pending.push({ index, text: line }); return; }

    const { name, args, open: opensBlock } = call.groups;
    const parts = splitArgs(args);

    const boundary = BOUNDARY.exec(name);
    const element = ELEMENT.exec(name);

    // `Node` bez klamry jest elementem, a z klamrą — granicą. Ta sama nazwa,
    // dwa różne byty, rozstrzyga obecność bloku.
    const isBoundary = !!boundary || (element?.groups?.base === 'Node' && !!opensBlock);

    if (isBoundary) {
      const kind: C4BoundaryInfo['kind'] = boundary
        ? (boundary.groups?.prefix?.toLowerCase() as C4BoundaryInfo['kind'] | undefined) ?? 'generic'
        : 'node';
      const info: C4BoundaryInfo = { kind };
      if (kind === 'node') {
        if (parts[2]) info.technology = parts[2];
        if (parts[3]) info.description = parts[3];
        const placement = element?.groups?.placement;
        if (placement) info.placement = placement === 'L' ? 'left' : 'right';
      } else if (parts[2]) {
        info.boundaryType = parts[2];
      }

      doc.groups.push({ id: parts[0], label: parts[1] ?? '', parentId: parent(), c4: info });
      anchorPending(`group:${parts[0]}`);
      // Granica bez klamry jest pusta — Mermaid tego nie zabrania.
      if (opensBlock) open.push(parts[0]);
      return;
    }

    if (element?.groups) {
      const kind = BASE_KIND[element.groups.base];
      const variant: C4Variant = element.groups.variant === 'Db' ? 'db'
        : element.groups.variant === 'Queue' ? 'queue' : 'plain';
      const info: C4NodeInfo = { kind, variant, external: !!element.groups.ext };
      if (element.groups.placement) info.placement = element.groups.placement === 'L' ? 'left' : 'right';

      // Tu rozstrzyga się różnica między `System` a `Container`.
      if (hasTechnology(kind)) {
        if (parts[2]) info.technology = parts[2];
        if (parts[3]) info.description = parts[3];
      } else if (parts[2]) {
        info.description = parts[2];
      }

      const node = ensureNode(parts[0]);
      node.label = parts[1] ?? parts[0];
      node.c4 = info;
      node.parentId = parent();
      anchorPending(`node:${parts[0]}`);
      return;
    }

    const rel = REL.exec(name);
    if (rel?.groups) {
      const [source, target, label, technology] = parts;
      ensureNode(source);
      ensureNode(target);
      const id = `${source}__${target}__${doc.edges.length}`;
      const edge: DiagramEdge = {
        id,
        source,
        target,
        lineStyle: 'solid',
        arrow: 'arrow',
        // Relacja obustronna to strzałka po obu stronach; model nie ma dla niej
        // osobnego rodzaju, a `meta.startArrow` rozumie już rysunek flowchartu.
        ...(rel.groups.bi ? { meta: { startArrow: 'arrow' } } : {}),
        ...(label ? { label } : {}),
        c4: {
          ...(technology ? { technology } : {}),
          ...(rel.groups.bi ? { bidirectional: true } : {}),
          ...(rel.groups.suffix ? { suffix: rel.groups.suffix } : {}),
        },
      };
      doc.edges.push(edge);
      anchorPending(`edge:${id}`);
      return;
    }

    // `UpdateElementStyle`, `UpdateRelStyle`, `UpdateLayoutConfig` i wszystko,
    // czego nie znamy — wraca nietknięte.
    pending.push({ index, text: line });
  });

  doc.unknown.push(...pending);
  return { document: doc, issues };
}

export function serializeC4Diagram(doc: DiagramDocument): string {
  const header = (doc.meta?.[HEADER_KEY] as C4Variant4 | undefined) ?? 'C4Context';
  const out: string[] = [header];
  if (doc.meta?.title) out.push(`    title ${doc.meta.title}`);

  const byAnchor = new Map<string, UnknownLine[]>();
  const tail: UnknownLine[] = [];
  for (const line of [...doc.unknown].sort((a, b) => a.index - b.index)) {
    if (!line.anchor) { tail.push(line); continue; }
    const bucket = byAnchor.get(line.anchor);
    if (bucket) bucket.push(line);
    else byAnchor.set(line.anchor, [line]);
  }
  const flush = (key: string, indent: string) => {
    const bucket = byAnchor.get(key);
    if (!bucket) return;
    byAnchor.delete(key);
    for (const line of bucket) out.push(`${indent}${line.text.trim()}`);
  };

  const elementLine = (node: DiagramNode, indent: string): string => {
    const info = node.c4 ?? { kind: 'system' as const, variant: 'plain' as const, external: false };
    const args = [node.id, quote(node.label)];
    if (hasTechnology(info.kind)) {
      // Opis bez technologii wymaga pustego miejsca po niej — inaczej Mermaid
      // wziąłby opis za technologię.
      if (info.technology || info.description) args.push(quote(info.technology ?? ''));
      if (info.description) args.push(quote(info.description));
    } else if (info.description) {
      args.push(quote(info.description));
    }
    return `${indent}${c4CallName(info)}(${args.join(', ')})`;
  };

  /** Granice i ich zawartość — rekurencyjnie, bo granice się zagnieżdżają. */
  const writeLevel = (parentId: string | undefined, depth: number) => {
    const indent = '    '.repeat(depth + 1);

    for (const group of doc.groups.filter((g) => g.parentId === parentId)) {
      flush(`group:${group.id}`, indent);
      const info: C4BoundaryInfo = group.c4 ?? { kind: 'generic' };
      const args = [group.id, quote(group.label)];
      if (info.kind === 'node') {
        if (info.technology || info.description) args.push(quote(info.technology ?? ''));
        if (info.description) args.push(quote(info.description));
      } else if (info.boundaryType) {
        args.push(quote(info.boundaryType));
      }
      out.push(`${indent}${c4BoundaryCallName(info)}(${args.join(', ')}) {`);
      writeLevel(group.id, depth + 1);
      out.push(`${indent}}`);
    }

    for (const node of doc.nodes.filter((n) => n.parentId === parentId)) {
      flush(`node:${node.id}`, indent);
      out.push(elementLine(node, indent));
    }
  };

  writeLevel(undefined, 0);

  for (const edge of doc.edges) {
    flush(`edge:${edge.id}`, '    ');
    const info = edge.c4 ?? {};
    const name = `${info.bidirectional ? 'Bi' : ''}Rel${info.suffix ? `_${info.suffix}` : ''}`;
    const args = [edge.source, edge.target];
    if (edge.label || info.technology) args.push(quote(edge.label ?? ''));
    if (info.technology) args.push(quote(info.technology));
    out.push(`    ${name}(${args.join(', ')})`);
  }

  for (const bucket of byAnchor.values()) for (const line of bucket) out.push(`    ${line.text.trim()}`);
  for (const line of tail) out.push(`    ${line.text.trim()}`);

  return withFrontMatter(doc.meta?.frontMatter, out.join('\n'));
}
