/**
 * Panel jakości wyniku — Etap 0 planu silnika.
 *
 * Sedno: czytelnik ma zobaczyć **obok wyniku**, ile ten wynik jest wart.
 * Wykres oscylatora liczonego Eulerem wygląda dokładnie tak samo jak liczony
 * Verletem — różnica jest wyłącznie w tym, co mówi ten panel.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InvariantReport } from '@hestia/core-sci';
import { QualityPanel } from './QualityPanel';

const raport = (over: Partial<InvariantReport> = {}): InvariantReport => ({
  name: 'E',
  initial: 0.5,
  maxDeviation: 0.05,
  relative: 0.1,
  trend: 'drift',
  ratePerUnitTime: 0.002,
  values: [
    [0, 0.5],
    [1, 0.51],
  ],
  issues: [],
  ...over,
});

describe('co widzi czytelnik', () => {
  it('nazywa niezmiennik i mówi, co się z nim stało', () => {
    render(<QualityPanel invariants={[raport()]} />);

    expect(screen.getByText(/E/)).toBeTruthy();
    expect(screen.getByText(/narasta/)).toBeTruthy();
  });

  it('odróżnia ograniczone wahanie od ucieczki', () => {
    render(<QualityPanel invariants={[raport({ trend: 'oscillation', relative: 1e-5 })]} />);
    expect(screen.getByText(/nie ucieka|waha/)).toBeTruthy();
  });

  it('wielkość zachowaną kwituje krótko, bez straszenia', () => {
    render(<QualityPanel invariants={[raport({ trend: 'stable', relative: 1e-12 })]} />);

    expect(screen.getByText(/zachowany/)).toBeTruthy();
    expect(screen.queryByText(/narasta/)).toBeNull();
  });

  it('pokazuje każdy zmierzony niezmiennik osobno', () => {
    render(<QualityPanel invariants={[raport(), raport({ name: 'p', trend: 'stable' })]} />);

    expect(screen.getByText(/^E:/)).toBeTruthy();
    expect(screen.getByText(/^p:/)).toBeTruthy();
  });

  it('przekazuje dalej uwagi z pomiaru', () => {
    render(
      <QualityPanel invariants={[raport({ issues: ['Niezmiennik przestał być liczbą (NaN).'] })]} />
    );
    expect(screen.getByText(/NaN/)).toBeTruthy();
  });
});

describe('kiedy panelu nie ma', () => {
  it('bez zmierzonych niezmienników nie zajmuje miejsca', () => {
    const { container } = render(<QualityPanel invariants={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('sam błąd całkowania wystarcza, żeby panel się pokazał', () => {
    render(<QualityPanel invariants={[]} error={{ relative: 3e-7, order: 4.02 }} />);

    expect(screen.getByText(/błąd/i)).toBeTruthy();
    // Zmierzony rząd metody jest informacją dla autora: rozjazd z teorią
    // znaczy, że coś w modelu nie jest tak gładkie, jak zakłada solver.
    expect(screen.getByText(/4[.,]0/)).toBeTruthy();
  });
});
