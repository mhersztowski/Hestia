/**
 * Rysunek zapisany w dokumencie.
 *
 * Sedno rysika w tej bazie: pociągnięcia wracają do bloku `formula` jako
 * dyrektywa, więc dokument dalej jest źródłem prawdy. Testy pilnują tego, co
 * przy takim zapisie ginie po cichu — podwojonej dyrektywy przy powtórnym
 * rysowaniu i rysunku, który nie dotarł do modelu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { compilePde, parseFormulaBlock, parseStrokes } from '@hestia/core-sci';
import { FieldBlock } from './FieldBlock';

const POLE = [
  '@pde',
  '@field u',
  '@grid 24 x 24',
  '@domain x: 0..1 m, y: 0..1 m',
  '@d u = \\alpha \\cdot \\Delta u',
  '@init u = 0',
  '@boundary neumann',
  '@vars u: K, alpha: m^2/s, x: m, y: m',
].join('\n');

/** Wyciąga treść dyrektywy `@strokes` z bloku. */
const strokesOf = (code: string) => /^@strokes\b(.*)$/m.exec(code)?.[1]?.trim() ?? '';

describe('FieldBlock — zapis rysunku', () => {
  it('rysuje na płótnie dopiero po włączeniu trybu', () => {
    render(<FieldBlock bare id="pole" code={POLE} />);

    expect(screen.getByTitle(/Rysuj warunek początkowy/)).toBeTruthy();
    // Przycisk zapisu pojawia się dopiero, gdy jest co zapisać — inaczej
    // czytelnik klikałby „zapisz" bez żadnego skutku.
    expect(screen.queryByTitle(/Zapisuje pociągnięcia/)).toBeNull();
  });

  it('istniejący rysunek jest odczytany z dokumentu', () => {
    const zRysunkiem = `${POLE}\n@strokes 0.3,0.4,0.1,1`;
    const model = compilePde(parseFormulaBlock('pole', zRysunkiem));

    render(<FieldBlock bare id="pole" code={zRysunkiem} />);
    // Model widzi rysunek: pole nie jest puste mimo `@init u = 0`.
    expect(model.run({ alpha: 0.01 }, [0, 0], 1).max).toBeGreaterThan(0.5);
  });

  it('nie gubi pozostałych dyrektyw przy zapisie', () => {
    // Zapis podmienia jedną linię, a nie przepisuje bloku — inaczej wracanie
    // do rysowania kasowałoby siatkę albo warunek brzegowy.
    const zRysunkiem = `${POLE}\n@strokes 0.3,0.4,0.1,1`;
    const blok = parseFormulaBlock('pole', zRysunkiem);

    expect(blok.pde?.nx).toBe(24);
    expect(blok.pde?.boundary).toEqual({ kind: 'neumann' });
    expect(parseStrokes(strokesOf(zRysunkiem))).toHaveLength(1);
  });

  it('powtórny zapis podmienia dyrektywę zamiast dokładać drugą', () => {
    // Dwie dyrektywy `@strokes` w jednym bloku znaczą, że jedna jest martwa —
    // parser bierze ostatnią, a autor widzi w pliku obie i nie wie, która działa.
    let code = `${POLE}\n@strokes 0.3,0.4,0.1,1`;
    code = code.replace(/^@strokes\b.*$/m, '@strokes 0.6,0.6,0.1,1');

    expect(code.match(/@strokes/g)).toHaveLength(1);
    expect(parseStrokes(strokesOf(code))[0].x).toBe(0.6);
  });

  it('nie woła zapisu, dopóki nikt nie rysował', () => {
    const onFormulaChange = vi.fn();
    render(<FieldBlock bare id="pole" code={POLE} onFormulaChange={onFormulaChange} />);

    expect(onFormulaChange).not.toHaveBeenCalled();
  });
});
