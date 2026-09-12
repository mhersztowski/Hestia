/**
 * Adapter formatu Mermaid — wejście i wyjście dla modelu diagramu.
 *
 * Rozpoznaje rodzaj po nagłówku i deleguje do parsera właściwego dla niego.
 * Kolejne rodzaje (sequence, class, ER) dokłada się tutaj, bez ruszania modelu
 * ani edytorów.
 */
import type { DiagramDocument } from '../../model/diagram';
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

const FLOWCHART_HEADER = /^\s*(?:flowchart|graph)\b/im;
const STATE_HEADER = /^\s*stateDiagram(?:-v2)?\b/im;
const CLASS_HEADER = /^\s*classDiagram(?:-v2)?\b/im;
const SEQUENCE_HEADER = /^\s*sequenceDiagram\b/im;
const ER_HEADER = /^\s*erDiagram\b/im;
const PACKET_HEADER = /^\s*packet(-beta)?\s*$/im;
const KANBAN_HEADER = /^\s*kanban\s*$/im;
const GANTT_HEADER = /^\s*gantt\s*$/im;
const TIMELINE_HEADER = /^\s*timeline\s*$/im;
const C4_HEADER = /^\s*C4(Context|Container|Component|Dynamic|Deployment)\s*$/im;

export const mermaidFormat: DiagramFormat = {
  id: 'mermaid',
  label: 'Mermaid',
  kinds: ['flowchart', 'state', 'class', 'sequence', 'er', 'packet', 'kanban', 'gantt', 'timeline', 'c4'],

  detect(text) {
    if (C4_HEADER.test(text)) return 0.95;
    if (TIMELINE_HEADER.test(text)) return 0.95;
    if (GANTT_HEADER.test(text)) return 0.95;
    if (KANBAN_HEADER.test(text)) return 0.95;
    if (PACKET_HEADER.test(text)) return 0.95;
    if (ER_HEADER.test(text)) return 0.95;
    if (SEQUENCE_HEADER.test(text)) return 0.95;
    if (CLASS_HEADER.test(text)) return 0.95;
    if (STATE_HEADER.test(text)) return 0.95;
    if (FLOWCHART_HEADER.test(text)) return 0.9;
    return 0;
  },

  parse(text): ParseResult {
    if (C4_HEADER.test(text)) return parseC4Diagram(text);
    if (TIMELINE_HEADER.test(text)) return parseTimelineDiagram(text);
    if (GANTT_HEADER.test(text)) return parseGanttDiagram(text);
    if (KANBAN_HEADER.test(text)) return parseKanbanDiagram(text);
    if (PACKET_HEADER.test(text)) return parsePacketDiagram(text);
    if (ER_HEADER.test(text)) return parseErDiagram(text);
    if (SEQUENCE_HEADER.test(text)) return parseSequenceDiagram(text);
    if (CLASS_HEADER.test(text)) return parseClassDiagram(text);
    if (STATE_HEADER.test(text)) return parseStateDiagram(text);
    if (FLOWCHART_HEADER.test(text)) return parseFlowchart(text);
    // Bez nagłówka zakładamy flowchart — to najczęstszy przypadek świeżo
    // wklejonego fragmentu, a parser i tak zachowa nierozpoznane linie.
    return parseFlowchart(text);
  },

  serialize(doc: DiagramDocument): string {
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
