/**
 * useModelRunner — liczenie modelu bez zamrażania interfejsu.
 *
 * Model liczy się synchronicznie i przy cięższych zjawiskach trwa to zauważalnie
 * długo (gaz z sześciuset cząstkami: 1,6 s). Przy każdym ruchu suwaka znaczy to
 * tyle samo nieruchomego ekranu — suwak nie nadąża za palcem, animacja stoi.
 *
 * Hook przenosi obliczenia do workera, jeśli host go dostarczy. Fabryka
 * przychodzi z zewnątrz, bo tylko host wie, jak zbudować workera w swoim
 * bundlerze; pakiet nie zgaduje ani nie wymusza konfiguracji.
 *
 * **Bez workera hook liczy synchronicznie** — i to nie jest awaria, tylko
 * uczciwy tryb zapasowy: podgląd, testy i eksport statyczny działają bez
 * dodatkowego zaplecza, tylko z zacięciami przy dużych modelach.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeRequest, restoreResult,
  type ComputeRequest, type ComputeResponse, type ModelSource, type PhenomenonResult,
} from '@hestia/core-sci';

/** Fabryka workera dostarczana przez hosta. */
export type WorkerFactory = () => Worker;

export interface ModelRunnerState {
  result?: PhenomenonResult;
  meta?: ComputeResponse['meta'];
  /** Trwa liczenie — po tym widok pokazuje, że wynik jest w drodze. */
  pending: boolean;
  error?: string;
  /** Czas ostatniego liczenia; przydatny, gdy dokument zaczyna zamulać. */
  elapsedMs?: number;
  /** Czy liczy worker, czy wątek interfejsu. */
  offThread: boolean;
}

let nextRequestId = 1;

export function useModelRunner(
  source: ModelSource,
  values: Record<string, number>,
  tSpan: [number, number],
  dt: number,
  workerFactory?: WorkerFactory,
): ModelRunnerState {
  const [state, setState] = useState<ModelRunnerState>({ pending: true, offThread: !!workerFactory });
  const workerRef = useRef<Worker | undefined>();
  /** Numer ostatniego wysłanego żądania — starsze odpowiedzi odrzucamy. */
  const latestRef = useRef(0);

  // Worker żyje tak długo jak komponent: tworzenie go na każde żądanie
  // kosztowałoby więcej niż samo liczenie lekkiego modelu.
  useEffect(() => {
    if (!workerFactory) return undefined;
    const worker = workerFactory();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
      const response = event.data;
      // Suwak wysyła żądania szybciej, niż wracają odpowiedzi. Bez odrzucania
      // spóźnionych wykres skakałby do stanu sprzed ruchu.
      if (response.id !== latestRef.current) return;
      setState({
        result: restoreResult(response),
        meta: response.meta,
        pending: false,
        error: response.error,
        elapsedMs: response.elapsedMs,
        offThread: true,
      });
    };
    worker.onerror = (event) => {
      setState((previous) => ({ ...previous, pending: false, error: `Worker: ${event.message}` }));
    };

    return () => {
      worker.terminate();
      workerRef.current = undefined;
    };
  }, [workerFactory]);

  // Zależność po treści, nie po tożsamości obiektów: `values` i `tSpan`
  // powstają na nowo przy każdym renderze, więc porównanie referencji
  // uruchamiałoby liczenie w kółko.
  const requestKey = useMemo(
    () => JSON.stringify([source, values, tSpan, dt]),
    [source, values, tSpan, dt],
  );

  useEffect(() => {
    const request: ComputeRequest = { id: (nextRequestId += 1), source, values, tSpan, dt };
    latestRef.current = request.id;

    const worker = workerRef.current;
    if (worker) {
      setState((previous) => ({ ...previous, pending: true, offThread: true }));
      worker.postMessage(request);
      return;
    }

    // Tryb zapasowy: liczymy tu i teraz. Interfejs stanie na czas obliczeń —
    // dlatego host powinien podać fabrykę workera wszędzie, gdzie może.
    const response = computeRequest(request);
    setState({
      result: restoreResult(response),
      meta: response.meta,
      pending: false,
      error: response.error,
      elapsedMs: response.elapsedMs,
      offThread: false,
    });
    // `requestKey` niesie całą treść żądania; pozostałe zależności są jego
    // składnikami i dodanie ich uruchamiałoby efekt dwa razy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return state;
}
