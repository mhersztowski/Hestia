/**
 * Zadanie z podręcznika w bloku `exercise`.
 *
 * Ten sam blok, co zadanie liczone z grafu — inny tryb, bo autor napisał co
 * innego. Testy pilnują trzech rzeczy, na których to stoi: treść jest
 * markdownem z matematyką, sprawdzanie działa bez modelu, a samoocena zgłasza
 * próbę do powtórek nawet wtedy, gdy nie ma czego sprawdzać.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExerciseBlock } from './ExerciseBlock';

const zadanie = (code: string, onAttempt?: (a: { id: string; quality: string; hintsUsed: number }) => void) =>
  render(<ExerciseBlock id="z1" code={code} formulas={[]} onAttempt={onAttempt as never} />);

describe('treść zadania', () => {
  it('jest markdownem — akapity, lista i wyróżnienia', () => {
    const { container } = zadanie([
      'Pierwszy akapit.',
      '',
      '- punkt jeden',
      '- punkt dwa',
      '@expected 6 m',
    ].join('\n'));

    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.textContent).toContain('Pierwszy akapit.');
  });

  it('matematyka w linii idzie przez KaTeX, a nie jako surowe dolary', () => {
    const { container } = zadanie('Dodano wektory $\\mathbf{a}$ i $\\mathbf{b}$.\n@expected 6 m');
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain('$');
  });

  it('wzór blokowy też', () => {
    const { container } = zadanie('Dane:\n\n$$c_x = 5{,}0 \\quad c_y = 0$$\n\n@expected 2 km');
    expect(container.querySelector('.katex')).toBeTruthy();
  });
});

describe('sprawdzanie bez żadnych obliczeń', () => {
  it('porównuje wpisaną odpowiedź z tą z książki', () => {
    const { container, getByPlaceholderText, getByText } = zadanie('Treść.\n@expected 6 m');
    fireEvent.change(getByPlaceholderText(/odpowiedź/i), { target: { value: '6.05 m' } });
    fireEvent.click(getByText('sprawdź'));
    expect(container.textContent).toMatch(/dobrze|zgadza|poprawn/i);
  });

  it('mówi wprost, że sprawdza tylko pierwszą wartość zdania', () => {
    const { container } = zadanie('Treść.\n@expected 6 m, o kąt 20,5° od kierunku północnego');
    expect(container.textContent).toMatch(/6 m/);
    expect(container.textContent).toMatch(/pierwsz/i);
  });

  it('nie ma pola odpowiedzi, gdy odpowiedzi nie da się porównać', () => {
    const { queryByPlaceholderText } = zadanie('Treść.\n@expected wektory muszą być prostopadłe');
    expect(queryByPlaceholderText(/odpowiedź/i)).toBeNull();
  });

  it('odpowiedź z książki jest zakryta, dopóki się jej nie odsłoni', () => {
    const { container, getByText } = zadanie('Treść.\n@expected wektory muszą być prostopadłe');
    expect(container.textContent).not.toContain('prostopadłe');
    fireEvent.click(getByText(/pokaż odpowiedź/i));
    expect(container.textContent).toContain('prostopadłe');
  });
});

describe('powtórki', () => {
  it('samoocena zgłasza próbę, także w zadaniu jakościowym', () => {
    const proby: Array<{ quality: string }> = [];
    const { getByText } = zadanie('Co można powiedzieć o wektorach $a$ i $b$?', (a) => proby.push(a));

    // Dokładne dopasowanie: „umiem" jest też częścią „nie umiem".
    fireEvent.click(getByText('umiem'));
    expect(proby).toHaveLength(1);
    expect(proby[0].quality).toBe('perfect');
  });

  it('trzy stopnie, bo „z trudem" wraca szybciej niż „umiem"', () => {
    const proby: Array<{ quality: string }> = [];
    const { getByText } = zadanie('Treść zadania.', (a) => proby.push(a));

    fireEvent.click(getByText('z trudem'));
    fireEvent.click(getByText('nie umiem'));
    expect(proby.map((p) => p.quality)).toEqual(['hinted', 'wrong']);
  });

  it('zadanie liczone z grafu nie prosi o samoocenę — ma czym sprawdzić', () => {
    const { queryByText } = zadanie('Policz.\n@given L: 1..2 m\n@answer T');
    expect(queryByText('nie umiem')).toBeNull();
  });
});
