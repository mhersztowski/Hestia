/**
 * expression.ts — LaTeX → funkcja JS, przez CortexJS Compute Engine.
 *
 * Compute Engine kompiluje wyrażenie do kodu JS (`run`), co daje pół miliona
 * wywołań na kilkanaście milisekund — tyle, ile potrzebuje RK4 w pętli. Sama
 * ewaluacja symboliczna (`N()` z podstawieniem) jest o trzy rzędy wielkości
 * wolniejsza i nadaje się tylko do jednorazowych obliczeń.
 *
 * Osobną, ważniejszą rolą tego modułu jest **łapanie cichych pomyłek LaTeX-a**.
 * Dwie zdarzają się naprawdę:
 *
 *  • `\gamma` to w Compute Engine stała Eulera–Mascheroniego (0.5772…), nie
 *    zmienna. Kto zapisze tłumienie jako γ, dostanie wynik policzony z cudzą
 *    stałą i nigdy się o tym nie dowie — wyrażenie kompiluje się bez błędu.
 *  • Mnożenie przez sąsiedztwo bywa czytane jako wywołanie funkcji: `m L^2`
 *    kończy się błędem „Unknown operator L", bo `L` staje się operatorem.
 *
 * Dlatego każdy zadeklarowany symbol musi pojawić się wśród `freeSymbols`
 * skompilowanego wyrażenia. Brak znaczy, że został wchłonięty, i jest błędem.
 */
import { ComputeEngine, compile } from '@cortex-js/compute-engine';
import { reservedSymbol } from './reservedSymbols';

/** Jedna instancja na proces — tworzenie silnika jest kosztowne. */
const engine = new ComputeEngine();

/**
 * Druga instancja, licząca kąty w stopniach.
 *
 * Osobna, a nie przełączana: instancja jest współdzielona przez cały proces,
 * więc chwilowa zmiana jednostki w jednym wywołaniu zmieniałaby znaczenie
 * wzorów liczonych równolegle gdzie indziej — w wykładach fizyki kąt jest
 * zawsze w radianach i ma taki zostać.
 *
 * Tworzona leniwie, bo większość dokumentów nigdy jej nie potrzebuje.
 * Compute Engine wstawia przelicznik do samej funkcji trygonometrycznej
 * (`Math.sin(0.01745 * _.x)`), więc zmienna nie jest skalowana globalnie —
 * `2x` znaczy `2x` niezależnie od trybu.
 */
let degreeEngine: ComputeEngine | undefined;

function engineFor(angularUnit: AngularUnit): ComputeEngine {
  if (angularUnit !== 'degrees') return engine;
  if (!degreeEngine) {
    degreeEngine = new ComputeEngine();
    (degreeEngine as unknown as { angularUnit: string }).angularUnit = 'deg';
  }
  return degreeEngine;
}

/** Jednostka, w której czytane są argumenty funkcji trygonometrycznych. */
export type AngularUnit = 'radians' | 'degrees';

export interface CompiledExpression {
  /** Wywołanie z mapą wartości symboli; `NaN`, gdy kompilacja się nie powiodła. */
  evaluate: (scope: Record<string, number>) => number;
  /** Symbole, których wyrażenie faktycznie potrzebuje. */
  freeSymbols: string[];
  /** Wygenerowany kod — pomaga zrozumieć, jak silnik przeczytał zapis. */
  code?: string;
  issues: string[];
}

/**
 * Kompiluje wyrażenie LaTeX.
 *
 * `declared` to nazwy, które autor uważa za zmienne. Każda z nich, jeśli
 * występuje w zapisie, musi trafić do `freeSymbols` — inaczej zgłaszamy, że
 * silnik zrozumiał ją jako coś innego.
 */
export function compileExpression(
  latex: string,
  declared: string[] = [],
  angularUnit: AngularUnit = 'radians',
): CompiledExpression {
  const issues: string[] = [];

  let result: ReturnType<typeof compile>;
  try {
    // `realOnly` zawęża wynik do liczb rzeczywistych: w fizyce pierwiastek z
    // liczby ujemnej znaczy błąd modelu, a nie liczbę zespoloną do narysowania.
    const ce = engineFor(angularUnit);
    result = compile(ce.parse(latex), { to: 'javascript', realOnly: true });
  } catch (error) {
    return {
      evaluate: () => Number.NaN,
      freeSymbols: [],
      issues: [`Nie umiem odczytać wyrażenia „${latex}": ${(error as Error).message}`],
    };
  }

  const freeSymbols = [...(result.freeSymbols ?? [])];

  if (!result.success || typeof result.run !== 'function') {
    issues.push(
      `Nie umiem skompilować „${latex}". Najczęstsza przyczyna to mnożenie przez sąsiedztwo `
      + '— zapisz je jawnie, np. `m \\cdot L^2` zamiast `m L^2`.',
    );
    return { evaluate: () => Number.NaN, freeSymbols, code: result.code, issues };
  }

  for (const name of declared) {
    if (freeSymbols.includes(name)) continue;
    if (!mentions(latex, name)) continue;
    issues.push(collisionMessage(name));
  }

  const run = result.run as (scope: Record<string, number>) => number;
  return {
    evaluate: (scope) => {
      const value = run(scope);
      return typeof value === 'number' ? value : Number.NaN;
    },
    freeSymbols,
    code: result.code,
    issues,
  };
}

/**
 * Komunikat o zajętej nazwie.
 *
 * Dla znanych kolizji mówi wprost, czym ta nazwa jest dla silnika i co wpisać
 * zamiast niej — „symbol ma wbudowane znaczenie" niczego autorowi nie ułatwia,
 * a „`i` to jednostka urojona, użyj `I`" kończy sprawę w jednym kroku.
 */
function collisionMessage(name: string): string {
  const reserved = reservedSymbol(name);
  if (reserved) {
    return `Symbol „${name}" jest zajęty — dla silnika matematycznego znaczy `
      + `${reserved.meaning}. Użyj innej nazwy, np. ${reserved.suggestion}.`;
  }
  return `Symbol „${name}" występuje w zapisie, ale silnik nie traktuje go jak zmiennej `
    + '— prawdopodobnie ma wbudowane znaczenie. Zmień nazwę zmiennej.';
}

/**
 * Czy zapis wspomina o symbolu.
 *
 * Sprawdzenie tekstowe wystarczy do wykrycia wchłonięcia: interesuje nas tylko,
 * czy autor *chciał* użyć tej nazwy.
 *
 * Granice muszą odróżnić `\theta` od `\theta_0` — bez tego szukanie `theta`
 * trafia w środek `theta_0` i zgłasza fałszywy alarm dla poprawnego zapisu.
 * Backslash granicy nie łamie, bo `\theta` to wciąż wystąpienie `theta`.
 */
function mentions(latex: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(latex);
}

export interface CompiledCondition {
  test: (scope: Record<string, number>) => boolean;
  freeSymbols: string[];
  issues: string[];
}

/**
 * Kompiluje warunek zdarzenia, np. `y < 0`.
 *
 * Osobna ścieżka, bo warunek zwraca prawdę lub fałsz, a `realOnly` z
 * `compileExpression` zamienia wszystko, co nie jest liczbą, na `NaN` — czyli
 * poprawnie skompilowana nierówność dawałaby cicho `NaN` i zdarzenie nigdy by
 * nie zaszło.
 *
 * Wyrażenie liczbowe w miejscu warunku jest błędem, a nie domyślnym
 * porównaniem z zerem: „`y`" i „`y < 0`" to dwie różne intencje i zgadywanie
 * której chciał autor kończy się źle.
 */
export function compileCondition(latex: string, declared: string[] = []): CompiledCondition {
  const issues: string[] = [];

  let result: ReturnType<typeof compile>;
  try {
    result = compile(engine.parse(latex), { to: 'javascript' });
  } catch (error) {
    return { test: () => false, freeSymbols: [], issues: [`Nie umiem odczytać warunku „${latex}": ${(error as Error).message}`] };
  }

  const freeSymbols = [...(result.freeSymbols ?? [])];
  if (!result.success || typeof result.run !== 'function') {
    return { test: () => false, freeSymbols, issues: [`Nie umiem skompilować warunku „${latex}".`] };
  }

  for (const name of declared) {
    if (freeSymbols.includes(name) || !mentions(latex, name)) continue;
    issues.push(`W warunku „${latex}" symbol „${name}" nie jest traktowany jak zmienna.`);
  }

  const run = result.run as (scope: Record<string, number>) => unknown;

  // Sprawdzamy od razu, na wartościach zastępczych: warunek, który zwraca
  // liczbę zamiast prawdy/fałszu, jest błędem zapisu i autor ma go zobaczyć
  // przy pisaniu, a nie dopiero wtedy, gdy zdarzenie nie zajdzie.
  const probe = Object.fromEntries(freeSymbols.map((name) => [name, 0]));
  let returnsBoolean = false;
  try {
    returnsBoolean = typeof run(probe) === 'boolean';
  } catch {
    returnsBoolean = false;
  }
  if (!returnsBoolean) {
    issues.push(`Warunek „${latex}" nie jest porównaniem — dopisz np. „< 0".`);
    return { test: () => false, freeSymbols, issues };
  }

  return {
    test: (scope) => run(scope) === true,
    freeSymbols,
    issues,
  };
}

/** Jednorazowe policzenie wartości — dla wyrażeń poza pętlą (np. warunki początkowe). */
export function evaluateOnce(latex: string, scope: Record<string, number>): number {
  const compiled = compileExpression(latex, Object.keys(scope));
  return compiled.evaluate(scope);
}

/** Warunek zdarzenia rozłożony na funkcję o znanym znaku. */
export interface CompiledComparison {
  /**
   * Lewa strona minus prawa — zdarzenie zachodzi tam, gdzie przechodzi przez zero.
   *
   * Cała sztuczka etapu 2 mieści się w tym odjęciu: „czy y < 0" jest pytaniem
   * zamkniętym i odpowiedź brzmi tak albo nie, a „ile wynosi y" jest funkcją
   * ciągłą, więc jej miejsce zerowe da się **znaleźć** z dowolną dokładnością.
   */
  value: (scope: Record<string, number>) => number;
  /** Kierunek przejścia wynikający z operatora. */
  direction: 'up' | 'down' | 'any';
  freeSymbols: string[];
  issues: string[];
}

/** Operatory porównania w kolejności od najdłuższego — inaczej `\le` zjadłoby `\leq`. */
const COMPARISONS: Array<[RegExp, 'up' | 'down' | 'any']> = [
  [/\\leqslant|\\leq|\\le\b|<=|</, 'down'],
  [/\\geqslant|\\geq|\\ge\b|>=|>/, 'up'],
  [/=/, 'any'],
];

/**
 * Dzieli warunek na strony porównania, pomijając wnętrza nawiasów klamrowych.
 *
 * Bez pilnowania nawiasów `\frac{a<b}{c}` rozpadłoby się w środku argumentu —
 * a takie zapisy zdarzają się w warunkach z ułamkami.
 */
function splitAtComparison(latex: string): { left: string; right: string; direction: 'up' | 'down' | 'any' } | undefined {
  for (const [pattern, direction] of COMPARISONS) {
    let depth = 0;
    for (let i = 0; i < latex.length; i += 1) {
      const char = latex[i];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      if (depth !== 0) continue;

      const match = pattern.exec(latex.slice(i));
      if (!match || match.index !== 0) continue;
      return {
        left: latex.slice(0, i),
        right: latex.slice(i + match[0].length),
        direction,
      };
    }
  }
  return undefined;
}

/**
 * Rozkłada warunek zdarzenia na funkcję zmieniającą znak.
 *
 * Zwraca `undefined`, gdy warunek nie jest **pojedynczym** porównaniem —
 * koniunkcja nie ma jednej takiej funkcji, a wybranie jednego z członów po
 * cichu zgubiłoby drugi. Wołający ma wtedy wrócić do sprawdzania po kroku
 * i o tym powiedzieć.
 */
export function compileComparison(latex: string, declared: string[] = []): CompiledComparison | undefined {
  const parts = splitAtComparison(latex);
  if (!parts) return undefined;
  // Człon z operatorem logicznym znaczy, że to nie jest proste porównanie.
  if (/\\land|\\lor|\\wedge|\\vee|&&|\|\|/.test(latex)) return undefined;
  if (!parts.left.trim() || !parts.right.trim()) return undefined;

  const left = compileExpression(parts.left, declared);
  const right = compileExpression(parts.right, declared);

  return {
    value: (scope) => left.evaluate(scope) - right.evaluate(scope),
    direction: parts.direction,
    freeSymbols: [...new Set([...left.freeSymbols, ...right.freeSymbols])],
    issues: [...left.issues, ...right.issues],
  };
}
