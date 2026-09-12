/**
 * Rozłożenie krawędzi wzdłuż boków węzła.
 *
 * Przy jednym punkcie zaczepienia wszystkie relacje encji wychodziły z tego
 * samego miejsca i zlewały się w wachlarz. Test sprawdza, że sąsiednie
 * krawędzie dostają różne punkty i że ich kolejność odpowiada położeniu drugiego
 * końca — inaczej linie krzyżowałyby się tuż przy węźle.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import { assignEdgeAnchors, anchorOffset, anchorIds, ANCHORS_PER_SIDE } from './edgeAnchors';

/** Węzeł-gwiazda: jeden u góry, kilka pod nim w różnych miejscach. */
function gwiazda(): DiagramDocument {
  const doc = emptyDiagram('er');
  doc.nodes = [
    { id: 'SRODEK', label: 'SRODEK', shape: 'rectangle', position: { x: 400, y: 0 }, attributes: [] },
    { id: 'LEWY', label: 'LEWY', shape: 'rectangle', position: { x: 0, y: 300 }, attributes: [] },
    { id: 'SRODKOWY', label: 'SRODKOWY', shape: 'rectangle', position: { x: 400, y: 300 }, attributes: [] },
    { id: 'PRAWY', label: 'PRAWY', shape: 'rectangle', position: { x: 800, y: 300 }, attributes: [] },
  ];
  doc.edges = ['LEWY', 'SRODKOWY', 'PRAWY'].map((target) => ({
    id: `SRODEK__${target}`, source: 'SRODEK', target, lineStyle: 'solid' as const, arrow: 'none' as const,
  }));
  return doc;
}

describe('rozkład po boku', () => {
  const anchors = assignEdgeAnchors(gwiazda());

  it('każda krawędź dostaje inny punkt zaczepienia', () => {
    const sources = ['LEWY', 'SRODKOWY', 'PRAWY'].map((t) => anchors.get(`SRODEK__${t}`)!.source);
    expect(new Set(sources).size).toBe(3);
  });

  it('bok wynika z kierunku, nie zawsze jest to dół', () => {
    // Cel odsunięty bardziej w bok niż w dół wychodzi bokiem — tak samo robi
    // Mermaid, u którego linia do sąsiada z lewej opuszcza lewą krawędź tabeli.
    expect(anchors.get('SRODEK__LEWY')!.source).toMatch(/^l/);
    expect(anchors.get('SRODEK__SRODKOWY')!.source).toMatch(/^b/);
    expect(anchors.get('SRODEK__PRAWY')!.source).toMatch(/^r/);
  });

  it('końce krawędzi patrzą na siebie', () => {
    expect(anchors.get('SRODEK__LEWY')!.target).toMatch(/^r/);
    expect(anchors.get('SRODEK__SRODKOWY')!.target).toMatch(/^t/);
    expect(anchors.get('SRODEK__PRAWY')!.target).toMatch(/^l/);
  });
});

describe('kilka krawędzi w tym samym kierunku', () => {
  /** Trzy cele blisko siebie pod węzłem — wszystkie wychodzą dołem. */
  const doc = emptyDiagram('er');
  doc.nodes = [
    { id: 'HUB', label: 'HUB', shape: 'rectangle', position: { x: 300, y: 0 }, attributes: [] },
    { id: 'A', label: 'A', shape: 'rectangle', position: { x: 200, y: 500 }, attributes: [] },
    { id: 'B', label: 'B', shape: 'rectangle', position: { x: 300, y: 500 }, attributes: [] },
    { id: 'C', label: 'C', shape: 'rectangle', position: { x: 400, y: 500 }, attributes: [] },
  ];
  doc.edges = ['A', 'B', 'C'].map((target) => ({
    id: `HUB__${target}`, source: 'HUB', target, lineStyle: 'solid' as const, arrow: 'none' as const,
  }));
  const anchors = assignEdgeAnchors(doc);

  it('wszystkie wychodzą dolnym bokiem', () => {
    for (const target of ['A', 'B', 'C']) {
      expect(anchors.get(`HUB__${target}`)!.source).toMatch(/^b/);
    }
  });

  it('każda dostaje inny punkt na tym boku', () => {
    const sloty = ['A', 'B', 'C'].map((t) => anchors.get(`HUB__${t}`)!.source);
    expect(new Set(sloty).size).toBe(3);
  });

  it('kolejność punktów odpowiada położeniu celów', () => {
    const slot = (t: string) => Number(anchors.get(`HUB__${t}`)!.source.slice(1));
    expect(slot('A')).toBeLessThan(slot('B'));
    expect(slot('B')).toBeLessThan(slot('C'));
  });
});

describe('kierunek boku', () => {
  function para(dx: number, dy: number): DiagramDocument {
    const doc = emptyDiagram('er');
    doc.nodes = [
      { id: 'A', label: 'A', shape: 'rectangle', position: { x: 0, y: 0 }, attributes: [] },
      { id: 'B', label: 'B', shape: 'rectangle', position: { x: dx, y: dy }, attributes: [] },
    ];
    doc.edges = [{ id: 'A__B', source: 'A', target: 'B', lineStyle: 'solid', arrow: 'none' }];
    return doc;
  }

  it('cel poniżej — wychodzi dołem, wchodzi górą', () => {
    const a = assignEdgeAnchors(para(0, 400)).get('A__B')!;
    expect(a.source).toMatch(/^b/);
    expect(a.target).toMatch(/^t/);
  });

  it('cel powyżej — wychodzi górą, wchodzi dołem', () => {
    const a = assignEdgeAnchors(para(0, -400)).get('A__B')!;
    expect(a.source).toMatch(/^t/);
    expect(a.target).toMatch(/^b/);
  });

  it('cel z prawej — wychodzi prawym bokiem, wchodzi lewym', () => {
    const a = assignEdgeAnchors(para(600, 0)).get('A__B')!;
    expect(a.source).toMatch(/^r/);
    expect(a.target).toMatch(/^l/);
  });

  it('cel z lewej — wychodzi lewym bokiem', () => {
    expect(assignEdgeAnchors(para(-600, 0)).get('A__B')!.source).toMatch(/^l/);
  });
});

describe('przypadki brzegowe', () => {
  it('więcej krawędzi na jednym boku niż punktów — rozkładane po całym boku', () => {
    // Osiem celów dokładnie pod węzłem: wszystkie muszą wyjść dołem, więc
    // sloty się powtórzą — ale mają objąć cały bok, nie skupić się w środku.
    const doc = emptyDiagram('er');
    doc.nodes = [{ id: 'HUB', label: 'HUB', shape: 'rectangle', position: { x: 500, y: 0 }, attributes: [] }];
    for (let i = 0; i < 8; i++) {
      doc.nodes.push({ id: `N${i}`, label: `N${i}`, shape: 'rectangle', position: { x: 470 + i * 8, y: 900 }, attributes: [] });
      doc.edges.push({ id: `HUB__N${i}`, source: 'HUB', target: `N${i}`, lineStyle: 'solid', arrow: 'none' });
    }
    const anchors = assignEdgeAnchors(doc);
    const sloty = doc.edges.map((e) => anchors.get(e.id)!.source);
    expect(sloty.every((s) => s.startsWith('b'))).toBe(true);
    expect(new Set(sloty).size).toBe(ANCHORS_PER_SIDE);
  });

  it('pętla własna zaczepia się tym samym bokiem', () => {
    const doc = emptyDiagram('er');
    doc.nodes = [{ id: 'A', label: 'A', shape: 'rectangle', position: { x: 0, y: 0 }, attributes: [] }];
    doc.edges = [{ id: 'A__A', source: 'A', target: 'A', lineStyle: 'solid', arrow: 'none' }];
    const a = assignEdgeAnchors(doc).get('A__A')!;
    expect(a.source).toMatch(/^b/);
    expect(a.target).toMatch(/^b/);
    expect(a.source).not.toBe(a.target);
  });

  it('krawędź do nieistniejącego węzła nie wywraca wyliczenia', () => {
    const doc = emptyDiagram('er');
    doc.nodes = [{ id: 'A', label: 'A', shape: 'rectangle', position: { x: 0, y: 0 }, attributes: [] }];
    doc.edges = [{ id: 'A__X', source: 'A', target: 'X', lineStyle: 'solid', arrow: 'none' }];
    expect(() => assignEdgeAnchors(doc)).not.toThrow();
  });
});

describe('położenie punktów', () => {
  it('każdy bok ma pełen komplet identyfikatorów', () => {
    expect(anchorIds('b')).toEqual(['b0', 'b1', 'b2', 'b3', 'b4']);
  });

  it('punkty są rozłożone równomiernie i nie w rogach', () => {
    const offsets = [0, 1, 2, 3, 4].map(anchorOffset);
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[4]).toBeLessThan(100);
    expect(offsets[2]).toBe(50);
  });
});
