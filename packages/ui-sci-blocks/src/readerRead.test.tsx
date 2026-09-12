/**
 * Przycisk „przeczytałem" pod podrozdziałem.
 *
 * Statystyka bazy wiedzy potrzebuje sygnału, którego nie da się wywnioskować
 * z przewijania: przewinięcie do końca znaczy tyle, że ktoś przeciągnął palcem.
 * Deklaracja czytelnika jest jedyną wiarygodną miarą, więc musi być jawna —
 * i musi dać się cofnąć, bo klika się ją przypadkiem.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReaderView } from './ReaderView';

const DOKUMENT = '# Podrozdział\n\nTreść wykładu.';

describe('przycisk', () => {
  it('nie pojawia się, gdy host nie zbiera statystyk', () => {
    render(<ReaderView markdown={DOKUMENT} />);
    expect(screen.queryByRole('button', { name: /przeczyta/i })).toBeNull();
  });

  it('pojawia się, gdy host podał obsługę', () => {
    render(<ReaderView markdown={DOKUMENT} onRead={vi.fn()} />);
    expect(screen.getByRole('button', { name: /przeczyta/i })).toBeTruthy();
  });

  it('zgłasza przeczytanie', () => {
    const onRead = vi.fn();
    render(<ReaderView markdown={DOKUMENT} onRead={onRead} />);

    fireEvent.click(screen.getByRole('button', { name: /przeczyta/i }));
    expect(onRead).toHaveBeenCalledWith(true);
  });

  it('gdy już przeczytany, mówi to wprost i pozwala cofnąć', () => {
    const onRead = vi.fn();
    render(<ReaderView markdown={DOKUMENT} onRead={onRead} read />);

    const przycisk = screen.getByRole('button', { name: /przeczytane/i });
    expect(przycisk.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(przycisk);
    expect(onRead).toHaveBeenCalledWith(false);
  });

  /**
   * Przycisk stoi **na końcu** treści, a nie w nagłówku.
   *
   * W nagłówku byłby propozycją oznaczenia czegoś, czego czytelnik jeszcze nie
   * przeczytał — a to jest zaproszenie do klikania na zapas i psucia własnej
   * statystyki.
   */
  it('stoi na końcu dokumentu, nie na początku', () => {
    render(<ReaderView markdown={DOKUMENT} onRead={vi.fn()} />);

    const tresc = screen.getByText('Treść wykładu.');
    const przycisk = screen.getByRole('button', { name: /przeczyta/i });
    expect(tresc.compareDocumentPosition(przycisk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
