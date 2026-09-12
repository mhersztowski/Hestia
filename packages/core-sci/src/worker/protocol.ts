/**
 * protocol.ts — liczenie modelu poza wątkiem interfejsu.
 *
 * Raport (Etap 5) przewiduje workery dla cięższych zjawisk i podaje warunek,
 * który to umożliwia: kontrakt `run()` przyjmuje dane i zwraca dane. Gaz w
 * pudle z sześciuset cząstkami liczy się 1,6 s — synchronicznie znaczy tyle
 * samo zamrożonego interfejsu przy **każdym** ruchu suwaka.
 *
 * Modelu nie da się przesłać do workera (to funkcje), więc przesyłamy jego
 * **opis**: albo wzory dokumentu, albo kod skryptu. Worker buduje model u
 * siebie tą samą drogą co strona i odsyła gołe liczby.
 *
 * Cała logika mieszka tutaj, a nie w pliku workera, z dwóch powodów: da się ją
 * sprawdzić testem bez przeglądarki, i host może ją uruchomić synchronicznie,
 * gdy workera nie ma (podgląd, eksport statyczny, środowisko testowe).
 */
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph, type PhenomenonModel, type PhenomenonResult } from '../graph/compileGraph';
import { parseFormulaBlock, type FormulaBlock } from '../formula/parseFormula';
import { runScript } from '../model/runScript';
import { Trajectory } from '../numeric/trajectory';
import type { InvariantReport } from '../numeric/invariants';
import type { Interpolant } from '../numeric/trajectory';
import type { EventHit } from '../numeric/events';

/** Skąd bierze się model — te dwie drogi ma dokument. */
export type ModelSource =
  /** Wzory z dokumentu; przesyłamy treść bloków, nie sparsowane obiekty. */
  | { kind: 'graph'; formulas: Array<{ id: string; body: string }> }
  /** Kod bloku `simscript`. */
  | { kind: 'script'; code: string };

export interface ComputeRequest {
  /** Numer żądania — odpowiedzi bywają nie po kolei. */
  id: number;
  source: ModelSource;
  values: Record<string, number>;
  tSpan: [number, number];
  dt: number;
}

/**
 * Wynik w postaci, która przechodzi przez granicę wątku.
 *
 * `Trajectory` jest klasą z metodami, więc struktura klonowana przez
 * `postMessage` straciłaby je po drodze. Przesyłamy same próbki i odtwarzamy
 * obiekt po stronie odbiorcy — inaczej `trajectory.value()` przestałoby
 * istnieć dokładnie tam, gdzie animacja go potrzebuje.
 */
export interface ComputeResponse {
  id: number;
  scalars: Record<string, number>;
  series: Record<string, Array<[number, number]>>;
  trajectory?: {
    samples: Array<{ t: number; y: number[] }>;
    stateNames: string[];
    /**
     * Dense output i zdarzenia jadą razem z próbkami.
     *
     * Bez nich odbiorca dostawałby rzadkie próbki metody adaptacyjnej i czytał
     * między nimi po cięciwie — czyli gorzej, niż policzył solver. To był
     * powód, dla którego interpolant jest strukturą danych, a nie funkcją.
     */
    interpolants?: Interpolant[];
    events?: EventHit[];
  };
  /**
   * Pomiar niezmienników — zwykłe dane, więc przechodzą bez odtwarzania.
   *
   * Muszą jechać razem z wynikiem, a nie być liczone po stronie strony:
   * pomiar dotyczy **tej** trajektorii, policzonej tym krokiem, i oderwany od
   * niej byłby oceną czegoś innego niż to, co czytelnik ogląda.
   */
  invariants?: InvariantReport[];
  /** Opis modelu — strona potrzebuje go do panelu parametrów i widoków. */
  meta: {
    parameters: PhenomenonModel['parameters'];
    observables: PhenomenonModel['observables'];
    derivativePairs: Array<[string, string]>;
    dynamic: boolean;
    issues: string[];
  };
  /** Ile trwało liczenie — po tym widać, czy warto było iść do workera. */
  elapsedMs: number;
  error?: string;
}

/** Buduje model z opisu — ta sama droga po obu stronach granicy wątku. */
export function modelFromSource(source: ModelSource): { model?: PhenomenonModel; error?: string } {
  if (source.kind === 'script') {
    const { model, issues } = runScript(source.code);
    if (!model) return { error: issues.join(' | ') || 'Skrypt nie zwrócił modelu.' };
    return { model };
  }

  const formulas: FormulaBlock[] = source.formulas.map((f) => parseFormulaBlock(f.id, f.body));
  return { model: compileGraph(buildGraph(formulas)) };
}

/**
 * Liczy żądanie i pakuje wynik do postaci przesyłalnej.
 *
 * Wyjątek zamieniamy na pole `error`, a nie rzucamy dalej: w workerze rzucony
 * błąd ginie w `onerror` bez numeru żądania, więc strona nie wiedziałaby,
 * na które pytanie nie ma odpowiedzi.
 */
export function computeRequest(request: ComputeRequest, now: () => number = () => Date.now()): ComputeResponse {
  const started = now();
  const pusty: ComputeResponse['meta'] = {
    parameters: [], observables: [], derivativePairs: [], dynamic: false, issues: [],
  };

  const { model, error } = modelFromSource(request.source);
  if (!model) {
    return { id: request.id, scalars: {}, series: {}, meta: pusty, elapsedMs: now() - started, error };
  }

  const meta: ComputeResponse['meta'] = {
    parameters: model.parameters,
    observables: model.observables,
    derivativePairs: model.derivativePairs,
    dynamic: model.dynamic,
    issues: model.issues,
  };

  try {
    const result = model.run(request.values, request.tSpan, request.dt);
    return {
      id: request.id,
      scalars: result.scalars,
      series: result.series,
      trajectory: result.trajectory
        ? {
          samples: result.trajectory.samples,
          stateNames: result.trajectory.stateNames,
          interpolants: result.trajectory.interpolants,
          events: result.trajectory.events,
        }
        : undefined,
      invariants: result.invariants,
      meta,
      elapsedMs: now() - started,
      // Nieudane całkowanie nie jest błędem żądania — model policzył wszystko,
      // czego dało się policzyć — ale odbiorca ma je zobaczyć tak samo.
      error: result.error,
    };
  } catch (e) {
    return {
      id: request.id,
      scalars: {},
      series: {},
      meta,
      elapsedMs: now() - started,
      error: `Błąd podczas liczenia: ${(e as Error).message}`,
    };
  }
}

/** Odtwarza wynik z postaci przesyłalnej — z powrotem z metodami trajektorii. */
export function restoreResult(response: ComputeResponse): PhenomenonResult {
  return {
    scalars: response.scalars,
    series: response.series,
    trajectory: response.trajectory
      ? new Trajectory(
        response.trajectory.samples,
        response.trajectory.stateNames,
        response.trajectory.interpolants,
        response.trajectory.events,
      )
      : undefined,
    invariants: response.invariants ?? [],
    error: response.error,
  };
}

/**
 * Obsługa wiadomości po stronie workera.
 *
 * Plik workera w hoście sprowadza się do jednej linii, która to woła — dzięki
 * temu logika jest tu, gdzie da się ją przetestować.
 */
export function handleWorkerMessage(data: ComputeRequest): ComputeResponse {
  return computeRequest(data);
}
