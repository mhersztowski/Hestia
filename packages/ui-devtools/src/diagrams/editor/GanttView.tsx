/**
 * GanttView — rysunek harmonogramu.
 *
 * SVG, nie React Flow: to nie graf, tylko dwie kolumny (nazwy i pas czasu),
 * w których wszystko wynika ze skali osi. Węzły i krawędzie nic by tu nie
 * wniosły, a przeciąganie po siatce wręcz przeszkadza — pasek ma stać tam,
 * gdzie każe mu data.
 */
import type { GanttLayout } from '../model/ganttLayout';

export interface GanttViewProps {
  layout: GanttLayout;
  /** Zaznaczone zadanie — po sekcji i pozycji w niej. */
  selected?: { section: number; task: number };
  onSelect?: (where: { section: number; task: number }) => void;
  onSelectSection?: (section: number) => void;
}

/** Barwa paska wynika ze znaczników; kolejność ważności jak w Mermaidzie. */
function barColors(tags: string[]): { fill: string; stroke: string } {
  if (tags.includes('crit')) return { fill: '#fecaca', stroke: '#dc2626' };
  if (tags.includes('active')) return { fill: '#bfdbfe', stroke: '#2563eb' };
  if (tags.includes('done')) return { fill: '#e2e8f0', stroke: '#94a3b8' };
  return { fill: '#dbeafe', stroke: '#60a5fa' };
}

export function GanttView({ layout, selected, onSelect, onSelectSection }: GanttViewProps) {
  const { labelWidth, chartWidth, headerHeight, width, height } = layout;

  return (
    <svg width={width} height={height} style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}>
      {/* Pas czasu ma własne tło — od razu widać, gdzie kończą się nazwy. */}
      <rect x={labelWidth} y={0} width={chartWidth} height={height} fill="#f8fafc" />

      {layout.ticks.map((tick, i) => (
        <g key={`t${i}`}>
          <line
            x1={labelWidth + tick.x}
            y1={headerHeight - 6}
            x2={labelWidth + tick.x}
            y2={height}
            stroke={tick.major ? '#cbd5e1' : '#e2e8f0'}
            strokeWidth={tick.major ? 1 : 0.7}
          />
          <text
            x={labelWidth + tick.x}
            y={headerHeight - 10}
            fontSize={9}
            fill="#64748b"
            textAnchor="middle"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {layout.rows.map((row, i) => {
        if (row.kind === 'section') {
          return (
            <g key={`r${i}`} onClick={() => onSelectSection?.(row.sectionIndex)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={row.y} width={width} height={row.height} fill="#eef2f7" />
              <text x={8} y={row.y + row.height / 2 + 3.5} fontSize={11} fontWeight={600} fill="#334155">
                {row.label}
              </text>
            </g>
          );
        }

        const active = selected?.section === row.sectionIndex && selected.task === row.taskIndex;
        return (
          <g
            key={`r${i}`}
            onClick={() => onSelect?.({ section: row.sectionIndex, task: row.taskIndex! })}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={0}
              y={row.y}
              width={width}
              height={row.height}
              fill={active ? '#dbeafe' : 'transparent'}
              opacity={active ? 0.6 : 1}
            />
            <text x={8} y={row.y + row.height / 2 + 4} fontSize={11} fill={row.entry?.issue ? '#b91c1c' : '#0f172a'}>
              {row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label}
            </text>
            {/* Zadanie bez miejsca na osi mówi wprost, czego brakuje. */}
            {row.entry?.issue && (
              <text x={labelWidth + 6} y={row.y + row.height / 2 + 4} fontSize={9} fill="#b91c1c">
                {row.entry.issue}
              </text>
            )}
          </g>
        );
      })}

      {layout.bars.map((bar, i) => {
        const colors = barColors(bar.tags);
        const active = selected?.section === bar.sectionIndex && selected.task === bar.taskIndex;
        const x = labelWidth + bar.x;

        if (bar.milestone) {
          // Kamień milowy nie ma długości — romb w punkcie, a nie pasek o
          // szerokości zaokrąglonej do minimum.
          const cy = bar.y + bar.height / 2;
          const r = bar.height / 2;
          return (
            <polygon
              key={`b${i}`}
              points={`${x},${cy - r} ${x + r},${cy} ${x},${cy + r} ${x - r},${cy}`}
              fill={active ? '#1d4ed8' : '#334155'}
              stroke={active ? '#1d4ed8' : '#0f172a'}
            />
          );
        }

        return (
          <g key={`b${i}`}>
            <rect
              x={x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={3}
              fill={colors.fill}
              stroke={active ? '#1d4ed8' : colors.stroke}
              strokeWidth={active ? 2 : 1}
              // Wykonane zadanie rysujemy przerywaną obwódką — kolor sam nie
              // wystarcza, gdy ktoś patrzy na wydruk albo ma słabszy kontrast.
              strokeDasharray={bar.tags.includes('done') ? '3 2' : undefined}
            />
          </g>
        );
      })}

      {layout.todayX !== undefined && (
        <g>
          <line
            x1={labelWidth + layout.todayX}
            y1={headerHeight - 6}
            x2={labelWidth + layout.todayX}
            y2={height}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={labelWidth + layout.todayX + 3} y={headerHeight - 10} fontSize={9} fill="#ef4444">
            dziś
          </text>
        </g>
      )}

      <line x1={labelWidth} y1={0} x2={labelWidth} y2={height} stroke="#cbd5e1" />
      <line x1={0} y1={headerHeight - 6} x2={width} y2={headerHeight - 6} stroke="#cbd5e1" />
    </svg>
  );
}
