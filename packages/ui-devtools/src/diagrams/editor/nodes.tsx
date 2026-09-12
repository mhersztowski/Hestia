/**
 * nodes.tsx — komponenty węzłów React Flow odwzorowujące kształty modelu.
 *
 * Kształty rysujemy CSS-em (`clip-path`, `border-radius`), a nie SVG per węzeł:
 * węzeł pozostaje zwykłym pudełkiem, więc tekst zawija się sam, a React Flow
 * nadal panuje nad rozmiarem i uchwytami. Kształty, których CSS nie wyrazi
 * sensownie, mają najbliższe czytelne przybliżenie — diagram ma być zrozumiały,
 * a nie idealnie zgodny z rendererem Mermaida (od tego jest podgląd „View").
 */
import { Handle, NodeResizer, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { NodeShape } from '../model/diagram';
import type { FlowNodeData } from './flowBridge';
import { InlineLabel } from './InlineLabel';
import { NodeShapeBackground } from './NodeShapeBackground';
import { ClassNodeView } from './ClassNodeView';
import { C4NodeView } from './C4NodeView';
import { EntityNodeView } from './EntityNodeView';

const BASE: CSSProperties = {
  position: 'relative',
  // Wypełnij węzeł: rozmiar nadaje mu `sizeStyle` (ten sam, co zna układ), a
  // kształt rysuje się względem TEGO elementu. Bez rozciągnięcia figura miałaby
  // wysokość tekstu, nie węzła.
  flex: 1,
  alignSelf: 'stretch',
  boxSizing: 'border-box',
  padding: '10px 16px',
  minWidth: 72,
  textAlign: 'center',
  fontSize: 13,
  lineHeight: 1.35,
  color: '#0f172a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const FILL = '#f8fafc';
const STROKE = '#64748b';
const STROKE_SELECTED = '#2563eb';

/** Ile miejsca zabiera sam kształt — tekst musi zmieścić się w środku figury. */
function contentPadding(shape: NodeShape): CSSProperties {
  if (shape === 'rhombus' || shape === 'choice') return { padding: '18px 26px' };
  if (shape === 'cylinder') return { padding: '18px 16px 12px' };
  if (shape === 'hexagon' || shape === 'parallelogram' || shape === 'parallelogramAlt'
    || shape === 'trapezoid' || shape === 'trapezoidAlt' || shape === 'asymmetric') {
    return { padding: '10px 26px' };
  }
  return {};
}

export function DiagramNodeView({ id, data, selected, width, height }: NodeProps<Node<FlowNodeData>>) {
  const isBar = data.shape === 'fork' || data.shape === 'join';

  if (isBar) {
    return (
      <div style={{ background: '#0f172a', minWidth: 100, height: 10, borderRadius: 2, position: 'relative',
        ...(selected ? { outline: '2px solid #2563eb', outlineOffset: 3 } : {}) }}>
        <Handle type="target" position={Position.Top} />
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  return (
    <div style={{ ...BASE, ...contentPadding(data.shape) }}>
      <NodeShapeBackground
        shape={data.shape}
        width={width ?? 150}
        height={height ?? 52}
        fill={FILL}
        stroke={selected ? STROKE_SELECTED : STROKE}
        strokeWidth={selected ? 2 : 1.4}
      />
      <Handle type="target" position={Position.Top} />
      {/* Treść leży NAD kształtem — inaczej wypełnienie figury zasłaniałoby tekst. */}
      <span style={{ position: 'relative', zIndex: 1 }}>
        <InlineLabel
          value={data.label}
          placeholder={data.fallback}
          placeholderIsValue
          editable={data.editable !== false}
          onCommit={(next) => data.onRename?.(id, next)}
          inputStyle={{ textAlign: 'center' }}
        />
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Pseudostan diagramu stanów: `[*]` — wypełnione koło (start) lub obwódka (koniec). */
export function DiagramPseudoNodeView({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const isEnd = data.shape === 'end';
  return (
    <div
      title={isEnd ? 'Stan końcowy' : 'Stan początkowy'}
      style={{
        width: 22, height: 22, borderRadius: '50%',
        background: isEnd ? '#f8fafc' : '#0f172a',
        border: isEnd ? '3px double #0f172a' : '2px solid #0f172a',
        ...(selected ? { outline: '2px solid #2563eb', outlineOffset: 2 } : {}),
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/**
 * Podgraf / stan złożony — ramka z podpisem, w którą wchodzą węzły potomne.
 *
 * Ramka MUSI mieć własne uchwyty: w diagramie stanów przejścia prowadzą także
 * do stanu złożonego (`Boot --> Connecting`), a bez uchwytu React Flow odmawia
 * narysowania takiej krawędzi („Couldn't create edge for target handle") i
 * przejście znika albo ciągnie się przez cały diagram.
 */
export function DiagramGroupView({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      style={{
        width: '100%', height: '100%',
        border: '1px dashed #94a3b8', borderRadius: 8,
        background: 'rgba(148,163,184,0.08)',
        ...(selected ? { borderColor: '#2563eb' } : {}),
      }}
    >
      {/* Uchwyty w rogach — ramka bywa za ciasna albo za luźna po ręcznym
          poprzestawianiu stanów, a przeliczenie układu zresetowałoby pozycje. */}
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected} lineStyle={{ borderColor: '#2563eb' }} />
      <Handle type="target" position={Position.Top} />
      <div style={{ position: 'absolute', top: -10, left: 10, padding: '0 6px', fontSize: 11, background: '#f8fafc', color: '#475569', maxWidth: '80%' }}>
        <InlineLabel
          value={data.label}
          placeholder={data.fallback}
          placeholderIsValue
          editable={data.editable !== false}
          onCommit={(next) => data.onRename?.(id, next)}
        />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const diagramNodeTypes = {
  diagramNode: DiagramNodeView,
  diagramPseudo: DiagramPseudoNodeView,
  diagramGroup: DiagramGroupView,
  diagramClass: ClassNodeView,
  diagramEntity: EntityNodeView,
  diagramC4: C4NodeView,
};
