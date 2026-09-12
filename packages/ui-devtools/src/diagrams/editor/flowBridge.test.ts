/**
 * Testy mostu model ⇄ React Flow.
 *
 * Najczęstsza kategoria błędów w takim moście to ciche gubienie pól: krawędź
 * bez etykiety, węzeł, który wypadł z grupy, pozycja, która nie wróciła do
 * modelu. Każdy z tych przypadków kończy się utratą danych przy zapisie, więc
 * mają tu własne testy.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument, type DiagramNode } from '../model/diagram';
import { toFlowNodes, toFlowEdges, applyFlowPositions, type FlowNodeData } from './flowBridge';
import type { Node } from '@xyflow/react';
import { estimateNodeSize } from '../model/nodeSize';
import { diagramEdgeTypes } from './edges';

function doc(): DiagramDocument {
  const d = emptyDiagram('flowchart');
  d.nodes = [
    { id: 'A', label: 'Start', shape: 'rectangle', position: { x: 10, y: 20 } },
    { id: 'B', label: '', shape: 'rhombus' },
  ];
  d.edges = [{ id: 'A__B', source: 'A', target: 'B', label: 'dalej', lineStyle: 'dotted', arrow: 'arrow' }];
  return d;
}

describe('toFlowNodes', () => {
  it('przenosi etykietę, kształt i pozycję', () => {
    const [a] = toFlowNodes(doc());
    expect(a).toMatchObject({ id: 'A', position: { x: 10, y: 20 } });
    expect(a.data).toMatchObject({ label: 'Start', shape: 'rectangle', fallback: 'A' });
  });

  it('węzeł bez pozycji dostaje zero — układ dosypie ją osobno', () => {
    expect(toFlowNodes(doc())[1].position).toEqual({ x: 0, y: 0 });
  });

  it('pseudostany dostają własny typ, żeby narysować je jako punkt', () => {
    const d = emptyDiagram('state');
    d.nodes = [{ id: 's', label: '', shape: 'start' }, { id: 'x', label: '', shape: 'rectangle' }];
    expect(toFlowNodes(d).map((n) => n.type)).toEqual(['diagramPseudo', 'diagramNode']);
  });

  it('grupy idą przed swoimi dziećmi — React Flow wymaga istniejącego rodzica', () => {
    const d = emptyDiagram('flowchart');
    d.groups = [{ id: 'g', label: 'Grupa' }];
    d.nodes = [{ id: 'A', label: '', shape: 'rectangle', parentId: 'g' }];

    const nodes = toFlowNodes(d);
    expect(nodes.map((n) => n.id)).toEqual(['g', 'A']);
    expect(nodes[1].parentId).toBe('g');
  });

  it('przynależność do nieistniejącej grupy jest pomijana, a nie przekazywana', () => {
    const d = emptyDiagram('flowchart');
    d.nodes = [{ id: 'A', label: '', shape: 'rectangle', parentId: 'brak' }];
    expect(toFlowNodes(d)[0].parentId).toBeUndefined();
  });
});

describe('toFlowEdges', () => {
  it('przenosi etykietę i styl', () => {
    const [edge] = toFlowEdges(doc());
    expect(edge).toMatchObject({ id: 'A__B', source: 'A', target: 'B', label: 'dalej' });
    expect(edge.data).toMatchObject({ lineStyle: 'dotted', arrow: 'arrow' });
  });

  it('linia przerywana jest animowana — to jedyny wizualny sygnał tego stylu', () => {
    expect(toFlowEdges(doc())[0].animated).toBe(true);
  });
});

describe('applyFlowPositions', () => {
  const flowNode = (id: string, x: number, y: number): Node<FlowNodeData> => ({
    id, position: { x, y }, data: { label: '', shape: 'rectangle', fallback: id },
  });

  it('zapisuje nowe pozycje do modelu, zaokrąglając do pełnych pikseli', () => {
    const updated = applyFlowPositions(doc(), [flowNode('A', 12.4, 20.6)]);
    expect(updated.nodes[0].position).toEqual({ x: 12, y: 21 });
  });

  it('nie rusza węzłów, których nie było w widoku', () => {
    const updated = applyFlowPositions(doc(), [flowNode('A', 0, 0)]);
    expect(updated.nodes[1].position).toBeUndefined();
  });

  it('nie zmienia niczego poza pozycjami', () => {
    const source = doc();
    const updated = applyFlowPositions(source, [flowNode('A', 5, 5)]);
    expect(updated.edges).toEqual(source.edges);
    expect(updated.nodes[0].label).toBe('Start');
  });
});

/**
 * Geometria grup w widoku.
 *
 * Bez rozmiaru ramki React Flow liczy obszar diagramu z samych dzieci i
 * `fitView` oddala widok do maksimum — dokładnie objaw zgłoszony na diagramie
 * z dwoma stanami złożonymi.
 */
describe('toFlowNodes — grupy', () => {
  function withGroup(): DiagramDocument {
    const d = emptyDiagram('state');
    d.groups = [{ id: 'g', label: 'Grupa', position: { x: 30, y: 40 }, size: { width: 320, height: 200 } }];
    d.nodes = [{ id: 'A', label: '', shape: 'rectangle', parentId: 'g', position: { x: 24, y: 34 } }];
    return d;
  }

  it('rozmiar ramki trafia do stylu węzła grupy', () => {
    const [group] = toFlowNodes(withGroup());
    expect(group.style).toMatchObject({ width: 320, height: 200 });
  });

  it('grupa ma własną pozycję, a dziecko lokalną wobec niej', () => {
    const [group, child] = toFlowNodes(withGroup());
    expect(group.position).toEqual({ x: 30, y: 40 });
    // 24/34 to odległość od rogu ramki, nie od rogu płótna.
    expect(child.position).toEqual({ x: 24, y: 34 });
    expect(child.parentId).toBe('g');
  });

  it('grupa bez wyliczonego rozmiaru dostaje sensowną wartość zastępczą', () => {
    const d = emptyDiagram('state');
    d.groups = [{ id: 'g', label: 'Grupa' }];
    const [group] = toFlowNodes(d);
    expect((group.style as { width: number }).width).toBeGreaterThan(0);
  });
});

/**
 * Typ krawędzi musi być zarejestrowany w React Flow.
 *
 * Własny typ bez wpisu w `edgeTypes` cofa bibliotekę do domyślnego i zasypuje
 * konsolę ostrzeżeniami — objaw łatwy do przeoczenia, bo diagram „prawie"
 * działa.
 */
describe('toFlowEdges — typ krawędzi', () => {
  const BUILT_IN = new Set(['default', 'straight', 'step', 'smoothstep', 'simplebezier']);

  it('używa typu wbudowanego albo takiego, który sami zarejestrowaliśmy', () => {
    // Typ spoza obu list cofa React Flow do domyślnego i zasypuje konsolę
    // ostrzeżeniami — objaw łatwy do przeoczenia, bo diagram „prawie" działa.
    for (const edge of toFlowEdges(doc())) {
      const known = BUILT_IN.has(edge.type!) || edge.type! in diagramEdgeTypes;
      expect(known, edge.type).toBe(true);
    }
  });
});

describe('rozmiar węzła w widoku', () => {
  it('szerokość odpowiada tej, którą zarezerwował układ', () => {
    const d = emptyDiagram('state');
    d.nodes = [{ id: 'A', label: 'Oczekiwanie na zdarzenie', shape: 'rectangle' }];
    const [flow] = toFlowNodes(d);
    expect((flow.style as { width: number }).width).toBe(estimateNodeSize(d.nodes[0]).width);
  });

  it('pseudostany nie dostają wymuszonej szerokości — rysują się jako punkt', () => {
    const d = emptyDiagram('state');
    d.nodes = [{ id: 's', label: '', shape: 'start' }];
    expect(toFlowNodes(d)[0].style).toBeUndefined();
  });
});

describe('krawędzie równoległe', () => {
  function twoWay(): DiagramDocument {
    const d = emptyDiagram('state');
    d.nodes = [
      { id: 'A', label: '', shape: 'rectangle' },
      { id: 'B', label: '', shape: 'rectangle' },
    ];
    d.edges = [
      { id: 'A__B', source: 'A', target: 'B', label: 'start', lineStyle: 'solid', arrow: 'arrow' },
      { id: 'B__A', source: 'B', target: 'A', label: 'stop', lineStyle: 'solid', arrow: 'arrow' },
    ];
    return d;
  }

  it('przejścia tam i z powrotem dostają kolejne numery w obrębie pary', () => {
    const [there, back] = toFlowEdges(twoWay());
    expect(there.data).toMatchObject({ parallelIndex: 0, parallelCount: 2 });
    expect(back.data).toMatchObject({ parallelIndex: 1, parallelCount: 2 });
  });

  it('pojedyncze przejście nie jest rozsuwane', () => {
    const d = twoWay();
    d.edges = [d.edges[0]];
    expect(toFlowEdges(d)[0].data).toMatchObject({ parallelIndex: 0, parallelCount: 1 });
  });

  it('różne pary liczone są niezależnie', () => {
    const d = twoWay();
    d.nodes.push({ id: 'C', label: '', shape: 'rectangle' });
    d.edges.push({ id: 'A__C', source: 'A', target: 'C', lineStyle: 'solid', arrow: 'arrow' });
    const byId = new Map(toFlowEdges(d).map((e) => [e.id, e.data]));
    expect(byId.get('A__C')).toMatchObject({ parallelIndex: 0, parallelCount: 1 });
  });
});

/**
 * Zakończenia krawędzi.
 *
 * Model rozróżnia cztery („-->", „---", „--o", „--x"), a przy własnym typie
 * krawędzi React Flow nie dorysowuje grotu sam. Brak markera oznacza gołe
 * linie — po diagramie nie widać wtedy kierunku przepływu.
 */
describe('toFlowEdges — zakończenia', () => {
  function withArrow(arrow: 'arrow' | 'none' | 'circle' | 'cross') {
    const d = emptyDiagram('flowchart');
    d.nodes = [{ id: 'A', label: '', shape: 'rectangle' }, { id: 'B', label: '', shape: 'rectangle' }];
    d.edges = [{ id: 'A__B', source: 'A', target: 'B', lineStyle: 'solid', arrow }];
    return toFlowEdges(d)[0];
  }

  it('strzałka dostaje wypełniony grot', () => {
    expect(withArrow('arrow').markerEnd).toMatchObject({ type: 'arrowclosed' });
  });

  it('kółko i krzyżyk mają własne markery', () => {
    expect(withArrow('circle').markerEnd).toBe('diagram-marker-circle');
    expect(withArrow('cross').markerEnd).toBe('diagram-marker-cross');
  });

  /**
   * React Flow sam robi z tej wartości `url(#…)`. Podanie gotowego odwołania
   * dawało `url('#url(#…)')` i marker po prostu się nie rysował — a testy tego
   * nie łapały, bo sprawdzały zapisaną wartość zamiast tego, co z niej wynika.
   */
  it('marker jest podany jako samo id, bez `url(#…)`', () => {
    for (const arrow of ['circle', 'cross'] as const) {
      expect(String(withArrow(arrow).markerEnd)).not.toContain('url(');
    }
  });

  it('linia bez grotu (`---`) nie dostaje żadnego zakończenia', () => {
    expect(withArrow('none').markerEnd).toBeUndefined();
  });
});

/**
 * Krawędzie dwustronne i niewidzialne.
 *
 * Mermaid zna `<-->`, `o--o`, `x--x` (zakończenie po obu stronach) oraz `~~~`
 * (link, który nie rysuje linii — służy tylko do ustawiania układu). Model trzyma
 * jedno i drugie w `meta`; bez przełożenia na widok `<-->` wyglądało jak zwykła
 * strzałka w jedną stronę, a `~~~` jak normalne połączenie.
 */
describe('toFlowEdges — krawędzie dwustronne i niewidzialne', () => {
  function edgeWith(meta: Record<string, string>, arrow: 'arrow' | 'none' | 'circle' | 'cross' = 'arrow') {
    const d = emptyDiagram('flowchart');
    d.nodes = [{ id: 'A', label: '', shape: 'rectangle' }, { id: 'B', label: '', shape: 'rectangle' }];
    d.edges = [{ id: 'A__B', source: 'A', target: 'B', lineStyle: 'solid', arrow, meta }];
    return toFlowEdges(d)[0];
  }

  it('`<-->` dostaje grot także od strony źródła', () => {
    expect(edgeWith({ startArrow: 'arrow' }).markerStart).toMatchObject({ type: 'arrowclosed' });
  });

  it('`o--o` i `x--x` mają własne markery po stronie źródła', () => {
    expect(edgeWith({ startArrow: 'circle' }, 'circle').markerStart).toBe('diagram-marker-circle');
    expect(edgeWith({ startArrow: 'cross' }, 'cross').markerStart).toBe('diagram-marker-cross');
  });

  it('zwykła krawędź nie ma zakończenia u źródła', () => {
    expect(edgeWith({}).markerStart).toBeUndefined();
  });

  it('`~~~` jest oznaczony jako niewidzialny', () => {
    expect(edgeWith({ invisible: 'true' }, 'none').data?.invisible).toBe(true);
  });
});

/**
 * Rozmiar pudełka na ekranie musi się zgadzać z tym, co zarezerwował układ.
 *
 * Do widoku szła sama szerokość, a wysokość brała się z tekstu — więc koło
 * wychodziło spłaszczoną elipsą, a odstępy policzone przez układ (który zna
 * pełny rozmiar) nie odpowiadały temu, co widać.
 */
describe('toFlowNodes — rozmiar zgodny z układem', () => {
  const nodeWith = (shape: DiagramNode['shape'], label: string) => {
    const d = emptyDiagram('flowchart');
    d.nodes = [{ id: 'A', label, shape }];
    return toFlowNodes(d)[0];
  };

  it('koło dostaje wysokość równą szerokości', () => {
    const flow = nodeWith('circle', 'Okrąg');
    const { width, minHeight } = flow.style as { width: number; minHeight: number };
    expect(minHeight).toBe(width);
  });

  it('podwójny okrąg też jest kwadratem', () => {
    const flow = nodeWith('doubleCircle', 'Podwójny okrąg');
    const { width, minHeight } = flow.style as { width: number; minHeight: number };
    expect(minHeight).toBe(width);
  });

  it('wysokość jest miękka — długi tekst może pudełko rozepchnąć, nie zostać ucięty', () => {
    const flow = nodeWith('rectangle', 'Bardzo długi opis kroku, który musi się zawinąć na kilka linii');
    expect((flow.style as Record<string, unknown>).height).toBeUndefined();
    expect((flow.style as Record<string, unknown>).minHeight).toBeGreaterThan(0);
  });

  it('pseudostany zachowują swój stały rozmiar', () => {
    expect(nodeWith('start', '').style).toBeUndefined();
  });
});
