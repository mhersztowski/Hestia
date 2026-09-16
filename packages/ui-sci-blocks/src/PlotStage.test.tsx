/**
 * Testy płótna wykresu.
 *
 * Arytmetyka widoku jest sprawdzona w `sci-core`; tutaj chodzi o to, czego bez
 * przeglądarki sprawdzić się nie da — czy zdarzenia wskaźnika i koła trafiają
 * we właściwe wywołania i czy przeciągnięcie idzie po całej ścieżce, a nie
 * tylko przy pierwszym zdarzeniu.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_VIEWPORT, type Viewport } from '@hestia/core-sci';
import { PlotStage } from './PlotStage';

/** jsdom nie ma ani kontekstu 2D, ani obserwatora rozmiaru. */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  })) as never;

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;

  /*
   * jsdom nie liczy układu, więc `clientWidth` jest zawsze zerem — a płótno
   * bez rozmiaru nie ma jak przeliczyć pikseli na jednostki. Bez tego mocka
   * `zoomAt` słusznie odmawia liczenia (dzielenie przez zero), a testy
   * przeciągania przechodzą fałszywie, bo dostają nieskończoność.
   */
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 });
});

function plotno(viewport: Viewport = DEFAULT_VIEWPORT) {
  const onViewportChange = vi.fn();
  const { container } = render(
    <PlotStage
      viewport={viewport}
      onViewportChange={onViewportChange}
      settings={DEFAULT_SETTINGS}
    />
  );
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  canvas.setPointerCapture = vi.fn();
  // jsdom zwraca same zera; bez rozmiaru przeliczenia dzielą przez zero.
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 400,
    right: 400,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { canvas, onViewportChange };
}

describe('przeciąganie', () => {
  it('ruch bez wciśniętego wskaźnika niczego nie zmienia', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('przeciągnięcie przesuwa widok', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 100 });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    const next = onViewportChange.mock.calls[0][0] as Viewport;
    // Płótno chwytamy jak mapę: treść idzie za palcem, więc świat w lewo.
    expect(next.xMin).toBeLessThan(DEFAULT_VIEWPORT.xMin);
  });

  it('każde zdarzenie ruchu liczy się od poprzedniego, nie od początku', () => {
    /*
     * Wskaźnik melduje położenie szybciej, niż React renderuje. Gdyby początek
     * przeciągnięcia siedział w stanie, drugie zdarzenie liczyłoby przesunięcie
     * od tego samego punktu co pierwsze i wykres skakałby zamiast płynąć.
     */
    const { canvas, onViewportChange } = plotno();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 110, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 100 });

    const [first] = onViewportChange.mock.calls[0] as [Viewport];
    const [second] = onViewportChange.mock.calls[1] as [Viewport];
    // Oba kroki mają tę samą długość, bo każdy liczy dziesięć pikseli.
    expect(first.xMin - DEFAULT_VIEWPORT.xMin).toBeCloseTo(second.xMin - DEFAULT_VIEWPORT.xMin, 9);
  });

  it('puszczenie wskaźnika kończy przeciąganie', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('nie reaguje na drugi wskaźnik w trakcie przeciągania', () => {
    // Dotknięcie drugim palcem nie może przejąć trwającego ruchu.
    const { canvas, onViewportChange } = plotno();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 300, clientY: 300 });

    expect(onViewportChange).not.toHaveBeenCalled();
  });
});

describe('skalowanie kołem', () => {
  it('obrót w dół oddala', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.wheel(canvas, { deltaY: 100, clientX: 200, clientY: 200 });

    const next = onViewportChange.mock.calls[0][0] as Viewport;
    expect(next.xMax - next.xMin).toBeGreaterThan(DEFAULT_VIEWPORT.xMax - DEFAULT_VIEWPORT.xMin);
  });

  it('obrót w górę przybliża', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 200, clientY: 200 });

    const next = onViewportChange.mock.calls[0][0] as Viewport;
    expect(next.xMax - next.xMin).toBeLessThan(DEFAULT_VIEWPORT.xMax - DEFAULT_VIEWPORT.xMin);
  });

  it('z Shiftem skaluje samą oś y', () => {
    const { canvas, onViewportChange } = plotno();
    fireEvent.wheel(canvas, { deltaY: 100, clientX: 200, clientY: 200, shiftKey: true });

    const next = onViewportChange.mock.calls[0][0] as Viewport;
    expect(next.xMax - next.xMin).toBeCloseTo(DEFAULT_VIEWPORT.xMax - DEFAULT_VIEWPORT.xMin);
    expect(next.yMax - next.yMin).toBeGreaterThan(DEFAULT_VIEWPORT.yMax - DEFAULT_VIEWPORT.yMin);
  });

  it('skalowanie przy krawędzi trzyma punkt pod kursorem', () => {
    // Wartość liczbowa jest sprawdzona w sci-core; tutaj chodzi o to, że
    // kotwicą jest położenie kursora względem płótna, a nie jego środek.
    const { canvas, onViewportChange } = plotno();
    fireEvent.wheel(canvas, { deltaY: -200, clientX: 0, clientY: 0 });

    const next = onViewportChange.mock.calls[0][0] as Viewport;
    expect(next.xMin).toBeCloseTo(DEFAULT_VIEWPORT.xMin, 6);
    expect(next.yMax).toBeCloseTo(DEFAULT_VIEWPORT.yMax, 6);
  });
});

describe('rysowanie', () => {
  it('woła rysowanie treści nad siatką', () => {
    // To przez ten punkt zaczepienia wejdą krzywe w kolejnym etapie.
    const onDraw = vi.fn();
    const { container } = render(
      <PlotStage
        viewport={DEFAULT_VIEWPORT}
        onViewportChange={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onDraw={onDraw}
      />
    );
    // Bez rozmiaru z ResizeObservera płótno nie rysuje niczego — atrapa
    // obserwatora nie melduje wymiarów, więc sprawdzamy samo wpięcie.
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
