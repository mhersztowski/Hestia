/**
 * PacketView — mapa bitów w SVG.
 *
 * Bez React Flow, z tego samego powodu co przy sekwencji: pozycja pola nie jest
 * swobodna, tylko wynika z zakresu bitów. Przeciąganie prostokąta „na bok" nie
 * miałoby znaczenia — o wszystkim decyduje zakres.
 */
import type { PacketSpec } from '../model/packet';
import { layoutPacket } from '../model/packetLayout';

export interface PacketViewProps {
  spec: PacketSpec;
  /** Indeks zaznaczonego pola. */
  selected?: number;
  onSelect?: (index: number) => void;
}

const STROKE = '#64748b';
const ACCENT = '#2563eb';
/** Naprzemienne wypełnienia, żeby sąsiednie pola dało się odróżnić bez liczenia. */
const FILLS = ['#f1f5f9', '#e2e8f0'];

export function PacketView({ spec, selected, onSelect }: PacketViewProps) {
  const layout = layoutPacket(spec);

  return (
    <svg
      width={layout.width + 1}
      height={layout.height + 1}
      viewBox={`0 0 ${layout.width + 1} ${layout.height + 1}`}
      style={{ display: 'block', fontSize: 11, fontFamily: 'inherit' }}
    >
      {/* Podziałka bitów nad każdym wierszem — bez niej trzeba liczyć kratki. */}
      {layout.ticks.map((tick, i) => (
        <text
          key={i}
          x={tick.x}
          y={tick.y}
          fontSize={9}
          fill="#94a3b8"
          textAnchor={tick.x === 0 ? 'start' : tick.x >= layout.width ? 'end' : 'middle'}
        >
          {tick.bit}
        </text>
      ))}

      {layout.segments.map((segment, i) => {
        const active = selected === segment.fieldIndex;
        return (
          <g
            key={i}
            onClick={() => onSelect?.(segment.fieldIndex)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <rect
              x={segment.x + 0.5}
              y={segment.y + 0.5}
              width={segment.width}
              height={segment.height}
              fill={active ? '#dbeafe' : FILLS[segment.fieldIndex % FILLS.length]}
              stroke={active ? ACCENT : STROKE}
              strokeWidth={active ? 2 : 1}
            />
            {/* Etykieta tylko na pierwszym kawałku: powtórzona w każdym wierszu
                sugerowałaby, że to osobne pola. */}
            {segment.first && (
              <text
                x={segment.x + segment.width / 2}
                y={segment.y + segment.height / 2 + 4}
                textAnchor="middle"
                fill="#0f172a"
              >
                {segment.label}
              </text>
            )}
            {/* Znak ciągłości na granicy wiersza. */}
            {segment.continues && (
              <text x={segment.x + segment.width - 6} y={segment.y + segment.height - 5} fontSize={10} fill="#94a3b8">›</text>
            )}
            <text x={segment.x + 3} y={segment.y + 11} fontSize={8} fill="#94a3b8">
              {segment.fromBit === segment.toBit ? segment.fromBit : `${segment.fromBit}–${segment.toBit}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
