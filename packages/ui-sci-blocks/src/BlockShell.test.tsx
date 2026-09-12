/**
 * Blok w edytorze tekstu.
 *
 * `BlockShell` osadza widok bloku (wykres, wzór, symulację) w drzewie edytora
 * markdown. Wynikają z tego dwa wymagania, które łatwo cofnąć nieświadomie —
 * i oba objawiają się dopiero przy pisaniu w dokumencie, nie w podglądzie.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockShell } from './BlockShell';

const WIDOK = <div data-testid="widok">wykres</div>;
const TRESC = () => <pre data-testid="tresc">kod bloku</pre>;

describe('BlockShell', () => {
  it('widok nie przyjmuje kursora ani tekstu', () => {
    // Bez tego kliknięcie w wykres wstawia kursor, a wpisany znak trafia do
    // treści bloku i psuje jego składnię.
    render(<BlockShell kind="wzór" accent="#000" id="a" view={WIDOK} children={TRESC} />);

    const opakowanie = screen.getByTestId('widok').parentElement;
    expect(opakowanie?.getAttribute('contenteditable')).toBe('false');
  });

  it('treść edytowalna zostaje w drzewie także w trybie widoku', () => {
    // Host renderuje w niej węzeł tekstowy edytora. Usunięcie go przy
    // przełączeniu zabrałoby edytorowi miejsce na treść bloku, a kursor
    // trafiałby w przypadkowe miejsca dokumentu.
    render(<BlockShell kind="wzór" accent="#000" id="a" view={WIDOK} children={TRESC} />);

    expect(screen.getByTestId('tresc')).toBeTruthy();
    expect(screen.getByTestId('tresc').parentElement?.style.display).toBe('none');
  });

  it('przełączenie na kod odsłania treść i chowa widok', () => {
    render(<BlockShell kind="wzór" accent="#000" id="a" view={WIDOK} children={TRESC} />);

    fireEvent.click(screen.getByTitle('Tekst źródłowy bloku'));

    expect(screen.queryByTestId('widok')).toBeNull();
    expect(screen.getByTestId('tresc').parentElement?.style.display).toBe('');
  });

  it('blok z uwagami otwiera się na kodzie', () => {
    // Uwaga dotyczy zapisu, więc czytelnik ma zobaczyć zapis, a nie widok,
    // który przy błędzie i tak jest pusty albo mylący.
    render(
      <BlockShell kind="wzór" accent="#000" id="a" view={WIDOK} children={TRESC} issues={['coś nie gra']} />,
    );

    expect(screen.queryByTestId('widok')).toBeNull();
  });

  it('bez treści edytowalnej pokazuje sam widok', () => {
    // Tryb czytania i eksport statyczny nie mają czego edytować.
    render(<BlockShell kind="wzór" accent="#000" id="a" view={WIDOK} />);

    expect(screen.getByTestId('widok')).toBeTruthy();
    expect(screen.queryByTitle('Tekst źródłowy bloku')).toBeNull();
  });
});
