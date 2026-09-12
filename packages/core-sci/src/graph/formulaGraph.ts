/**
 * formulaGraph.ts — zbiór wzorów jako DAG.
 *
 * Teza z raportu doprowadzona do kodu: zjawisko to nie pojedynczy wzór z
 * metadanymi, tylko **graf wzorów**. Wynika z tego kilka rzeczy, których nie
 * trzeba potem pisać ręcznie:
 *
 *  • **Kolejności obliczeń nikt nie podaje.** Wzór C używający `T` z A i `ω`
 *    z B musi policzyć się po nich — to wynika z symboli, nie z deklaracji.
 *  • **Parametry rozpoznają się same.** Symbol, którego nie liczy żaden węzeł,
 *    jest wejściem układu; stąd bierze się panel suwaków.
 *  • **Cykl jest błędem dokumentu**, a nie zawieszeniem aplikacji.
 *
 * Węzeł ODE łamie czystość DAG-u (dynamika w czasie), ale mieści się w nim jako
 * zwykły węzeł: na wejściu ma parametry, na wyjściu zmienne stanu. Pętla
 * solvera siedzi w środku i nikogo z zewnątrz nie obchodzi.
 */
import { compileExpression } from '../formula/expression';
import type { FormulaBlock } from '../formula/parseFormula';
import { create, all } from 'mathjs';
import { sameDimension } from '../units/quantity';

/** Osobna instancja math.js — używana wyłącznie do liczenia wymiarów. */
const math = create(all, {});

export interface GraphIssue {
  message: string;
  /** Wzór, którego dotyczy — do podświetlenia bloku w dokumencie. */
  formulaId?: string;
}

export interface GraphNode {
  block: FormulaBlock;
  /** Symbole, które ten węzeł produkuje. */
  outputs: string[];
  /** Symbole, których potrzebuje. */
  inputs: string[];
}

export interface FormulaGraph {
  nodes: GraphNode[];
  /** Symbole liczone przez którykolwiek węzeł. */
  computed: string[];
  /** Symbole wejściowe — to z nich powstaje panel parametrów. */
  parameters: string[];
  issues: GraphIssue[];
}

/**
 * Symbole, które silnik zna sam i które nie są ani parametrem, ani wynikiem.
 *
 * `t` jest tu świadomie: czas w węźle ODE nie jest parametrem do ustawienia
 * suwakiem, tylko zmienną niezależną.
 *
 * Świadomie NIE ma tu stałych fizycznych. `h` to w dydaktyce wysokość częściej
 * niż stała Plancka, `R` opór częściej niż stała gazowa, `e` ładunek albo
 * podstawa logarytmu. Symbol jest domyślnie zmienną; stałe służą do
 * podpowiadania wartości domyślnych parametrom, nie do ich przechwytywania —
 * inaczej `E = m \cdot g \cdot h` przestałoby zależeć od wysokości.
 */
const BUILTIN = new Set(['t', 'Pi', 'ExponentialE']);

/** Symbole, których potrzebuje wyrażenie — z pominięciem wbudowanych. */
function symbolsOf(latex: string, declared: string[]): string[] {
  return compileExpression(latex, declared).freeSymbols.filter((s) => !BUILTIN.has(s));
}

/**
 * Buduje graf z bloków wzorów.
 *
 * `knownIds` to identyfikatory istniejące w dokumencie, ale **poza** tym grafem.
 * Potrzebne, gdy blok `sim` wybiera podzbiór wzorów: `@derivedFrom` jest wtedy
 * metadaną pochodzenia, nie zależnością obliczeniową, i wskazywanie na wzór
 * spoza podzbioru jest normalne — bez tej listy każdy taki odsyłacz byłby
 * zgłaszany jako brak.
 */
export function buildGraph(blocks: FormulaBlock[], knownIds: string[] = []): FormulaGraph {
  const issues: GraphIssue[] = [];
  const nodes: GraphNode[] = [];

  const seenIds = new Set<string>();
  for (const block of blocks) {
    if (seenIds.has(block.id)) {
      issues.push({ message: `Duplikat identyfikatora wzoru „${block.id}".`, formulaId: block.id });
      continue;
    }
    seenIds.add(block.id);

    for (const issue of block.issues) issues.push({ message: issue.message, formulaId: block.id });

    if (block.kind === 'ode') {
      const state = block.state ?? [];
      const declared = [...state, ...Object.keys(block.vars)];
      const inputs = new Set<string>();
      for (const expression of Object.values(block.derivatives ?? {})) {
        for (const symbol of symbolsOf(expression, declared)) {
          // Zmienna stanu jest wynikiem tego samego węzła, nie jego wejściem —
          // inaczej każdy układ ODE byłby cyklem sam ze sobą.
          if (!state.includes(symbol)) inputs.add(symbol);
        }
      }
      for (const expression of Object.values(block.init ?? {})) {
        for (const symbol of symbolsOf(expression, declared)) {
          if (!state.includes(symbol)) inputs.add(symbol);
        }
      }
      nodes.push({ block, outputs: state, inputs: [...inputs] });
      continue;
    }

    if (!block.target || !block.expression) continue;
    const declared = [...Object.keys(block.vars), block.target];
    nodes.push({
      block,
      outputs: [block.target],
      inputs: symbolsOf(block.expression, declared).filter((s) => s !== block.target),
    });
  }

  // Kto liczy który symbol — podstawa i krawędzi, i wykrycia dwóch definicji.
  const producer = new Map<string, string>();
  for (const node of nodes) {
    for (const output of node.outputs) {
      const previous = producer.get(output);
      if (previous) {
        issues.push({
          message: `Wielkość „${output}" liczą dwa wzory: „${previous}" i „${node.block.id}".`,
          formulaId: node.block.id,
        });
        continue;
      }
      producer.set(output, node.block.id);
    }
  }

  const znane = new Set([...seenIds, ...knownIds]);
  for (const node of nodes) {
    for (const reference of node.block.derivedFrom) {
      if (!znane.has(reference)) {
        issues.push({
          message: `Wzór „${node.block.id}" wywodzi się z „${reference}", którego nie ma w dokumencie.`,
          formulaId: node.block.id,
        });
      }
    }
    issues.push(...dimensionIssues(node));
  }

  const computed = [...producer.keys()];
  const parameters = [...new Set(nodes.flatMap((n) => n.inputs))].filter((s) => !producer.has(s));

  // Parametr, którego nikt nie zadeklarował w `@vars`, jest podejrzany: to
  // zwykle literówka w nazwie (`v_y` w równaniu przy `vy` w `@state`), a wtedy
  // zmienna stanu po cichu staje się stałym parametrem i wynik jest bez sensu,
  // choć nic się nie wywala. Milczymy tylko wtedy, gdy autor nie deklaruje
  // jednostek w ogóle — wtedy brak deklaracji niczego nie znaczy.
  const declaresUnits = nodes.some((node) => Object.keys(node.block.vars).length > 0);
  if (declaresUnits) {
    for (const parameter of parameters) {
      const declared = nodes.some((node) => parameter in node.block.vars);
      if (declared) continue;
      issues.push({
        message: `Wielkość „${parameter}" nie jest przez nic liczona ani zadeklarowana w @vars. `
          + 'Jeśli to zmienna stanu, sprawdź pisownię; jeśli parametr — dopisz jego jednostkę.',
      });
    }
  }

  const graph: FormulaGraph = { nodes, computed, parameters, issues };
  const cycle = findCycle(graph);
  if (cycle) {
    issues.push({ message: `Zależności tworzą cykl: ${cycle.join(' → ')}.`, formulaId: cycle[0] });
  }

  return graph;
}

/**
 * Analiza wymiarowa: obie strony wzoru muszą mieć ten sam wymiar.
 *
 * Sprawdzenie jest celowo płytkie — liczy wymiar tylko dla wzorów złożonych z
 * mnożeń, dzieleń i pierwiastków, czyli tam, gdzie da się to zrobić bez
 * budowania algebry wymiarów. Nie zgłaszamy nic, gdy nie umiemy policzyć:
 * fałszywy alarm w narzędziu do nauki jest gorszy niż brak alarmu.
 */
function dimensionIssues(node: GraphNode): GraphIssue[] {
  const { block } = node;
  if (block.kind !== 'definition' || !block.target || !block.expression) return [];

  const targetUnit = block.vars[block.target];
  if (!targetUnit) return [];

  const dimension = dimensionOf(block.expression, block.vars);
  if (!dimension) return [];

  return sameDimension(dimension, targetUnit)
    ? []
    : [{
      message: `Wymiar prawej strony (${dimension}) nie zgadza się z zadeklarowanym `
        + `dla „${block.target}" (${targetUnit}).`,
      formulaId: block.id,
    }];
}

/**
 * Wymiar wyrażenia, o ile da się go ustalić.
 *
 * Podstawiamy jednostki za symbole i liczymy wyrażenie w math.js — działa dla
 * iloczynów, ilorazów i potęg, czyli dla większości wzorów fizycznych. Suma
 * dwóch różnych wymiarów albo funkcja przestępna dają `undefined` i wtedy
 * milczymy.
 */
function dimensionOf(latex: string, vars: Record<string, string>): string | undefined {
  const symbols = compileExpression(latex, Object.keys(vars)).freeSymbols;
  if (!symbols.length) return undefined;
  if (symbols.some((s) => !vars[s] && !BUILTIN.has(s))) return undefined;
  if (/\\(sin|cos|tan|ln|log|exp|arcsin|arccos|arctan)/.test(latex)) return undefined;

  // Wymiar liczymy na wartościach zastępczych: każda jednostka wchodzi z
  // wartością 1, więc wynik niesie sam wymiar. Różne wartości dałyby ten sam
  // wymiar, a jedynki nie psują pierwiastków.
  try {
    const scope: Record<string, unknown> = {};
    for (const symbol of symbols) {
      const unit = vars[symbol];
      if (unit && unit !== '1') scope[symbol] = math.unit(1, unit);
      else scope[symbol] = 1;
    }
    const expression = latexToMathjs(latex);
    if (!expression) return undefined;
    const value = math.evaluate(expression, scope);
    if (!math.isUnit(value)) return undefined;
    return (value as unknown as { toSI(): { formatUnits(): string } }).toSI().formatUnits();
  } catch {
    return undefined;
  }
}

/**
 * Zamiana prostego LaTeX-a na zapis math.js — tylko na potrzeby wymiarów.
 *
 * Świadomie obsługuje wąską klasę zapisów (ułamki, pierwiastki, potęgi,
 * mnożenie); wszystko poza nią zwraca `undefined`, co wyłącza sprawdzenie.
 * To nie jest drugi parser matematyki — to detektor wymiarów, który woli się
 * poddać niż zgadywać.
 */
function latexToMathjs(latex: string): string | undefined {
  let text = latex;
  let previous: string;
  do {
    previous = text;
    text = text
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\\sqrt\{([^{}]*)\}/g, '(($1)^0.5)');
  } while (text !== previous);

  text = text
    .replace(/\\pi/g, '1')
    .replace(/\\cdot/g, '*')
    .replace(/\\left|\\right/g, '')
    .replace(/_\{?([A-Za-z0-9]+)\}?/g, '_$1');

  if (/\\/.test(text)) return undefined;
  // Mnożenie przez sąsiedztwo: `2 L` → `2 * L`.
  text = text.replace(/([A-Za-z0-9_)])\s+([A-Za-z0-9_(])/g, '$1 * $2');
  return text;
}

/** Pierwszy znaleziony cykl w grafie zależności; `undefined`, gdy go nie ma. */
function findCycle(graph: FormulaGraph): string[] | undefined {
  const producer = new Map<string, string>();
  for (const node of graph.nodes) for (const output of node.outputs) producer.set(output, node.block.id);

  const dependencies = new Map<string, string[]>();
  for (const node of graph.nodes) {
    dependencies.set(node.block.id, node.inputs.map((s) => producer.get(s)).filter((id): id is string => !!id));
  }

  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    if (state.get(id) === 'done') return undefined;
    if (state.get(id) === 'open') return [...stack.slice(stack.indexOf(id)), id];

    state.set(id, 'open');
    stack.push(id);
    for (const next of dependencies.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return undefined;
  };

  for (const node of graph.nodes) {
    const cycle = visit(node.block.id);
    if (cycle) return cycle;
  }
  return undefined;
}

/**
 * Kolejność obliczeń.
 *
 * Węzły niezależne zachowują kolejność z dokumentu — czytelnik widzi wzory w
 * tej kolejności, w jakiej je napisał, więc walkthrough nie ma powodu jej
 * zmieniać. Przy cyklu zwracamy to, co się da: dokument z błędem i tak musi się
 * wyświetlić.
 */
export function topologicalOrder(graph: FormulaGraph): string[] {
  const producer = new Map<string, string>();
  for (const node of graph.nodes) for (const output of node.outputs) producer.set(output, node.block.id);

  const order: string[] = [];
  const state = new Map<string, 'open' | 'done'>();

  const visit = (id: string) => {
    if (state.has(id)) return;
    state.set(id, 'open');
    const node = graph.nodes.find((n) => n.block.id === id);
    for (const symbol of node?.inputs ?? []) {
      const dependency = producer.get(symbol);
      if (dependency && dependency !== id && state.get(dependency) !== 'open') visit(dependency);
    }
    state.set(id, 'done');
    order.push(id);
  };

  for (const node of graph.nodes) visit(node.block.id);
  return order;
}
