/**
 * flowBridge.ts — tłumaczenie modelu diagramu na dane React Flow i z powrotem.
 *
 * Warstwa jest cienka i **bez Reacta**, żeby dało się ją przetestować bez DOM-u:
 * to tutaj najłatwiej zgubić pole modelu (etykietę krawędzi, przynależność do
 * grupy), a taki błąd objawia się dopiero jako zniknięcie danych po zapisie.
 *
 * React Flow jest tu tylko widokiem — źródłem prawdy pozostaje
 * {@link DiagramDocument}.
 */
import type { CSSProperties } from 'react';
import { MarkerType, type Edge, type EdgeMarker, type Node } from '@xyflow/react';
import type { ClassMember, DiagramDocument, DiagramEdge, DiagramNode, EntityAttribute } from '../model/diagram';
import { estimateNodeSize } from '../model/nodeSize';
import { assignEdgeAnchors } from '../model/edgeAnchors';
import type { C4NodeInfo } from '../model/c4';
import { MARKER_COLOR, markerFor, erMarkerFor } from './markers';

/** Dane węzła przekazywane do komponentu React Flow. */
export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  shape: DiagramNode['shape'];
  /** Podpis pokazywany, gdy węzeł nie ma etykiety — wtedy rysujemy id. */
  fallback: string;
  /** Zapis etykiety edytowanej wprost na diagramie (dwuklik). */
  onRename?: (id: string, label: string) => void;
  /** `false` w podglądzie tylko do odczytu. */
  editable?: boolean;
  /** Składowe klasy — rysowane w sekcjach pól i metod (diagram klas). */
  members?: ClassMember[];
  /** Adnotacja «interface», «abstract». */
  stereotype?: string;
  /** Atrybuty encji (diagram ER). */
  attributes?: EntityAttribute[];
  /** Znaczenie elementu C4 — rodzaj, wariant, technologia, opis. */
  c4?: C4NodeInfo;
}

export interface FlowBuildOptions {
  onRenameNode?: (id: string, label: string) => void;
  onRenameGroup?: (id: string, label: string) => void;
  onRelabelEdge?: (id: string, label: string) => void;
  editable?: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
  lineStyle: DiagramEdge['lineStyle'];
  arrow: DiagramEdge['arrow'];
  /** Link `~~~` — w Mermaidzie niewidoczny, w edytorze rysowany na blado. */
  invisible?: boolean;
  /** Zapis opisu przejścia edytowanego na linii. */
  onRelabel?: (id: string, label: string) => void;
  editable?: boolean;
  /** Numer wśród krawędzi łączących tę samą parę węzłów (od 0). */
  parallelIndex: number;
  /** Ile krawędzi łączy tę parę — razem z tą. */
  parallelCount: number;
  /** Krotność przy źródle (UML). */
  sourceLabel?: string;
  /** Krotność przy celu (UML). */
  targetLabel?: string;
}

/** Kształty rysowane jako małe punkty (pseudostany diagramu stanów). */
const DOT_SHAPES = new Set<DiagramNode['shape']>(['start', 'end']);

/**
 * Rozmiar pudełka w postaci stylu CSS — dokładnie ten, który zna układ.
 *
 * `display: flex` nie jest ozdobą: wnętrze węzła rysuje kształt jako SVG
 * rozpięty na `inset: 0`, a procent wysokości nie działa względem rodzica, który
 * ma tylko `min-height`. Bez rozciągnięcia flexem kształt brał wysokość samego
 * tekstu i koło wychodziło płaską elipsą mimo kwadratowego węzła.
 */
function sizeStyle(node: DiagramNode): CSSProperties {
  const { width, height } = estimateNodeSize(node);
  return { width, minHeight: height, display: 'flex' };
}

export function toFlowNodes(doc: DiagramDocument, options: FlowBuildOptions = {}): Node<FlowNodeData>[] {
  const groupIds = new Set(doc.groups.map((g) => g.id));

  const groupNodes: Node<FlowNodeData>[] = doc.groups.map((group) => ({
    id: group.id,
    type: 'diagramGroup',
    position: group.position ?? { x: 0, y: 0 },
    data: {
      label: group.label, shape: 'rectangle', fallback: group.id,
      onRename: options.onRenameGroup, editable: options.editable !== false,
    },
    // Rozmiar musi trafić do `style`: React Flow nie wylicza go z dzieci, a bez
    // niego ramka ma zerową wysokość i `fitView` liczy obszar z samych dzieci.
    style: { width: group.size?.width ?? 200, height: group.size?.height ?? 140 },
    ...(group.parentId && groupIds.has(group.parentId)
      ? { parentId: group.parentId, extent: 'parent' as const }
      : {}),
  }));

  const nodes: Node<FlowNodeData>[] = doc.nodes.map((node) => ({
    id: node.id,
    // Klasa ma własny widok: nagłówek + sekcje pól i metod. Rozpoznajemy ją po
    // obecności ciała, nie po rodzaju dokumentu — dzięki temu ten sam widok
    // zadziała, gdy inny format też przyniesie składowe.
    type: DOT_SHAPES.has(node.shape) ? 'diagramPseudo'
      : node.c4 ? 'diagramC4'
        : node.attributes ? 'diagramEntity'
          : node.members ? 'diagramClass'
            : 'diagramNode',
    position: node.position ?? { x: 0, y: 0 },
    data: {
      label: node.label, shape: node.shape, fallback: node.id,
      onRename: options.onRenameNode, editable: options.editable !== false,
      ...(node.members ? { members: node.members } : {}),
      ...(node.stereotype ? { stereotype: node.stereotype } : {}),
      ...(node.attributes ? { attributes: node.attributes } : {}),
      ...(node.c4 ? { c4: node.c4 } : {}),
    },
    // Ta sama miara co w układzie — inaczej pudełko na ekranie byłoby innego
    // rozmiaru niż miejsce, które dla niego zarezerwowano, i sąsiedzi by się
    // nakładali mimo poprawnie policzonych odstępów.
    //
    // Wysokość idzie jako `minHeight`, nie `height`: kształty wpisane (koło,
    // romb, walec) muszą dostać pełną wysokość z układu, bo inaczej koło wychodzi
    // spłaszczoną elipsą — a jednocześnie tekst dłuższy od szacunku ma pudełko
    // rozepchnąć, nie zostać ucięty.
    style: DOT_SHAPES.has(node.shape) ? undefined : sizeStyle(node),
    // React Flow wymaga, by rodzic istniał — grupa spoza modelu zerwałaby render.
    // Świadomie BEZ `extent: 'parent'`: ramka bywa ciasno dopasowana do
    // zawartości, więc ograniczenie do rodzica sprawiało, że węzeł „nie chciał
    // się ruszyć". Bez niego stan da się też po prostu wyciągnąć z ramki.
    ...(node.parentId && groupIds.has(node.parentId) ? { parentId: node.parentId } : {}),
  }));

  // Grupy muszą poprzedzać swoje dzieci, inaczej React Flow zgłasza błąd rodzica.
  return [...groupNodes, ...nodes];
}

/** Zakończenie krawędzi w postaci, którą rozumie React Flow. */
function endMarker(arrow: DiagramEdge['arrow']): EdgeMarker | string | undefined {
  if (arrow === 'arrow') {
    return { type: MarkerType.ArrowClosed, width: 18, height: 18, color: MARKER_COLOR };
  }
  return markerFor(arrow);
}

export function toFlowEdges(doc: DiagramDocument, options: FlowBuildOptions = {}): Edge<FlowEdgeData>[] {
  // Przejścia tam i z powrotem (`Idle --> Praca` i `Praca --> Idle`) biegną tą
  // samą trasą, więc ich opisy lądowały jeden na drugim i robiły się
  // nieczytelne. Numerujemy je w obrębie pary, żeby widok mógł je rozsunąć.
  const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');
  const total = new Map<string, number>();
  for (const edge of doc.edges) {
    const key = pairKey(edge.source, edge.target);
    total.set(key, (total.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  // Punkty zaczepienia rozłożone po bokach — bez nich wszystkie relacje węzła
  // wychodzą z jednego miejsca i zlewają się w wachlarz.
  const anchors = assignEdgeAnchors(doc);

  return doc.edges.map((edge) => {
    const key = pairKey(edge.source, edge.target);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(anchors.get(edge.id)
        ? { sourceHandle: anchors.get(edge.id)!.source, targetHandle: anchors.get(edge.id)!.target }
        : {}),
      label: edge.label,
      // Własny typ — daje etykietę edytowaną wprost na linii. Musi być
      // zarejestrowany w `edgeTypes`, inaczej React Flow cofa się do domyślnego.
      type: 'diagramEdge',
      animated: edge.lineStyle === 'dotted',
      // Zakończenie linii: strzałka ma gotowy typ w React Flow, kółko i krzyżyk
      // mają własne markery. Bez tego wszystkie krawędzie były gołymi liniami i
      // nie było widać kierunku przepływu.
      // Diagram ER ma własne zakończenia (liczebność), a nie groty.
      markerEnd: edge.erTo ? erMarkerFor(edge.erTo) : endMarker(edge.arrow),
      // Zakończenie po stronie źródła (`<-->`, `o--o`, `x--x`). Markery mają
      // `orient="auto-start-reverse"`, więc ten sam kształt obraca się sam.
      ...(edge.erFrom
        ? { markerStart: erMarkerFor(edge.erFrom) }
        : edge.meta?.startArrow
          ? { markerStart: endMarker(edge.meta.startArrow as DiagramEdge['arrow']) }
          : {}),
      data: {
        lineStyle: edge.lineStyle,
        arrow: edge.arrow,
        // `~~~` nie rysuje linii w Mermaidzie, ale w edytorze musi zostać
        // widoczny — inaczej nie da się go zaznaczyć ani usunąć.
        ...(edge.meta?.invisible === 'true' ? { invisible: true } : {}),
        onRelabel: options.onRelabelEdge,
        editable: options.editable !== false,
        parallelIndex: index,
        parallelCount: total.get(key) ?? 1,
        ...(edge.sourceLabel ? { sourceLabel: edge.sourceLabel } : {}),
        ...(edge.targetLabel ? { targetLabel: edge.targetLabel } : {}),
      },
    };
  });
}

/**
 * Przenosi pozycje z React Flow do modelu.
 *
 * Tylko pozycje — reszta zmian (etykiety, kształty, nowe krawędzie) idzie przez
 * jawne operacje na modelu, żeby widok nigdy nie nadpisał danych, których nie
 * reprezentuje.
 */
export function applyFlowPositions(doc: DiagramDocument, nodes: Node<FlowNodeData>[]): DiagramDocument {
  const positions = new Map(nodes.map((n) => [n.id, n.position]));
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const pos = positions.get(node.id);
      return pos ? { ...node, position: { x: Math.round(pos.x), y: Math.round(pos.y) } } : node;
    }),
  };
}
