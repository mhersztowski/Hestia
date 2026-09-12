/**
 * Okno rozwiązywania zadania i historia podejść.
 *
 * jsdom nie rasteryzuje kanwy — testujemy **decyzje**: co da się zapisać,
 * w jakim trybie, jak wynik wraca do sprawdzenia i co pokazuje historia.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { serializeInk } from '@hestia/core-sci';
import { SolutionDialog, SolutionHistory } from './SolutionDialog';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined }) as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['png'], { type: 'image/png' }));
  };
});

const pismo = serializeInk([{ width: 1.6, points: [{ x: 1, y: 2, pressure: 0.5 }] }]);

describe('okno rozwiązywania zadania', () => {
  it('daje oba tryby, domyślnie tekst z LaTeX-em', () => {
    render(<SolutionDialog title="Zadanie 1" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'tekst i LaTeX' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'odręcznie' })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Wyprowadzenie/)).toBeTruthy();
  });

  // Zapis pustego rozwiązania niczego by nie zapisał, a wyglądałby na sukces.
  it('nie da się zapisać pustego rozwiązania', () => {
    render(<SolutionDialog title="Z" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /zapisz/ })).toHaveProperty('disabled', true);
  });

  it('zapisuje treść, tryb i wynik — bez daty, tę stempluje host', () => {
    const onSave = vi.fn();
    render(<SolutionDialog title="Z" onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Wyprowadzenie/), {
      target: { value: 'Z (15-13): $T = 2\\pi\\sqrt{m/k}$' },
    });
    fireEvent.change(screen.getByPlaceholderText('np. 0,28 s'), { target: { value: '0,28 s' } });
    fireEvent.click(screen.getByRole('button', { name: /zapisz/ }));

    expect(onSave).toHaveBeenCalledWith({
      mode: 'md',
      content: expect.stringContaining('2\\pi'),
      answer: '0,28 s',
    });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('at');
  });

  // LaTeX w polu tekstowym jest nieczytelny, a to on jest treścią rozwiązania.
  it('pokazuje podgląd składu pisanej treści', () => {
    const { container } = render(<SolutionDialog title="Z" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Wyprowadzenie/), {
      target: { value: 'Wynik $x^2$ gotowe' },
    });
    expect(container.textContent).toContain('gotowe');
  });

  it('tryb odręczny zapisuje pociągnięcia, nie obraz', () => {
    const onSave = vi.fn();
    const { container } = render(<SolutionDialog title="Z" onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'odręcznie' }));
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 2, clientY: 2, pressure: 0.5 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 9, clientY: 4, pressure: 0.7 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    fireEvent.click(screen.getByRole('button', { name: /zapisz/ }));
    expect(onSave.mock.calls[0][0].mode).toBe('ink');
    expect(onSave.mock.calls[0][0].content).toMatch(/^\d/);
  });

  it('bierze odpowiedź z bloku jako wartość początkową', () => {
    render(<SolutionDialog title="Z" initialAnswer="1,5 m" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('np. 0,28 s')).toHaveProperty('value', '1,5 m');
  });
});

describe('historia rozwiązań', () => {
  const historia = [
    { at: Date.UTC(2026, 7, 4), mode: 'md' as const, content: 'nowsze wyprowadzenie', answer: '0,28 s' },
    { at: Date.UTC(2026, 6, 1), mode: 'ink' as const, content: pismo },
  ];

  it('pokazuje podejścia z datą i trybem, od najnowszego', () => {
    const { container } = render(<SolutionHistory solutions={historia} onClose={vi.fn()} />);
    expect(container.textContent).toContain('tekst');
    expect(container.textContent).toContain('pismo');
    expect(container.textContent).toContain('nowsze wyprowadzenie');
  });

  it('przełącza widok między podejściami', () => {
    const { container } = render(<SolutionHistory solutions={historia} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button')[2]); // drugie podejście
    // Pismo odtwarza się z wektorów na kanwie, więc tekstu wyprowadzenia już nie ma.
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.textContent).not.toContain('nowsze wyprowadzenie');
  });

  it('pusta historia mówi to wprost', () => {
    const { container } = render(<SolutionHistory solutions={[]} onClose={vi.fn()} />);
    expect(container.textContent).toContain('Jeszcze nic tu nie ma');
  });
});
