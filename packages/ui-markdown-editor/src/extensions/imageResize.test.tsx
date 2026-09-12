/**
 * Zmiana rozmiaru obrazka przez przeciągnięcie narożnika.
 *
 * Szerokość dało się już ustawić suwakiem w oknie edycji, ale to jest droga
 * przez trzy kliknięcia i podgląd wielkości innej niż docelowa. Uchwyt
 * w narożniku odpowiada na pytanie „ile ma zajmować **tu**", patrząc na to samo,
 * co czytelnik.
 *
 * Wynik trafia do atrybutu `width`, czyli tam, gdzie już wcześniej trafiał
 * suwak — konwersja do markdownu (`<img style="width: …">`) działa bez zmian.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageResizeHandle } from './ImageResizeHandle';

/** Szerokość kolumny, względem której liczymy procent. */
const KOLUMNA = 800;

function pole(width: string | null = null) {
  const updateAttributes = vi.fn();
  const wrapper = document.createElement('div');
  Object.defineProperty(wrapper, 'offsetWidth', { value: 400, configurable: true });
  // Rodzic udaje kolumnę tekstu — to on wyznacza, ile znaczy „100 %".
  const rodzic = document.createElement('div');
  Object.defineProperty(rodzic, 'offsetWidth', { value: KOLUMNA, configurable: true });
  rodzic.appendChild(wrapper);

  render(<ImageResizeHandle width={width} updateAttributes={updateAttributes} elementRef={{ current: wrapper }} />);
  return { updateAttributes };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('uchwyt', () => {
  it('jest opisany, żeby dało się go znaleźć bez myszy', () => {
    pole();
    expect(screen.getByLabelText(/rozmiar/i)).toBeTruthy();
  });

  it('przeciągnięcie w prawo poszerza obrazek', () => {
    const { updateAttributes } = pole();
    const uchwyt = screen.getByLabelText(/rozmiar/i);

    fireEvent.pointerDown(uchwyt, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 560, pointerId: 1 });

    // Start 400 px z 800 px kolumny = 50 %; +160 px daje 70 %.
    expect(updateAttributes).toHaveBeenCalledWith({ width: '70%' });
  });

  it('przeciągnięcie w lewo zwęża', () => {
    const { updateAttributes } = pole();
    fireEvent.pointerDown(screen.getByLabelText(/rozmiar/i), { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 240, pointerId: 1 });

    expect(updateAttributes).toHaveBeenCalledWith({ width: '30%' });
  });

  it('nie schodzi poniżej sensownego minimum', () => {
    const { updateAttributes } = pole();
    fireEvent.pointerDown(screen.getByLabelText(/rozmiar/i), { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: -2000, pointerId: 1 });

    expect(updateAttributes).toHaveBeenLastCalledWith({ width: '10%' });
  });

  /**
   * Sto procent **kasuje** atrybut zamiast go zapisywać.
   *
   * Brak szerokości znaczy „tyle, ile obrazek ma naturalnie, nie więcej niż
   * kolumna" — a to jest inna informacja niż „dokładnie sto procent kolumny",
   * która rozciągnęłaby mały obrazek na całą szerokość.
   */
  it('rozciągnięcie do pełnej szerokości usuwa atrybut', () => {
    const { updateAttributes } = pole('50%');
    fireEvent.pointerDown(screen.getByLabelText(/rozmiar/i), { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 3000, pointerId: 1 });

    expect(updateAttributes).toHaveBeenLastCalledWith({ width: null });
  });

  it('po puszczeniu przycisku przestaje reagować na ruch', () => {
    const { updateAttributes } = pole();
    fireEvent.pointerDown(screen.getByLabelText(/rozmiar/i), { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    updateAttributes.mockClear();

    fireEvent.pointerMove(window, { clientX: 700, pointerId: 1 });
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it('zaokrągla do pełnych procentów — pół procenta nikogo nie interesuje', () => {
    const { updateAttributes } = pole();
    fireEvent.pointerDown(screen.getByLabelText(/rozmiar/i), { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 411, pointerId: 1 });

    expect(updateAttributes).toHaveBeenCalledWith({ width: '51%' });
  });
});
