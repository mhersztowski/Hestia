/**
 * DiagramEditor — graficzna edycja diagramu na React Flow.
 *
 * Komponent operuje wyłącznie na {@link DiagramDocument}: nie zna Mermaida ani
 * żadnej innej składni. Format wchodzi i wychodzi w komponencie nadrzędnym
 * (patrz `DiagramBlockView`), więc ten sam edytor obsłuży kolejne języki bez
 * jednej zmiany.
 *
 * Zmiany idą przez jawne operacje z `model/operations` i są wypychane w górę
 * przez `onChange` — historia (undo) należy do hosta, bo to on wie, co jest
 * dokumentem.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, ConnectionMode,
  useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { removeNode, type ClassRelationKind, type DiagramDocument, type NodeShape } from '../model/diagram';
import {
  addNode, addGroup, connect, moveNodeToGroup, removeEdge, removeGroup, renameNode, resetLayout,
  setEdgeLabel, setGroupLabel, setGroupPosition, setGroupSize, spotForNewNode,
  setEdgeStyle, reverseEdge, setNodeName, type EdgeStylePatch,
} from '../model/operations';
import { addMember, updateMember, removeMember, moveMember, setStereotype } from '../model/classMembers';
import { setEdgeRelation, swapRelationSides } from '../model/classRelations';
import {
  addAttribute, updateAttribute, toggleAttributeKey, removeAttribute, moveAttribute,
} from '../model/entityAttributes';
import { autoLayout } from '../model/layout';
import { applyFlowPositions, toFlowEdges, toFlowNodes, type FlowEdgeData, type FlowNodeData } from './flowBridge';
import { diagramNodeTypes } from './nodes';
import { diagramEdgeTypes } from './edges';
import { DiagramMarkers } from './markers';
import { EdgeStyleBar } from './EdgeStyleBar';
import { ClassSpecPanel } from './ClassSpecPanel';
import { EntitySpecPanel } from './EntitySpecPanel';
import { C4SpecPanel } from './C4SpecPanel';
import { setC4Info, withC4Kind } from '../model/c4Ops';
import type { C4NodeInfo } from '../model/c4';

export interface DiagramEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  /** Kształty oferowane przy dodawaniu węzła — domyślnie zależne od rodzaju diagramu. */
  palette?: Array<{ shape: NodeShape; label: string }>;
  readOnly?: boolean;
  height?: number | string;
}

const FLOWCHART_PALETTE: Array<{ shape: NodeShape; label: string }> = [
  { shape: 'rectangle', label: 'Proces' },
  { shape: 'rounded', label: 'Zaokrąglony' },
  { shape: 'stadium', label: 'Start/Stop' },
  { shape: 'rhombus', label: 'Decyzja' },
  { shape: 'circle', label: 'Punkt' },
  { shape: 'cylinder', label: 'Dane' },
];

const ER_PALETTE: Array<{ shape: NodeShape; label: string }> = [
  { shape: 'rectangle', label: 'Encja' },
];

const CLASS_PALETTE: Array<{ shape: NodeShape; label: string }> = [
  { shape: 'rectangle', label: 'Klasa' },
];

/**
 * W C4 o elemencie decyduje rodzaj, nie kształt — wszystkie są prostokątami.
 * Paleta niesie więc dodatkowo `c4`, którym uzupełniamy świeżo dodany węzeł.
 */
const C4_PALETTE: Array<{ shape: NodeShape; label: string; c4: Partial<C4NodeInfo> }> = [
  { shape: 'rectangle', label: 'Osoba', c4: { kind: 'person' } },
  { shape: 'rectangle', label: 'System', c4: { kind: 'system' } },
  { shape: 'rectangle', label: 'Kontener', c4: { kind: 'container' } },
  { shape: 'rectangle', label: 'Komponent', c4: { kind: 'component' } },
  { shape: 'rectangle', label: 'Baza', c4: { kind: 'system', variant: 'db' } },
  { shape: 'rectangle', label: 'Zewnętrzny', c4: { kind: 'system', external: true } },
];

const STATE_PALETTE: Array<{ shape: NodeShape; label: string }> = [
  { shape: 'rectangle', label: 'Stan' },
  { shape: 'start', label: 'Start [*]' },
  { shape: 'end', label: 'Koniec [*]' },
  { shape: 'choice', label: 'Wybór' },
  { shape: 'fork', label: 'Rozgałęzienie' },
  { shape: 'join', label: 'Złączenie' },
];

/**
 * Dopasowanie widoku po każdej zmianie struktury diagramu.
 *
 * `fitView` na `<ReactFlow>` działa tylko przy pierwszym renderze — i to zanim
 * węzły zostaną zmierzone, więc przy diagramie wyższym niż okno widok zostawał
 * przybliżony i użytkownik widział sam jego wierzchołek. Hook `useReactFlow`
 * wymaga kontekstu, dlatego siedzi w komponencie-dziecku `<ReactFlow>`.
 */
/**
 * Dopasowanie widoku — wyłącznie wtedy, gdy dokument przyszedł Z ZEWNĄTRZ.
 *
 * Wcześniej sygnaturą była liczba węzłów i krawędzi, więc każde dodanie stanu
 * czy połączenia przerzucało widok na pełny diagram — w środku pracy wyglądało
 * to jak przypadkowy skok. Teraz odświeżamy kadr przy wejściu w edycję i przy
 * podmianie dokumentu (inny diagram, cofnięcie, edycja kodu), a własne zmiany
 * zostawiają kadr w spokoju.
 */
/** Ile milisekund po interakcji użytkownika kadr pozostaje nietykalny. */
const INTERACTION_GUARD_MS = 1200;

function FitViewOnExternalChange({ token, lastInteraction, paneRef }: {
  token: number;
  lastInteraction: React.MutableRefObject<number>;
  /** Kontener TEGO edytora — patrz komentarz przy obserwatorze rozmiaru. */
  paneRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  // `useReactFlow()` oddaje NOWY obiekt przy każdym renderze, więc `fitView` w
  // tablicy zależności odpalałby efekt bez końca: dopasowanie zmienia widok →
  // render → dopasowanie. Objawiało się to skakaniem kadru w trakcie edycji, a
  // przy większych diagramach przepełnieniem stosu. Trzymamy instancję w ref i
  // zależymy wyłącznie od tokenu.
  const instance = useReactFlow();
  const instanceRef = useRef(instance);
  instanceRef.current = instance;

  const fit = useCallback((force = false) => {
    // Dopasowanie tuż po kliknięciu czy geście użytkownik odbiera jako „widok
    // sam ucieka". Wymuszamy je tylko wtedy, gdy sam o nie poprosił
    // (przełączenie diagramu, „Ułóż") — automatyczne czeka na spokój.
    if (!force && Date.now() - lastInteraction.current < INTERACTION_GUARD_MS) return;
    // `minZoom` jest konieczne: React Flow domyślnie nie schodzi poniżej 0.5,
    // więc diagram większy od dwukrotności okna zostawał obcięty.
    instanceRef.current.fitView({ padding: 0.15, minZoom: MIN_ZOOM });
  }, [lastInteraction]);

  // Zmiana rozmiaru kontenera (rozwinięcie panelu, obrót telefonu) nie przelicza
  // widoku sama z siebie — diagram zostaje w starej skali, zgubiony w rogu.
  useEffect(() => {
    // Własny kontener, nie `document.querySelector('.react-flow')`: ten drugi
    // zwraca PIERWSZY diagram na stronie. W edytorze markdown, gdzie bloków
    // bywa kilka, obserwowaliśmy cudzy element — więc nasz nigdy nie dostawał
    // dopasowania i po wejściu w „Edit" płótno zostawało nieułożone, dopóki nie
    // przełączyło się na „Code" i z powrotem.
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === 'undefined') return;

    // Obserwator zgłasza się też przy podłączeniu i przy zmianach o pojedyncze
    // piksele (zaznaczenie węzła, pasek przewijania). Każde takie zgłoszenie
    // przestawiało kadr w środku pracy, więc reagujemy dopiero na zmianę, która
    // realnie unieważnia dopasowanie.
    const MIN_CHANGE_PX = 24;
    let known = { width: pane.clientWidth, height: pane.clientHeight };
    let timer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      // Przejście z zerowego rozmiaru to PIERWSZY prawdziwy pomiar — węzły
      // dopiero teraz da się zmierzyć, więc kadr trzeba ustawić bezwarunkowo.
      const pierwszyPomiar = (known.width === 0 || known.height === 0) && box.width > 0 && box.height > 0;
      if (!pierwszyPomiar
        && Math.abs(box.width - known.width) < MIN_CHANGE_PX
        && Math.abs(box.height - known.height) < MIN_CHANGE_PX) return;
      known = { width: box.width, height: box.height };

      clearTimeout(timer);
      timer = setTimeout(() => {
        // Przesunięcie widoku w trakcie gestu wyrywa element spod kursora.
        if (pane.querySelector('.react-flow__node.dragging')) return;
        fit(pierwszyPomiar);
      }, pierwszyPomiar ? 60 : 150);
    });
    observer.observe(pane);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [fit, paneRef]);

  useEffect(() => {
    // Dwa podejścia, bo React Flow mierzy węzły dopiero po wstawieniu do DOM:
    // pierwsze łapie typowy przypadek, drugie diagramy z ramkami, których
    // rozmiar ustala się o klatkę później.
    // Zmiana tokenu to zawsze świadome żądanie kadru — stąd `force`.
    const frame = requestAnimationFrame(() => fit(true));
    const late = setTimeout(() => fit(true), 250);
    return () => { cancelAnimationFrame(frame); clearTimeout(late); };
  }, [token, fit]);

  return null;
}

/**
 * Dolna granica skali. Domyślne 0.5 React Flow oznacza, że diagram dwa razy
 * większy od okna nigdy się nie zmieści — a automat stanów z kilkoma stanami
 * złożonymi łatwo tę granicę przekracza.
 */
const MIN_ZOOM = 0.05;

/** Od tylu elementów miniaturka zaczyna się przydawać. */
const MINIMAP_FROM_NODES = 12;

/**
 * Widoczny wycinek diagramu w jego własnych współrzędnych.
 *
 * Potrzebny, żeby nowe elementy trafiały tam, gdzie użytkownik patrzy — a nie
 * w lewy górny róg całego diagramu, często poza kadrem.
 */
function visibleArea(instance: ReturnType<typeof useReactFlow>, pane: Element | null) {
  const rect = pane?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0, width: 800, height: 600 };
  const topLeft = instance.screenToFlowPosition({ x: rect.left, y: rect.top });
  const bottomRight = instance.screenToFlowPosition({ x: rect.right, y: rect.bottom });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(bottomRight.x - topLeft.x, 100),
    height: Math.max(bottomRight.y - topLeft.y, 100),
  };
}

const btn: React.CSSProperties = {
  fontSize: 12, padding: '3px 8px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer',
};

function DiagramEditorInner({ document: doc, onChange, palette, readOnly, height = 460 }: DiagramEditorProps) {
  const instance = useReactFlow();
  const paneRef = useRef<HTMLDivElement | null>(null);
  const shapes = palette
    ?? (doc.kind === 'state' ? STATE_PALETTE
      : doc.kind === 'class' ? CLASS_PALETTE
        : doc.kind === 'er' ? ER_PALETTE
          : doc.kind === 'c4' ? C4_PALETTE
            : FLOWCHART_PALETTE);

  // Układ uzupełnia tylko brakujące pozycje, więc przeciągnięte węzły zostają
  // tam, gdzie postawił je użytkownik.
  const laidOut = useMemo(() => autoLayout(doc), [doc]);
  /** Ostatni dokument wysłany przez nas — służy do odróżnienia zmian własnych od zewnętrznych. */
  const emittedRef = useRef<DiagramDocument | null>(null);
  /** Kiedy użytkownik ostatnio coś zrobił — chroni kadr przed automatycznym dopasowaniem. */
  const lastInteractionRef = useRef(0);
  const emit = useCallback((next: DiagramDocument) => {
    emittedRef.current = next;
    lastInteractionRef.current = Date.now();
    onChange(next);
  }, [onChange]);

  // Licznik rośnie tylko wtedy, gdy dokument NIE pochodzi z naszej ostatniej zmiany.
  const [fitToken, setFitToken] = useState(0);
  useEffect(() => {
    if (emittedRef.current === doc) return;
    emittedRef.current = doc;
    setFitToken((t) => t + 1);
  }, [doc]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Widok ma WŁASNY stan węzłów. Przepisywanie modelu przy każdej klatce
  // przeciągania (a React Flow zgłasza zmianę pozycji kilkadziesiąt razy na
  // sekundę) przeliczało układ i podstawiało nowe obiekty węzłów, przez co
  // biblioteka gubiła uchwyt przeciągania — element „uciekał" spod kursora i
  // trudno było cokolwiek zaznaczyć. Do modelu zapisujemy dopiero na koniec
  // gestu (`onNodeDragStop`).
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(toFlowNodes(laidOut));
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(toFlowEdges(laidOut));

  // Zapis tekstu edytowanego wprost na diagramie. Trzymane w ref, żeby zmiana
  // dokumentu nie wymuszała przebudowy wszystkich węzłów przy każdym renderze.
  const docRef = useRef(laidOut);
  docRef.current = laidOut;
  const buildOptions = useMemo(() => ({
    editable: !readOnly,
    onRenameNode: (id: string, label: string) => emit(setNodeName(docRef.current, id, label)),
    onRenameGroup: (id: string, label: string) => emit(setGroupLabel(docRef.current, id, label)),
    onRelabelEdge: (id: string, label: string) => emit(setEdgeLabel(docRef.current, id, label)),
  }), [emit, readOnly]);

  // Zmiana dokumentu z zewnątrz (wpisanie kodu, cofnięcie, operacja z paska)
  // odświeża widok. W trakcie przeciągania `doc` się nie zmienia, więc ten
  // efekt nie przerywa gestu.
  useEffect(() => {
    // Zaznaczenie przenosimy na nowe obiekty: bez tego każda operacja (zmiana
    // etykiety, dodanie połączenia) odznaczała element, przez co znikały
    // uchwyty ramki i trzeba było klikać od nowa.
    setNodes((previous) => {
      const selected = new Set(previous.filter((n) => n.selected).map((n) => n.id));
      return toFlowNodes(laidOut, buildOptions).map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    });
    setEdges((previous) => {
      const selected = new Set(previous.filter((e) => e.selected).map((e) => e.id));
      return toFlowEdges(laidOut, buildOptions).map((e) => (selected.has(e.id) ? { ...e, selected: true } : e));
    });
  }, [laidOut, buildOptions, setNodes, setEdges]);

  const node = selectedNode ? laidOut.nodes.find((n) => n.id === selectedNode) : undefined;
  const edge = selectedEdge ? laidOut.edges.find((e) => e.id === selectedEdge) : undefined;
  const group = selectedGroup ? laidOut.groups.find((g) => g.id === selectedGroup) : undefined;

  const isGroup = useCallback((id: string) => laidOut.groups.some((g) => g.id === id), [laidOut.groups]);

  const handleNodesChange = useCallback((changes: NodeChange<Node<FlowNodeData>>[]) => {
    // Najpierw widok — płynność gestu zależy od tego, że nic go nie przerywa.
    onNodesChangeInternal(changes);
    if (changes.some((c) => c.type === 'select' || c.type === 'position')) {
      lastInteractionRef.current = Date.now();
    }

    for (const change of changes) {
      if (change.type === 'select') {
        const groupSelected = isGroup(change.id);
        if (change.selected) {
          setSelectedGroup(groupSelected ? change.id : null);
          setSelectedNode(groupSelected ? null : change.id);
          setSelectedEdge(null);
        } else if (groupSelected ? selectedGroup === change.id : selectedNode === change.id) {
          if (groupSelected) setSelectedGroup(null); else setSelectedNode(null);
        }
      }
      // Rozmiar ramki ustala się jednym gestem uchwytu i nie leci klatka po
      // klatce z całą resztą, więc zapisujemy go od razu.
      if (change.type === 'dimensions' && change.dimensions && change.resizing === false && isGroup(change.id)) {
        emit(setGroupSize(laidOut, change.id, change.dimensions));
      }
    }
  }, [onNodesChangeInternal, isGroup, laidOut, emit, selectedGroup, selectedNode]);

  /** Koniec przeciągania — dopiero teraz pozycje trafiają do modelu. */
  const handleNodeDragStop = useCallback((_: unknown, dragged: Node<FlowNodeData>, alsoDragged: Node<FlowNodeData>[]) => {
    const moved = alsoDragged?.length ? alsoDragged : [dragged];
    let next = laidOut;
    for (const item of moved) {
      if (isGroup(item.id)) next = setGroupPosition(next, item.id, item.position);
    }
    next = applyFlowPositions(next, moved.filter((n) => !isGroup(n.id)));
    emit(next);
  }, [laidOut, isGroup, emit]);

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge<FlowEdgeData>>[]) => {
    onEdgesChangeInternal(changes);
    for (const change of changes) {
      if (change.type === 'remove') emit(removeEdge(laidOut, change.id));
      if (change.type === 'select') {
        setSelectedEdge(change.selected ? change.id : null);
        if (change.selected) { setSelectedNode(null); setSelectedGroup(null); }
      }
    }
  }, [onEdgesChangeInternal, laidOut, emit]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    emit(connect(laidOut, connection.source, connection.target));
  }, [laidOut, emit]);

  const handleAdd = useCallback((shape: NodeShape, c4?: Partial<C4NodeInfo>) => {
    const spot = spotForNewNode(laidOut, visibleArea(instance, paneRef.current));
    const added = addNode(laidOut, shape, { position: spot });
    // Rodzaj C4 dokładamy po dodaniu — `addNode` zna tylko kształty, wspólne
    // dla wszystkich diagramów.
    emit(c4 ? withC4Kind(added, c4) : added);
  }, [laidOut, emit, instance]);

  const editNodeId = useCallback(() => {
    if (!node) return;
    const next = window.prompt('Identyfikator (nazwa w kodzie diagramu)', node.id);
    if (next !== null) emit(renameNode(laidOut, node.id, next));
  }, [node, laidOut, emit]);

  const addGroupWithSelection = useCallback(() => {
    // Zaznaczony węzeł od razu wchodzi do nowej ramki — najczęstszy scenariusz
    // to „zamknij ten stan w złożonym".
    // Ramka bez zawartości też musi trafić w kadr; z zawartością pozycję
    // wyznaczy układ, bo musi objąć przeniesione węzły.
    const spot = selectedNode ? undefined : spotForNewNode(laidOut, visibleArea(instance, paneRef.current), { width: 200, height: 140 });
    emit(addGroup(laidOut, { members: selectedNode ? [selectedNode] : [], ...(spot ? { position: spot } : {}) }));
  }, [laidOut, selectedNode, emit]);

  const moveSelectedToGroup = useCallback(() => {
    if (!node) return;
    const options = laidOut.groups.map((g) => g.id);
    if (!options.length) {
      window.alert(laidOut.kind === 'state'
        ? 'Nie ma jeszcze żadnego stanu złożonego — dodaj go przyciskiem „+ Stan złożony".'
        : 'Nie ma jeszcze żadnego podgrafu — dodaj go przyciskiem „+ Podgraf".');
      return;
    }
    const answer = window.prompt(
      `Do której ramki przenieść „${node.id}"? Puste = wyjmij na zewnątrz.\nDostępne: ${options.join(', ')}`,
      node.parentId ?? options[0],
    );
    if (answer === null) return;
    emit(moveNodeToGroup(laidOut, node.id, answer.trim() || undefined));
  }, [node, laidOut, emit]);

  // Panel specyfikacji otwiera się na żądanie: przy zaznaczeniu klasy pokazuje
  // się sam, ale da się go zamknąć, gdy zasłania diagram.
  // Zamknięcie panelu jest TRWAŁE: otwierał się przy każdym zaznaczeniu i
  // zasłaniał płótno, przez co nie dawało się złapać tabelki, żeby ją przesunąć.
  // Wraca dopiero na żądanie — przyciskiem w pasku.
  const [specClosed, setSpecClosed] = useState(false);
  /**
   * Otwarcie i zamknięcie panelu zmienia szerokość płótna, a to budzi
   * obserwatora rozmiaru. Oznaczamy je jako interakcję użytkownika, żeby kadr
   * został tam, gdzie był — przeskok w tym momencie wygląda jak błąd.
   */
  const setSpecOpen = useCallback((open: boolean) => {
    lastInteractionRef.current = Date.now();
    setSpecClosed(!open);
  }, []);
  const closeSpec = useCallback(() => setSpecOpen(false), [setSpecOpen]);
  const classNode = node?.members ? node : undefined;
  const entityNode = node?.attributes ? node : undefined;
  const c4Node = node?.c4 ? node : undefined;

  const changeC4 = useCallback((patch: Partial<C4NodeInfo>) => {
    if (!c4Node) return;
    emit(setC4Info(laidOut, c4Node.id, patch));
  }, [c4Node, laidOut, emit]);
  const showSpec = !readOnly && (classNode || entityNode || c4Node) && !specClosed;

  const addClassMember = useCallback((kind: 'field' | 'method') => {
    if (!selectedNode) return;
    emit(addMember(laidOut, selectedNode, kind));
  }, [selectedNode, laidOut, emit]);

  const updateClassMember = useCallback((index: number, patch: Parameters<typeof updateMember>[3]) => {
    if (!selectedNode) return;
    emit(updateMember(laidOut, selectedNode, index, patch));
  }, [selectedNode, laidOut, emit]);

  const removeClassMember = useCallback((index: number) => {
    if (!selectedNode) return;
    emit(removeMember(laidOut, selectedNode, index));
  }, [selectedNode, laidOut, emit]);

  const moveClassMember = useCallback((from: number, to: number) => {
    if (!selectedNode) return;
    emit(moveMember(laidOut, selectedNode, from, to));
  }, [selectedNode, laidOut, emit]);

  const changeStereotype = useCallback((value: string) => {
    if (!selectedNode) return;
    emit(setStereotype(laidOut, selectedNode, value));
  }, [selectedNode, laidOut, emit]);

  const addEntityAttribute = useCallback(() => {
    if (!selectedNode) return;
    emit(addAttribute(laidOut, selectedNode));
  }, [selectedNode, laidOut, emit]);

  const updateEntityAttribute = useCallback((index: number, patch: Parameters<typeof updateAttribute>[3]) => {
    if (!selectedNode) return;
    emit(updateAttribute(laidOut, selectedNode, index, patch));
  }, [selectedNode, laidOut, emit]);

  const toggleEntityKey = useCallback((index: number, key: Parameters<typeof toggleAttributeKey>[3]) => {
    if (!selectedNode) return;
    emit(toggleAttributeKey(laidOut, selectedNode, index, key));
  }, [selectedNode, laidOut, emit]);

  const removeEntityAttribute = useCallback((index: number) => {
    if (!selectedNode) return;
    emit(removeAttribute(laidOut, selectedNode, index));
  }, [selectedNode, laidOut, emit]);

  const moveEntityAttribute = useCallback((from: number, to: number) => {
    if (!selectedNode) return;
    emit(moveAttribute(laidOut, selectedNode, from, to));
  }, [selectedNode, laidOut, emit]);

  const changeRelation = useCallback((relation: ClassRelationKind) => {
    if (!selectedEdge) return;
    emit(setEdgeRelation(laidOut, selectedEdge, relation));
  }, [selectedEdge, laidOut, emit]);

  const swapSides = useCallback(() => {
    if (!selectedEdge) return;
    emit(swapRelationSides(laidOut, selectedEdge));
  }, [selectedEdge, laidOut, emit]);

  const changeEdgeStyle = useCallback((patch: EdgeStylePatch) => {
    if (!selectedEdge) return;
    emit(setEdgeStyle(laidOut, selectedEdge, patch));
  }, [selectedEdge, laidOut, emit]);

  const reverseSelectedEdge = useCallback(() => {
    if (!selectedEdge) return;
    emit(reverseEdge(laidOut, selectedEdge));
  }, [selectedEdge, laidOut, emit]);

  const deleteSelection = useCallback(() => {
    if (selectedEdge) { emit(removeEdge(laidOut, selectedEdge)); setSelectedEdge(null); return; }
    if (selectedGroup) { emit(removeGroup(laidOut, selectedGroup)); setSelectedGroup(null); return; }
    if (selectedNode) { emit(removeNode(laidOut, selectedNode)); setSelectedNode(null); }
  }, [selectedEdge, selectedGroup, selectedNode, laidOut, emit]);

  const relayout = useCallback(() => {
    // Zrzucamy zapisany układ (węzły i ramki) i liczymy od zera — „posprzątaj".
    emit(autoLayout(resetLayout(laidOut)));
    // Po ręcznym uporządkowaniu kadr wolno przestawić — o to właśnie prosi klik.
    setFitToken((t) => t + 1);
  }, [laidOut, emit]);

  const hint = selectedEdge ? 'Zaznaczone połączenie'
    : selectedGroup ? `Ramka: ${selectedGroup} — przeciągnij rogi, aby zmienić rozmiar`
      : selectedNode ? `Zaznaczony: ${selectedNode}`
        : 'Przeciągnij od kropki na krawędzi węzła do drugiego węzła, aby połączyć';

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {shapes.map((s) => (
              <button
                key={s.label}
                type="button"
                style={btn}
                onClick={() => handleAdd(s.shape, (s as { c4?: Partial<C4NodeInfo> }).c4)}
                title={`Dodaj: ${s.label}`}
              >
                + {s.label}
              </button>
            ))}
            {/* Mermaid nie zna grup w diagramie klas — przycisk obiecywałby
                strukturę, której zapis nie utrzyma. */}
            {doc.kind !== 'class' && doc.kind !== 'er' && (
              <button type="button" style={btn} onClick={addGroupWithSelection}
                title={doc.kind === 'state' ? 'Nowy stan złożony (ramka); zaznaczony stan wejdzie do środka'
                  : doc.kind === 'c4' ? 'Nowa granica (ramka); zaznaczony element wejdzie do środka'
                    : 'Nowy podgraf (ramka)'}>
                + {doc.kind === 'state' ? 'Stan złożony' : doc.kind === 'c4' ? 'Granica' : 'Podgraf'}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" style={btn} onClick={relayout} title="Ułóż diagram od nowa">Ułóż</button>
          </div>

          {/* Druga linia dotyczy zaznaczenia — przyciski są aktywne dokładnie
              wtedy, gdy mają na czym działać, więc nie trzeba zgadywać. */}
          {/* W pasku zostają wyłącznie przyciski — jego wysokość nie może
              zależeć od zaznaczenia. Wszystko, co zmienia się wraz z nim
              (podpowiedź, ustawienia połączenia), leży na nakładce nad płótnem:
              każda zmiana wysokości paska kurczy płótno, a to przelicza kadr —
              widać to jako przeskok widoku przy zwykłym kliknięciu. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>
            {/* Etykiety edytuje się klikając tekst na diagramie — w pasku zostaje
                tylko to, czego na płótnie nie widać (identyfikator) i operacje. */}
            <button type="button" style={btn} onClick={editNodeId} disabled={!node}>Nazwa (id)</button>
            {/* Przenoszenie do ramki ma sens tylko tam, gdzie ramki istnieją —
                w diagramie klas i ER Mermaid ich nie zna, więc przycisk
                obiecywałby operację niemożliwą do wykonania. */}
            {doc.kind !== 'class' && doc.kind !== 'er' && (
              <button
                type="button"
                style={btn}
                onClick={moveSelectedToGroup}
                disabled={!node}
                title={doc.kind === 'state'
                  ? 'Przenieś zaznaczony stan do stanu złożonego (dodasz go przyciskiem „+ Stan złożony")'
                  : 'Przenieś zaznaczony węzeł do podgrafu (dodasz go przyciskiem „+ Podgraf")'}
              >
                {doc.kind === 'state' ? 'Przenieś do stanu' : 'Przenieś do podgrafu'}
              </button>
            )}
            <button type="button" style={btn} onClick={deleteSelection} disabled={!node && !edge && !group}>Usuń</button>
            {/* Panel specyfikacji przywołuje się jawnie — po zamknięciu nie
                wraca sam, żeby nie zasłaniał diagramu przy każdym kliknięciu. */}
            {(classNode || entityNode || c4Node) && specClosed && (
              <button type="button" style={btn} onClick={() => setSpecOpen(true)}>
                {entityNode ? 'Atrybuty' : c4Node ? 'Opis elementu' : 'Składowe'}
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }} ref={paneRef}>
        {/* Definicje markerów muszą być w DOM-ie, zanim krawędź się do nich odwoła. */}
        <DiagramMarkers />

        {/* Nakładka stanu zaznaczenia: pasek krawędzi albo panel specyfikacji.
            Leży NAD płótnem, więc nie zmienia jego wymiarów i nie przestawia
            kadru. Zdarzenia łapie wyłącznie widoczne pudełko — obok niego
            płótno pozostaje dostępne, a sam panel da się zamknąć na stałe
            (wraca przyciskiem „Atrybuty"/„Składowe"). */}
        {!readOnly && (
          <div
            className="nodrag nopan"
            onClick={(e) => e.stopPropagation()}
            style={{
              // Bez `right` nakładka jest szeroka na tyle, ile trzeba: przy
              // panelu specyfikacji zostawia resztę płótna wolną, więc węzły
              // obok da się chwycić i przesunąć.
              position: 'absolute', top: 8, left: 8, maxWidth: 'calc(100% - 16px)', zIndex: 5,
              display: 'flex', alignItems: showSpec ? 'stretch' : 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              // Sama podpowiedź nie może przechwytywać kliknięć w diagram pod
              // spodem; pasek ustawień musi — stąd różnica.
              // Nakładka rozciąga się na całą szerokość, ale przechwytywać
              // zdarzenia ma tylko jej widoczna część — inaczej blokowałaby
              // przeciąganie węzłów leżących obok panelu.
              pointerEvents: 'none',
              border: edge || showSpec ? '1px solid #e2e8f0' : '1px solid transparent',
              background: edge || showSpec ? 'rgba(248,250,252,0.97)' : 'transparent',
              ...(edge || showSpec ? { boxShadow: '0 1px 4px rgba(15,23,42,0.08)' } : {}),
            }}
          >
            {/* Wewnętrzne pudełko przyjmuje kliknięcia; tło nakładki nie. */}
            {/* Bez `flex: 1` pudełko ma szerokość swojej zawartości, więc
                obszar obok panelu zostaje przezroczysty dla kliknięć i węzły
                pod nim da się chwycić. */}
            <div style={{ pointerEvents: edge || showSpec ? 'auto' : 'none', minWidth: 0 }}>
            {edge ? (
              <EdgeStyleBar
                edge={edge}
                kind={doc.kind}
                onChange={changeEdgeStyle}
                onReverse={reverseSelectedEdge}
                onRelation={changeRelation}
                onSwapSides={swapSides}
              />
            ) : showSpec && entityNode ? (
              <EntitySpecPanel
                node={entityNode}
                onAdd={addEntityAttribute}
                onUpdate={updateEntityAttribute}
                onToggleKey={toggleEntityKey}
                onRemove={removeEntityAttribute}
                onMove={moveEntityAttribute}
                onClose={closeSpec}
              />
            ) : showSpec && c4Node ? (
              <C4SpecPanel node={c4Node} onChange={changeC4} onClose={closeSpec} />
            ) : showSpec && classNode ? (
              <ClassSpecPanel
                node={classNode}
                onAdd={addClassMember}
                onUpdate={updateClassMember}
                onRemove={removeClassMember}
                onMove={moveClassMember}
                onStereotype={changeStereotype}
                onClose={closeSpec}
              />
            ) : (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</span>
            )}
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={diagramNodeTypes}
          edgeTypes={diagramEdgeTypes}
          onNodesChange={readOnly ? undefined : handleNodesChange}
          onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
          onEdgesChange={readOnly ? undefined : handleEdgesChange}
          onConnect={readOnly ? undefined : handleConnect}
          onEdgeDoubleClick={readOnly ? undefined : (_, e) => { setSelectedEdge(e.id); setSelectedNode(null); }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          // Uchwyty są jednego typu (`source`), więc łączenie musi być swobodne
          // — inaczej nie dałoby się dociągnąć relacji do celu.
          connectionMode={ConnectionMode.Loose}
          minZoom={MIN_ZOOM}
          proOptions={{ hideAttribution: true }}
        >
          <FitViewOnExternalChange token={fitToken} lastInteraction={lastInteractionRef} paneRef={paneRef} />
          <Background />
          <Controls showInteractive={false} />
          {/* Miniaturka pomaga dopiero przy diagramie, który nie mieści się w
              oknie — przy kilku węzłach tylko zabiera miejsce i zasłania róg. */}
          {nodes.length > MINIMAP_FROM_NODES && (
            <MiniMap
              pannable
              zoomable
              // Klik w miniaturkę przenosi widok w to miejsce — bez tego służy
              // tylko do orientacji i trzeba szukać fragmentu przewijaniem.
              onClick={(_, position) => {
                // Zachowujemy bieżące przybliżenie: klik ma przenieść widok, a
                // nie zmieniać skalę (`setCenter` bez `zoom` ustawia własną).
                instance.setCenter(position.x, position.y, { zoom: instance.getZoom(), duration: 250 });
              }}
              style={{ width: 120, height: 90, cursor: 'pointer' }}
            />
          )}
        </ReactFlow>
      </div>

    </div>
  );
}

/**
 * `ReactFlowProvider` jest potrzebny, żeby sam edytor (a nie tylko jego dzieci)
 * mógł pytać o stan widoku — stąd wie, gdzie patrzy użytkownik przy dodawaniu
 * elementów.
 */
export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <DiagramEditorInner {...props} />
    </ReactFlowProvider>
  );
}
