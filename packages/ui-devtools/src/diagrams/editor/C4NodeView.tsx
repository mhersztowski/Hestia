/**
 * C4NodeView — element modelu C4: rodzaj, nazwa, technologia, opis.
 *
 * Osobny widok, bo element C4 ma **cztery warstwy tekstu** o różnej wadze i
 * pomylenie ich odbiera diagramowi sens: „[Java, Spring]" pod nazwą znaczy co
 * innego niż ten sam napis jako opis. Zwykły węzeł z jedną etykietą by je
 * skleił.
 *
 * Barwa niesie zewnętrzność, kształt — wariant. Element spoza naszej
 * odpowiedzialności jest szary, jak w oryginalnej notacji C4; baza i kolejka
 * dostają własny znak, bo w druku odcień bywa nie do odróżnienia.
 */
import type { NodeProps, Node } from '@xyflow/react';
import { NodeAnchors } from './nodeAnchors';
import type { FlowNodeData } from './flowBridge';
import { InlineLabel } from './InlineLabel';
import type { C4NodeInfo } from '../model/c4';

/** Barwy elementu: wewnętrzny niebieski, zewnętrzny szary — jak w notacji C4. */
function colors(info: C4NodeInfo, selected: boolean) {
  if (info.external) {
    return { fill: '#f1f5f9', stroke: selected ? '#2563eb' : '#94a3b8', text: '#334155' };
  }
  if (info.kind === 'person') {
    return { fill: '#dbeafe', stroke: selected ? '#2563eb' : '#3b82f6', text: '#0f172a' };
  }
  return { fill: '#eff6ff', stroke: selected ? '#2563eb' : '#60a5fa', text: '#0f172a' };
}

/** Znak wariantu — czytelny bez legendy i bez koloru. */
const VARIANT_MARK: Record<C4NodeInfo['variant'], string> = {
  plain: '',
  db: '🗄',
  queue: '≡',
};

const KIND_MARK: Record<C4NodeInfo['kind'], string> = {
  person: '👤',
  system: '',
  container: '',
  component: '',
  node: '🖥',
};

export function C4NodeView({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  const info: C4NodeInfo = data.c4 ?? { kind: 'system', variant: 'plain', external: false };
  const look = colors(info, !!selected);
  const mark = VARIANT_MARK[info.variant] || KIND_MARK[info.kind];

  return (
    <div
      style={{
        flex: 1,
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: '6px 8px',
        background: look.fill,
        border: `${selected ? 2 : 1.4}px solid ${look.stroke}`,
        // Osoba ma zaokrąglony górny brzeg — w notacji C4 to sylwetka, nie karta.
        borderRadius: info.kind === 'person' ? '14px 14px 4px 4px' : 4,
        fontSize: 12,
        lineHeight: 1.3,
        color: look.text,
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      <NodeAnchors />

      {mark && <div style={{ fontSize: 11, lineHeight: 1 }}>{mark}</div>}

      <div style={{ fontWeight: 600 }}>
        <InlineLabel
          value={data.label}
          placeholder={data.fallback}
          placeholderIsValue
          editable={data.editable !== false}
          onCommit={(next) => data.onRename?.(id, next)}
          inputStyle={{ textAlign: 'center', fontWeight: 600 }}
        />
      </div>

      {/* Technologia w nawiasach kwadratowych — tak zapisuje ją notacja C4. */}
      {info.technology && (
        <div style={{ fontSize: 10, color: '#475569' }}>[{info.technology}]</div>
      )}
      {info.external && !info.technology && (
        <div style={{ fontSize: 9, color: '#94a3b8' }}>zewnętrzny</div>
      )}
      {info.description && (
        <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'normal' }}>{info.description}</div>
      )}
    </div>
  );
}
