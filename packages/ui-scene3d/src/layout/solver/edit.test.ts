import { describe, it, expect } from 'vitest';
import { lit, expr, type LayoutDoc } from '../model/types';
import { solveLayout } from './index';
import { applyDrag } from './edit';

const DOK = (d: Partial<LayoutDoc>): LayoutDoc => ({
  vars: {}, shapes: [], mode: 'static', viewport: { width: 400, height: 300 }, ...d,
});
const rects = (doc: LayoutDoc) => solveLayout(doc).rects;

describe('ruch myszą zapisuje się inaczej w każdym trybie', () => {
  it('statyczny zapisuje liczbę', () => {
    const doc = DOK({ shapes: [{ id: 'a', x: lit(0), y: lit(0), w: lit(10), h: lit(10) }] });
    const { doc: nowy } = applyDrag(doc, 'a', { x: 30, y: 40 }, rects(doc));
    expect(nowy.shapes[0].x).toEqual(lit(30));
  });

  it('statyczny odmawia, gdy obie współrzędne wynikają z wyrażeń', () => {
    const doc = DOK({ vars: { m: 5 }, shapes: [{ id: 'a', x: expr('m * 2'), y: expr('m'), w: lit(10), h: lit(10) }] });
    const { doc: nowy, odmowa } = applyDrag(doc, 'a', { x: 30, y: 40 }, rects(doc));
    expect(odmowa).toMatch(/wyrażeń/);
    expect(nowy).toBe(doc);
  });

  it('jedna współrzędna z wyrażenia nie unieruchamia drugiej', () => {
    const doc = DOK({ vars: { m: 5 }, shapes: [{ id: 'a', x: expr('m * 2'), y: lit(0), w: lit(10), h: lit(10) }] });
    const { doc: nowy, odmowa, uwaga } = applyDrag(doc, 'a', { x: 30, y: 40 }, rects(doc));
    expect(odmowa).toBeUndefined();
    expect(uwaga).toMatch(/Poziome/);
    expect(rects(nowy).a).toMatchObject({ x: 10, y: 40 });
  });

  it('kotwice zmieniają odstępy, a nie pozycję', () => {
    const doc = DOK({
      mode: 'anchor',
      shapes: [{
        id: 'a', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
        anchor: { minX: 1, maxX: 1, minY: 0, maxY: 0, offsetLeft: -50, offsetRight: -10, offsetTop: 10, offsetBottom: 40 },
      }],
    });
    const { doc: nowy } = applyDrag(doc, 'a', { x: 300, y: 60 }, rects(doc));
    // Przypięcie do prawej krawędzi zostaje przypięciem — zmienia się tylko odstęp.
    expect(nowy.shapes[0].anchor!.minX).toBe(1);
    expect(rects(nowy).a.x).toBeCloseTo(300, 6);
    expect(rects(nowy).a.w).toBeCloseTo(40, 6);
  });

  it('przepływ odmawia i tłumaczy dlaczego', () => {
    const doc = DOK({
      mode: 'flow',
      shapes: [
        { id: 'box', x: lit(0), y: lit(0), w: lit(200), h: lit(100), container: { direction: 'row' } },
        { id: 'a', parent: 'box', x: lit(0), y: lit(0), w: lit(50), h: lit(20) },
      ],
    });
    const { odmowa } = applyDrag(doc, 'a', { x: 100, y: 100 }, rects(doc));
    expect(odmowa).toMatch(/przepływ/);
  });

  it('więzy zapisują także to, co poruszyło się „samo"', () => {
    const doc = DOK({
      mode: 'constraint',
      shapes: [
        { id: 'a', x: lit(0), y: lit(0), w: lit(50), h: lit(20) },
        { id: 'b', x: lit(0), y: lit(100), w: lit(50), h: lit(20) },
      ],
      constraints: [{ id: 'c', type: 'distanceY', refs: ['a', 'b'], value: lit(100) }],
    });
    const { doc: nowy } = applyDrag(doc, 'a', { x: 0, y: 50 }, rects(doc));
    const r = rects(nowy);
    expect(r.b.y - r.a.y).toBeCloseTo(100, 3);
    expect(r.a.y).toBeGreaterThan(0);
  });
});
