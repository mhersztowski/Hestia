/**
 * diagram.ts — neutralny model diagramu, wspólny dla wszystkich formatów.
 *
 * Mermaid jest **jednym z** formatów wejścia i wyjścia, nie modelem danych.
 * Edytory graficzne pracują wyłącznie na tym modelu, a konkretne składnie
 * (Mermaid, a w przyszłości PlantUML, Graphviz, własny JSON) wchodzą i wychodzą
 * przez adaptery `DiagramFormat`. Dzięki temu:
 *   • dodanie formatu nie dotyka edytora ani odwrotnie;
 *   • ten sam diagram można zapisać w innym języku bez utraty układu;
 *   • układ (pozycje) żyje w modelu, choć większość składni tekstowych go nie ma.
 *
 * Zasada zachowania treści: czego adapter nie rozumie, ląduje w `unknown` z
 * numerem linii i wraca przy zapisie na swoje miejsce. Edytor graficzny nie może
 * kasować tego, czego nie potrafi narysować — to najszybszy sposób na utratę
 * pracy użytkownika.
 */

import type { SequenceScript } from './sequence';
import type { PacketSpec } from './packet';
import type { KanbanBoard } from './kanban';
import type { GanttChart } from './gantt';
import type { Timeline } from './timeline';
import type { C4BoundaryInfo, C4NodeInfo, C4RelInfo } from './c4';

/** Rodzaj diagramu — decyduje, który edytor graficzny go obsłuży. */
export type DiagramKind =
  | 'flowchart' | 'state' | 'class' | 'sequence' | 'er' | 'packet' | 'gantt' | 'kanban' | 'timeline' | 'c4';

/** Kierunek układu, w terminologii wspólnej dla formatów. */
export type DiagramDirection = 'TB' | 'BT' | 'LR' | 'RL';

/**
 * Kształt węzła. Nazwy są opisowe, nie składniowe — adapter Mermaida mapuje je
 * na `[]`, `{}`, `(())` itd., a inny format na swoje odpowiedniki.
 */
export type NodeShape =
  | 'rectangle' | 'rounded' | 'stadium' | 'subroutine' | 'cylinder'
  | 'circle' | 'doubleCircle' | 'rhombus' | 'hexagon'
  // Cztery warianty ścięć — w Mermaidzie każdy ma własny zapis i znaczenie:
  // wejście/wyjście (`[/…/]`, `[\…\]`) oraz operacja ręczna (`[/…\]`, `[\…/]`).
  | 'parallelogram' | 'parallelogramAlt' | 'trapezoid' | 'trapezoidAlt'
  /** Chorągiewka `>tekst]` — blok z wciętym lewym bokiem. */
  | 'asymmetric'
  // Kształty właściwe diagramom stanów:
  | 'start' | 'end' | 'choice' | 'fork' | 'join';

/** Styl linii krawędzi. */
export type EdgeLineStyle = 'solid' | 'dotted' | 'thick';
/**
 * Zakończenie krawędzi.
 *
 * Trzy ostatnie przychodzą z diagramów klas (UML): pusty trójkąt to
 * dziedziczenie, wypełniony romb kompozycja, pusty romb agregacja. Trzymamy je
 * tu, a nie osobno „dla klas", bo to nadal zakończenia linii — inne formaty
 * mogą po nie sięgnąć.
 */
export type EdgeArrowType =
  | 'arrow' | 'none' | 'circle' | 'cross'
  | 'triangle' | 'diamond' | 'diamondFilled';

/**
 * Rodzaj relacji między klasami (UML).
 *
 * Trzymany jako osobne pojęcie, a nie odczytywany z wyglądu linii: rodzaj
 * relacji jest tym, co niesie znaczenie i czego potrzebuje generator kodu.
 * Wygląd (zakończenie, styl linii) z niego wynika — patrz `RELATION_LOOK`.
 */
export type ClassRelationKind =
  | 'inheritance' | 'realization' | 'composition' | 'aggregation'
  | 'association' | 'dependency' | 'link';

/**
 * Liczebność końca relacji w diagramie ER (notacja „crow's foot").
 *
 * Każdy koniec ma własną liczebność i każdy ma w Mermaidzie inny zapis po
 * lewej i prawej stronie (`||--o{`), więc trzymamy ją jako pojęcie, a nie jako
 * napis — inaczej odbicie lustrzane trzeba by odgadywać przy zapisie.
 */
export type ErCardinality = 'zeroOrOne' | 'exactlyOne' | 'zeroOrMore' | 'oneOrMore';

/** Rola klucza w encji. */
export type EntityKey = 'PK' | 'FK' | 'UK';

/**
 * Atrybut encji.
 *
 * Osobno od {@link ClassMember}, bo niesie co innego: nie widoczność i
 * parametry, tylko typ, role kluczy i komentarz.
 */
export interface EntityAttribute {
  /** Zapis źródłowy — wraca nietknięty, gdy rozbiór się nie powiódł. */
  raw: string;
  type?: string;
  name?: string;
  /** `PK`, `FK`, `UK`; w Mermaidzie można je łączyć. */
  keys?: EntityKey[];
  /** Opis w cudzysłowie na końcu wiersza. */
  comment?: string;
}

/** Widoczność składowej klasy w notacji UML. */
export type MemberVisibility = 'public' | 'private' | 'protected' | 'package';

/**
 * Składowa klasy — pole albo metoda.
 *
 * `raw` trzyma zapis źródłowy i jest **jedynym** polem obowiązkowym: składnia
 * bywa bogatsza, niż model opisuje (generyki, wartości domyślne, adnotacje), a
 * zasadą adaptera jest oddać przy zapisie dokładnie to, czego nie rozumiemy.
 * Pozostałe pola to wynik rozbioru i służą wyłącznie do wyświetlania.
 */
export interface ClassMember {
  /** Zapis źródłowy, bez wcięcia — wraca nietknięty, gdy nic nie zmieniono. */
  raw: string;
  kind: 'field' | 'method';
  visibility?: MemberVisibility;
  /** Nazwa bez znaku widoczności i bez typu. */
  name?: string;
  /** Typ pola albo typ zwracany metody. */
  type?: string;
  /** Lista parametrów metody w zapisie źródłowym, bez nawiasów. */
  params?: string;
  /** `$` w Mermaidzie. */
  isStatic?: boolean;
  /** `*` w Mermaidzie. */
  isAbstract?: boolean;
}

export interface DiagramNode {
  /** Identyfikator w obrębie diagramu — stabilny, używany w krawędziach. */
  id: string;
  /** Etykieta widoczna na diagramie; pusta = rysuj samo `id`. */
  label: string;
  shape: NodeShape;
  /**
   * Pozycja w układzie; brak = wylicz automatycznie przy otwarciu edytora.
   *
   * Dla węzła z `parentId` jest **lokalna względem grupy** — tak liczy je React
   * Flow, a pozycja globalna wyrzuciłaby dziecko poza ramkę rodzica.
   */
  position?: { x: number; y: number };
  /** Grupa (podgraf / stan złożony), do której węzeł należy. */
  parentId?: string;
  /** Klasa stylu z formatu źródłowego — przenoszona bez interpretacji. */
  className?: string;
  /** Składowe klasy (diagram klas). Puste = klasa bez ciała. */
  members?: ClassMember[];
  /** Adnotacja `<<interface>>`, `<<abstract>>`, `<<enumeration>>`. */
  stereotype?: string;
  /** Atrybuty encji (diagram ER). */
  attributes?: EntityAttribute[];
  /** Znaczenie elementu w modelu C4 — rodzaj, wariant, zewnętrzność. */
  c4?: C4NodeInfo;
  /** Dane specyficzne dla formatu, których model nie modeluje wprost. */
  meta?: Record<string, string>;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  lineStyle: EdgeLineStyle;
  arrow: EdgeArrowType;
  /** Długość/waga linii w formatach, które ją rozróżniają (Mermaid `---` vs `----`). */
  length?: number;
  /** Podpis przy źródle — w UML krotność („1", „0..*"). */
  sourceLabel?: string;
  /** Podpis przy celu — w UML krotność. */
  targetLabel?: string;
  /** Rodzaj relacji (diagram klas) — znaczenie, nie wygląd. */
  relation?: ClassRelationKind;
  /** Cechy relacji C4 — technologia, obustronność, przyrostek kierunku. */
  c4?: C4RelInfo;
  /** Liczebność przy źródle (diagram ER). */
  erFrom?: ErCardinality;
  /** Liczebność przy celu (diagram ER). */
  erTo?: ErCardinality;
  /**
   * Relacja identyfikująca — w Mermaidzie linia ciągła (`--`) zamiast
   * przerywanej (`..`). Znaczy, że byt zależny nie istnieje bez nadrzędnego.
   */
  erIdentifying?: boolean;
  /**
   * Strona, przy której stoi zakończenie relacji: nadklasa, interfejs, całość.
   *
   * Zapis Mermaida dopuszcza obie kolejności (`A <|-- B` i `B --|> A`), a model
   * zostaje wierny źródłu — to pole mówi, gdzie jest „góra" relacji, bez
   * przestawiania stron.
   */
  relationEnd?: 'source' | 'target';
  meta?: Record<string, string>;
}

/** Podgraf (flowchart) albo stan złożony (state) — pojemnik na węzły. */
export interface DiagramGroup {
  id: string;
  label: string;
  parentId?: string;
  /** Rodzaj granicy w modelu C4. */
  c4?: C4BoundaryInfo;
  direction?: DiagramDirection;
  /** Pozycja ramki — lokalna względem grupy nadrzędnej, jak u węzłów. */
  position?: { x: number; y: number };
  /** Rozmiar ramki obejmujący zawartość; wyliczany przez `autoLayout`. */
  size?: { width: number; height: number };
}

/** Linia źródła, której adapter nie rozpoznał — wraca nietknięta przy zapisie. */
export interface UnknownLine {
  /** Numer linii w oryginalnym źródle (0-based) — decyduje o kolejności powrotu. */
  index: number;
  text: string;
  /**
   * Element, PRZED którym linia ma wrócić — `node:A`, `group:G`, `edge:A__B`.
   *
   * Zapis układa diagram po swojemu (najpierw grupy, potem węzły, na końcu
   * krawędzie), więc sam numer linii nie wystarczy: komentarz sekcji lądowałby
   * na końcu pliku, z dala od tego, co opisuje. Brak kotwicy = koniec zapisu.
   */
  anchor?: string;
}

export interface DiagramDocument {
  kind: DiagramKind;
  /**
   * Nagłówek rodzaju diagramu, którego adapter nie obsługuje (np. `mindmap`).
   *
   * Obecność tego pola znaczy: **rozumiemy, czym to jest, i nie umiemy tego
   * edytować**. Dokument jest wtedy pusty, a całe źródło leży w `unknown` —
   * zapis oddaje je bez zmian, a edytor graficzny odmawia otwarcia.
   *
   * Bez tego rozróżnienia parser zakładał flowchart także tam, gdzie autor
   * jasno napisał, o jaki rodzaj chodzi: gałęzie mindmapy stawały się węzłami,
   * a pierwsza operacja w edytorze nadpisywała blok zapisem, którego Mermaid
   * nie renderuje.
   */
  unsupported?: string;
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  /** Fragmenty źródła poza modelem (style, klik-handlery, komentarze). */
  unknown: UnknownLine[];
  /** Tytuł diagramu, jeśli format go niesie. */
  title?: string;
  /**
   * Przebieg diagramu sekwencji.
   *
   * Osobne pole, bo sekwencja nie jest grafem: znaczenie niesie kolejność w
   * czasie i zagnieżdżenie bloków, czego `nodes`/`edges` nie wyrażają.
   */
  sequence?: SequenceScript;
  /**
   * Mapa bitów diagramu pakietu.
   *
   * Osobne pole z tego samego powodu co przebieg sekwencji: pola pakietu
   * opisuje zakres bitów, a nie położenie w grafie.
   */
  packet?: PacketSpec;
  /** Tablica kanban — kolumny i karty; struktura bez geometrii. */
  kanban?: KanbanBoard;
  /** Harmonogram — sekcje, zadania i ich położenie w czasie. */
  gantt?: GanttChart;
  /** Oś wydarzeń — okresy i to, co się w nich wydarzyło. */
  timeline?: Timeline;
  meta?: Record<string, string>;
}

export function emptyDiagram(kind: DiagramKind, direction: DiagramDirection = 'TB'): DiagramDocument {
  return { kind, direction, nodes: [], edges: [], groups: [], unknown: [] };
}

/** Węzeł po id (albo `undefined`). */
export function findNode(doc: DiagramDocument, id: string): DiagramNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/**
 * Identyfikator wolny w obrębie dokumentu, zbudowany z podanego rdzenia.
 *
 * Kolizja id po stronie edytora oznacza cichą utratę krawędzi przy zapisie,
 * więc nadawanie nazw idzie zawsze przez tę funkcję.
 */
export function uniqueNodeId(doc: DiagramDocument, base = 'n'): string {
  const taken = new Set([...doc.nodes.map((n) => n.id), ...doc.groups.map((g) => g.id)]);
  const clean = base.replace(/[^A-Za-z0-9_]/g, '') || 'n';
  if (!taken.has(clean)) return clean;
  for (let i = 1; ; i++) {
    const candidate = `${clean}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Identyfikator krawędzi — pochodny od końców, więc czytelny w diffach. */
export function edgeId(doc: DiagramDocument, source: string, target: string): string {
  const taken = new Set(doc.edges.map((e) => e.id));
  const base = `${source}__${target}`;
  if (!taken.has(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Usuwa węzeł razem z jego krawędziami — osierocona krawędź psuje każdy format. */
export function removeNode(doc: DiagramDocument, id: string): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== id),
    edges: doc.edges.filter((e) => e.source !== id && e.target !== id),
  };
}
