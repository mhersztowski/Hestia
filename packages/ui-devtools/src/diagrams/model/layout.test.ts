/**
 * Testy układu automatycznego (poziom płaski — hierarchia ma własny plik).
 *
 * Diagramy stanów niemal zawsze mają cykle (`Praca --> Idle --> Praca`), więc
 * najważniejsze jest, żeby algorytm nie zapętlił się i nie zawiesił edytora.
 *
 * Sprawdzamy relacje między pozycjami, a nie konkretne piksele: odstępy zależą
 * od rozmiarów elementów (grupa jest dużo większa od węzła), więc wpisane na
 * sztywno liczby testowałyby implementację, a nie zachowanie.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import { autoLayout, computeRanks } from './layout';

function graph(edges: Array<[string, string]>, ids?: string[]): DiagramDocument {
  const doc = emptyDiagram('flowchart');
  const nodeIds = ids ?? [...new Set(edges.flat())];
  doc.nodes = nodeIds.map((id) => ({ id, label: '', shape: 'rectangle' as const }));
  doc.edges = edges.map(([source, target]) => ({
    id: `${source}__${target}`, source, target, lineStyle: 'solid' as const, arrow: 'arrow' as const,
  }));
  return doc;
}

const ranksOf = (doc: DiagramDocument) => computeRanks(doc.nodes.map((n) => n.id), doc.edges);
const posOf = (doc: DiagramDocument, id: string) => doc.nodes.find((n) => n.id === id)!.position!;

describe('computeRanks', () => {
  it('łańcuch dostaje kolejne warstwy', () => {
    const ranks = ranksOf(graph([['A', 'B'], ['B', 'C']]));
    expect([ranks.get('A'), ranks.get('B'), ranks.get('C')]).toEqual([0, 1, 2]);
  });

  it('rozgałęzienie zostaje na jednej warstwie', () => {
    const ranks = ranksOf(graph([['A', 'B'], ['A', 'C']]));
    expect(ranks.get('B')).toBe(1);
    expect(ranks.get('C')).toBe(1);
  });

  it('węzeł z dwoma poprzednikami ląduje za tym dalszym', () => {
    const ranks = ranksOf(graph([['A', 'B'], ['B', 'C'], ['A', 'C']]));
    expect(ranks.get('C')).toBe(2);
  });

  it('cykl nie zapętla obliczeń', () => {
    const ranks = ranksOf(graph([['A', 'B'], ['B', 'A']]));
    expect(ranks.size).toBe(2);
  });

  it('pętla własna jest pomijana', () => {
    expect(ranksOf(graph([['A', 'A']])).get('A')).toBe(0);
  });

  it('węzeł bez krawędzi trafia na warstwę zerową', () => {
    expect(ranksOf(graph([], ['sam'])).get('sam')).toBe(0);
  });
});

describe('autoLayout', () => {
  it('układ pionowy: następnik jest niżej, w tej samej kolumnie', () => {
    const doc = autoLayout(graph([['A', 'B']]));
    expect(posOf(doc, 'B').y).toBeGreaterThan(posOf(doc, 'A').y);
    expect(posOf(doc, 'B').x).toBe(posOf(doc, 'A').x);
  });

  it('układ poziomy: następnik jest z prawej, w tym samym wierszu', () => {
    const doc = autoLayout({ ...graph([['A', 'B']]), direction: 'LR' });
    expect(posOf(doc, 'B').x).toBeGreaterThan(posOf(doc, 'A').x);
    expect(posOf(doc, 'B').y).toBe(posOf(doc, 'A').y);
  });

  it('węzły tej samej warstwy nie nachodzą na siebie', () => {
    const doc = autoLayout(graph([['A', 'B'], ['A', 'C']]));
    // Rozstaw musi przekraczać szerokość węzła, inaczej pudełka by się przykryły.
    expect(Math.abs(posOf(doc, 'B').x - posOf(doc, 'C').x)).toBeGreaterThan(100);
  });

  it('warstwy są rozsunięte na tyle, by zmieścić węzeł', () => {
    const doc = autoLayout(graph([['A', 'B']]));
    expect(posOf(doc, 'B').y - posOf(doc, 'A').y).toBeGreaterThan(50);
  });

  it('nie nadpisuje pozycji ustawionych przez użytkownika', () => {
    const base = graph([['A', 'B']]);
    base.nodes[0].position = { x: 999, y: 999 };
    const doc = autoLayout(base);
    expect(posOf(doc, 'A')).toEqual({ x: 999, y: 999 });
    expect(posOf(doc, 'B')).not.toEqual({ x: 999, y: 999 });
  });

  it('diagram bez grup nie dostaje sztucznych ramek', () => {
    expect(autoLayout(graph([['A', 'B']])).groups).toEqual([]);
  });
});
