/**
 * walkthrough.ts — wyprowadzenie krok po kroku.
 *
 * Raport (3.6b) obiecuje to jako rzecz, która „wychodzi za darmo": skoro graf
 * zna porządek obliczeń, umie też odsłaniać dokument wzór po wzorze, z wynikiem
 * pośrednim przy każdym kroku. To jest cała treść tego modułu — kolejność już
 * mamy, brakuje tylko nazwania jej wykładem.
 *
 * Za darmo nie znaczy bez decyzji. Dwie tu są:
 *
 *  • **Krok opisuje, co wnosi**, a nie tylko który wzór wykonać. Czytelnik ma
 *    zobaczyć „stąd bierze się okres", a nie „węzeł 2 z 3".
 *  • **Wartości pośrednie liczy ten sam kod, co symulację.** Gdyby walkthrough
 *    miał własną ścieżkę obliczeń, mógłby pokazać co innego niż wykres obok —
 *    i wtedy przestałby być wyprowadzeniem, a stałby się drugą implementacją.
 */
import type { FormulaKind } from '../formula/parseFormula';
import type { FormulaGraph, GraphNode } from './formulaGraph';
import { topologicalOrder } from './formulaGraph';

export interface WalkthroughStep {
  /** Wzór wykonywany w tym kroku. */
  formulaId: string;
  /** Wielkości, które ten krok wprowadza. */
  produces: string[];
  /** Wielkości, których używa — a więc kroki, które musiały być wcześniej. */
  dependsOn: string[];
  kind: FormulaKind;
  /** Założenia przyjęte w tym kroku; czytelnik ma wiedzieć, kiedy przestaną obowiązywać. */
  assumptions: string[];
  /** Wzory, z których ten się wywodzi — po nich buduje się graf wiedzy. */
  derivedFrom: string[];
}

/**
 * Rozkłada dokument na kolejne kroki wyprowadzenia.
 *
 * Kolejność obliczeń to nie to samo, co kolejność wykładu — i tu wychodzi
 * różnica, której nie widać, dopóki nie spróbuje się opowiedzieć dokumentu.
 * Wzór amplitudy ustalonej **liczy się** z samych parametrów, więc solver mógłby
 * policzyć go przed równaniem ruchu. Ale on z tego równania *wynika*, i czytelnik
 * musi zobaczyć je pierwsze. Tę wiedzę niesie `@derivedFrom` i dlatego dokłada
 * ona własne krawędzie porządku — obok zależności przez symbole.
 */
export function walkthrough(graph: FormulaGraph): WalkthroughStep[] {
  const byId = new Map(graph.nodes.map((node) => [node.block.id, node]));

  return orderForReading(graph)
    .map((id) => byId.get(id))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .map((node) => ({
      formulaId: node.block.id,
      produces: node.outputs,
      dependsOn: node.inputs,
      kind: node.block.kind,
      assumptions: node.block.assume,
      derivedFrom: node.block.derivedFrom,
    }));
}

/**
 * Kolejność czytania: obliczenia plus pochodzenie wzorów.
 *
 * Zaczynamy od porządku obliczeń (bez niego wynik byłby nieprawdziwy) i
 * przesuwamy wzory tak, by żaden nie stał przed tym, z którego się wywodzi.
 * Wywód wskazujący wzór spoza dokumentu pomijamy — walidacja indeksu zgłosiła
 * go już jako wiszące odniesienie i nie ma powodu psuć przez to kolejności.
 */
function orderForReading(graph: FormulaGraph): string[] {
  const base = topologicalOrder(graph);
  const known = new Set(base);
  const nodeOf = new Map(graph.nodes.map((node) => [node.block.id, node]));

  const placed: string[] = [];
  const state = new Map<string, 'open' | 'done'>();

  const visit = (id: string) => {
    if (state.get(id) === 'done') return;
    // Cykl w `@derivedFrom` jest błędem dokumentu (zgłasza go walidacja);
    // tutaj po prostu nie wchodzimy w niego drugi raz.
    if (state.get(id) === 'open') return;
    state.set(id, 'open');

    const node: GraphNode | undefined = nodeOf.get(id);
    for (const source of node?.block.derivedFrom ?? []) {
      if (known.has(source)) visit(source);
    }
    state.set(id, 'done');
    placed.push(id);
  };

  for (const id of base) visit(id);
  return placed;
}

/**
 * Wielkości znane po wykonaniu pierwszych `count` kroków.
 *
 * Stąd bierze się odsłanianie: widok kroku pokazuje tylko to, co do tej chwili
 * zostało wyprowadzone, więc czytelnik nie widzi wyniku, zanim pozna drogę.
 */
export function knownAfter(steps: WalkthroughStep[], count: number): string[] {
  return [...new Set(steps.slice(0, count).flatMap((step) => step.produces))];
}
