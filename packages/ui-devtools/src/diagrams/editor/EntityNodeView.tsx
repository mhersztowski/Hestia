/**
 * EntityNodeView — encja diagramu ER: nagłówek i tabela atrybutów.
 *
 * Osobno od widoku klasy, bo atrybut niesie co innego: nie widoczność i
 * parametry, tylko typ, role kluczy i komentarz. Kolumny są stałe (typ,
 * nazwa, klucz), żeby dało się czytać w pionie — przy zlepku „string numer PK"
 * wzrok musiałby za każdym razem szukać granicy pól.
 */
import type { NodeProps, Node } from '@xyflow/react';
import { NodeAnchors } from './nodeAnchors';
import type { EntityAttribute } from '../model/diagram';
import type { FlowNodeData } from './flowBridge';
import { InlineLabel } from './InlineLabel';

const STROKE = '#64748b';
const STROKE_SELECTED = '#2563eb';

function AttributeRow({ attribute }: { attribute: EntityAttribute }) {
  // Rozbiór się nie powiódł — pokazujemy zapis źródłowy, zamiast zgadywać.
  if (!attribute.name) {
    return <div style={{ padding: '1px 8px', gridColumn: '1 / -1', color: '#64748b' }}>{attribute.raw}</div>;
  }
  return (
    <>
      <div style={{ padding: '1px 8px', color: '#64748b' }}>{attribute.type}</div>
      <div style={{ padding: '1px 4px', fontWeight: attribute.keys?.includes('PK') ? 600 : 400 }}>
        {attribute.name}
      </div>
      <div style={{ padding: '1px 6px', color: '#2563eb', fontSize: 10, whiteSpace: 'nowrap' }}>
        {attribute.keys?.join(', ')}
      </div>
      {/* Komentarz jest osobną kolumną, tak jak w Mermaidzie: opis pola bywa
          dłuższy niż jego nazwa i doklejony do niej robiłby się nieczytelny. */}
      <div style={{ padding: '1px 8px', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
        {attribute.comment}
      </div>
    </>
  );
}

export function EntityNodeView({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  const attributes = data.attributes ?? [];
  const stroke = selected ? STROKE_SELECTED : STROKE;

  return (
    <div
      style={{
        flex: 1,
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        border: `${selected ? 2 : 1.4}px solid ${stroke}`,
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.35,
        color: '#0f172a',
        overflow: 'hidden',
      }}
    >
      <NodeAnchors />

      <div style={{
        padding: '4px 8px', textAlign: 'center', fontWeight: 600,
        background: '#e2e8f0',
        borderBottom: attributes.length ? `1px solid ${stroke}` : undefined,
      }}>
        <InlineLabel
          value={data.label}
          placeholder={data.fallback}
          placeholderIsValue
          editable={data.editable !== false}
          onCommit={(next) => data.onRename?.(id, next)}
          inputStyle={{ textAlign: 'center', fontWeight: 600 }}
        />
      </div>

      {attributes.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto auto 1fr',
          alignItems: 'center',
          padding: '3px 0',
        }}>
          {attributes.map((attribute, i) => <AttributeRow key={i} attribute={attribute} />)}
        </div>
      )}

    </div>
  );
}
