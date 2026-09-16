/**
 * Rysowanie piórem.
 *
 * Test odtwarza sytuację, w której to się psuje: pióro melduje położenie
 * szybciej, niż React przerenderowuje, więc seria zdarzeń przychodzi **bez
 * żadnego renderu pomiędzy**. Przy zapisie „nowa lista = stara + punkt" każde
 * zdarzenie widzi tę samą starą listę i z całego pociągnięcia zostaje ostatni
 * punkt — błąd niewidoczny przy powolnym ruchu myszą.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Stroke } from '@hestia/core-sci';
import { StrokeCanvas } from './StrokeCanvas';

/** Zbiera pociągnięcia tak, jak robi to rodzic — przez funkcję aktualizującą. */
function zbieracz() {
  let stan: Stroke[] = [];
  return {
    onChange: (update: (poprzednie: Stroke[]) => Stroke[]) => {
      stan = update(stan);
    },
    get strokes() {
      return stan;
    },
  };
}

function plotno(onChange: (u: (p: Stroke[]) => Stroke[]) => void) {
  const { container } = render(
    <StrokeCanvas width={200} height={200} domainX={[0, 1]} domainY={[0, 1]} onChange={onChange} />
  );
  const element = container.firstElementChild as HTMLElement;
  // jsdom nie zna przechwytywania wskaźnika, a komponent go używa.
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
  return element;
}

/** Zdarzenie pióra w ułamkach płótna. */
function pioro(element: HTMLElement, typ: string, ux: number, uy: number, pressure = 0.8) {
  const event = new Event(typ, { bubbles: true, cancelable: true }) as Event &
    Record<string, unknown>;
  Object.assign(event, {
    pointerId: 1,
    pointerType: 'pen',
    pressure,
    buttons: 1,
    clientX: ux * 200,
    clientY: uy * 200,
  });
  element.dispatchEvent(event);
}

describe('StrokeCanvas', () => {
  it('zapisuje całe pociągnięcie, a nie tylko ostatni punkt', () => {
    const zbior = zbieracz();
    const element = plotno(zbior.onChange);

    pioro(element, 'pointerdown', 0.1, 0.5);
    for (let i = 1; i <= 8; i += 1) pioro(element, 'pointermove', 0.1 + i * 0.1, 0.5);
    pioro(element, 'pointerup', 0.9, 0.5);

    expect(zbior.strokes.length).toBeGreaterThan(5);
  });

  it('nacisk pióra steruje wysokością plamki', () => {
    const zbior = zbieracz();
    const element = plotno(zbior.onChange);

    pioro(element, 'pointerdown', 0.2, 0.2, 0.2);
    pioro(element, 'pointermove', 0.8, 0.8, 1);

    const [lekki, mocny] = zbior.strokes;
    expect(lekki.amplitude).toBeCloseTo(0.2, 2);
    expect(mocny.amplitude).toBeCloseTo(1, 2);
  });

  it('przerzedza punkty zamiast zapisywać każdy meldunek', () => {
    // Bez tego jedno przeciągnięcie zostawia kilkaset gaussianów, z których
    // każdy jest liczony w każdym punkcie siatki w każdym kroku czasowym.
    const zbior = zbieracz();
    const element = plotno(zbior.onChange);

    pioro(element, 'pointerdown', 0.5, 0.5);
    for (let i = 0; i < 200; i += 1) pioro(element, 'pointermove', 0.5 + i * 0.0001, 0.5);

    expect(zbior.strokes.length).toBeLessThan(10);
  });

  it('nie rysuje bez wciśniętego pióra', () => {
    const zbior = zbieracz();
    const element = plotno(zbior.onChange);

    pioro(element, 'pointermove', 0.5, 0.5);
    expect(zbior.strokes).toHaveLength(0);
  });

  it('położenie odpowiada miejscu dotknięcia', () => {
    const zbior = zbieracz();
    const element = plotno(zbior.onChange);

    pioro(element, 'pointerdown', 0.25, 0.75);
    expect(zbior.strokes[0].x).toBeCloseTo(0.25, 2);
    expect(zbior.strokes[0].y).toBeCloseTo(0.75, 2);
  });
});
