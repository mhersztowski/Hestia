/**
 * Ściąga z API w bloku `simscript` — Etap 5.
 *
 * Deklaracje `SCRIPT_API_TYPES` powstały dla Monaco, ale blok w dokumencie ma
 * zwykłe pole tekstowe: autor pisze bez podpowiedzi i bez sposobu, żeby
 * sprawdzić, co ma pod ręką. Rdzeń może mieć najlepsze solvery świata — jeśli
 * nikt nie wie, że są, każdy skrypt zacznie od własnej pętli Eulera.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptBlock } from './ScriptBlock';

const KOD = `return defineModel({
  parameters: [{ name: 'a', value: 1 }],
  observables: [{ name: 'x', kind: 'scalar' }],
  dynamic: false,
  run: ({ a }) => ({ scalars: { x: a } }),
});`;

describe('ściąga z dostępnych funkcji', () => {
  it('jest schowana, dopóki autor nie otworzy kodu', () => {
    render(<ScriptBlock code={KOD} bare />);
    expect(screen.queryByText(/co jest dostępne/i)).toBeNull();
  });

  it('pokazuje się razem z kodem', () => {
    render(<ScriptBlock code={KOD} bare />);
    fireEvent.click(screen.getByText(/kod/));

    expect(screen.getByText(/co jest dostępne/i)).toBeTruthy();
  });

  it('wymienia solvery i bibliotekę, nie tylko `defineModel`', () => {
    render(<ScriptBlock code={KOD} bare />);
    fireEvent.click(screen.getByText(/kod/));
    const treść = screen.getByTestId('script-api').textContent ?? '';

    for (const nazwa of ['dopri5', 'rosenbrock', 'buildModel', 'measureInvariant', 'findEventTime']) {
      expect(treść, `brak ${nazwa}`).toContain(nazwa);
    }
  });

  it('pokazuje dokładnie te deklaracje, które opisują API — bez przepisywania', () => {
    render(<ScriptBlock code={KOD} bare />);
    fireEvent.click(screen.getByText(/kod/));
    const treść = screen.getByTestId('script-api').textContent ?? '';

    // Ściąga jest tym samym tekstem, który dostaje edytor; drugie źródło
    // rozjechałoby się przy pierwszej zmianie API.
    expect(treść).toContain('declare function dopri5');
  });
});
