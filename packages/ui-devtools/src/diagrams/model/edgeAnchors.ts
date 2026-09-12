/**
 * edgeAnchors.ts — rozłożenie krawędzi wzdłuż boków węzła.
 *
 * Domyślnie React Flow daje węzłowi jeden punkt zaczepienia na górze i jeden na
 * dole. Przy encji z pięcioma relacjami wszystkie linie wychodzą wtedy z tego
 * samego miejsca i zlewają się w wachlarz — nie widać, która dokąd biegnie.
 * Mermaid rozkłada je po całej krawędzi tabeli i tak jest czytelniej.
 *
 * Wyliczenie jest czystą funkcją modelu (bez DOM-u), więc daje się sprawdzić
 * co do slotu.
 */
import type { DiagramDocument } from './diagram';
import { estimateNodeSize } from './nodeSize';

/** Bok węzła: górny, dolny, lewy, prawy. */
export type AnchorSide = 't' | 'b' | 'l' | 'r';

/** Ile punktów zaczepienia ma jeden bok. */
export const ANCHORS_PER_SIDE = 5;

/** Identyfikator uchwytu, np. `b2` — trzeci punkt na dolnej krawędzi. */
export type AnchorId = string;

export interface EdgeAnchors {
  source: AnchorId;
  target: AnchorId;
}

/** Wszystkie identyfikatory uchwytów — widok musi je wyrenderować. */
export function anchorIds(side: AnchorSide): AnchorId[] {
  return Array.from({ length: ANCHORS_PER_SIDE }, (_, i) => `${side}${i}`);
}

/** Położenie uchwytu wzdłuż boku, w procentach (0 = początek, 100 = koniec). */
export function anchorOffset(index: number): number {
  // Skrajne punkty odsuwamy od rogów, żeby linia nie wychodziła z narożnika.
  return Math.round(((index + 1) / (ANCHORS_PER_SIDE + 1)) * 100);
}

interface Placed {
  edgeId: string;
  side: AnchorSide;
  /** Współrzędna prostopadła do boku — po niej sortujemy, żeby nie krzyżować. */
  along: number;
  role: 'source' | 'target';
}

/**
 * Przydziela każdej krawędzi punkty zaczepienia po obu stronach.
 *
 * Bok wynika z tego, gdzie leży drugi koniec: przewaga pionowa kieruje linię na
 * górę albo dół, przewaga pozioma na bok. W obrębie jednego boku krawędzie
 * sortujemy po położeniu drugiego końca — dzięki temu nie przecinają się
 * nawzajem tuż przy węźle.
 */
export function assignEdgeAnchors(doc: DiagramDocument): Map<string, EdgeAnchors> {
  const centers = new Map<string, { x: number; y: number }>();
  for (const node of doc.nodes) {
    const size = estimateNodeSize(node);
    const position = node.position ?? { x: 0, y: 0 };
    centers.set(node.id, { x: position.x + size.width / 2, y: position.y + size.height / 2 });
  }

  const placements: Placed[] = [];
  for (const edge of doc.edges) {
    const from = centers.get(edge.source);
    const to = centers.get(edge.target);
    if (!from || !to) continue;

    if (edge.source === edge.target) {
      // Pętla własna wychodzi i wraca tym samym bokiem — rysunek robi resztę.
      placements.push({ edgeId: edge.id, side: 'b', along: 0, role: 'source' });
      placements.push({ edgeId: edge.id, side: 'b', along: 1, role: 'target' });
      continue;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const vertical = Math.abs(dy) >= Math.abs(dx);

    const sourceSide: AnchorSide = vertical ? (dy > 0 ? 'b' : 't') : (dx > 0 ? 'r' : 'l');
    const targetSide: AnchorSide = vertical ? (dy > 0 ? 't' : 'b') : (dx > 0 ? 'l' : 'r');

    placements.push({ edgeId: edge.id, side: sourceSide, along: vertical ? to.x : to.y, role: 'source' });
    placements.push({ edgeId: edge.id, side: targetSide, along: vertical ? from.x : from.y, role: 'target' });
  }

  // Grupujemy po „węzeł + bok" i rozdajemy sloty w kolejności położenia.
  const groups = new Map<string, Placed[]>();
  for (const placement of placements) {
    const edge = doc.edges.find((e) => e.id === placement.edgeId)!;
    const nodeId = placement.role === 'source' ? edge.source : edge.target;
    const key = `${nodeId}|${placement.side}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(placement);
    else groups.set(key, [placement]);
  }

  const result = new Map<string, EdgeAnchors>();
  const put = (edgeId: string, role: 'source' | 'target', anchor: AnchorId) => {
    const current = result.get(edgeId) ?? { source: 'b2', target: 't2' };
    result.set(edgeId, { ...current, [role]: anchor });
  };

  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.along - b.along);
    bucket.forEach((placement, index) => {
      // Przy większej liczbie krawędzi niż slotów rozkładamy je równomiernie i
      // pozwalamy się powtórzyć — lepiej dwie linie w jednym punkcie niż
      // wszystkie w środku boku.
      const slot = bucket.length <= ANCHORS_PER_SIDE
        ? Math.floor((ANCHORS_PER_SIDE - bucket.length) / 2) + index
        : Math.round((index / (bucket.length - 1)) * (ANCHORS_PER_SIDE - 1));
      put(placement.edgeId, placement.role, `${placement.side}${slot}`);
    });
  }

  return result;
}
