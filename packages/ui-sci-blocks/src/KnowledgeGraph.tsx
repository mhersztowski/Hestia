/**
 * KnowledgeGraph — droga nauki jako rysunek.
 *
 * SVG, nie React Flow, mimo że raport wskazuje ReactFlow („już masz"). Ten graf
 * jest **czytany, nie edytowany**: kilkanaście węzłów ułożonych warstwami przez
 * rdzeń, bez przeciągania, bez portów, bez zapisu układu. React Flow wniósłby
 * do pakietu, który dziś zależy tylko od Reacta, ciężką zależność i drugi model
 * układu obok tego z `layoutKnowledgeGraph`. Moment na niego przyjdzie, gdyby
 * autor miał przestawiać graf ręcznie.
 *
 * Warstwa poziomo, kolejność pionowo: strzałka zawsze biegnie w prawo, więc
 * kierunek nauki widać bez czytania grotów.
 */
import { odmiana, type GraphLayout } from '@hestia/core-sci';

export interface KnowledgeGraphProps {
  layout: GraphLayout;
  /** Dokument podświetlony — np. obecnie czytany. */
  active?: string;
  onOpen?: (path: string) => void;
  width?: number;
}

const NODE_W = 168;
const NODE_H = 52;
const GAP_X = 60;
const GAP_Y = 18;

export function KnowledgeGraph({ layout, active, onOpen, width }: KnowledgeGraphProps) {
  const perLevel = new Map<number, number>();
  for (const node of layout.nodes) perLevel.set(node.level, (perLevel.get(node.level) ?? 0) + 1);
  const maxInLevel = Math.max(...perLevel.values(), 1);

  const totalWidth = layout.levels * NODE_W + (layout.levels - 1) * GAP_X + 24;
  const totalHeight = maxInLevel * (NODE_H + GAP_Y) + 24;

  const position = (node: GraphLayout['nodes'][number]) => ({
    x: 12 + node.level * (NODE_W + GAP_X),
    y: 12 + node.index * (NODE_H + GAP_Y),
  });
  const byPath = new Map(layout.nodes.map((node) => [node.path, node] as const));

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      width={width ?? totalWidth}
      style={{ display: 'block', maxWidth: '100%', fontFamily: 'system-ui, sans-serif' }}
    >
      <defs>
        <marker
          id="sci-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
        </marker>
      </defs>

      {layout.edges.map((edge, index) => {
        const from = byPath.get(edge.from);
        const to = byPath.get(edge.to);
        if (!from || !to) return null;

        const a = position(from);
        const b = position(to);
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const mid = (x1 + x2) / 2;

        return (
          <path
            key={index}
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={edge.kind === 'requires' ? '#94a3b8' : '#c4b5fd'}
            // Wywód wzoru rysujemy przerywaną: to powiązanie treści, nie
            // wymaganie wstępne, i czytelnik nie musi go przechodzić.
            strokeDasharray={edge.kind === 'derivedFrom' ? '4 3' : undefined}
            strokeWidth={1.3}
            markerEnd="url(#sci-arrow)"
          />
        );
      })}

      {layout.nodes.map((node) => {
        const { x, y } = position(node);
        const wybrany = node.path === active;
        return (
          <g
            key={node.path}
            onClick={() => onOpen?.(node.path)}
            style={{ cursor: onOpen ? 'pointer' : 'default' }}
          >
            <rect
              x={x}
              y={y}
              width={NODE_W}
              height={NODE_H}
              rx={6}
              fill={wybrany ? '#dbeafe' : '#fff'}
              stroke={wybrany ? '#2563eb' : '#cbd5e1'}
              strokeWidth={wybrany ? 2 : 1}
            />
            <text x={x + 10} y={y + 20} fontSize={11.5} fontWeight={600} fill="#0f172a">
              {node.title.length > 24 ? `${node.title.slice(0, 23)}…` : node.title}
            </text>
            <text x={x + 10} y={y + 35} fontSize={9.5} fill="#94a3b8">
              {node.tags.slice(0, 2).join(' · ')}
            </text>
            <text x={x + 10} y={y + 46} fontSize={9} fill="#64748b">
              {node.formulaCount > 0 &&
                `${node.formulaCount} ${odmiana(node.formulaCount, ['wzór', 'wzory', 'wzorów'])}`}
              {node.scriptCount > 0 && `${node.formulaCount > 0 ? ' · ' : ''}skrypt`}
              {node.exerciseCount > 0 && ` · ${node.exerciseCount} zad.`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
