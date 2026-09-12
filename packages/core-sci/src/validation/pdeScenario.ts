/**
 * pdeScenario.ts — pole na siatce jako scenariusz dla drugiego silnika.
 *
 * Cross-walidacja pokrywała wyłącznie układy ODE. Dla pól to brak dotkliwszy
 * niż gdzie indziej: jawny schemat różnic skończonych ma **warunek
 * stabilności**, którego błędne wyliczenie objawia się dopiero na gęstszej
 * siatce — i to nie jako błąd, tylko jako wynik, który rozbiega się do
 * nieskończoności albo, gorzej, wygląda wiarygodnie i jest zły.
 *
 * Scenariusz opisuje pole tak, żeby dało się je policzyć **metodą linii**
 * w SciPy: siatka, dziedzina, warunek początkowy i prawa strona z laplasjanem
 * podanym jako osobny symbol. To jest ta sama droga co przy ODE — wspólnym
 * punktem obu silników zostaje wyłącznie tłumaczenie wzoru, więc punkty
 * kontrolne sprawdzamy najpierw.
 */
import type { FormulaBlock } from '../formula/parseFormula';
import { latexToPython } from './toPython';
import { podstawLaplasjan } from '../pde/grid2d';

export interface PdeScenario {
  id: string;
  field: string;
  nx: number;
  ny: number;
  domainX: [number, number];
  domainY: [number, number];
  /** `diffusion` (pierwszy rząd w czasie) albo `wave` (drugi). */
  order: 'diffusion' | 'wave';
  /** Prawa strona w Pythonie; laplasjan pod symbolem `Lambda`. */
  rhs: string;
  /** Warunek początkowy jako wyrażenie od `x` i `y`. */
  initial: string;
  /** `dirichlet` z wartością albo `neumann` (brzeg izolowany). */
  boundary: { kind: string; value: number };
  parameters: Record<string, number>;
  tSpan: [number, number];
  /** Ile klatek zapisać do porównania. */
  frames: number;
  issues: string[];
}

export interface PdeScenarioOptions {
  parameters: Record<string, number>;
  tSpan: [number, number];
  frames?: number;
  /**
   * Siatka do walidacji — zwykle **rzadsza** niż w dokumencie.
   *
   * Porównanie 96×96 przez sto klatek daje plik na kilkadziesiąt megabajtów,
   * a błąd schematu widać tak samo na siatce 32×32. Gęstość jest tu kosztem,
   * nie dokładnością rozstrzygnięcia.
   */
  grid?: { nx: number; ny: number };
  /**
   * Warunek początkowy podmieniony na potrzeby walidacji.
   *
   * Niektóre warunki z dokumentów są dobrane pod to, żeby zjawisko było
   * widoczne, a nie pod porównywanie silników: stroma plamka niesie wysokie
   * częstości przestrzenne, dla których każda dyskretyzacja ma własną
   * dyspersję. Porównanie mówiłoby wtedy o różnicy między siatkami, a nie
   * o poprawności solvera.
   */
  initial?: string;
}

/** Scenariusz pola do policzenia niezależnym silnikiem. */
export function exportPdeScenario(block: FormulaBlock, options: PdeScenarioOptions): PdeScenario {
  const issues: string[] = [];
  const pde = block.pde;

  if (block.kind !== 'pde' || !pde?.field) {
    issues.push('Cross-walidacja pól dotyczy bloków `@pde` — ten blok nim nie jest.');
  }

  const rownanie = pde?.second ?? pde?.first;
  if (!rownanie) issues.push('Blok pola nie ma równania (`@d` albo `@d2`).');

  /*
   * Laplasjan podstawiamy pod jednoznakowy symbol **przed** tłumaczeniem, tak
   * samo jak przy kompilacji do naszego solvera. Inaczej `\Delta u` wyszłoby
   * z tłumaczenia jako iloczyn `Delta * u` i drugi silnik liczyłby co innego —
   * a to jest dokładnie ten rodzaj rozjazdu, który cross-walidacja ma łapać,
   * więc nie może go sama wprowadzać.
   */
  const podstawione = rownanie ? podstawLaplasjan(rownanie, pde?.field ?? 'u') : undefined;
  const rhs = podstawione ? latexToPython(podstawione) : { code: '0', issues: [] };
  issues.push(...rhs.issues);

  const zrodloWarunku = options.initial ?? pde?.init;
  const initial = zrodloWarunku ? latexToPython(zrodloWarunku) : { code: '0', issues: [] };
  issues.push(...initial.issues);

  return {
    id: block.id,
    field: pde?.field ?? 'u',
    nx: options.grid?.nx ?? pde?.nx ?? 32,
    ny: options.grid?.ny ?? pde?.ny ?? 32,
    domainX: pde?.domainX ?? [0, 1],
    domainY: pde?.domainY ?? [0, 1],
    order: pde?.second ? 'wave' : 'diffusion',
    rhs: rhs.code,
    initial: initial.code,
    boundary: pde?.boundary
      ? { kind: pde.boundary.kind, value: 'value' in pde.boundary ? pde.boundary.value : 0 }
      : { kind: 'dirichlet', value: 0 },
    parameters: options.parameters,
    tSpan: options.tSpan,
    frames: options.frames ?? 5,
    issues,
  };
}
