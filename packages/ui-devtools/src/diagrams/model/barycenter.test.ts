/**
 * Rozmieszczenie w warstwie — porządkowanie barycentryczne.
 *
 * Bez niego każdy element warstwy lądował w tej samej kolumnie (x = 0) i
 * diagram schodził pionową kreską w dół: rozgałęzienia się nie rozchodziły, a
 * połączenia krzyżowały bez potrzeby. Renderer Mermaida (dagre) wykonuje
 * dokładnie ten krok — węzeł ciąży ku średniej pozycji swoich sąsiadów z
 * poprzedniej warstwy.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import { autoLayout } from './layout';

function graph(edges: Array<[string, string]>, ids?: string[]): DiagramDocument {
  const doc = emptyDiagram('flowchart');
  doc.nodes = (ids ?? [...new Set(edges.flat())]).map((id) => ({ id, label: '', shape: 'rectangle' as const }));
  doc.edges = edges.map(([source, target]) => ({
    id: `${source}__${target}`, source, target, lineStyle: 'solid' as const, arrow: 'arrow' as const,
  }));
  return doc;
}
const x = (doc: DiagramDocument, id: string) => doc.nodes.find((n) => n.id === id)!.position!.x;
const y = (doc: DiagramDocument, id: string) => doc.nodes.find((n) => n.id === id)!.position!.y;

describe('rozmieszczenie w warstwie', () => {
  it('rozgałęzienie rozchodzi się na boki, a nie w jedną kolumnę', () => {
    const doc = autoLayout(graph([['A', 'B'], ['A', 'C']]));
    expect(x(doc, 'B')).not.toBe(x(doc, 'C'));
    // Rodzic ma stać POŚRODKU między dziećmi, nie przy jednym z nich —
    // inaczej strzałki rozchodzą się skośnie i krzyżują bez powodu.
    const middle = (x(doc, 'B') + x(doc, 'C')) / 2;
    expect(Math.abs(x(doc, 'A') - middle)).toBeLessThan(30);
  });

  it('zejście gałęzi wraca na środek', () => {
    // A → {B, C} → D: D ma leżeć między B i C, nie przy jednym z nich.
    const doc = autoLayout(graph([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']]));
    const middle = (x(doc, 'B') + x(doc, 'C')) / 2;
    expect(Math.abs(x(doc, 'D') - middle)).toBeLessThan(30);
  });

  it('prosty łańcuch zostaje w jednej kolumnie', () => {
    const doc = autoLayout(graph([['A', 'B'], ['B', 'C']]));
    expect(x(doc, 'A')).toBe(x(doc, 'B'));
    expect(x(doc, 'B')).toBe(x(doc, 'C'));
  });

  it('elementy warstwy nie nachodzą na siebie mimo ciążenia ku środkowi', () => {
    const doc = autoLayout(graph([['A', 'B'], ['A', 'C'], ['A', 'D']]));
    const xs = ['B', 'C', 'D'].map((id) => x(doc, id)).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(100);
    expect(xs[2] - xs[1]).toBeGreaterThan(100);
  });

  it('warstwy nadal rosną w dół', () => {
    const doc = autoLayout(graph([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']]));
    expect(y(doc, 'A')).toBeLessThan(y(doc, 'B'));
    expect(y(doc, 'B')).toBeLessThan(y(doc, 'D'));
  });

  it('w układzie poziomym rozgałęzienie rozchodzi się w pionie', () => {
    const doc = autoLayout({ ...graph([['A', 'B'], ['A', 'C']]), direction: 'LR' });
    expect(y(doc, 'B')).not.toBe(y(doc, 'C'));
    expect(x(doc, 'B')).toBe(x(doc, 'C'));
  });
});
