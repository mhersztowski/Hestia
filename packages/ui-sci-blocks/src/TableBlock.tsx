/**
 * TableBlock — tablica z podpisem i identyfikatorem.
 *
 * Zwykły markdown zgubiłby podpis (stałby się osobnym akapitem) i nie dałby
 * identyfikatora, a w tomie jest 27 tablic, do których tekst odsyła po numerze.
 */
import type { CSSProperties } from 'react';
import { parseTableBlock } from '@hestia/core-sci';
import { inline } from './inlineText';

export interface TableBlockProps {
  id: string;
  code: string;
  compact?: boolean;
}

export function TableBlock({ id, code, compact }: TableBlockProps) {
  const tablica = parseTableBlock(id, code);
  const [naglowek, ...wiersze] = tablica.rows;

  return (
    <figure
      id={compact ? undefined : `ref-${id}`}
      style={{ margin: compact ? 0 : '4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {tablica.caption && (
        <figcaption style={compact ? { fontSize: 11, color: '#64748b' } : podpis}>
          {inline(tablica.caption)}
        </figcaption>
      )}
      {/* Szeroka tablica przewija się we własnym pudełku — strona nigdy nie
          przewija się w poziomie. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: compact ? 11 : 13 }}>
          {/* Komórka idzie przez ten sam renderer, co akapit i podpis:
              podręcznik podpisuje kolumny symbolami (`θ`, `sinθ`), więc bez
              tego w nagłówku zostawały dolary. */}
          {naglowek && (
            <thead>
              <tr>
                {naglowek.map((k, i) => (
                  <th key={i} style={komorka}>
                    {inline(k)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {wiersze.map((w, i) => (
              <tr key={i}>
                {w.map((k, j) => (
                  <td key={j} style={komorka}>
                    {inline(k)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tablica.issues.map((i) => (
        <div key={i.message} style={{ fontSize: 11, color: '#b91c1c' }}>
          {i.message}
        </div>
      ))}
    </figure>
  );
}

const podpis: CSSProperties = {
  fontSize: 13,
  color: '#475569',
  paddingLeft: 12,
  borderLeft: '3px solid #cbd5e1',
};
const komorka: CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '4px 8px',
  textAlign: 'left',
};
