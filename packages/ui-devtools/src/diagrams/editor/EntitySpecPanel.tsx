/**
 * EntitySpecPanel — edycja atrybutów encji.
 *
 * Atrybut niesie cztery niezależne rzeczy: typ, nazwę, role kluczy i komentarz.
 * Jedno pole tekstowe by je skleiło, a role kluczy nie są wyborem z listy —
 * `PK, FK` to poprawna kombinacja — więc każda ma własny przełącznik.
 *
 * Panel leży na nakładce nad płótnem, nie w pasku narzędzi: pasek zmieniałby
 * wysokość przy zaznaczeniu, a to przelicza kadr i wygląda jak przeskok widoku.
 */
import type { CSSProperties } from 'react';
import type { DiagramNode, EntityAttribute, EntityKey } from '../model/diagram';

export interface EntitySpecPanelProps {
  node: DiagramNode;
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<Omit<EntityAttribute, 'raw'>>) => void;
  onToggleKey: (index: number, key: EntityKey) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onClose: () => void;
}

const KEYS: EntityKey[] = ['PK', 'FK', 'UK'];

const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%',
  boxSizing: 'border-box',
};
const iconBtn: CSSProperties = { ...input, cursor: 'pointer', padding: '2px 5px', lineHeight: 1.1, width: 'auto' };
const keyBtn = (active: boolean): CSSProperties => ({
  ...iconBtn,
  padding: '2px 4px',
  fontSize: 10,
  fontWeight: active ? 700 : 400,
  color: active ? '#1e40af' : '#94a3b8',
  background: active ? '#dbeafe' : '#fff',
  borderColor: active ? '#2563eb' : '#cbd5e1',
});

function AttributeRow({ attribute, index, count, onUpdate, onToggleKey, onRemove, onMove }: {
  attribute: EntityAttribute;
  index: number;
  count: number;
  onUpdate: EntitySpecPanelProps['onUpdate'];
  onToggleKey: EntitySpecPanelProps['onToggleKey'];
  onRemove: EntitySpecPanelProps['onRemove'];
  onMove: EntitySpecPanelProps['onMove'];
}) {
  // Rozbiór się nie powiódł — nie rozkładamy takiego zapisu na kontrolki, bo
  // pierwsza zmiana nadpisałaby coś, czego nie umiemy odtworzyć.
  if (!attribute.name) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code style={{ flex: 1, fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {attribute.raw}
        </code>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>zapis spoza modelu</span>
        <button type="button" style={iconBtn} title="Usuń atrybut" onClick={() => onRemove(index)}>×</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(50px, 0.8fr) minmax(60px, 1fr) auto auto auto minmax(60px, 1fr) 24px 24px 24px', gap: 3, alignItems: 'center' }}>
      <input
        style={input}
        value={attribute.type ?? ''}
        placeholder="typ"
        title="Typ atrybutu"
        onChange={(e) => onUpdate(index, { type: e.target.value })}
      />
      <input
        style={input}
        value={attribute.name}
        placeholder="nazwa"
        onChange={(e) => onUpdate(index, { name: e.target.value })}
      />
      {/* Role kluczy działają jak przełączniki, nie jak wybór z listy —
          atrybut bywa naraz kluczem głównym i obcym. */}
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          style={keyBtn(!!attribute.keys?.includes(key))}
          title={key === 'PK' ? 'Klucz główny' : key === 'FK' ? 'Klucz obcy' : 'Klucz unikalny'}
          onClick={() => onToggleKey(index, key)}
        >
          {key}
        </button>
      ))}
      <input
        style={input}
        value={attribute.comment ?? ''}
        placeholder="komentarz"
        title="Opis pokazywany obok atrybutu"
        onChange={(e) => onUpdate(index, { comment: e.target.value })}
      />
      <button type="button" style={iconBtn} title="W górę" disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</button>
      <button type="button" style={iconBtn} title="W dół" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>↓</button>
      <button type="button" style={iconBtn} title="Usuń atrybut" onClick={() => onRemove(index)}>×</button>
    </div>
  );
}

export function EntitySpecPanel({
  node, onAdd, onUpdate, onToggleKey, onRemove, onMove, onClose,
}: EntitySpecPanelProps) {
  const attributes = node.attributes ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12 }}>{node.label || node.id}</strong>
        <button type="button" style={iconBtn} onClick={onAdd}>+ atrybut</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={iconBtn} title="Zamknij panel" onClick={onClose}>×</button>
      </div>

      {attributes.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Encja bez atrybutów — dodaj pierwszy.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 210, overflowY: 'auto' }}>
          {attributes.map((attribute, i) => (
            <AttributeRow
              key={i}
              attribute={attribute}
              index={i}
              count={attributes.length}
              onUpdate={onUpdate}
              onToggleKey={onToggleKey}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
