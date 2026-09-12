/**
 * evaluate.ts — dokument w liczby: parametry, kolejność zależności, funkcje
 * gotowe do próbkowania.
 *
 * Lista wyrażeń nie jest programem czytanym z góry na dół. `b = 2a` wolno
 * napisać nad `a = 5`, bo wiersze wiąże zależność, a nie kolejność wpisania —
 * dokładnie tak samo, jak arkusz kalkulacyjny wiąże komórki. Kolejność liczenia
 * bierzemy więc z grafu zależności, a cykl zgłaszamy zamiast się w nim zapętlić.
 *
 * ## Czego tu jeszcze nie ma
 *
 * Definicja funkcji (`f(x) = x^2`) jest **rozpoznawana**, ale jeszcze nie
 * podstawiana w innych wierszach: wymaga to wstrzyknięcia definicji do
 * Compute Engine, co jest osobną pracą. Do tego czasu wiersz mówi o tym
 * wprost, zamiast milczeć.
 */

import { compileExpression } from '../formula/expression';
import type { PlotDocument, PlotRow } from './document';
import type { PlotRowKind } from './parseRow';

export interface EvaluatedRow {
  id: string;
  kind: PlotRowKind;
  latex: string;
  /**
   * Funkcja do próbkowania.
   *
   * Dla `explicit-y` bierze x i oddaje y; dla `explicit-x` odwrotnie. Brak
   * znaczy, że wiersz nie jest krzywą — albo że nie dało się go policzyć.
   */
  fn?: (t: number) => number;
  /**
   * Funkcja dwóch zmiennych dla krzywych uwikłanych i nierówności.
   *
   * Zwraca `lewa − prawa`, więc krzywa to miejsce, gdzie wynik jest zerem,
   * a obszar nierówności — gdzie ma właściwy znak. Sprowadzenie obu stron do
   * jednej różnicy pozwala tej samej metodzie obsłużyć `x² + y² = 4`
   * i `x² + y² < 4`.
   */
  fn2?: (x: number, y: number) => number;
  /** Strona nierówności do wypełnienia; brak = sam kontur. */
  fill?: 'negative' | 'positive';
  /** Współrzędne punktu, już policzone. */
  point?: { x: number; y: number };
  /** Wartość wyrażenia bez zmiennych. */
  value?: number;
  issues: string[];
}

export interface EvaluationResult {
  rows: EvaluatedRow[];
  /** Wartości parametrów — do pokazania przy suwakach. */
  scope: Record<string, number>;
  /** Uwagi dotyczące całego dokumentu, np. cykl zależności. */
  issues: string[];
}

/**
 * Sortuje definicje tak, by każda liczyła się po tych, od których zależy.
 *
 * Zwraca też uczestników cyklu — nie samą informację, że cykl istnieje.
 * „Wykryto cykl" nie mówi, gdzie szukać; „a zależy od b, b od a" mówi.
 */
function orderDefinitions(
  definitions: Map<string, { deps: string[] }>,
): { order: string[]; cycles: string[][] } {
  const order: string[] = [];
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (name: string, path: string[]): void => {
    const current = state.get(name);
    if (current === 'done') return;
    if (current === 'visiting') {
      // Zamknięcie ścieżki na sobie — wycinamy pętlę od miejsca powrotu.
      const start = path.indexOf(name);
      cycles.push(path.slice(start >= 0 ? start : 0));
      return;
    }

    state.set(name, 'visiting');
    for (const dep of definitions.get(name)?.deps ?? []) {
      if (definitions.has(dep)) visit(dep, [...path, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };

  for (const name of definitions.keys()) visit(name, []);
  return { order, cycles };
}

export function evaluateDocument(
  doc: PlotDocument,
  overrides: Record<string, number> = {},
): EvaluationResult {
  const issues: string[] = [];
  const scope: Record<string, number> = {};

  // --- definicje parametrów ---------------------------------------------

  const definitions = new Map<string, { row: PlotRow; deps: string[] }>();
  for (const row of doc.rows) {
    if (row.parsed.kind !== 'constant' || !row.parsed.name) continue;
    // Pierwsza definicja wygrywa; druga jest błędem autora, nie powodem do
    // liczenia raz tak, raz inaczej.
    if (definitions.has(row.parsed.name)) {
      issues.push(`Parametr „${row.parsed.name}" jest zdefiniowany więcej niż raz — liczę z pierwszej definicji.`);
      continue;
    }
    definitions.set(row.parsed.name, { row, deps: row.parsed.freeSymbols });
  }

  const { order, cycles } = orderDefinitions(definitions);
  for (const cycle of cycles) {
    issues.push(`Cykl zależności: ${cycle.join(' → ')} → ${cycle[0]}. Te parametry nie mają wartości.`);
  }

  const wCyklu = new Set(cycles.flat());

  for (const name of order) {
    if (wCyklu.has(name)) continue;

    // Suwak ma pierwszeństwo — to jedyny powód, dla którego istnieje.
    if (name in overrides) {
      scope[name] = overrides[name];
      continue;
    }
    const entry = definitions.get(name);
    if (!entry) continue;
    scope[name] = compileExpression(entry.row.parsed.body, [], doc.settings.angleUnit).evaluate(scope);
  }

  // Parametry z suwaków, dla których nie ma wiersza definicji.
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in scope)) scope[name] = value;
  }

  // --- wiersze ----------------------------------------------------------

  /*
   * Jednostkę kąta obsługuje silnik wyrażeń, a nie skalowanie argumentu.
   *
   * Pierwsze podejście mnożyło `x` przez π/180 przed wywołaniem funkcji —
   * i psuło wszystko, co kątem nie jest: `y = 2x` dawało wtedy 0,105 zamiast 6.
   * Compute Engine wstawia przelicznik do samej funkcji trygonometrycznej,
   * więc zamiana dotyczy dokładnie tego, co powinna.
   */
  const kat = doc.settings.angleUnit;

  const rows: EvaluatedRow[] = doc.rows.map((row) => {
    const { parsed } = row;
    const base: EvaluatedRow = { id: row.id, kind: parsed.kind, latex: row.latex, issues: [...parsed.issues] };

    /** Symbole, których nie umiemy podać — wykres i tak powstanie, z zerem. */
    const brakujace = parsed.freeSymbols.filter((s) => !(s in scope));
    if (brakujace.length > 0 && parsed.kind !== 'blank') {
      base.issues.push(`Nie znam wartości: ${brakujace.join(', ')}. Dodaj wiersz z definicją, np. „${brakujace[0]} = 1".`);
    }

    switch (parsed.kind) {
      case 'explicit-y':
      case 'explicit-x': {
        const zmienna = parsed.kind === 'explicit-y' ? 'x' : 'y';
        const compiled = compileExpression(parsed.body, [], kat);
        base.issues.push(...compiled.issues);

        base.fn = (t: number) => {
          // Zerami zastępujemy brakujące parametry dopiero tutaj, w miejscu
          // wywołania — dzięki temu zmiana suwaka nie wymaga rekompilacji.
          const local: Record<string, number> = { ...scope, [zmienna]: t };
          for (const missing of brakujace) local[missing] = 0;
          return compiled.evaluate(local);
        };
        break;
      }

      case 'implicit':
      case 'inequality': {
        if (!parsed.lhs || !parsed.rhs) break;

        const lewa = compileExpression(parsed.lhs, [], kat);
        const prawa = compileExpression(parsed.rhs, [], kat);
        base.issues.push(...lewa.issues, ...prawa.issues);

        base.fn2 = (x: number, y: number) => {
          const local: Record<string, number> = { ...scope, x, y };
          for (const missing of brakujace) local[missing] = 0;
          return lewa.evaluate(local) - prawa.evaluate(local);
        };

        /*
         * Strona do wypełnienia wynika z operatora.
         *
         * `y < x²` znaczy `y − x² < 0`, czyli obszar po stronie ujemnej różnicy.
         * Nierówność nieostra dostaje ten sam obszar: różnica między `<` a `≤`
         * to sama krzywa graniczna, a ta ma zerową grubość i tak jest rysowana
         * konturem.
         */
        if (parsed.kind === 'inequality') {
          base.fill = parsed.relation === '<' || parsed.relation === '<=' ? 'negative' : 'positive';
        }
        break;
      }

      case 'point': {
        if (!parsed.point) break;
        const x = compileExpression(parsed.point.x, [], kat).evaluate(scope);
        const y = compileExpression(parsed.point.y, [], kat).evaluate(scope);
        base.point = { x, y };
        break;
      }

      case 'value': {
        base.value = compileExpression(parsed.body, [], kat).evaluate(scope);
        break;
      }

      case 'function': {
        base.issues.push(
          'Definicje funkcji są na razie tylko rozpoznawane — użycie „'
          + `${parsed.name}(x)" w innym wierszu jeszcze nie zadziała.`,
        );
        break;
      }

      default:
        break;
    }

    return base;
  });

  return { rows, scope, issues };
}
