/**
 * c4Ops.ts — zmiany w diagramie C4.
 *
 * Struktura (węzły, krawędzie, grupy) należy do `operations.ts` i C4 z niej
 * korzysta bez zmian. Tutaj jest tylko to, czego tamten plik nie zna: znaczenie
 * elementu.
 *
 * Jedna rzecz wymaga uwagi — **zmiana rodzaju bywa stratna**. Osoba i system
 * nie mają technologii, więc przełączenie kontenera na system musiałoby ją
 * gdzieś podziać. Nie kasujemy jej po cichu: pole zostaje w modelu, a zapis
 * po prostu go nie użyje. Powrót na kontener przywraca to, co było.
 */
import type { DiagramDocument, DiagramNode } from './diagram';
import type { C4BoundaryInfo, C4NodeInfo } from './c4';

const DEFAULT_INFO: C4NodeInfo = { kind: 'system', variant: 'plain', external: false };

/** Zmienia opis elementu; brakujące pola biorą wartości domyślne. */
export function setC4Info(doc: DiagramDocument, nodeId: string, patch: Partial<C4NodeInfo>): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (node.id === nodeId
      ? { ...node, c4: { ...DEFAULT_INFO, ...node.c4, ...patch } }
      : node)),
  };
}

/** Zmienia opis granicy. */
export function setC4Boundary(doc: DiagramDocument, groupId: string, patch: Partial<C4BoundaryInfo>): DiagramDocument {
  return {
    ...doc,
    groups: doc.groups.map((group) => (group.id === groupId
      ? { ...group, c4: { kind: 'generic' as const, ...group.c4, ...patch } }
      : group)),
  };
}

/** Zmienia opis relacji. */
export function setC4Rel(
  doc: DiagramDocument,
  edgeId: string,
  patch: { technology?: string; bidirectional?: boolean; suffix?: string },
): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const c4 = { ...edge.c4, ...patch };
      // Obustronność widać na rysunku strzałką przy źródle — rysunek i zapis
      // muszą mówić to samo.
      const meta = c4.bidirectional
        ? { ...edge.meta, startArrow: 'arrow' }
        : (() => { const rest = { ...edge.meta }; delete rest.startArrow; return rest; })();
      return { ...edge, c4, meta: Object.keys(meta).length ? meta : undefined };
    }),
  };
}

/**
 * Uzupełnia świeżo dodany węzeł o opis C4.
 *
 * `addNode` z `operations.ts` nie wie nic o C4, więc rodzaj dokładamy tuż po
 * dodaniu — dzięki temu jedna ścieżka dodawania obsługuje wszystkie diagramy.
 */
export function withC4Kind(doc: DiagramDocument, info: Partial<C4NodeInfo>): DiagramDocument {
  const last: DiagramNode | undefined = doc.nodes[doc.nodes.length - 1];
  if (!last) return doc;
  return setC4Info(doc, last.id, info);
}
