/**
 * hints.ts — podpowiedzi wyprowadzone z grafu.
 *
 * Raport (4.1) obiecuje gradację pomocy bez pisania hintów: skoro znamy ścieżkę
 * wyprowadzenia wyniku, znamy też kolejne stopnie podpowiedzi. Tutaj to jest
 * dosłownie ta sama ścieżka, czytana od końca:
 *
 *  1. **który wzór** — nazwa i postać równania, które daje odpowiedź,
 *  2. **czego potrzebujesz** — wielkości wchodzące do tego wzoru,
 *  3. **wartość pośrednia** — policzona liczba jednego kroku wcześniej,
 *  4. **pełne wyprowadzenie** — cała ścieżka od danych do wyniku.
 *
 * Podpowiedź nigdy nie podaje wyniku końcowego. To nie jest ostrożność wobec
 * ucznia, tylko konsekwencja: zadanie, którego ostatnia podpowiedź jest
 * odpowiedzią, przestaje mierzyć cokolwiek.
 */
import type { FormulaGraph } from '../graph/formulaGraph';
import type { PhenomenonResult } from '../graph/compileGraph';
import { walkthrough } from '../graph/walkthrough';

export interface Hint {
  /** Numer stopnia — im wyższy, tym więcej zdradza. */
  level: number;
  text: string;
}

/**
 * Buduje podpowiedzi dla wielkości `answer`.
 *
 * `handWritten` z bloku zadania mają pierwszeństwo: autor, który wie o zadaniu
 * coś ponad strukturę wzorów, nie ma być przez nią zagłuszony.
 */
export function buildHints(
  graph: FormulaGraph,
  answer: string,
  result?: PhenomenonResult,
  handWritten: string[] = [],
): Hint[] {
  if (handWritten.length) return handWritten.map((text, index) => ({ level: index + 1, text }));

  const steps = walkthrough(graph);
  const target = steps.find((step) => step.produces.includes(answer));
  if (!target) return [];

  const node = graph.nodes.find((n) => n.block.id === target.formulaId);
  const hints: Hint[] = [];

  hints.push({
    level: 1,
    text: `Szukanej wielkości dostarcza wzór „${target.formulaId}"`
      + (node?.block.expression ? `: ${node.block.targetLatex ?? node.block.target} = ${node.block.expression}` : '')
      + (target.assumptions.length ? ` (przy założeniu: ${target.assumptions.join(', ')})` : ''),
  });

  if (target.dependsOn.length) {
    hints.push({
      level: 2,
      text: `Potrzebujesz do niego: ${target.dependsOn.join(', ')}.`,
    });
  }

  // Wartości pośrednie: wielkości policzone przed szukaną. Jeśli ich nie ma,
  // zadanie jest jednokrokowe i ten stopień po prostu nie istnieje.
  const earlier = steps.slice(0, steps.indexOf(target)).flatMap((step) => step.produces);
  const intermediate = earlier.filter((name) => result?.scalars[name] !== undefined);
  if (intermediate.length) {
    hints.push({
      level: hints.length + 1,
      text: `Wartości pośrednie: ${intermediate
        .map((name) => `${name} = ${Number(result!.scalars[name].toPrecision(4))}`)
        .join(', ')}.`,
    });
  }

  const path = steps.slice(0, steps.indexOf(target) + 1).map((step) => step.formulaId);
  if (path.length > 1) {
    hints.push({ level: hints.length + 1, text: `Pełna droga: ${path.join(' → ')}.` });
  }

  return hints;
}
