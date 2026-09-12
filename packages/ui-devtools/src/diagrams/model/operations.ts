/**
 * operations.ts — jawne operacje edycyjne na modelu diagramu.
 *
 * Edytor graficzny nie modyfikuje dokumentu „w miejscu": każda zmiana to
 * funkcja `(doc, …) → doc`. Dzięki temu historia (undo) w hoście sprowadza się
 * do trzymania poprzedniej wartości, a operacje dają się przetestować bez DOM-u.
 */
import {
  edgeId, uniqueNodeId,
  type DiagramDocument, type DiagramEdge, type DiagramKind, type DiagramNode, type NodeShape,
  type EdgeArrowType, type EdgeLineStyle,
} from './diagram';

/** Czytelny rdzeń nazwy nowego węzła — zależny od roli, nie od nazwy kształtu. */
export function baseNameFor(kind: DiagramKind, shape: NodeShape): string {
  if (shape === 'start') return 'start';
  if (shape === 'end') return 'koniec';
  if (kind === 'class') return 'Klasa';
  if (kind === 'er') return 'ENCJA';
  if (kind === 'state') {
    if (shape === 'choice') return 'Wybor';
    if (shape === 'fork') return 'Rozgalezienie';
    if (shape === 'join') return 'Zlaczenie';
    return 'Stan';
  }
  if (shape === 'rhombus') return 'Decyzja';
  if (shape === 'cylinder') return 'Dane';
  return 'Krok';
}

export interface AddNodeOptions {
  position?: { x: number; y: number };
  label?: string;
  parentId?: string;
  /** Proponowany rdzeń identyfikatora; domyślnie wynika z rodzaju i kształtu. */
  id?: string;
}

/**
 * Dodaje węzeł z nazwą wolną w obrębie dokumentu.
 *
 * Pseudostany (`[*]`) nie dostają etykiety — w składni i tak nie mają nazwy,
 * a podpis „start1" na kropce tylko myli.
 */
export function addNode(doc: DiagramDocument, shape: NodeShape, options: AddNodeOptions = {}): DiagramDocument {
  const isPseudo = shape === 'start' || shape === 'end';
  // Gdy znamy docelową nazwę, bierzemy ją też na identyfikator — inaczej
  // powstawałby zbędny alias (`state "Idle" as Stan`), mylący przy czytaniu kodu.
  const id = uniqueNodeId(doc, options.id ?? (isPseudo ? baseNameFor(doc.kind, shape) : options.label ?? baseNameFor(doc.kind, shape)));
  const node: DiagramNode = {
    id,
    label: isPseudo ? '' : (options.label ?? id),
    shape,
    // Klasa musi mieć ciało od początku — po jego obecności widok poznaje, że
    // ma narysować sekcje pól i metod zamiast zwykłej figury.
    ...(doc.kind === 'class' ? { members: [] } : {}),
    // Encja rozpoznaje się po obecności listy atrybutów — tak jak klasa po ciele.
    ...(doc.kind === 'er' ? { attributes: [] } : {}),
    ...(options.position ? { position: options.position } : {}),
    ...(options.parentId ? { parentId: options.parentId } : {}),
  };
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function setNodeLabel(doc: DiagramDocument, id: string, label: string): DiagramDocument {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, label } : n)) };
}

/**
 * Ustawia nazwę widoczną na diagramie.
 *
 * W schemacie blokowym i diagramie stanów etykieta jest czymś innym niż
 * identyfikator (`A[Start]`), więc zmieniamy sam opis. W diagramie klas nazwa
 * JEST identyfikatorem — `class Pies` nie ma osobnego pola na opis, więc
 * ustawienie samej etykiety nie zmieniłoby niczego w zapisie.
 */
export function setNodeName(doc: DiagramDocument, id: string, name: string): DiagramDocument {
  if (doc.kind !== 'class') return setNodeLabel(doc, id, name);
  const renamed = renameNode(doc, id, name);
  // `renameNode` odmawia przy kolizji i przy pustej nazwie — wtedy nic nie robimy.
  const clean = name.replace(/[^A-Za-z0-9_]/g, '');
  return renamed === doc ? doc : setNodeLabel(renamed, clean, clean);
}

export function setNodeShape(doc: DiagramDocument, id: string, shape: NodeShape): DiagramDocument {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, shape } : n)) };
}

/**
 * Ustawia opis przejścia. Pusty tekst **usuwa** etykietę zamiast zapisywać
 * pustą — inaczej w Mermaidzie powstałby wiszący dwukropek (`A --> B:`).
 */
export function setEdgeLabel(doc: DiagramDocument, id: string, label: string): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => {
      if (e.id !== id) return e;
      const trimmed = label.trim();
      const { label: _drop, ...rest } = e;
      return trimmed ? { ...rest, label: trimmed } : rest;
    }),
  };
}

/** Co da się ustawić w wyglądzie połączenia. Pominięte pole zostaje bez zmian. */
export interface EdgeStylePatch {
  lineStyle?: EdgeLineStyle;
  /** Zakończenie po stronie celu. */
  arrow?: EdgeArrowType;
  /** Zakończenie po stronie źródła (`<-->`, `o--o`, `x--x`); `none` je zdejmuje. */
  startArrow?: EdgeArrowType;
  /** Link `~~~`: rysowany tylko po to, by ustawić układ. */
  invisible?: boolean;
  /** Długość linii — w Mermaidzie steruje odstępem między węzłami. */
  length?: number;
}

/**
 * Zmienia wygląd połączenia.
 *
 * Zakończenie u źródła i „niewidzialność" żyją w `meta`, bo nie każdy format
 * je zna — ta funkcja jest jedynym miejscem, które o tym wie. Wpisy z `meta`
 * są **usuwane**, a nie zerowane: pusty klucz przeciekłby do zapisu.
 */
export function setEdgeStyle(doc: DiagramDocument, id: string, patch: EdgeStylePatch): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((edge) => {
      if (edge.id !== id) return edge;

      const meta: Record<string, string> = { ...edge.meta };
      if (patch.startArrow !== undefined) {
        if (patch.startArrow === 'none') delete meta.startArrow;
        else meta.startArrow = patch.startArrow;
      }
      if (patch.invisible !== undefined) {
        if (patch.invisible) meta.invisible = 'true';
        else delete meta.invisible;
      }

      const { meta: _drop, ...rest } = edge;
      return {
        ...rest,
        ...(patch.lineStyle !== undefined ? { lineStyle: patch.lineStyle } : {}),
        ...(patch.arrow !== undefined ? { arrow: patch.arrow } : {}),
        ...(patch.length !== undefined ? { length: patch.length } : {}),
        ...(Object.keys(meta).length ? { meta } : {}),
      };
    }),
  };
}

/**
 * Odwraca kierunek połączenia razem z zakończeniami stron.
 *
 * Sama zamiana końców zostawiłaby grot po tej samej stronie ekranu, więc
 * strzałka wskazywałaby teraz źródło — czyli coś innego, niż widać w kodzie.
 */
export function reverseEdge(doc: DiagramDocument, id: string): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((edge) => {
      if (edge.id !== id) return edge;
      const start = (edge.meta?.startArrow as EdgeArrowType | undefined) ?? 'none';
      const meta: Record<string, string> = { ...edge.meta };
      if (edge.arrow === 'none') delete meta.startArrow;
      else meta.startArrow = edge.arrow;

      const { meta: _drop, ...rest } = edge;
      return {
        ...rest,
        source: edge.target,
        target: edge.source,
        arrow: start,
        ...(Object.keys(meta).length ? { meta } : {}),
      };
    }),
  };
}

export function connect(doc: DiagramDocument, source: string, target: string, label?: string): DiagramDocument {
  const edge: DiagramEdge = {
    id: edgeId(doc, source, target),
    source,
    target,
    lineStyle: 'solid',
    arrow: 'arrow',
    ...(label?.trim() ? { label: label.trim() } : {}),
  };
  return { ...doc, edges: [...doc.edges, edge] };
}

export function removeEdge(doc: DiagramDocument, id: string): DiagramDocument {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== id) };
}

/** Zmiana identyfikatora węzła razem z przepięciem krawędzi i przynależności. */
export function renameNode(doc: DiagramDocument, from: string, to: string): DiagramDocument {
  const clean = to.replace(/[^A-Za-z0-9_]/g, '');
  if (!clean || clean === from) return doc;
  // Kolizja id oznaczałaby sklejenie dwóch węzłów przy zapisie — odmawiamy.
  if (doc.nodes.some((n) => n.id === clean) || doc.groups.some((g) => g.id === clean)) return doc;

  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({
      ...n,
      ...(n.id === from ? { id: clean } : {}),
      ...(n.parentId === from ? { parentId: clean } : {}),
    })),
    edges: doc.edges.map((e) => ({
      ...e,
      source: e.source === from ? clean : e.source,
      target: e.target === from ? clean : e.target,
    })),
  };
}

// ── Grupy (podgrafy / stany złożone) ─────────────────────────────────────────

export interface AddGroupOptions {
  label?: string;
  parentId?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  /** Węzły przenoszone do nowej grupy — np. bieżące zaznaczenie. */
  members?: string[];
}

/**
 * Dodaje grupę. Identyfikator jest wolny w obrębie dokumentu, bo grupa dzieli
 * przestrzeń nazw z węzłami — w diagramie stanów to jeden byt.
 */
export function addGroup(doc: DiagramDocument, options: AddGroupOptions = {}): DiagramDocument {
  const base = doc.kind === 'state' ? 'StanZlozony' : 'Grupa';
  const id = uniqueNodeId(doc, base);
  const members = new Set(options.members ?? []);

  return {
    ...doc,
    groups: [...doc.groups, {
      id,
      label: options.label ?? id,
      ...(options.parentId ? { parentId: options.parentId } : {}),
      ...(options.position ? { position: options.position } : {}),
      ...(options.size ? { size: options.size } : {}),
    }],
    // Węzły wchodzące do grupy tracą własną pozycję: dotychczasowa była liczona
    // od płótna, a wewnątrz grupy obowiązują współrzędne lokalne.
    nodes: doc.nodes.map((n) => (members.has(n.id) ? { ...n, parentId: id, position: undefined } : n)),
  };
}

export function setGroupLabel(doc: DiagramDocument, id: string, label: string): DiagramDocument {
  return { ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, label } : g)) };
}

/** Ręczna zmiana rozmiaru ramki (uchwyty w rogach). */
export function setGroupSize(doc: DiagramDocument, id: string, size: { width: number; height: number }): DiagramDocument {
  const rounded = { width: Math.round(size.width), height: Math.round(size.height) };
  return { ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, size: rounded } : g)) };
}

export function setGroupPosition(doc: DiagramDocument, id: string, position: { x: number; y: number }): DiagramDocument {
  const rounded = { x: Math.round(position.x), y: Math.round(position.y) };
  return { ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, position: rounded } : g)) };
}

/**
 * Usuwa grupę. Zawartość **przechodzi poziom wyżej**, a nie znika — skasowanie
 * kilku stanów przy okazji zwijania ramki byłoby zaskoczeniem, a przejścia do
 * nich zostałyby osierocone.
 */
export function removeGroup(doc: DiagramDocument, id: string): DiagramDocument {
  const group = doc.groups.find((g) => g.id === id);
  if (!group) return doc;
  const newParent = group.parentId;

  return {
    ...doc,
    groups: doc.groups
      .filter((g) => g.id !== id)
      .map((g) => (g.parentId === id ? { ...g, parentId: newParent } : g)),
    // Pozycje kasujemy: były lokalne wobec znikającej ramki.
    nodes: doc.nodes.map((n) => (n.parentId === id ? { ...n, parentId: newParent, position: undefined } : n)),
    // Przejścia do samej grupy nie mają już celu — usuwamy tylko je.
    edges: doc.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

/** Przenosi węzeł do grupy (albo poza wszystkie, gdy `groupId` jest pusty). */
export function moveNodeToGroup(doc: DiagramDocument, nodeId: string, groupId?: string): DiagramDocument {
  if (groupId && !doc.groups.some((g) => g.id === groupId)) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId
      ? { ...n, ...(groupId ? { parentId: groupId } : { parentId: undefined }), position: undefined }
      : n)),
  };
}

/**
 * Zrzuca cały zapisany układ — pozycje węzłów **oraz** pozycje i rozmiary ramek.
 *
 * Czyszczenie samych węzłów zostawiało ramki w starych miejscach, więc po
 * „Ułóż" zawartość rozjeżdżała się względem swoich ramek. Układ liczy się
 * wtedy od zera, spójnie dla obu poziomów.
 */
export function resetLayout(doc: DiagramDocument): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map(({ position: _drop, ...rest }) => rest),
    groups: doc.groups.map(({ position: _p, size: _s, ...rest }) => rest),
  };
}

/**
 * Przenosi zapisany układ ze starego dokumentu na nowy (te same identyfikatory).
 *
 * Składnie tekstowe nie niosą współrzędnych, więc każde ponowne sparsowanie
 * kodu daje model bez pozycji — a edytor liczy wtedy układ od zera i diagram
 * „skacze". Przy edycji w bloku markdown dzieje się to po **każdej** zmianie,
 * bo model wraca pętlą przez tekst. Dlatego układ przenosimy jawnie.
 *
 * Elementy, których nie ma w starym dokumencie (świeżo dodane), zostają bez
 * pozycji — dostaną ją z `autoLayout`.
 */
export function mergeLayout(target: DiagramDocument, previous: DiagramDocument): DiagramDocument {
  const nodePositions = new Map(previous.nodes.filter((n) => n.position).map((n) => [n.id, n.position!]));
  const groupBoxes = new Map(previous.groups.map((g) => [g.id, { position: g.position, size: g.size }]));

  return {
    ...target,
    nodes: target.nodes.map((n) => {
      const position = nodePositions.get(n.id);
      return position && !n.position ? { ...n, position } : n;
    }),
    groups: target.groups.map((g) => {
      const box = groupBoxes.get(g.id);
      if (!box) return g;
      return {
        ...g,
        ...(g.position ? {} : box.position ? { position: box.position } : {}),
        ...(g.size ? {} : box.size ? { size: box.size } : {}),
      };
    }),
  };
}

/** Prostokąt widocznego obszaru w układzie współrzędnych diagramu. */
export interface VisibleArea { x: number; y: number; width: number; height: number }

/**
 * Wskazuje miejsce dla nowego elementu: środek widocznego obszaru, odsunięty
 * tak, by nie przykryć czegoś, co już tam stoi.
 *
 * Wcześniej nowe węzły lądowały po skosie od lewego górnego rogu diagramu —
 * przy przewiniętym albo oddalonym widoku wypadały poza kadr i wyglądało to
 * na „dodane w dziwnym miejscu".
 */
export function spotForNewNode(
  doc: DiagramDocument,
  area: VisibleArea,
  size = { width: 150, height: 52 },
): { x: number; y: number } {
  const center = {
    x: Math.round(area.x + area.width / 2 - size.width / 2),
    y: Math.round(area.y + area.height / 2 - size.height / 2),
  };

  // Zajęte są tylko elementy na tym samym poziomie (bez rodzica): pozycje
  // wewnątrz ramek są lokalne, więc nie da się ich porównywać z globalnymi.
  const taken = [
    ...doc.nodes.filter((n) => !n.parentId && n.position).map((n) => n.position!),
    ...doc.groups.filter((g) => !g.parentId && g.position).map((g) => g.position!),
  ];

  const collides = (p: { x: number; y: number }) =>
    taken.some((t) => Math.abs(t.x - p.x) < size.width * 0.8 && Math.abs(t.y - p.y) < size.height * 1.4);

  if (!collides(center)) return center;

  // Spirala kwadratowa wokół środka — pierwsze wolne miejsce blisko kadru.
  const stepX = Math.round(size.width * 0.9);
  const stepY = Math.round(size.height * 1.6);
  for (let ring = 1; ring <= 6; ring++) {
    for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
      const candidate = { x: center.x + dx * ring * stepX, y: center.y + dy * ring * stepY };
      if (!collides(candidate)) return candidate;
    }
  }
  return center;
}
