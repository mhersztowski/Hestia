/**
 * dot/index.ts — DOT (Graphviz) ⇄ model diagramu.
 *
 * Powód istnienia: **mnóstwo narzędzi pluje DOT-em i żadne nie pluje
 * Mermaidem**. Profilery, `pydeps`, `madge`, `cargo-depgraph`, grafy wywołań
 * z kompilatorów — wszystkie zapisują graf w tym formacie. Bez adaptera taki
 * plik trzeba przepisać ręcznie, zanim da się z nim cokolwiek zrobić w notatce.
 *
 * Parser jest liniowy i wybaczający, tak jak flowchartowy: rozpoznaje
 * deklaracje węzłów, krawędzie i klastry, a wszystko inne (`node [...]`,
 * `overlap`, `fontname`, `rank`) zapisuje w `unknown` i oddaje przy zapisie.
 * Obsługujemy podzbiór DOT-a — ten, który niosą pliki z narzędzi — i nie
 * udajemy, że rozumiemy więcej.
 *
 * Świadomie **nie sięgamy po pełny parser języka DOT**: gramatyka dopuszcza
 * zagnieżdżone podgrafy jako operandy krawędzi (`{A B} -> {C D}`), atrybuty
 * domyślne dziedziczone po zakresach i porty (`A:f0 -> B:f1`). Wciągnięcie tego
 * kosztowałoby wielokrotnie więcej niż wartość, którą daje — a pliki z narzędzi
 * używają prostego podzbioru.
 */
import {
  edgeId, emptyDiagram,
  type DiagramDocument, type DiagramDirection, type DiagramNode,
  type EdgeLineStyle, type NodeShape,
} from '../../model/diagram';
import type { DiagramFormat, ParseIssue, ParseResult } from '../../model/format';

/** `digraph G {`, `graph {`, `strict digraph {` */
const HEADER = /^\s*(strict\s+)?(digraph|graph)\b\s*("[^"]*"|[A-Za-z0-9_]*)?\s*\{?\s*;?\s*$/i;
const DETECT = /^\s*(strict\s+)?(digraph|graph)\b[^\n]*\{/im;
/** `subgraph cluster_x {` — klastrem jest tylko podgraf o nazwie `cluster*`. */
const SUBGRAPH = /^\s*subgraph\s+("[^"]*"|[A-Za-z0-9_]+)\s*\{\s*$/i;
const CLOSE = /^\s*\}\s*;?\s*$/;
const RANKDIR = /^\s*rankdir\s*=\s*"?(TB|BT|LR|RL)"?\s*;?\s*$/i;
/** `label="Warstwa danych";` w ciele klastra. */
const GROUP_LABEL = /^\s*label\s*=\s*("(?:[^"\\]|\\.)*"|[A-Za-z0-9_]+)\s*;?\s*$/i;
/** Ustawienia domyślne całych zakresów — rozumie je Graphviz, my nie. */
const SCOPE_DEFAULTS = /^\s*(node|edge|graph)\s*\[/i;

/*
 * Identyfikator **bez grupy przechwytującej**: wchodzi do trzech wzorców, a
 * grupa w środku przesuwałaby numerację wszystkiego, co po nim — co objawia się
 * tym, że atrybuty krawędzi „czytają się" jako nazwa węzła.
 *
 * Ostatnia alternatywa (nazwa nieoczekiwana) wyklucza `=`, żeby `overlap=false`
 * nie zostało wzięte za deklarację węzła. Ustawienia grafu mają wyglądać na
 * ustawienia i trafiać do `unknown`.
 */
const ID = '(?:"(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_]*|-?[0-9.]+|[^\\s\\->;=\\[\\]{}]+)';
/** `A -> B -> C [attrs];` albo `A -- B;` */
const EDGE = new RegExp(`^\\s*(${ID})((?:\\s*(?:->|--)\\s*${ID})+)\\s*(\\[[^\\]]*\\])?\\s*;?\\s*$`);
/** `A [label="x", shape=box];` */
const NODE_DECL = new RegExp(`^\\s*(${ID})\\s*(\\[[^\\]]*\\])\\s*;?\\s*$`);
/** Samotny identyfikator w instrukcji: `Baza;` (średnik bywa pominięty przed `}`). */
const BARE_NODE = new RegExp(`^\\s*(${ID})\\s*;?\\s*$`);

/** Kształty Graphviza, które mają odpowiednik w modelu. */
const SHAPES: Record<string, NodeShape> = {
  box: 'rectangle', rect: 'rectangle', rectangle: 'rectangle', square: 'rectangle', plaintext: 'rectangle',
  ellipse: 'stadium', oval: 'stadium',
  circle: 'circle', doublecircle: 'doubleCircle', point: 'circle',
  diamond: 'rhombus', mdiamond: 'rhombus',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
  trapezium: 'trapezoid',
  note: 'asymmetric',
  box3d: 'subroutine', component: 'subroutine',
};

/** Odwrotność `SHAPES` — pierwsze trafienie wygrywa, bo kilka nazw znaczy to samo. */
const SHAPE_NAMES: Partial<Record<NodeShape, string>> = {
  rectangle: 'box', stadium: 'ellipse', circle: 'circle', doubleCircle: 'doublecircle',
  rhombus: 'diamond', hexagon: 'hexagon', cylinder: 'cylinder',
  parallelogram: 'parallelogram', trapezoid: 'trapezium', asymmetric: 'note',
  subroutine: 'box3d',
};

/** Zdejmuje cudzysłowy i odwraca sekwencje ucieczki. */
function unquote(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('"')) return text;
  return text.slice(1, -1).replace(/\\(.)/g, '$1');
}

/** Cytuje identyfikator, jeśli DOT tego wymaga. */
function quoteId(id: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) ? id : `"${id.replace(/(["\\])/g, '\\$1')}"`;
}

function quoteValue(value: string): string {
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

/**
 * Rozbiera `[label="a, b", shape=box]`.
 *
 * Przecinek rozdziela pary **poza cudzysłowem** — inaczej etykieta „Kawa,
 * herbata" rozpadłaby się na dwa atrybuty, z których drugi byłby bez sensu.
 */
export function parseAttrs(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const body = raw.trim().replace(/^\[|\]$/g, '');
  const out: Record<string, string> = {};

  let key = '';
  let value = '';
  let quoted = false;
  let afterEquals = false;

  const flush = () => {
    const k = key.trim().toLowerCase();
    if (k) out[k] = unquote(value.trim());
    key = '';
    value = '';
    afterEquals = false;
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === '\\' && quoted) { value += char + (body[i + 1] ?? ''); i += 1; continue; }
    if (char === '"') { quoted = !quoted; (afterEquals ? (value += char) : (key += char)); continue; }
    if (!quoted && char === '=') { afterEquals = true; continue; }
    if (!quoted && (char === ',' || char === ';')) { flush(); continue; }
    if (afterEquals) value += char;
    else key += char;
  }
  flush();
  return out;
}

function lineStyleOf(style: string | undefined): EdgeLineStyle {
  if (!style) return 'solid';
  if (/dashed|dotted/i.test(style)) return 'dotted';
  if (/bold/i.test(style)) return 'thick';
  return 'solid';
}

/**
 * Rozbija źródło na „po jednej rzeczy w linii".
 *
 * Parser jest liniowy, a DOT wcale nie musi być: `digraph { A -> B -> C; }`
 * w jednej linii jest równie poprawne jak rozpisane na pięć. Pliki z narzędzi
 * bywają jedno- i wieloliniowe, więc zamiast przepisywać parser na tokeny
 * normalizujemy wejście: łamiemy po `{`, przed `}` i po `;`.
 *
 * Łamanie omija cudzysłowy — `label="Kawa; herbata"` musi zostać w całości,
 * inaczej średnik w etykiecie rozcinałby ją na dwie nieistniejące instrukcje.
 */
export function splitStatements(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '\\' && quoted) { current += char + (text[i + 1] ?? ''); i += 1; continue; }
    if (char === '"') { quoted = !quoted; current += char; continue; }

    if (!quoted && (char === '{' || char === ';')) {
      current += char;
      out.push(current);
      current = '';
      continue;
    }
    if (!quoted && char === '}') {
      if (current.trim()) out.push(current);
      out.push('}');
      current = '';
      continue;
    }
    if (!quoted && char === '\n') {
      if (current.trim()) out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current);
  return out;
}

export function parseDot(text: string): ParseResult {
  const lines = splitStatements(text);
  const issues: ParseIssue[] = [];

  const header = lines.find((line) => HEADER.test(line) || DETECT.test(line));
  const directed = !/^\s*(strict\s+)?graph\b/i.test(header ?? 'digraph');

  const doc = emptyDiagram('flowchart', 'TB');
  doc.meta = { dotDirected: directed ? 'true' : 'false' };

  /** Stos otwartych klastrów — DOT dopuszcza zagnieżdżenie. */
  const stack: string[] = [];
  let seenHeader = false;
  let groupCounter = 0;

  const ensureNode = (id: string): DiagramNode => {
    const istniejacy = doc.nodes.find((n) => n.id === id);
    if (istniejacy) return istniejacy;
    const node: DiagramNode = {
      id,
      label: '',
      shape: 'rectangle',
      ...(stack.length ? { parentId: stack[stack.length - 1] } : {}),
    };
    doc.nodes.push(node);
    return node;
  };

  const applyNodeAttrs = (node: DiagramNode, attrs: Record<string, string>) => {
    if (attrs.label !== undefined) node.label = attrs.label;
    const shape = SHAPES[attrs.shape?.toLowerCase() ?? ''];
    if (shape) node.shape = shape;
  };

  // `index` numeruje **instrukcje po normalizacji**, nie linie oryginału.
  // Dla `unknown` to bez znaczenia: zapis stawia je na początku ciała, bo
  // ustawienia DOT-a obowiązują od miejsca deklaracji w dół.
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Komentarze DOT-a: `//`, `#` oraz jednolinijkowe `/* */`.
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || /^\/\*.*\*\/$/.test(trimmed)) return;

    if (!seenHeader && (HEADER.test(line) || DETECT.test(line))) { seenHeader = true; return; }

    const rankdir = RANKDIR.exec(trimmed);
    if (rankdir) { doc.direction = rankdir[1].toUpperCase() as DiagramDirection; return; }

    const subgraph = SUBGRAPH.exec(trimmed);
    if (subgraph) {
      const nazwa = unquote(subgraph[1]);
      // Podgraf bez przedrostka `cluster` nie rysuje ramki — dla Graphviza to
      // wyłącznie grupowanie ustawień, więc grupą go nie robimy.
      if (!/^cluster/i.test(nazwa)) { doc.unknown.push({ index, text: line }); stack.push(''); return; }
      groupCounter += 1;
      const id = nazwa || `cluster_${groupCounter}`;
      doc.groups.push({
        id, label: '',
        ...(stack.length && stack[stack.length - 1] ? { parentId: stack[stack.length - 1] } : {}),
      });
      stack.push(id);
      return;
    }

    if (CLOSE.test(trimmed)) {
      if (stack.length) stack.pop();
      return;
    }

    // `label=` w ciele klastra opisuje klaster; poza nim jest tytułem grafu.
    const groupLabel = GROUP_LABEL.exec(trimmed);
    if (groupLabel) {
      const wartosc = unquote(groupLabel[1]);
      const biezacy = stack[stack.length - 1];
      if (biezacy) {
        const group = doc.groups.find((g) => g.id === biezacy);
        if (group) group.label = wartosc;
      } else {
        doc.title = wartosc;
      }
      return;
    }

    if (SCOPE_DEFAULTS.test(trimmed)) { doc.unknown.push({ index, text: line }); return; }

    const edge = EDGE.exec(trimmed);
    if (edge) {
      const attrs = parseAttrs(edge[3]);
      // `A -> B -> C` to łańcuch odcinków; rozwijamy go na pary.
      const konce = [unquote(edge[1]), ...edge[2].split(/->|--/).map(unquote).filter(Boolean)];
      for (let i = 0; i < konce.length - 1; i += 1) {
        const from = ensureNode(konce[i]);
        const to = ensureNode(konce[i + 1]);
        doc.edges.push({
          id: edgeId(doc, from.id, to.id),
          source: from.id,
          target: to.id,
          lineStyle: lineStyleOf(attrs.style),
          arrow: directed ? 'arrow' : 'none',
          ...(attrs.label ? { label: attrs.label } : {}),
        });
      }
      return;
    }

    const decl = NODE_DECL.exec(trimmed);
    if (decl) {
      applyNodeAttrs(ensureNode(unquote(decl[1])), parseAttrs(decl[2]));
      return;
    }

    const bare = BARE_NODE.exec(trimmed);
    if (bare) { ensureNode(unquote(bare[1])); return; }

    doc.unknown.push({ index, text: line });
  });

  return { document: doc, issues };
}

export function serializeDot(doc: DiagramDocument): string {
  const directed = doc.meta?.dotDirected !== 'false';
  const strzalka = directed ? '->' : '--';
  const out: string[] = [`${directed ? 'digraph' : 'graph'} {`];

  if (doc.direction !== 'TB') out.push(`  rankdir=${doc.direction};`);
  if (doc.title) out.push(`  label=${quoteValue(doc.title)};`);

  // Nierozpoznane linie wracają na początek ciała: to prawie zawsze ustawienia
  // (`node [...]`, `overlap`), które w DOT-cie obowiązują od miejsca deklaracji.
  for (const line of [...doc.unknown].sort((a, b) => a.index - b.index)) {
    out.push(`  ${line.text.trim()}`);
  }

  const nodeLine = (node: DiagramNode, indent: string): string | undefined => {
    const attrs: string[] = [];
    if (node.label) attrs.push(`label=${quoteValue(node.label)}`);
    const shape = SHAPE_NAMES[node.shape];
    if (shape && shape !== 'box') attrs.push(`shape=${shape}`);
    if (attrs.length === 0) return undefined;
    return `${indent}${quoteId(node.id)} [${attrs.join(', ')}];`;
  };

  for (const group of doc.groups) {
    // Przedrostek `cluster` jest obowiązkowy — bez niego Graphviz nie narysuje ramki.
    const id = /^cluster/i.test(group.id) ? group.id : `cluster_${group.id}`;
    out.push(`  subgraph ${quoteId(id)} {`);
    if (group.label) out.push(`    label=${quoteValue(group.label)};`);
    for (const node of doc.nodes.filter((n) => n.parentId === group.id)) {
      out.push(nodeLine(node, '    ') ?? `    ${quoteId(node.id)};`);
    }
    out.push('  }');
  }

  for (const node of doc.nodes) {
    if (node.parentId) continue;
    const line = nodeLine(node, '  ');
    if (line) out.push(line);
  }

  for (const edge of doc.edges) {
    const attrs: string[] = [];
    if (edge.label) attrs.push(`label=${quoteValue(edge.label)}`);
    if (edge.lineStyle === 'dotted') attrs.push('style=dashed');
    if (edge.lineStyle === 'thick') attrs.push('style=bold');
    const ogon = attrs.length ? ` [${attrs.join(', ')}]` : '';
    out.push(`  ${quoteId(edge.source)} ${strzalka} ${quoteId(edge.target)}${ogon};`);
  }

  out.push('}');
  return out.join('\n');
}

export const dotFormat: DiagramFormat = {
  id: 'dot',
  label: 'DOT (Graphviz)',
  kinds: ['flowchart'],

  detect(text) {
    return DETECT.test(text) ? 0.9 : 0;
  },

  parse: parseDot,
  serialize: serializeDot,
};
