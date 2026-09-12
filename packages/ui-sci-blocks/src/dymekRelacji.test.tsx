/**
 * Dymek odsyłacza dla wzoru, który nie jest przypisaniem.
 *
 * Podręcznik pełen jest równań w rodzaju `d²x/dt² + (k/m)x = 0` — one nie mają
 * „lewej strony", którą coś się definiuje. Dymek składał treść jako
 * `cel = wyrażenie`, więc dla takiego wzoru pokazywał samo „=".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReferenceLink } from './ReferenceLink';

/** Dymek pyta urządzenie o mysz — w jsdom trzeba mu odpowiedzieć. */
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((zapytanie: string) => ({
    matches: zapytanie.includes('hover: hover'),
    media: zapytanie,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const RELACJA = [
  '@relation',
  '\\frac{\\mathrm{d}^2 x}{\\mathrm{d}t^2} + \\frac{k}{m} x = 0',
  '@vars x: m, k: N/m, m: kg',
].join('\n');

const DEFINICJA = ['\\omega = \\sqrt{k/m}', '@vars omega: 1/s, k: N/m, m: kg'].join('\n');

const dymek = (code: string) => {
  const widok = render(
    <ReferenceLink
      id="rh1-15-eq5"
      label="15-5"
      target={{ code, kind: 'formula', sameDocument: true }}
    />,
  );
  fireEvent.mouseEnter(widok.getByText('15-5'));
  return widok;
};

describe('wzór w dymku', () => {
  it('relacja pokazuje całe równanie, nie samo „=”', () => {
    const { baseElement } = dymek(RELACJA);
    const wzor = baseElement.querySelector('[role="dialog"] .katex');
    expect(wzor).toBeTruthy();

    // KaTeX zostawia oryginalny zapis w `annotation` — po nim poznajemy,
    // że złożono całe równanie, a nie sklejkę z pustych pól.
    const zrodlo = baseElement.querySelector('[role="dialog"] .katex annotation')?.textContent ?? '';
    expect(zrodlo).toContain('\\frac{k}{m}');
    expect(zrodlo.trim()).not.toBe('=');
    expect(zrodlo.trim().startsWith('=')).toBe(false);
  });

  it('definicja nadal pokazuje „cel = wyrażenie”', () => {
    const { baseElement } = dymek(DEFINICJA);
    const zrodlo = baseElement.querySelector('[role="dialog"] .katex annotation')?.textContent ?? '';
    expect(zrodlo).toContain('\\omega');
    expect(zrodlo).toContain('\\sqrt{k/m}');
  });
});
