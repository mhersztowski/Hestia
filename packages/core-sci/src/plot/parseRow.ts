/**
 * parseRow.ts — rozpoznanie jednego wiersza listy wyrażeń.
 *
 * Wiersz kalkulatora nie jest „tekstem do narysowania": `y = x^2` to wykres,
 * `a = 3` to parametr, `f(x) = x^2` to definicja, a `x^2 + y^2 = 4` to krzywa
 * uwikłana. Rozpoznanie dzieje się **raz**, przy wpisaniu, i to ono decyduje,
 * którym rendererem wiersz pójdzie dalej — dzięki temu warstwa rysująca nie
 * musi już niczego zgadywać.
 *
 * ## Skąd biorą się wolne symbole
 *
 * Z kompilacji, nie ze skanowania tekstu. Zapis `\exp(x)` zawiera literę `x`
 * dwa razy, ale zmienną jest tylko jedna z nich; `\pi` wygląda jak nazwa,
 * a jest liczbą. Compute Engine wie o tym wszystkim, więc pytamy jego —
 * `compileExpression` i tak trzeba wywołać do rysowania, a wynik da się podać
 * dalej.
 *
 * ## Co jest zmienną osi
 *
 * `x` i `y` są zarezerwowane dla osi i nigdy nie trafiają na listę parametrów.
 * Bez tego kalkulator pokazałby suwak pozwalający „ustawić x", co nie ma
 * znaczenia — x jest tym, po czym przebiegamy przy rysowaniu.
 */

import { compileExpression } from '../formula/expression';
import { reservedSymbol } from '../formula/reservedSymbols';
import { splitRelation, type RelationOp } from './relation';

/** Rodzaj wiersza; ustalany raz i przechowywany razem z wierszem. */
export type PlotRowKind =
  /** `y = f(x)` albo samo `f(x)` — krzywa przebiegana po osi x. */
  | 'explicit-y'
  /** `x = g(y)` — krzywa przebiegana po osi y; obejmuje proste pionowe. */
  | 'explicit-x'
  /** `f(x, y) = c` — krzywa uwikłana. */
  | 'implicit'
  /** `y < x^2`, `x^2 + y^2 \le 4` — obszar. */
  | 'inequality'
  /** `(2, 5)` — punkt. */
  | 'point'
  /** `a = 3` — parametr; źródło suwaka. */
  | 'constant'
  /** `f(x) = x^2` — definicja funkcji. */
  | 'function'
  /** `z = f(x, y)` — powierzchnia w przestrzeni. */
  | 'surface'
  /** `2 + 2` — wyrażenie bez zmiennych, do policzenia. */
  | 'value'
  /** Wiersz pusty — normalny stan listy, nie usterka. */
  | 'blank'
  /** Zapis, którego nie umiemy odczytać. */
  | 'unknown';

export interface PlotPoint {
  x: string;
  y: string;
}

export interface ParsedPlotRow {
  latex: string;
  kind: PlotRowKind;
  /** Wyrażenie do policzenia; dla wykresów jawnych prawa strona równania. */
  body: string;
  /** Nazwa definiowana — dla `constant` i `function`. */
  name?: string;
  /** Argumenty definicji funkcji, w kolejności zapisu. */
  params?: string[];
  /** Operator — dla nierówności. */
  relation?: RelationOp;
  /** Lewa strona relacji — potrzebna przy krzywych uwikłanych i nierównościach. */
  lhs?: string;
  rhs?: string;
  /** Współrzędne punktu, każda jako osobne wyrażenie. */
  point?: PlotPoint;
  /**
   * Symbole, których wiersz potrzebuje z zewnątrz.
   *
   * Bez zmiennych osi, bez argumentów własnej definicji i bez stałych
   * matematycznych. To z tej listy powstają suwaki i krawędzie grafu
   * zależności między wierszami.
   */
  freeSymbols: string[];
  issues: string[];
}

/** Zmienne osi — nigdy nie są parametrem. */
const AXIS = new Set(['x', 'y']);

/** `f(x)` albo `g(t, u)` po lewej stronie równania. */
const FUNCTION_HEAD = /^([A-Za-z][A-Za-z0-9]*)\s*\(([^()]*)\)$/;

/** Nazwa parametru: litera łacińska albo grecka, z opcjonalnym indeksem. */
const NAME = /^(?:\\[A-Za-z]+|[A-Za-z])(?:_\{?[A-Za-z0-9]+\}?)?$/;

/**
 * Wolne symbole wyrażenia, po odsianiu tego, co parametrem nie jest.
 *
 * `bound` to nazwy związane w miejscu użycia — zmienne osi przy wykresie
 * i argumenty przy definicji funkcji.
 */
function freeSymbolsOf(latex: string, bound: Iterable<string>, issues: string[]): string[] {
  const compiled = compileExpression(latex);
  issues.push(...compiled.issues);

  const boundSet = new Set(bound);
  return compiled.freeSymbols
    .filter((symbol) => !boundSet.has(symbol))
    // Stała matematyczna ma wartość; suwak pozwalający zmienić π nie znaczy nic.
    .filter((symbol) => !reservedSymbol(symbol))
    .sort();
}

/** Rozkłada `(a, b)` na współrzędne; `undefined`, gdy to nie jest para. */
function asPoint(latex: string): PlotPoint | undefined {
  const text = latex.trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return undefined;

  const inner = text.slice(1, -1);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());

  // Para, nie trójka i nie pojedyncze wyrażenie w nawiasie.
  if (parts.length !== 2 || parts.some((p) => p === '')) return undefined;
  return { x: parts[0], y: parts[1] };
}

/** Czy wyrażenie w ogóle zależy od danej zmiennej osi. */
function usesAxis(latex: string, axis: 'x' | 'y'): boolean {
  return compileExpression(latex).freeSymbols.includes(axis);
}

export function parsePlotRow(latex: string): ParsedPlotRow {
  const text = latex.trim();
  const issues: string[] = [];

  if (!text) {
    return { latex, kind: 'blank', body: '', freeSymbols: [], issues };
  }

  const point = asPoint(text);
  if (point) {
    const free = [
      ...freeSymbolsOf(point.x, AXIS, issues),
      ...freeSymbolsOf(point.y, AXIS, issues),
    ];
    return {
      latex, kind: 'point', body: text, point,
      freeSymbols: [...new Set(free)].sort(),
      issues,
    };
  }

  const relation = splitRelation(text);

  if (!relation) {
    /*
     * Wyrażenie bez relacji. Desmos czyta `sin(x)` jako `y = sin(x)` — bez tego
     * przy każdym wierszu trzeba by dopisywać `y=`, czyli dokładnie to, czego
     * kalkulator ma oszczędzić.
     */
    if (text.includes('\\ne')) {
      issues.push('Relacja „różne od" nie ma obrazu na płaszczyźnie — narysowaniem byłby prawie cały ekran.');
      return { latex, kind: 'unknown', body: text, freeSymbols: [], issues };
    }

    const compiled = compileExpression(text);
    if (compiled.issues.length > 0) {
      return { latex, kind: 'unknown', body: text, freeSymbols: [], issues: compiled.issues };
    }

    const free = freeSymbolsOf(text, AXIS, issues);
    const dependsOnX = compiled.freeSymbols.includes('x');
    const dependsOnY = compiled.freeSymbols.includes('y');

    if (dependsOnX) return { latex, kind: 'explicit-y', body: text, freeSymbols: free, issues };
    if (dependsOnY) return { latex, kind: 'explicit-x', body: text, freeSymbols: free, issues };
    return { latex, kind: 'value', body: text, freeSymbols: free, issues };
  }

  const { lhs, op, rhs } = relation;

  if (op !== '=') {
    const free = [
      ...freeSymbolsOf(lhs, AXIS, issues),
      ...freeSymbolsOf(rhs, AXIS, issues),
    ];
    return {
      latex, kind: 'inequality', body: rhs, relation: op, lhs, rhs,
      freeSymbols: [...new Set(free)].sort(),
      issues,
    };
  }

  /*
   * `z = f(x, y)` — powierzchnia.
   *
   * Sprawdzamy **zależność od osi**, a nie samą nazwę po lewej: `z = 3` bez
   * zmiennych jest stałą i musi nią zostać, inaczej suwak `z` przestałby
   * działać. Zależność od jednej zmiennej wystarczy — `z = x^2` to rynna,
   * powierzchnia stała wzdłuż `y`, i jest to przypadek pouczający.
   */
  if (lhs === 'z' && (usesAxis(rhs, 'x') || usesAxis(rhs, 'y'))) {
    return {
      latex, kind: 'surface', body: rhs, lhs, rhs,
      freeSymbols: freeSymbolsOf(rhs, AXIS, issues),
      issues,
    };
  }

  // Lewa strona to sama zmienna osi — wykres jawny. Obejmuje `x = 3`, czyli
  // prostą pionową: po lewej stoi zmienna osi, więc to nie definicja stałej.
  if (lhs === 'y' || lhs === 'x') {
    const kind = lhs === 'y' ? 'explicit-y' : 'explicit-x';
    return { latex, kind, body: rhs, lhs, rhs, freeSymbols: freeSymbolsOf(rhs, AXIS, issues), issues };
  }

  // `f(x) = …` — definicja funkcji. Polecenie LaTeX-a odpada, bo zaczyna się
  // od „\": `\sin(x) = 0` to równanie do rozwiązania, nie definicja.
  const head = FUNCTION_HEAD.exec(lhs);
  if (head && !lhs.startsWith('\\')) {
    const params = head[2].split(',').map((p) => p.trim()).filter(Boolean);
    return {
      latex, kind: 'function', body: rhs, name: head[1], params,
      lhs, rhs,
      freeSymbols: freeSymbolsOf(rhs, params, issues),
      issues,
    };
  }

  // Sama nazwa po lewej — parametr.
  if (NAME.test(lhs)) {
    return {
      latex, kind: 'constant', body: rhs, name: lhs, lhs, rhs,
      freeSymbols: freeSymbolsOf(rhs, AXIS, issues),
      issues,
    };
  }

  // Zostaje krzywa uwikłana: obie strony to wyrażenia, a nie nazwa.
  const free = [
    ...freeSymbolsOf(lhs, AXIS, issues),
    ...freeSymbolsOf(rhs, AXIS, issues),
  ];
  const dependsOnBoth = usesAxis(lhs, 'x') || usesAxis(lhs, 'y') || usesAxis(rhs, 'x') || usesAxis(rhs, 'y');

  if (!dependsOnBoth && issues.length === 0) {
    // Równanie bez zmiennych osi to warunek na parametry, nie krzywa.
    issues.push('Równanie nie zależy od x ani y — nie ma czego narysować.');
    return { latex, kind: 'unknown', body: rhs, lhs, rhs, freeSymbols: free, issues };
  }

  return {
    latex, kind: 'implicit', body: rhs, lhs, rhs,
    freeSymbols: [...new Set(free)].sort(),
    issues,
  };
}
