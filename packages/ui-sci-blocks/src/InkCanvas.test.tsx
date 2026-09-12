/**
 * Kanwa pisania rysikiem.
 *
 * jsdom nie rasteryzuje kanwy, więc `getContext` i `toBlob` podstawiamy —
 * testujemy **decyzje**, nie rysowanie: co trafia do portu rozpoznawania,
 * kiedy przyciski są dostępne i co się dzieje, gdy model odmówi.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InkCanvas } from './InkCanvas';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined }) as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['png'], { type: 'image/png' }));
  };
});

/** Jedno pociągnięcie rysikiem — wciśnięcie, ruch, puszczenie. */
function napisz(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5, pressure: 0.4 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 12, pressure: 0.6 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

const kanwa = (c: HTMLElement) => c.querySelector('canvas') as HTMLCanvasElement;

describe('kanwa pisania rysikiem', () => {
  it('bez portu rozpoznawania mówi o tym wprost zamiast pokazywać martwy przycisk', () => {
    render(<InkCanvas mode="latex" />);
    expect(screen.queryByRole('button', { name: /rozpoznaj/ })).toBeNull();
    expect(screen.getByText(/rozpoznawanie niedostępne/)).toBeTruthy();
  });

  // Rozpoznawanie pustej kanwy kosztowałoby zapytanie do modelu za nic.
  it('rozpoznawanie i czyszczenie są nieaktywne, dopóki nic nie napisano', () => {
    const { container } = render(<InkCanvas mode="latex" recognize={vi.fn()} />);
    expect(screen.getByRole('button', { name: /rozpoznaj wzór/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'wyczyść' })).toHaveProperty('disabled', true);

    napisz(kanwa(container));
    expect(screen.getByRole('button', { name: /rozpoznaj wzór/ })).toHaveProperty('disabled', false);
  });

  it('oddaje portowi obraz PNG i tryb, a wynik podaje dalej', async () => {
    const recognize = vi.fn(async () => '\\frac{a}{b}');
    const onRecognized = vi.fn();
    const { container } = render(
      <InkCanvas mode="latex" recognize={recognize} onRecognized={onRecognized} />,
    );

    napisz(kanwa(container));
    fireEvent.click(screen.getByRole('button', { name: /rozpoznaj wzór/ }));

    await waitFor(() => expect(onRecognized).toHaveBeenCalledWith('\\frac{a}{b}'));
    const [obraz, tryb] = recognize.mock.calls[0] as unknown as [Blob, string];
    expect(obraz.type).toBe('image/png');
    expect(tryb).toBe('latex');
  });

  /**
   * Pociągnięcia idą do hosta **wektorowo**, nie jako obraz — historia
   * rozwiązań ma się dać odtworzyć i rozpoznać jeszcze raz lepszym modelem.
   */
  it('zapisuje pociągnięcia wektorowo po każdym ruchu pióra', () => {
    const onStrokesChange = vi.fn();
    const { container } = render(<InkCanvas mode="text" onStrokesChange={onStrokesChange} />);

    napisz(kanwa(container));

    expect(onStrokesChange).toHaveBeenCalled();
    const [strokes, zapis] = onStrokesChange.mock.calls.at(-1)!;
    expect(strokes[0].points.length).toBeGreaterThan(1);
    expect(typeof zapis).toBe('string');
    expect(zapis).not.toContain('\n');
  });

  it('czyszczenie zeruje też zapis u hosta', () => {
    const onStrokesChange = vi.fn();
    const { container } = render(<InkCanvas mode="text" onStrokesChange={onStrokesChange} />);
    napisz(kanwa(container));
    fireEvent.click(screen.getByRole('button', { name: 'wyczyść' }));
    expect(onStrokesChange.mock.calls.at(-1)![1]).toBe('');
  });

  // Odmowa modelu nie może wyglądać jak zawieszenie przycisku.
  it('błąd rozpoznawania pokazuje się przy kanwie', async () => {
    const recognize = vi.fn(async () => { throw new Error('Model nie rozpoznał pisma'); });
    const { container } = render(<InkCanvas mode="latex" recognize={recognize} />);

    napisz(kanwa(container));
    fireEvent.click(screen.getByRole('button', { name: /rozpoznaj wzór/ }));

    await waitFor(() => expect(screen.getByText(/nie rozpoznał pisma/)).toBeTruthy());
  });

  it('tryb tekstowy ma własną etykietę przycisku', () => {
    render(<InkCanvas mode="text" recognize={vi.fn()} />);
    expect(screen.getByRole('button', { name: /rozpoznaj tekst/ })).toBeTruthy();
  });

  it('podgląd historii nie daje pisać ani rozpoznawać', () => {
    render(<InkCanvas mode="latex" recognize={vi.fn()} readOnly value={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
