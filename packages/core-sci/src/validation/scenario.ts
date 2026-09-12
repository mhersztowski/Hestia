/**
 * scenario.ts — układ z dokumentu w postaci przenośnej dla SciPy.
 *
 * Cross-walidacja z raportu (§7, poziom 2): dwa niezależne silniki liczą to
 * samo, więc błąd musiałby być identyczny w obu, żeby przejść niezauważony.
 * Niezależność jest tu prawdziwa — RK4 z krokiem stałym po naszej stronie,
 * adaptacyjny LSODA/RK45 po stronie SciPy.
 *
 * Wspólnym punktem obu dróg jest **tłumaczenie wzoru**, i dokładnie dlatego
 * scenariusz niesie ze sobą `checkpoints`: wartości prawych stron policzone
 * przez nasz silnik w kilku stanach. Skrypt Pythona sprawdza je, **zanim**
 * zacznie całkować. Bez tego rozjazd w tłumaczeniu udawałby zgodność albo
 * rozbieżność solwerów, a to są zupełnie różne diagnozy.
 */
import type { FormulaBlock } from '../formula/parseFormula';
import { compileComparison, compileExpression } from '../formula/expression';
import { latexToPython } from './toPython';

export interface ScenarioCheckpoint {
  /** Stan, w którym liczono pochodne. */
  state: Record<string, number>;
  /** Wartości prawych stron według naszego silnika. */
  derivatives: Record<string, number>;
}

export interface Scenario {
  id: string;
  /** Zmienne stanu w kolejności wektora — obie strony muszą ją zachować. */
  state: string[];
  /** Prawe strony jako wyrażenia Pythona: nazwa zmiennej → kod. */
  derivatives: Record<string, string>;
  parameters: Record<string, number>;
  initial: Record<string, number>;
  tSpan: [number, number];
  /** Ile punktów porównać — rzadziej niż kroków całkowania, bo chodzi o zgodność, nie o zapis. */
  samples: number;
  /**
   * Metoda, którą ma liczyć strona referencyjna.
   *
   * Dla większości układów `DOP853` z ciasnymi tolerancjami jest najlepszym
   * możliwym odniesieniem. Dla układu **sztywnego** byłby jednak odniesieniem
   * bezużytecznym — jawna metoda albo nie skończy, albo skończy po godzinie —
   * więc scenariusz musi umieć poprosić o metodę niejawną. Bez tego pola
   * całego etapu 3 nie da się skonfrontować z niezależnym silnikiem.
   */
  method?: 'DOP853' | 'Radau' | 'LSODA' | 'BDF';
  /**
   * Zdarzenia jako wyrażenia zmieniające znak — w składni Pythona.
   *
   * SciPy nazywa to tak samo i rozwiązuje tak samo (miejsce zerowe wewnątrz
   * kroku), więc porównanie **chwil zdarzeń** jest sprawdzeniem etapu 2 przez
   * niezależną implementację tej samej idei.
   */
  events?: Array<{ expression: string; direction: number; terminal: boolean }>;
  checkpoints: ScenarioCheckpoint[];
  issues: string[];
}

export interface ScenarioOptions {
  parameters: Record<string, number>;
  initial?: Record<string, number>;
  tSpan?: [number, number];
  samples?: number;
  /** Metoda strony referencyjnej; domyślnie DOP853. */
  method?: Scenario['method'];
  /** Czy przenieść zdarzenia z bloku (`@when`) do scenariusza. */
  events?: boolean;
}

/**
 * Stany do sprawdzenia tłumaczenia.
 *
 * Rozrzucone celowo: same zera przepuściłyby błąd w członie liniowym, a same
 * jedynki — pomylenie mnożenia z dodawaniem.
 */
const PROBKI = [0, 0.37, -0.81, 1.5];

/**
 * Normalizacja ujemnego zera.
 *
 * `JSON.stringify(-0)` daje `0`, więc fixture wczytany z pliku różniłby się od
 * tego, co przed chwilą zapisaliśmy — a porównanie „przed i po" jest jedynym
 * sposobem sprawdzenia, że fixture w ogóle da się odtworzyć. Matematycznie to
 * ta sama liczba.
 */
const bezMinusZera = (x: number) => (Object.is(x, -0) ? 0 : x);

/** Buduje scenariusz z bloku ODE. */
export function exportScenario(
  block: FormulaBlock,
  options: ScenarioOptions,
): Scenario {
  const issues: string[] = [];
  const state = block.state ?? [];

  if (block.kind !== 'ode' || !state.length) {
    issues.push('Cross-walidacja dotyczy układów ODE — ten blok nim nie jest.');
  }

  const derivatives: Record<string, string> = {};
  for (const name of state) {
    const latex = block.derivatives?.[name];
    if (!latex) { issues.push(`Brak pochodnej dla „${name}".`); continue; }

    const wynik = latexToPython(latex);
    issues.push(...wynik.issues);
    derivatives[name] = wynik.code;
  }

  // Warunki początkowe z dokumentu, chyba że wywołujący poda własne.
  const initial: Record<string, number> = {};
  for (const name of state) {
    if (options.initial?.[name] !== undefined) { initial[name] = options.initial[name]; continue; }

    const wyrazenie = block.init?.[name];
    initial[name] = wyrazenie
      ? bezMinusZera(compileExpression(wyrazenie, Object.keys(options.parameters)).evaluate(options.parameters))
      : 0;
  }

  // Punkty kontrolne liczy **nasz** silnik — Python ma je odtworzyć.
  const checkpoints: ScenarioCheckpoint[] = PROBKI.map((wartosc) => {
    const stan: Record<string, number> = {};
    state.forEach((name, index) => {
      // Każda zmienna dostaje inną próbkę, żeby nie przepuścić zamiany
      // zmiennych miejscami w wektorze stanu.
      stan[name] = PROBKI[(PROBKI.indexOf(wartosc) + index) % PROBKI.length];
    });

    const scope = { ...options.parameters, ...stan, t: 0 };
    const pochodne: Record<string, number> = {};
    for (const name of state) {
      const latex = block.derivatives?.[name];
      if (!latex) continue;
      pochodne[name] = bezMinusZera(compileExpression(
        latex,
        [...Object.keys(options.parameters), ...state, 't'],
      ).evaluate(scope));
    }

    return { state: stan, derivatives: pochodne };
  });

  /**
   * Zdarzenia przetłumaczone na wyrażenia zmieniające znak.
   *
   * Warunek `y < 0` staje się funkcją `y` — dokładnie tak, jak po naszej
   * stronie robi to `compileComparison`. Kierunek zapisujemy w konwencji SciPy
   * (−1 znaczy „przejście malejące"), bo to ona jest tu stroną obcą.
   */
  const events = options.events
    ? (block.events ?? []).map((event) => {
      const rozkład = compileComparison(event.when, [...state, ...Object.keys(options.parameters)]);
      if (!rozkład) {
        issues.push(`Warunku „${event.when}" nie da się rozłożyć na wielkość przechodzącą przez zero.`);
        return undefined;
      }
      const strony = event.when.split(/<=|>=|<|>|=/);
      const lewa = latexToPython(strony[0]);
      const prawa = latexToPython(strony[1] ?? '0');
      issues.push(...lewa.issues, ...prawa.issues);

      return {
        expression: `(${lewa.code}) - (${prawa.code})`,
        direction: rozkład.direction === 'down' ? -1 : (rozkład.direction === 'up' ? 1 : 0),
        terminal: !!event.stop,
      };
    }).filter((e): e is NonNullable<typeof e> => !!e)
    : undefined;

  return {
    id: block.id,
    state,
    derivatives,
    parameters: options.parameters,
    initial,
    tSpan: options.tSpan ?? [0, 10],
    samples: options.samples ?? 50,
    method: options.method ?? 'DOP853',
    events,
    checkpoints,
    issues,
  };
}
