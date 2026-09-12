/**
 * Przeciąganie w trybie więzów.
 *
 * To jest sprawdzian, czy więzy są czymś więcej niż jednorazowym wyrównaniem:
 * rysunek ma iść za ręką, ale nie łamiąc tego, co już ustalono.
 */
import { describe, it, expect } from 'vitest';
import { lit, type LayoutDoc } from '../model/types';
import { dragShape } from './drag';

const DOK = (d: Partial<LayoutDoc>): LayoutDoc => ({
  vars: {}, shapes: [], mode: 'constraint', viewport: { width: 800, height: 600 }, ...d,
});

const a = { id: 'a', x: lit(0), y: lit(0), w: lit(100), h: lit(40) };
const b = { id: 'b', x: lit(0), y: lit(200), w: lit(60), h: lit(40) };

describe('przeciąganie', () => {
  it('kształt bez więzów idzie dokładnie tam, gdzie kursor', () => {
    const r = dragShape(DOK({ shapes: [a, b] }), 'b', { x: 333, y: 111 });
    expect(r.rects.b.x).toBeCloseTo(333, 6);
    expect(r.rects.b.y).toBeCloseTo(111, 6);
  });

  it('wyrównanie zostaje wyrównaniem — ruch odbywa się wzdłuż niego', () => {
    const dok = DOK({
      shapes: [a, b],
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'alignLeft', refs: ['a', 'b'] },
      ],
    });
    const r = dragShape(dok, 'b', { x: 333, y: 111 });
    // W poziomie nie ma swobody, więc `b` wraca pod `a`; w pionie idzie za ręką.
    expect(r.rects.b.x).toBeCloseTo(0, 3);
    expect(r.rects.b.y).toBeCloseTo(111, 3);
  });

  it('nie rusza tego, co zostało przypięte', () => {
    const dok = DOK({ shapes: [a, b], constraints: [{ id: 'c0', type: 'fixed', refs: ['a'] }] });
    const r = dragShape(dok, 'a', { x: 500, y: 500 });
    expect(r.rects.a.x).toBeCloseTo(0, 3);
    expect(r.rects.a.y).toBeCloseTo(0, 3);
  });

  it('ciągnięcie jednego przesuwa drugi, gdy tak każe więz', () => {
    const dok = DOK({
      shapes: [a, b],
      constraints: [{ id: 'c1', type: 'distanceY', refs: ['a', 'b'], value: lit(200) }],
    });
    const r = dragShape(dok, 'a', { x: 0, y: 60 });
    // Nic nie jest przypięte, więc `b` musi pójść razem — odstęp ma zostać 200.
    expect(r.rects.b.y - r.rects.a.y).toBeCloseTo(200, 3);
    expect(r.rects.a.y).toBeGreaterThan(0);
  });

  it('mówi, ile swobody zostało — tak samo jak zwykłe przeliczenie', () => {
    const dok = DOK({ shapes: [a, b], constraints: [{ id: 'c0', type: 'fixed', refs: ['a'] }] });
    expect(dragShape(dok, 'b', { x: 10, y: 10 }).dof).toBe(4);
  });

  it('w trybach bez więzów przeciąganie po prostu zapisuje nową pozycję', () => {
    const r = dragShape(DOK({ mode: 'static', shapes: [a, b] }), 'b', { x: 7, y: 9 });
    expect(r.rects.b).toEqual({ x: 7, y: 9, w: 60, h: 40 });
  });
});
