/**
 * Kotwice krawędzi muszą istnieć w KAŻDYM widoku węzła.
 *
 * `toFlowEdges` przypisuje każdej krawędzi `sourceHandle`/`targetHandle`
 * wyliczone przez `assignEdgeAnchors` (np. `b2`). React Flow, nie znajdując
 * uchwytu o takim identyfikatorze, **po cichu nie rysuje krawędzi** — bez
 * błędu w konsoli i bez śladu w interfejsie. Tak zniknęły wszystkie połączenia
 * na schematach blokowych i diagramach stanów, podczas gdy klasy, encje i C4
 * (jedyne widoki używające wtedy `NodeAnchors`) rysowały się poprawnie.
 *
 * Dlatego test sprawdza komplet identyfikatorów, a nie sam fakt, że węzeł ma
 * jakieś uchwyty: brakujący jeden bok znaczy znikające krawędzie akurat w tę
 * stronę — usterkę, której na małym diagramie można nie zauważyć.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react';
import { DiagramNodeView, DiagramPseudoNodeView } from './nodes';
import { ClassNodeView } from './ClassNodeView';
import { EntityNodeView } from './EntityNodeView';
import { C4NodeView } from './C4NodeView';
import { anchorIds, type AnchorSide } from '../model/edgeAnchors';
import type { FlowNodeData } from './flowBridge';
import type { NodeShape } from '../model/diagram';

const SIDES: AnchorSide[] = ['t', 'b', 'l', 'r'];
const KOMPLET = SIDES.flatMap(anchorIds);

function props(data: Partial<FlowNodeData> & { shape: NodeShape }): NodeProps<Node<FlowNodeData>> {
  return {
    id: 'n1', type: 'diagramNode', selected: false, dragging: false, zIndex: 0,
    isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, draggable: true,
    selectable: true, deletable: true, width: 150, height: 52,
    data: { label: 'Węzeł', fallback: 'n1', editable: false, ...data },
  } as unknown as NodeProps<Node<FlowNodeData>>;
}

/** Identyfikatory uchwytów wyrenderowanych przez widok. */
function uchwyty(element: React.ReactElement): string[] {
  const markup = renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
  return [...markup.matchAll(/data-handleid="([^"]+)"/g)].map((m) => m[1]);
}

describe('kotwice krawędzi w widokach węzłów', () => {
  it('zwykły węzeł (schemat blokowy, stan) ma komplet kotwic', () => {
    expect(uchwyty(<DiagramNodeView {...props({ shape: 'rectangle' })} />)).toEqual(expect.arrayContaining(KOMPLET));
  });

  // Rozwidlenie rysuje się jako belka, ale przejścia dochodzą do niego tak samo.
  it('belka fork/join ma komplet kotwic', () => {
    expect(uchwyty(<DiagramNodeView {...props({ shape: 'fork' })} />)).toEqual(expect.arrayContaining(KOMPLET));
  });

  it('pseudostan [*] ma komplet kotwic', () => {
    expect(uchwyty(<DiagramPseudoNodeView {...props({ shape: 'start' })} />)).toEqual(expect.arrayContaining(KOMPLET));
  });

  // Te trzy działały od początku — są w teście jako straż, żeby zmiana w
  // `NodeAnchors` nie zabrała kotwic tam, gdzie dziś są.
  it('klasa, encja i C4 nadal mają komplet kotwic', () => {
    expect(uchwyty(<ClassNodeView {...props({ shape: 'rectangle', members: [] })} />)).toEqual(expect.arrayContaining(KOMPLET));
    expect(uchwyty(<EntityNodeView {...props({ shape: 'rectangle', attributes: [] })} />)).toEqual(expect.arrayContaining(KOMPLET));
    expect(uchwyty(<C4NodeView {...props({ shape: 'rectangle', c4: { kind: 'system' } })} />)).toEqual(expect.arrayContaining(KOMPLET));
  });
});
