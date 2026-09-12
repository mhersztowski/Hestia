/**
 * Wizualna edycja wzoru.
 *
 * Testy pilnują granicy między czytaniem a edycją oraz tego, co przy zapisie
 * ginie najłatwiej: dyrektyw z jednostkami i powiązaniami, które leżą w tym
 * samym bloku co wzór, ale nie są jego częścią.
 *
 * Samego MathLive nie uruchamiamy — to web component ładowany leniwie i jego
 * zachowanie należy do biblioteki. Sprawdzamy **nasze** decyzje: kiedy edycja
 * jest dostępna i co trafia z powrotem do dokumentu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { replaceExpression } from '@hestia/core-sci';
import { FormulaBlockView } from './FormulaBlockView';

const WZOR = [
  'T = 2\\pi\\sqrt{\\frac{L}{g}}',
  '@vars T: s, L: m, g: m/s^2',
  '@derivedFrom wahadlo-ode',
].join('\n');

describe('FormulaBlockView — edycja', () => {
  it('bez zapisu wzór nie jest klikalny', () => {
    // Tryb czytania: `ReaderView` i eksport statyczny nie mają gdzie zapisać,
    // więc kursor „tekstowy" nad wzorem obiecywałby coś, czego nie ma.
    render(<FormulaBlockView bare id="okres" code={WZOR} />);
    expect(screen.queryByTitle(/edytować wzór/)).toBeNull();
  });

  it('z zapisem wzór zaprasza do edycji', () => {
    render(<FormulaBlockView bare id="okres" code={WZOR} onChange={vi.fn()} />);
    expect(screen.getByTitle(/edytować wzór/)).toBeTruthy();
  });

  it('kliknięcie otwiera edytor zamiast składu', () => {
    render(<FormulaBlockView bare id="okres" code={WZOR} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/edytować wzór/));

    // MathLive ładuje się leniwie — do tego czasu blok mówi, co się dzieje.
    expect(screen.getByText(/wczytuję edytor wzorów/)).toBeTruthy();
  });

  it('układ ODE daje osobny wzór na każde równanie', () => {
    // Edycja całego bloku naraz byłaby edycją tekstu, nie matematyki.
    const ode = [
      '@ode', '@state theta, omega',
      '@d theta = \\omega',
      '@d omega = -\\frac{g}{L}\\sin(\\theta)',
      '@vars g: m/s^2, L: m, theta: rad, omega: rad/s',
    ].join('\n');

    render(<FormulaBlockView bare id="ruch" code={ode} onChange={vi.fn()} />);
    expect(screen.getAllByTitle(/edytować wzór/)).toHaveLength(2);
  });
});

describe('zapis edycji do dokumentu', () => {
  it('zachowuje jednostki i powiązania', () => {
    // To jest sedno: blok to wzór **plus** dyrektywy. Zapis, który je gubi,
    // kasuje jednostki, a symulacja przestaje liczyć — bez żadnego komunikatu.
    const nowy = replaceExpression(WZOR, 0, 'T = 4\\pi\\sqrt{\\frac{L}{g}}');

    expect(nowy).toContain('@vars T: s, L: m, g: m/s^2');
    expect(nowy).toContain('@derivedFrom wahadlo-ode');
    expect(nowy).toContain('4\\pi');
  });
});
