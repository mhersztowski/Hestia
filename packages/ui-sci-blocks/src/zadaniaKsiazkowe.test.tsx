/**
 * Zadania przepisane z podręcznika — sprawdzenie na prawdziwej treści.
 *
 * Zadanie 5 z rozdziału 2 Resnicka: markdown z matematyką, odpowiedź podana
 * w książce zdaniem („6 m, o kąt 20,5°…"), zero danych do wyliczenia.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExerciseBlock } from './ExerciseBlock';

const KOD = `
Grający w golfa trzykrotnie uderzył w piłkę, zanim wpadła ona do dołka. Po
pierwszym uderzeniu piłka przesunęła się o 12 m na północ, po drugim o 6 m
w kierunku południowo-wschodnim, a po trzecim o 3 m w kierunku
południowo-zachodnim. Jakie musiałoby być przemieszczenie $\\mathbf{d}$ piłki,
aby wpadła ona do dołka po pierwszym uderzeniu?

@expected 6 m, o kąt 20,5° od kierunku północnego w kierunku wschodnim
@level 2
@uses rh1-2-eq10a
@hint Rozłóż każde przemieszczenie na składowe $x$ i $y$.
@hint Dodaj składowe osobno, potem złóż wynik.
`;

describe('zadanie 2-5 z Resnicka', () => {
  const widok = (onAttempt?: (a: unknown) => void) =>
    render(<ExerciseBlock id="rh1-zad-2-5" code={KOD} formulas={[]} onAttempt={onAttempt as never} />);

  it('treść jest markdownem z matematyką', () => {
    const { container } = widok();
    expect(container.textContent).toContain('Grający w golfa');
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).not.toContain('$');
  });

  it('nic nie jest losowane ani liczone — nie ma „innych danych"', () => {
    const { queryByText, container } = widok();
    expect(queryByText(/inne dane/)).toBeNull();
    expect(container.textContent).not.toMatch(/wariant #/);
  });

  it('sprawdza pierwszą wartość odpowiedzi i mówi o tym', () => {
    const { container, getByPlaceholderText, getByText } = widok();
    expect(container.textContent).toMatch(/Sprawdzam pierwszą wartość/);

    fireEvent.change(getByPlaceholderText(/odpowiedź/i), { target: { value: '6,1 m' } });
    fireEvent.click(getByText('sprawdź'));
    expect(container.textContent).toMatch(/dobrze|zgadza|poprawn/i);
  });

  it('sama liczba bez jednostki to za mało', () => {
    const { container, getByPlaceholderText, getByText } = widok();
    fireEvent.change(getByPlaceholderText(/odpowiedź/i), { target: { value: '6' } });
    fireEvent.click(getByText('sprawdź'));
    expect(container.textContent).toMatch(/jednostk/i);
  });

  it('pełna odpowiedź z książki czeka pod przyciskiem', () => {
    const { container, getByText } = widok();
    expect(container.textContent).not.toContain('20,5');
    fireEvent.click(getByText(/pokaż odpowiedź/i));
    expect(container.textContent).toContain('20,5');
  });

  it('podpowiedzi autora odsłaniają się pojedynczo', () => {
    const { container, getByText } = widok();
    fireEvent.click(getByText(/podpowiedź 1\/2/));
    expect(container.textContent).toContain('Rozłóż każde przemieszczenie');
    expect(container.textContent).not.toContain('Dodaj składowe osobno');
  });

  it('rozwiązanie zgłasza próbę, więc zadanie wejdzie do powtórek', () => {
    const proby: Array<{ id: string; quality: string; hintsUsed: number }> = [];
    const { getByPlaceholderText, getByText } = widok((a) => proby.push(a as never));

    fireEvent.click(getByText(/podpowiedź 1\/2/));
    fireEvent.change(getByPlaceholderText(/odpowiedź/i), { target: { value: '6 m' } });
    fireEvent.click(getByText('sprawdź'));

    expect(proby).toHaveLength(1);
    expect(proby[0].id).toBe('rh1-zad-2-5');
    // Podpowiedź zużyta — odpowiedź poprawna, ale wraca szybciej niż samodzielna.
    expect(proby[0].quality).toBe('hinted');
    expect(proby[0].hintsUsed).toBe(1);
  });
});
