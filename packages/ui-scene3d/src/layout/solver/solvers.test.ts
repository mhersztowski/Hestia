/**
 * Cztery sposoby wyliczania pozycji na jednym modelu.
 *
 * To jest sedno pakietu: ten sam dokument daje się ułożyć na kilka sposobów,
 * a wybór należy do dokumentu, nie do danych. Każdy solver ma inne mocne strony
 * i inne ograniczenia — testy opisują jedno i drugie.
 */
import { describe, it, expect } from 'vitest';
import { lit, expr, type LayoutDoc } from '../model/types';
import { solveLayout } from './index';

const DOK = (d: Partial<LayoutDoc>): LayoutDoc => ({
  vars: {}, shapes: [], mode: 'static', viewport: { width: 800, height: 600 }, ...d,
});

describe('statyczny — pozycje wprost', () => {
  it('bierze wartości takie, jakie są', () => {
    const r = solveLayout(DOK({
      shapes: [{ id: 'a', x: lit(10), y: lit(20), w: lit(100), h: lit(50) }],
    }));
    expect(r.rects.a).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('wyrażenia działają także tutaj — to nadal statyczny układ', () => {
    // Wyrażenie nie czyni layoutu dynamicznym: kierunek liczenia jest jeden,
    // więc wynik jest przewidywalny i natychmiastowy.
    const r = solveLayout(DOK({
      vars: { margines: 16 },
      shapes: [
        { id: 'a', x: expr('margines'), y: lit(0), w: lit(100), h: lit(20) },
        { id: 'b', x: expr('a.x + a.w + margines'), y: lit(0), w: lit(100), h: lit(20) },
      ],
    }));
    expect(r.rects.b.x).toBe(132);
  });

  it('nie podaje stopni swobody — tu nie ma o co pytać', () => {
    const r = solveLayout(DOK({ shapes: [{ id: 'a', x: lit(0), y: lit(0), w: lit(1), h: lit(1) }] }));
    expect(r.dof).toBeUndefined();
  });
});

describe('kotwice — jak w Godocie i Unity', () => {
  const panel = { id: 'panel', x: lit(0), y: lit(0), w: lit(400), h: lit(300) };

  it('przypięcie do lewego górnego rogu daje stały rozmiar', () => {
    const r = solveLayout(DOK({
      mode: 'anchor',
      shapes: [panel, {
        id: 'guzik', parent: 'panel', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
        anchor: {
          minX: 0, maxX: 0, minY: 0, maxY: 0,
          offsetLeft: 10, offsetTop: 20, offsetRight: 110, offsetBottom: 60,
        },
      }],
    }));
    expect(r.rects.guzik).toEqual({ x: 10, y: 20, w: 100, h: 40 });
  });

  it('rozciągnięcie na całą szerokość rodzica z marginesami', () => {
    const r = solveLayout(DOK({
      mode: 'anchor',
      shapes: [panel, {
        id: 'pasek', parent: 'panel', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
        anchor: {
          minX: 0, maxX: 1, minY: 0, maxY: 0,
          offsetLeft: 8, offsetTop: 0, offsetRight: -8, offsetBottom: 40,
        },
      }],
    }));
    // 400 szerokości rodzica, po 8 z każdej strony.
    expect(r.rects.pasek).toEqual({ x: 8, y: 0, w: 384, h: 40 });
  });

  it('przypięcie do prawego dolnego rogu trzyma się rogu', () => {
    const r = solveLayout(DOK({
      mode: 'anchor',
      shapes: [panel, {
        id: 'ok', parent: 'panel', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
        anchor: {
          minX: 1, maxX: 1, minY: 1, maxY: 1,
          offsetLeft: -90, offsetTop: -40, offsetRight: -10, offsetBottom: -10,
        },
      }],
    }));
    expect(r.rects.ok).toEqual({ x: 310, y: 260, w: 80, h: 30 });
  });

  it('obiekt bez kotwicy zachowuje się jak w układzie statycznym', () => {
    const r = solveLayout(DOK({
      mode: 'anchor',
      shapes: [panel, { id: 'x', parent: 'panel', x: lit(5), y: lit(5), w: lit(10), h: lit(10) }],
    }));
    expect(r.rects.x).toEqual({ x: 5, y: 5, w: 10, h: 10 });
  });
});

describe('przepływ — jak flex', () => {
  const kontener = {
    id: 'box', x: lit(0), y: lit(0), w: lit(300), h: lit(100),
    container: { direction: 'row' as const, gap: 10, padding: 5 },
  };

  it('układa dzieci w rzędzie z odstępami', () => {
    const r = solveLayout(DOK({
      mode: 'flow',
      shapes: [kontener,
        { id: 'a', parent: 'box', x: lit(0), y: lit(0), w: lit(50), h: lit(20) },
        { id: 'b', parent: 'box', x: lit(0), y: lit(0), w: lit(70), h: lit(20) },
      ],
    }));
    expect(r.rects.a.x).toBe(5);
    expect(r.rects.b.x).toBe(65); // 5 + 50 + 10
  });

  it('rozdziela nadwyżkę proporcjonalnie do „grow"', () => {
    const r = solveLayout(DOK({
      mode: 'flow',
      shapes: [kontener,
        { id: 'a', parent: 'box', x: lit(0), y: lit(0), w: lit(50), h: lit(20), flow: { grow: 1 } },
        { id: 'b', parent: 'box', x: lit(0), y: lit(0), w: lit(50), h: lit(20), flow: { grow: 3 } },
      ],
    }));
    // 300 - 2*5 (padding) - 10 (gap) - 100 (bazowe) = 180 do rozdziału: 45 i 135.
    expect(r.rects.a.w).toBe(95);
    expect(r.rects.b.w).toBe(185);
  });

  it('kolumna układa w pionie', () => {
    const r = solveLayout(DOK({
      mode: 'flow',
      shapes: [{ ...kontener, container: { direction: 'column', gap: 4, padding: 0 } },
        { id: 'a', parent: 'box', x: lit(0), y: lit(0), w: lit(10), h: lit(30) },
        { id: 'b', parent: 'box', x: lit(0), y: lit(0), w: lit(10), h: lit(30) },
      ],
    }));
    expect(r.rects.a.y).toBe(0);
    expect(r.rects.b.y).toBe(34);
  });

  it('„stretch" rozciąga w poprzek kierunku układania', () => {
    const r = solveLayout(DOK({
      mode: 'flow',
      shapes: [{ ...kontener, container: { direction: 'row', gap: 0, padding: 10, align: 'stretch' } },
        { id: 'a', parent: 'box', x: lit(0), y: lit(0), w: lit(50), h: lit(20) },
      ],
    }));
    expect(r.rects.a.h).toBe(80); // 100 - 2*10
  });
});

describe('więzy — jak w szkicu CAD', () => {
  const dwa = [
    { id: 'a', x: lit(0), y: lit(0), w: lit(100), h: lit(40) },
    { id: 'b', x: lit(200), y: lit(90), w: lit(60), h: lit(40) },
  ];

  it('wyrównanie do lewej zrównuje współrzędne', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: dwa,
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'alignLeft', refs: ['a', 'b'] },
      ],
    }));
    expect(r.rects.b.x).toBeCloseTo(r.rects.a.x, 4);
  });

  it('odległość w poziomie ustawia się na zadaną wartość', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: dwa,
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'distanceX', refs: ['a', 'b'], value: lit(150) },
      ],
    }));
    expect(r.rects.b.x - r.rects.a.x).toBeCloseTo(150, 3);
  });

  it('wartość więzu może być wyrażeniem — to jest cel całej warstwy parametrów', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      vars: { odstep: 40 },
      shapes: dwa,
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'distanceX', refs: ['a', 'b'], value: expr('odstep * 2') },
      ],
    }));
    expect(r.rects.b.x - r.rects.a.x).toBeCloseTo(80, 3);
  });

  it('równa szerokość wyrównuje wymiary', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: dwa,
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'sameWidth', refs: ['a', 'b'] },
      ],
    }));
    expect(r.rects.b.w).toBeCloseTo(100, 3);
  });

  it('mówi, ile swobody zostało', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: dwa,
      constraints: [{ id: 'c0', type: 'fixed', refs: ['a'] }],
    }));
    // Dwa prostokąty to 8 zmiennych; `fixed` zabiera cztery.
    expect(r.dof).toBe(4);
  });

  it('w pełni związany układ ma zero stopni swobody', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: [{ id: 'a', x: lit(1), y: lit(2), w: lit(3), h: lit(4) }],
      constraints: [{ id: 'c0', type: 'fixed', refs: ['a'] }],
    }));
    expect(r.dof).toBe(0);
  });

  it('sprzeczne więzy są zgłaszane, a nie milcząco pomijane', () => {
    const r = solveLayout(DOK({
      mode: 'constraint',
      shapes: dwa,
      constraints: [
        { id: 'c0', type: 'fixed', refs: ['a'] },
        { id: 'c1', type: 'distanceX', refs: ['a', 'b'], value: lit(100) },
        { id: 'c2', type: 'distanceX', refs: ['a', 'b'], value: lit(300) },
      ],
    }));
    expect(r.issues.join(' ')).toMatch(/nie udało|sprzeczn/i);
  });
});
