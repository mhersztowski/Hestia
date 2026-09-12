/**
 * Zakres nazw widocznych w wyrażeniach.
 *
 * To jest ta decyzja, którą trzeba podjąć raz i na zawsze, bo zapisuje się
 * w plikach: do czego wolno się odwołać w wyrażeniu. Później zmiana oznaczałaby
 * migrację wszystkich dokumentów.
 */
import { describe, it, expect } from 'vitest';
import { lit, expr, ref, type LayoutDoc } from './types';
import { resolveValues } from './scope';

const DOK = (shapes: LayoutDoc['shapes'], vars: Record<string, number> = {}): LayoutDoc => ({
  vars, shapes, mode: 'static', viewport: { width: 1000, height: 600 },
});

describe('parametry dokumentu', () => {
  it('liczba wprost', () => {
    const r = resolveValues(DOK([{ id: 'a', x: lit(10), y: lit(20), w: lit(30), h: lit(40) }]));
    expect(r.values.a).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it('odwołanie do parametru', () => {
    const r = resolveValues(DOK(
      [{ id: 'a', x: ref('margines'), y: lit(0), w: lit(10), h: lit(10) }],
      { margines: 24 },
    ));
    expect(r.values.a.x).toBe(24);
  });

  it('wyrażenie na kilku parametrach', () => {
    const r = resolveValues(DOK(
      [{ id: 'a', x: lit(0), y: lit(0), w: expr('kolumna * 2 + odstep'), h: lit(10) }],
      { kolumna: 100, odstep: 8 },
    ));
    expect(r.values.a.w).toBe(208);
  });
});

describe('odwołania do innych obiektów', () => {
  /**
   * To jest powód, dla którego ta decyzja zapada teraz: bez niej kotwice
   * i „ustaw pod tamtym" trzeba by później dopisać do formatu, migrując pliki.
   */
  it('sięga po wymiar innego kształtu', () => {
    const r = resolveValues(DOK([
      { id: 'panel', x: lit(0), y: lit(0), w: lit(300), h: lit(200) },
      { id: 'guzik', x: lit(0), y: lit(0), w: expr('panel.w / 3'), h: lit(40) },
    ]));
    expect(r.values.guzik.w).toBe(100);
  });

  it('sięga po pozycję innego kształtu', () => {
    const r = resolveValues(DOK([
      { id: 'a', x: lit(50), y: lit(0), w: lit(10), h: lit(10) },
      { id: 'b', x: expr('a.x + a.w + 8'), y: lit(0), w: lit(10), h: lit(10) },
    ]));
    expect(r.values.b.x).toBe(68);
  });

  it('rozwiązuje w kolejności zależności, nie w kolejności zapisu', () => {
    // `b` stoi przed `a`, ale zależy od niego.
    const r = resolveValues(DOK([
      { id: 'b', x: expr('a.x + 10'), y: lit(0), w: lit(10), h: lit(10) },
      { id: 'a', x: lit(5), y: lit(0), w: lit(10), h: lit(10) },
    ]));
    expect(r.values.b.x).toBe(15);
    expect(r.issues).toEqual([]);
  });

  it('rodzic jest dostępny pod nazwą „parent"', () => {
    const r = resolveValues(DOK([
      { id: 'panel', x: lit(0), y: lit(0), w: lit(400), h: lit(300) },
      { id: 'dziecko', parent: 'panel', x: lit(0), y: lit(0), w: expr('parent.w / 2'), h: lit(20) },
    ]));
    expect(r.values.dziecko.w).toBe(200);
  });

  it('obiekt najwyższego poziomu ma za rodzica obszar rysunku', () => {
    const r = resolveValues(DOK([
      { id: 'a', x: lit(0), y: lit(0), w: expr('parent.w'), h: lit(10) },
    ]));
    expect(r.values.a.w).toBe(1000);
  });
});

describe('co się dzieje, gdy nie da się policzyć', () => {
  it('zapętlenie przez obiekty jest zgłaszane, a nie liczone w nieskończoność', () => {
    const r = resolveValues(DOK([
      { id: 'a', x: expr('b.x + 1'), y: lit(0), w: lit(10), h: lit(10) },
      { id: 'b', x: expr('a.x + 1'), y: lit(0), w: lit(10), h: lit(10) },
    ]));

    expect(r.issues.join(' ')).toMatch(/zapętl|cykl/i);
    // Mimo błędu zwracamy komplet wartości — rysunek ma się pokazać.
    expect(Number.isFinite(r.values.a.x)).toBe(true);
  });

  it('odwołanie do nieistniejącej nazwy jest zgłaszane', () => {
    const r = resolveValues(DOK([
      { id: 'a', x: expr('nie_ma.w'), y: lit(0), w: lit(10), h: lit(10) },
    ]));
    expect(r.issues.join(' ')).toMatch(/nie_ma/);
  });

  it('samo odwołanie do siebie też jest zapętleniem', () => {
    const r = resolveValues(DOK([
      { id: 'a', x: expr('a.x + 1'), y: lit(0), w: lit(10), h: lit(10) },
    ]));
    expect(r.issues.join(' ')).toMatch(/zapętl|cykl/i);
  });
});
