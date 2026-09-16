/**
 * Testy hooka liczącego model.
 *
 * Sprawdzają dwie rzeczy, które psują się cicho: spóźnione odpowiedzi cofające
 * wykres do stanu sprzed ruchu suwaka, i tryb zapasowy udający, że liczy worker.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { computeRequest, type ComputeRequest, type ComputeResponse } from '@hestia/core-sci';
import { useModelRunner } from './useModelRunner';

const SKRYPT = {
  kind: 'script' as const,
  code: `
    return defineModel({
      parameters: [{ name: 'a', unit: 'm/s^2', value: 2 }],
      observables: [{ name: 'droga', kind: 'scalar', unit: 'm' }],
      run: (v: Record<string, number>, tSpan: [number, number]) => ({
        scalars: { droga: 0.5 * v.a * tSpan[1] * tSpan[1] },
        series: {},
      }),
    });
  `,
};

/**
 * Atrapa workera z ręcznie sterowanym momentem odpowiedzi.
 *
 * Prawdziwy worker odpowiada, kiedy chce — a właśnie kolejność odpowiedzi jest
 * tu przedmiotem testu, więc musi być w rękach testu, nie przeglądarki.
 */
class WorkerAtrapa {
  onmessage: ((event: MessageEvent<ComputeResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly kolejka: ComputeRequest[] = [];
  terminated = false;

  postMessage(request: ComputeRequest) {
    this.kolejka.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  /** Odpowiada na żądanie o podanym numerze — w dowolnej kolejności. */
  odpowiedz(index: number) {
    const request = this.kolejka[index];
    this.onmessage?.({ data: computeRequest(request) } as MessageEvent<ComputeResponse>);
  }
}

describe('useModelRunner', () => {
  it('bez fabryki liczy synchronicznie i mówi to wprost', async () => {
    const { result } = renderHook(() => useModelRunner(SKRYPT, { a: 2 }, [0, 3], 0.01));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.result?.scalars.droga).toBeCloseTo(9, 6);
    // Tryb zapasowy nie udaje workera — po tym polu widok wie, czego się spodziewać.
    expect(result.current.offThread).toBe(false);
  });

  it('z fabryką oddaje liczenie workerowi', async () => {
    const worker = new WorkerAtrapa();
    const factory = vi.fn(() => worker as unknown as Worker);

    const { result } = renderHook(() => useModelRunner(SKRYPT, { a: 2 }, [0, 3], 0.01, factory));

    await waitFor(() => expect(worker.kolejka).toHaveLength(1));
    expect(result.current.pending).toBe(true);
    expect(result.current.offThread).toBe(true);

    act(() => worker.odpowiedz(0));
    expect(result.current.pending).toBe(false);
    expect(result.current.result?.scalars.droga).toBeCloseTo(9, 6);
  });

  it('odrzuca odpowiedź na nieaktualne żądanie', async () => {
    // Suwak wysyła szybciej, niż wracają odpowiedzi. Gdyby spóźniona wygrywała,
    // wykres cofałby się do wartości sprzed ruchu.
    const worker = new WorkerAtrapa();
    const factory = () => worker as unknown as Worker;

    const { result, rerender } = renderHook(
      ({ a }) => useModelRunner(SKRYPT, { a }, [0, 3], 0.01, factory),
      { initialProps: { a: 2 } }
    );

    await waitFor(() => expect(worker.kolejka).toHaveLength(1));
    rerender({ a: 4 });
    await waitFor(() => expect(worker.kolejka).toHaveLength(2));

    // Najpierw wraca nowsza, potem starsza — sytuacja, o którą chodzi.
    act(() => worker.odpowiedz(1));
    expect(result.current.result?.scalars.droga).toBeCloseTo(18, 6);

    act(() => worker.odpowiedz(0));
    expect(result.current.result?.scalars.droga).toBeCloseTo(18, 6);
  });

  it('zatrzymuje workera przy odmontowaniu', async () => {
    const worker = new WorkerAtrapa();
    const { unmount } = renderHook(() =>
      useModelRunner(SKRYPT, { a: 2 }, [0, 3], 0.01, () => worker as unknown as Worker)
    );

    await waitFor(() => expect(worker.kolejka).toHaveLength(1));
    unmount();
    // Bez tego każdy zamknięty dokument zostawiałby wątek liczący w tle.
    expect(worker.terminated).toBe(true);
  });

  it('błąd workera trafia do stanu zamiast znikać', async () => {
    const worker = new WorkerAtrapa();
    const { result } = renderHook(() =>
      useModelRunner(SKRYPT, { a: 2 }, [0, 3], 0.01, () => worker as unknown as Worker)
    );

    await waitFor(() => expect(worker.kolejka).toHaveLength(1));
    act(() => worker.onerror?.({ message: 'brak modułu' } as ErrorEvent));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toMatch(/brak modułu/);
  });
});
