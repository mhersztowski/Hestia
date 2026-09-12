/**
 * diagrams — graficzny edytor diagramów.
 *
 * Jedno z narzędzi pakietu `web-devtools`, w całości zamknięte w tym katalogu:
 *   • `model/`   — neutralny model diagramu (niezależny od składni),
 *   • `formats/` — adaptery formatów (Mermaid, a w przyszłości kolejne),
 *   • `editor/`  — edytory graficzne (React Flow; canvas tam, gdzie graf nie wystarczy).
 *
 * Mermaid jest jednym z formatów, a nie modelem danych — dołożenie PlantUML-a
 * czy własnego JSON-a sprowadza się do nowego adaptera.
 *
 * Import: `@hestia/ui-devtools/diagrams` (albo z korzenia pakietu, który
 * re-eksportuje to API dla wygody).
 */
export type {
  DiagramDocument, DiagramNode, DiagramEdge, DiagramGroup, DiagramKind,
  DiagramDirection, NodeShape, EdgeArrowType, EdgeLineStyle, UnknownLine,
  ClassMember, MemberVisibility, ClassRelationKind,
  EntityAttribute, EntityKey, ErCardinality,
} from './model/diagram';
export { emptyDiagram, findNode, uniqueNodeId, edgeId, removeNode } from './model/diagram';

export type { DiagramFormat, ParseResult, ParseIssue } from './model/format';
export { DiagramFormatRegistry, diagramFormats } from './model/format';

export {
  addNode, setNodeLabel, setNodeShape, setEdgeLabel, connect, removeEdge, renameNode, baseNameFor,
  addGroup, setGroupLabel, setGroupSize, setGroupPosition, removeGroup, moveNodeToGroup, resetLayout, mergeLayout,
  setEdgeStyle, reverseEdge, setNodeName,
} from './model/operations';
export type { AddNodeOptions, AddGroupOptions, EdgeStylePatch } from './model/operations';

export {
  addMember, updateMember, removeMember, moveMember, setStereotype, formatMember, emptyMember,
} from './model/classMembers';

export {
  addAttribute, updateAttribute, toggleAttributeKey, removeAttribute, moveAttribute,
  formatAttribute, emptyAttribute,
} from './model/entityAttributes';

export {
  classRelations, relationOf, setEdgeRelation, swapRelationSides,
  RELATION_LOOK, RELATION_MEANING, CLASS_RELATION_KINDS,
} from './model/classRelations';
export type { ClassRelationView, RelationLook } from './model/classRelations';

export {
  emptySequence, isBlock, participantsUsed, stepsAt, stepAt,
} from './model/sequence';
export type {
  SequenceScript, SequenceStep, SequenceMessage, SequenceNote, SequenceBlock,
  SequenceParticipant, SequenceArrow, SequenceBlockKind, SequenceSection, StepPath,
} from './model/sequence';
export { layoutSequence } from './model/sequenceLayout';
export type { SequenceLayout } from './model/sequenceLayout';
export {
  insertStep, insertIntoSection, removeStep, updateStep, moveStep, newBlock, addSection,
  addParticipant, updateParticipant, renameParticipant, removeParticipant, setAutonumber,
} from './model/sequenceOps';

export {
  emptyPacket, fieldWidth, packetSize, validatePacket, DEFAULT_BITS_PER_ROW,
} from './model/packet';
export type { PacketSpec, PacketField, PacketIssue, PacketIssueKind } from './model/packet';
export { layoutPacket } from './model/packetLayout';
export type { PacketLayout } from './model/packetLayout';
export {
  addPacketField, updatePacketField, removePacketField, resizePacketField,
  movePacketField, setPacketTitle,
} from './model/packetOps';

export { emptyKanban, cardCount, isPriority, KANBAN_PRIORITIES } from './model/kanban';
export type { KanbanBoard, KanbanColumn, KanbanCard, KanbanPriority } from './model/kanban';
export {
  addColumn, updateColumn, removeColumn, moveColumn,
  addCard, updateCard, removeCard, moveCard, moveCardToColumn,
} from './model/kanbanOps';

export { emptyGantt, ganttTasks, findTaskById, taskCount, isMilestone, GANTT_TAGS } from './model/gantt';
export type { GanttChart, GanttSection, GanttTask, GanttTag, GanttStart, GanttEnd } from './model/gantt';
export { scheduleGantt, parseDateWithFormat, parseDuration, placedCount, referenceableIds } from './model/ganttSchedule';
export type { GanttSchedule, ScheduledTask, ScheduledSection } from './model/ganttSchedule';
export { layoutGantt, pickTickStep } from './model/ganttLayout';
export type { GanttLayout, GanttRow, GanttBar, GanttTick } from './model/ganttLayout';
// Nazwy z przedrostkiem: `addSection` należy już do diagramu sekwencji, a
// „sekcja" znaczy w obu co innego.
export {
  addSection as addGanttSection,
  updateSection as updateGanttSection,
  removeSection as removeGanttSection,
  moveSection as moveGanttSection,
  addTask as addGanttTask,
  updateTask as updateGanttTask,
  toggleTag as toggleGanttTag,
  removeTask as removeGanttTask,
  moveTask as moveGanttTask,
  moveTaskToSection as moveGanttTaskToSection,
  setGanttSetting,
} from './model/ganttOps';

export { emptyTimeline, periodCount, eventCount } from './model/timeline';
export type { Timeline, TimelineSection, TimelinePeriod } from './model/timeline';
export {
  addTimelineSection, updateTimelineSection, removeTimelineSection, moveTimelineSection,
  addPeriod, updatePeriod, removePeriod, movePeriod, movePeriodToSection,
  addEvent, updateEvent, removeEvent, moveEvent, setTimelineTitle,
} from './model/timelineOps';

export {
  c4CallName, c4BoundaryCallName, hasTechnology,
  C4_ELEMENT_KINDS, C4_VARIANTS, C4_BOUNDARY_KINDS, C4_DIAGRAM_KINDS, C4_KIND_LABEL,
} from './model/c4';
export type {
  C4NodeInfo, C4BoundaryInfo, C4RelInfo, C4ElementKind, C4Variant, C4BoundaryKind,
} from './model/c4';

export { setC4Info, setC4Boundary, setC4Rel, withC4Kind } from './model/c4Ops';

export { DIAGRAM_STARTERS, starterDiagram } from './model/starters';
export type { DiagramStarter } from './model/starters';

export { estimateNodeSize } from './model/nodeSize';

export { autoLayout, computeRanks } from './model/layout';
export type { LayoutOptions } from './model/layout';

export { mermaidFormat, parseFlowchart, serializeFlowchart, parseStateDiagram, serializeStateDiagram } from './formats/mermaid';
export { readSectionLines, writeSectionLines } from './formats/mermaid/layoutFrontMatter';
export { splitFrontMatter, withFrontMatter } from './formats/mermaid/frontMatter';

// Most do projektów UML (`*.umlproj.json`) — wejście dla importu z kodu
// źródłowego i wyjście dla strony Programming → UML.
export {
  umlDiagramToDocument, documentToUmlDiagram, parseUmlMember, formatUmlMember,
} from './formats/uml/umlProject';
export { umlProjectFormat } from './formats/uml/umlFormat';
export { dotFormat, parseDot, serializeDot } from './formats/dot';
export { plantUmlFormat, parsePlantUml, serializePlantUml } from './formats/plantuml';
export type {
  UmlDiagramLike, UmlNodeLike, UmlEdgeLike, UmlMemberLike, UmlNodeDataLike, UmlKind, UmlRelType,
} from './formats/uml/umlProject';

export { DiagramEditor } from './editor/DiagramEditor';
export type { DiagramEditorProps } from './editor/DiagramEditor';
export { diagramNodeTypes } from './editor/nodes';
export { diagramEdgeTypes } from './editor/edges';
export { DiagramMarkers, markerFor } from './editor/markers';
export { EdgeStyleBar } from './editor/EdgeStyleBar';
export { TimelineEditor } from './editor/TimelineEditor';
export type { TimelineEditorProps } from './editor/TimelineEditor';
export { GanttEditor } from './editor/GanttEditor';
export type { GanttEditorProps } from './editor/GanttEditor';
export { GanttView } from './editor/GanttView';
export { KanbanEditor } from './editor/KanbanEditor';
export type { KanbanEditorProps } from './editor/KanbanEditor';
export { PacketEditor } from './editor/PacketEditor';
export type { PacketEditorProps } from './editor/PacketEditor';
export { PacketView } from './editor/PacketView';
export { SequenceEditor } from './editor/SequenceEditor';
export type { SequenceEditorProps } from './editor/SequenceEditor';
export { SequenceView } from './editor/SequenceView';
export { EntityNodeView } from './editor/EntityNodeView';
export { C4NodeView } from './editor/C4NodeView';
export { C4SpecPanel } from './editor/C4SpecPanel';
export type { C4SpecPanelProps } from './editor/C4SpecPanel';
export { ClassSpecPanel } from './editor/ClassSpecPanel';
export { EntitySpecPanel } from './editor/EntitySpecPanel';
export type { EntitySpecPanelProps } from './editor/EntitySpecPanel';
export type { ClassSpecPanelProps } from './editor/ClassSpecPanel';
export type { EdgeStyleBarProps } from './editor/EdgeStyleBar';
export { InlineLabel } from './editor/InlineLabel';
export { resolveInlineEdit, inlineEditKey } from './editor/inlineEdit';
export { toFlowNodes, toFlowEdges, applyFlowPositions } from './editor/flowBridge';
export type { FlowNodeData, FlowEdgeData } from './editor/flowBridge';

import { diagramFormats } from './model/format';
import { mermaidFormat } from './formats/mermaid';
import { umlProjectFormat } from './formats/uml/umlFormat';
import { dotFormat } from './formats/dot';
import { plantUmlFormat } from './formats/plantuml';

// Formaty wbudowane rejestrują się przy imporcie pakietu, więc host dostaje
// działający `diagramFormats.detect()` bez dodatkowej konfiguracji.
diagramFormats.register(mermaidFormat);
diagramFormats.register(umlProjectFormat);
diagramFormats.register(dotFormat);
diagramFormats.register(plantUmlFormat);
