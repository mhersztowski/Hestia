/**
 * classRelations.ts — relacje między klasami jako pojęcie, nie jako rysunek.
 *
 * Dotąd rodzaj relacji dawało się odczytać wyłącznie z kombinacji „zakończenie
 * linii + jej styl" (trójkąt + ciągła = dziedziczenie, trójkąt + przerywana =
 * implementacja…). Do rysowania to wystarcza, ale każdy, kto chce z modelu
 * **wygenerować kod**, musiałby tę kombinację odgadywać i powtarzać u siebie.
 * Dlatego rodzaj relacji jest teraz osobnym polem krawędzi, a wygląd z niego
 * wynika — nie odwrotnie.
 *
 * `classRelations(doc)` oddaje relacje w postaci kanonicznej: niezależnie od
 * tego, czy w źródle napisano `Zwierze <|-- Pies` czy `Pies --|> Zwierze`,
 * `from` jest zawsze stroną GŁÓWNĄ relacji (nadklasa, interfejs, całość).
 * Znaczenie stron dla każdego rodzaju opisuje {@link RELATION_MEANING}.
 */
import type {
  ClassRelationKind, DiagramDocument, DiagramEdge, EdgeArrowType, EdgeLineStyle,
} from './diagram';

/** Jak dany rodzaj relacji wygląda i po której stronie stoi jego zakończenie. */
export interface RelationLook {
  end: EdgeArrowType;
  lineStyle: EdgeLineStyle;
  /**
   * Czy zakończenie stoi przy stronie GŁÓWNEJ relacji (`from`).
   *
   * To nie jest szczegół rysunku, tylko reguła czytania diagramu: trójkąt
   * dziedziczenia stoi przy nadklasie (stronie głównej), ale strzałka asocjacji
   * przy klasie powiązanej (stronie drugiej). Bez tego rozróżnienia „strona z
   * zakończeniem" raz znaczyłaby nadklasę, a raz cel powiązania.
   */
  endAtFrom: boolean;
}

export const RELATION_LOOK: Record<ClassRelationKind, RelationLook> = {
  inheritance: { end: 'triangle', lineStyle: 'solid', endAtFrom: true },
  realization: { end: 'triangle', lineStyle: 'dotted', endAtFrom: true },
  composition: { end: 'diamondFilled', lineStyle: 'solid', endAtFrom: true },
  aggregation: { end: 'diamond', lineStyle: 'solid', endAtFrom: true },
  association: { end: 'arrow', lineStyle: 'solid', endAtFrom: false },
  dependency: { end: 'arrow', lineStyle: 'dotted', endAtFrom: false },
  link: { end: 'none', lineStyle: 'solid', endAtFrom: false },
};

/**
 * Co znaczą strony relacji — to jest kontrakt dla generatora kodu.
 *
 * Dla dziedziczenia deklaracja powstaje przy `to` (`class to extends from`), a
 * dla kompozycji przy `from` (`class from { to pole; }`) — dlatego samo „kto
 * jest źródłem" nie wystarcza i rodzaj relacji trzeba znać wprost.
 */
export const RELATION_MEANING: Record<ClassRelationKind, { label: string; from: string; to: string }> = {
  inheritance: { label: 'dziedziczenie', from: 'nadklasa', to: 'podklasa' },
  realization: { label: 'implementacja', from: 'interfejs', to: 'klasa implementująca' },
  composition: { label: 'kompozycja', from: 'całość', to: 'część (nie istnieje bez całości)' },
  aggregation: { label: 'agregacja', from: 'całość', to: 'część (istnieje samodzielnie)' },
  association: { label: 'asocjacja', from: 'klasa odwołująca się', to: 'klasa powiązana' },
  dependency: { label: 'zależność', from: 'klasa używająca', to: 'klasa używana' },
  link: { label: 'powiązanie', from: 'klasa', to: 'klasa' },
};

/** Kolejność w interfejsie — od najczęstszych. */
export const CLASS_RELATION_KINDS: ClassRelationKind[] = [
  'inheritance', 'realization', 'composition', 'aggregation', 'association', 'dependency', 'link',
];

/**
 * Rodzaj relacji dla krawędzi, która go nie deklaruje.
 *
 * Diagramy wczytane starszą wersją (albo z formatu, który pojęcia relacji nie
 * ma) niosą tylko wygląd — odczytujemy go wtedy wstecz, żeby generator dostał
 * sensowną odpowiedź zamiast `undefined`.
 */
export function relationOf(edge: DiagramEdge): ClassRelationKind {
  if (edge.relation) return edge.relation;
  const end = edge.arrow !== 'none' ? edge.arrow : (edge.meta?.startArrow as EdgeArrowType | undefined) ?? 'none';
  const dotted = edge.lineStyle === 'dotted';
  if (end === 'triangle') return dotted ? 'realization' : 'inheritance';
  if (end === 'diamondFilled') return 'composition';
  if (end === 'diamond') return 'aggregation';
  if (end === 'arrow') return dotted ? 'dependency' : 'association';
  return 'link';
}

type Side = 'source' | 'target';
const other = (side: Side): Side => (side === 'source' ? 'target' : 'source');

/** Przy której stronie krawędzi stoi zakończenie relacji. */
function endSide(edge: DiagramEdge): Side {
  if (edge.relationEnd) return edge.relationEnd;
  return edge.arrow === 'none' && edge.meta?.startArrow ? 'source' : 'target';
}

/**
 * Która strona krawędzi jest stroną GŁÓWNĄ relacji (`from`).
 *
 * Wynika z rodzaju: przy dziedziczeniu główna jest ta z trójkątem, przy
 * asocjacji ta bez strzałki. Dzięki temu `Zwierze <|-- Pies` i
 * `Pies --|> Zwierze` dają identyczny wynik.
 */
function fromSide(edge: DiagramEdge): Side {
  const end = endSide(edge);
  return RELATION_LOOK[relationOf(edge)].endAtFrom ? end : other(end);
}

/**
 * Ustawia rodzaj relacji razem z wyglądem, który z niego wynika.
 *
 * Zakończenie ląduje po stronie wskazanej przez `end` (domyślnie tam, gdzie
 * stało) — dzięki temu zmiana rodzaju nie odwraca znaczenia relacji.
 */
export function setEdgeRelation(
  doc: DiagramDocument,
  id: string,
  kind: ClassRelationKind,
  from?: Side,
): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((edge) => {
      if (edge.id !== id) return edge;
      // Zachowujemy stronę GŁÓWNĄ, nie stronę zakończenia: przy zmianie
      // dziedziczenia na asocjację zakończenie musi przeskoczyć na drugi
      // koniec, żeby znaczenie relacji zostało to samo.
      const main = from ?? fromSide(edge);
      const look = RELATION_LOOK[kind];
      const endAt = look.endAtFrom ? main : other(main);

      const meta = { ...edge.meta };
      delete meta.startArrow;
      if (endAt === 'source' && look.end !== 'none') meta.startArrow = look.end;

      const { meta: _drop, ...rest } = edge;
      return {
        ...rest,
        relation: kind,
        relationEnd: endAt,
        lineStyle: look.lineStyle,
        arrow: endAt === 'target' ? look.end : 'none',
        ...(Object.keys(meta).length ? { meta } : {}),
      };
    }),
  };
}

/** Zamienia strony relacji miejscami — `from` staje się `to`. */
export function swapRelationSides(doc: DiagramDocument, id: string): DiagramDocument {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) return doc;
  return setEdgeRelation(doc, id, relationOf(edge), other(fromSide(edge)));
}

/** Relacja w postaci gotowej dla generatora kodu. */
export interface ClassRelationView {
  /** Identyfikator krawędzi — pozwala wrócić do modelu. */
  id: string;
  kind: ClassRelationKind;
  /** Strona główna: nadklasa / interfejs / całość / klasa odwołująca się. */
  from: string;
  /** Druga strona: podklasa / implementacja / część / klasa powiązana. */
  to: string;
  /** Krotność przy `from`, jeśli podano („1", „0..*"). */
  fromCardinality?: string;
  /** Krotność przy `to`. */
  toCardinality?: string;
  /** Opis relacji z diagramu. */
  label?: string;
}

/**
 * Relacje klas w postaci kanonicznej — punkt wejścia dla generatora kodu.
 *
 * Normalizuje strony: bez względu na to, czy w źródle stoi `Zwierze <|-- Pies`
 * czy `Pies --|> Zwierze`, `from` jest stroną z zakończeniem. Konsument nie musi
 * więc znać składni Mermaida ani patrzeć na `arrow`/`lineStyle`.
 */
export function classRelations(doc: DiagramDocument): ClassRelationView[] {
  return doc.edges.map((edge) => {
    const main = fromSide(edge);
    const from = main === 'source' ? edge.source : edge.target;
    const to = main === 'source' ? edge.target : edge.source;
    const fromCard = main === 'source' ? edge.sourceLabel : edge.targetLabel;
    const toCard = main === 'source' ? edge.targetLabel : edge.sourceLabel;
    return {
      id: edge.id,
      kind: relationOf(edge),
      from,
      to,
      ...(fromCard ? { fromCardinality: fromCard } : {}),
      ...(toCard ? { toCardinality: toCard } : {}),
      ...(edge.label ? { label: edge.label } : {}),
    };
  });
}

