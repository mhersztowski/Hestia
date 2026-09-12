/**
 * Adapter formatu Mermaid — wejście i wyjście dla modelu diagramu.
 *
 * Rozpoznaje rodzaj po nagłówku i deleguje do parsera właściwego dla niego.
 * Kolejne rodzaje (sequence, class, ER) dokłada się tutaj, bez ruszania modelu
 * ani edytorów.
 */
import { emptyDiagram, type DiagramDocument } from '../../model/diagram';
import type { DiagramFormat, ParseResult } from '../../model/format';
import { parseFlowchart, serializeFlowchart } from './flowchart';
import { parseStateDiagram, serializeStateDiagram } from './state';
import { parseClassDiagram, serializeClassDiagram } from './classDiagram';
import { parseSequenceDiagram, serializeSequenceDiagram } from './sequenceDiagram';
import { parseErDiagram, serializeErDiagram } from './erDiagram';
import { parsePacketDiagram, serializePacketDiagram } from './packetDiagram';
import { parseKanbanDiagram, serializeKanbanDiagram } from './kanbanDiagram';
import { parseGanttDiagram, serializeGanttDiagram } from './ganttDiagram';
import { parseTimelineDiagram, serializeTimelineDiagram } from './timelineDiagram';
import { parseC4Diagram, serializeC4Diagram } from './c4Diagram';
import { readPositions, writePositions, type LayoutMap } from './layoutFrontMatter';

/**
 * Nakłada układ zapisany we front matterze na świeżo sparsowany dokument.
 *
 * Robimy to **tutaj**, a nie w parserach poszczególnych rodzajów: układ jest
 * własnością diagramu, a nie jego składni, więc dziesięć adapterów nie musi
 * o nim wiedzieć. Ta sama zasada działa w drugą stronę przy zapisie.
 */
function applyStoredLayout(doc: DiagramDocument): DiagramDocument {
  const stored = readPositions(doc.meta?.frontMatter ?? '');
  if (Object.keys(stored).length === 0) return doc;

  for (const node of doc.nodes) {
    const box = stored[node.id];
    // Pozycja z modelu ma pierwszeństwo: parser rodzaju mógł ją wyliczyć ze
    // składni, która współrzędne jednak niesie.
    if (box && !node.position) node.position = { x: box.x, y: box.y };
  }
  for (const group of doc.groups) {
    const box = stored[group.id];
    if (!box) continue;
    if (!group.position) group.position = { x: box.x, y: box.y };
    if (!group.size && box.width !== undefined && box.height !== undefined) {
      group.size = { width: box.width, height: box.height };
    }
  }
  return doc;
}

/** Układ do zapisania — tylko elementy, które faktycznie mają pozycję. */
function collectLayout(doc: DiagramDocument): LayoutMap {
  const out: LayoutMap = {};
  for (const node of doc.nodes) {
    if (node.position) out[node.id] = { x: node.position.x, y: node.position.y };
  }
  for (const group of doc.groups) {
    if (!group.position) continue;
    out[group.id] = group.size
      ? { ...group.position, width: group.size.width, height: group.size.height }
      : { ...group.position };
  }
  return out;
}

/**
 * Dokument z układem wpisanym do front mattera.
 *
 * Kopia, a nie mutacja: `serialize` nie ma prawa zmieniać dokumentu, który
 * dostał — host trzyma go w stanie Reacta i cicha podmiana `meta` skończyłaby
 * się renderem z nieaktualnymi danymi.
 */
function withStoredLayout(doc: DiagramDocument): DiagramDocument {
  const frontMatter = writePositions(doc.meta?.frontMatter, collectLayout(doc));
  if (frontMatter === doc.meta?.frontMatter) return doc;

  const meta = { ...doc.meta };
  if (frontMatter) meta.frontMatter = frontMatter;
  else delete meta.frontMatter;
  return { ...doc, meta: Object.keys(meta).length > 0 ? meta : undefined };
}

/**
 * Nagłówki rodzajów, które Mermaid zna, a my nie umiemy edytować.
 *
 * Lista jest jawna, bo różnica między „nie ma nagłówka" a „jest nagłówek,
 * którego nie obsługujemy" decyduje o tym, czy wolno zgadywać. Pierwszy
 * przypadek to świeżo wklejony fragment i domysł jest uprzejmy; drugi to
 * wyraźna deklaracja autora i domysł jest jej zignorowaniem.
 */
const UNSUPPORTED_HEADERS: Array<[name: string, header: RegExp]> = [
  ['pie', /^\s*pie\b/im],
  ['mindmap', /^\s*mindmap\s*$/im],
  ['journey', /^\s*journey\s*$/im],
  ['gitGraph', /^\s*gitGraph\b/im],
  ['quadrantChart', /^\s*quadrantChart\b/im],
  ['requirementDiagram', /^\s*requirementDiagram\b/im],
  ['sankey', /^\s*sankey(-beta)?\s*$/im],
  ['xychart', /^\s*xychart(-beta)?\b/im],
  ['block', /^\s*block(-beta)?\s*$/im],
  ['architecture', /^\s*architecture(-beta)?\s*$/im],
  ['radar', /^\s*radar(-beta)?\b/im],
  ['treemap', /^\s*treemap(-beta)?\b/im],
  ['zenuml', /^\s*zenuml\s*$/im],
];

/** Rodzaj spoza obsługiwanych albo `undefined`. */
function unsupportedKind(text: string): string | undefined {
  return UNSUPPORTED_HEADERS.find(([, header]) => header.test(text))?.[0];
}

/**
 * Dokument dla rodzaju, którego nie umiemy edytować.
 *
 * Całe źródło ląduje w `unknown`, więc zapis oddaje je linia po linii. Model
 * zna wtedy jedną prawdę: to nie jest flowchart i nie ma tu czego rysować.
 */
function unsupportedResult(text: string, kind: string): ParseResult {
  const doc = emptyDiagram('flowchart');
  doc.unsupported = kind;
  doc.unknown = text.split('\n').map((line, index) => ({ index, text: line }));
  return {
    document: doc,
    issues: [{
      message: `Diagram „${kind}" da się obejrzeć, ale nie da się go edytować graficznie — `
        + 'ten rodzaj nie ma jeszcze modelu w edytorze.',
    }],
  };
}

const FLOWCHART_HEADER = /^\s*(?:flowchart|graph)\b/im;
/**
 * Nagłówek DOT-a, który wygląda jak nagłówek Mermaida.
 *
 * `graph G {` to Graphviz, a `graph TD` to Mermaid — słowo jest to samo,
 * różnicę robi klamra. Bez tego rozróżnienia oba adaptery zgłaszały tę samą
 * pewność i wygrywał zarejestrowany wcześniej, czyli przypadek.
 */
const DOT_HEADER = /^\s*(?:strict\s+)?(?:di)?graph\b[^\n]*\{/im;
const STATE_HEADER = /^\s*stateDiagram(?:-v2)?\b/im;
const CLASS_HEADER = /^\s*classDiagram(?:-v2)?\b/im;
const SEQUENCE_HEADER = /^\s*sequenceDiagram\b/im;
const ER_HEADER = /^\s*erDiagram\b/im;
const PACKET_HEADER = /^\s*packet(-beta)?\s*$/im;
const KANBAN_HEADER = /^\s*kanban\s*$/im;
const GANTT_HEADER = /^\s*gantt\s*$/im;
const TIMELINE_HEADER = /^\s*timeline\s*$/im;
const C4_HEADER = /^\s*C4(Context|Container|Component|Dynamic|Deployment)\s*$/im;

/** Rozbiór właściwy dla rodzaju z nagłówka. */
function parseByHeader(text: string): ParseResult {
  if (C4_HEADER.test(text)) return parseC4Diagram(text);
  if (TIMELINE_HEADER.test(text)) return parseTimelineDiagram(text);
  if (GANTT_HEADER.test(text)) return parseGanttDiagram(text);
  if (KANBAN_HEADER.test(text)) return parseKanbanDiagram(text);
  if (PACKET_HEADER.test(text)) return parsePacketDiagram(text);
  if (ER_HEADER.test(text)) return parseErDiagram(text);
  if (SEQUENCE_HEADER.test(text)) return parseSequenceDiagram(text);
  if (CLASS_HEADER.test(text)) return parseClassDiagram(text);
  if (STATE_HEADER.test(text)) return parseStateDiagram(text);
  // Bez nagłówka zakładamy flowchart — to najczęstszy przypadek świeżo
  // wklejonego fragmentu, a parser i tak zachowa nierozpoznane linie.
  return parseFlowchart(text);
}

export const mermaidFormat: DiagramFormat = {
  id: 'mermaid',
  label: 'Mermaid',
  kinds: ['flowchart', 'state', 'class', 'sequence', 'er', 'packet', 'kanban', 'gantt', 'timeline', 'c4'],

  detect(text) {
    // Rozpoznanie mówi „to jest Mermaid", a nie „umiem to edytować" — pasek ma
    // pokazać właściwą nazwę formatu także wtedy, gdy edycja jest zamknięta.
    if (unsupportedKind(text)) return 0.95;
    if (C4_HEADER.test(text)) return 0.95;
    if (TIMELINE_HEADER.test(text)) return 0.95;
    if (GANTT_HEADER.test(text)) return 0.95;
    if (KANBAN_HEADER.test(text)) return 0.95;
    if (PACKET_HEADER.test(text)) return 0.95;
    if (ER_HEADER.test(text)) return 0.95;
    if (SEQUENCE_HEADER.test(text)) return 0.95;
    if (CLASS_HEADER.test(text)) return 0.95;
    if (STATE_HEADER.test(text)) return 0.95;
    if (DOT_HEADER.test(text)) return 0;
    if (FLOWCHART_HEADER.test(text)) return 0.9;
    return 0;
  },

  parse(text): ParseResult {
    const nieobslugiwany = unsupportedKind(text);
    if (nieobslugiwany) return unsupportedResult(text, nieobslugiwany);

    const result = parseByHeader(text);
    return { ...result, document: applyStoredLayout(result.document) };
  },

  serialize(input: DiagramDocument): string {
    // Dokumentu, którego nie rozumiemy, nie przepisujemy — oddajemy źródło.
    if (input.unsupported) return input.unknown.map((line) => line.text).join('\n');

    const doc = withStoredLayout(input);
    if (doc.kind === 'c4') return serializeC4Diagram(doc);
    if (doc.kind === 'timeline') return serializeTimelineDiagram(doc);
    if (doc.kind === 'gantt') return serializeGanttDiagram(doc);
    if (doc.kind === 'kanban') return serializeKanbanDiagram(doc);
    if (doc.kind === 'packet') return serializePacketDiagram(doc);
    if (doc.kind === 'er') return serializeErDiagram(doc);
    if (doc.kind === 'sequence') return serializeSequenceDiagram(doc);
    if (doc.kind === 'class') return serializeClassDiagram(doc);
    if (doc.kind === 'state') return serializeStateDiagram(doc);
    return serializeFlowchart(doc);
  },
};

export { parseFlowchart, serializeFlowchart } from './flowchart';
export { parseStateDiagram, serializeStateDiagram } from './state';
export { parseClassDiagram, serializeClassDiagram, parseMember } from './classDiagram';
export { parseSequenceDiagram, serializeSequenceDiagram } from './sequenceDiagram';
export { parseErDiagram, serializeErDiagram, parseAttribute } from './erDiagram';
export { parsePacketDiagram, serializePacketDiagram } from './packetDiagram';
export { parseKanbanDiagram, serializeKanbanDiagram, parseCardMeta } from './kanbanDiagram';
export { parseGanttDiagram, serializeGanttDiagram, parseTaskData, serializeTaskData } from './ganttDiagram';
export { parseTimelineDiagram, serializeTimelineDiagram } from './timelineDiagram';
export { parseC4Diagram, serializeC4Diagram, splitArgs } from './c4Diagram';
