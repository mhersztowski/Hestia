/**
 * PacketEditor — edycja mapy bitów: rysunek plus lista pól.
 *
 * Rysunek pokazuje podział przestrzeni, ale nie da się w nim „przeciągnąć
 * pola" — jego miejsce wynika z zakresu bitów, a nie z pozycji. Zakres, nazwę i
 * kolejność zmienia się więc na liście, a rysunek służy do czytania i
 * wskazywania.
 *
 * Usterki podziału (dziura, nakładka) pokazujemy wprost: Mermaid odmawia
 * narysowania takiego pakietu, więc milczenie kończyłoby się pustym podglądem
 * bez wyjaśnienia.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DiagramDocument } from '../model/diagram';
import { validatePacket, fieldWidth } from '../model/packet';
import {
  addPacketField, updatePacketField, removePacketField, resizePacketField,
  movePacketField, setPacketTitle,
} from '../model/packetOps';
import { PacketView } from './PacketView';

export interface PacketEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  readOnly?: boolean;
  height?: number | string;
}

const btn: CSSProperties = {
  fontSize: 11, padding: '3px 8px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};

export function PacketEditor({ document: doc, onChange, readOnly, height = 520 }: PacketEditorProps) {
  const spec = doc.packet ?? { fields: [], bitsPerRow: 32, unknown: [] };
  const [selected, setSelected] = useState<number | undefined>();
  // Lista pól domyślnie schowana: mapa bitów jest czytelna sama z siebie, a
  // panel zabiera niemal połowę szerokości.
  const [panelOpen, setPanelOpen] = useState(false);
  const issues = validatePacket(spec);

  const emit = useCallback((next: DiagramDocument) => onChange(next), [onChange]);

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {/* Z zaznaczonym polem nowe ląduje tuż za nim — kolejność pól to
              kolejność bajtów, więc dodawanie w środku jest tu normalną
              operacją, nie wyjątkiem. */}
          <button
            type="button"
            style={btn}
            onClick={() => {
              emit(addPacketField(doc, 8, 'pole', selected));
              if (selected !== undefined) setSelected(selected + 1);
              setPanelOpen(true);
            }}
            title={selected === undefined
              ? 'Dodaj pole na końcu pakietu'
              : `Dodaj pole zaraz za „${spec.fields[selected]?.label ?? ''}"`}
          >
            + Pole
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {selected === undefined
              ? 'wstawiam na koniec — zaznacz pole, aby wstawić w środku'
              : `wstawiam za „${spec.fields[selected]?.label ?? ''}"`}
          </span>
          <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            tytuł
            <input
              style={{ ...input, width: 200 }}
              value={spec.title ?? ''}
              placeholder="np. UDP Packet"
              onChange={(e) => emit(setPacketTitle(doc, e.target.value))}
            />
          </label>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            bitów: {spec.fields.reduce((sum, f) => sum + Math.max(fieldWidth(f), 0), 0)}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            style={btn}
            onClick={() => setPanelOpen((open) => !open)}
            title={panelOpen ? 'Ukryj listę pól' : 'Pokaż listę pól'}
          >
            {panelOpen ? 'Ukryj pola ›' : '‹ Pola'}
          </button>
        </div>
      )}

      {/* Usterki podziału — Mermaid nie narysuje takiego pakietu, więc mówimy o
          tym wprost, zamiast zostawiać pusty podgląd. */}
      {issues.length > 0 && (
        <div style={{ padding: '6px 8px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 11, color: '#b91c1c' }}>
          {issues.map((issue, i) => <div key={i}>{issue.message}</div>)}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12 }}>
          {spec.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{spec.title}</div>}
          <PacketView
            spec={spec}
            selected={selected}
            onSelect={readOnly ? undefined : (index) => { setSelected(index); setPanelOpen(true); }}
          />
        </div>

        {!readOnly && panelOpen && (
          <div style={{ flex: '0 0 300px', maxWidth: '45%', minWidth: 0, borderLeft: '1px solid #e2e8f0', overflowY: 'auto', padding: 8 }}>
            {spec.fields.length === 0 ? (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Pakiet bez pól — dodaj pierwsze.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {spec.fields.map((field, index) => (
                  <div
                    key={index}
                    onClick={() => setSelected(index)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 52px 24px 24px 24px',
                      gap: 3,
                      alignItems: 'center',
                      padding: 3,
                      borderRadius: 4,
                      background: selected === index ? '#dbeafe' : 'transparent',
                    }}
                  >
                    <input
                      style={input}
                      value={field.label}
                      placeholder="nazwa pola"
                      onChange={(e) => emit(updatePacketField(doc, index, { label: e.target.value }))}
                    />
                    {/* Szerokość w bitach, nie zakres: zakres wynika z kolejności
                        i sam się przelicza, więc ręczne wpisywanie go tylko
                        tworzyłoby dziury. */}
                    <input
                      type="number"
                      min={1}
                      style={input}
                      value={fieldWidth(field)}
                      title="Szerokość w bitach"
                      onChange={(e) => {
                        const width = Number(e.target.value);
                        if (Number.isFinite(width)) emit(resizePacketField(doc, index, width));
                      }}
                    />
                    <button type="button" style={btn} title="W górę" disabled={index === 0}
                      onClick={() => emit(movePacketField(doc, index, index - 1))}>↑</button>
                    <button type="button" style={btn} title="W dół" disabled={index === spec.fields.length - 1}
                      onClick={() => emit(movePacketField(doc, index, index + 1))}>↓</button>
                    <button type="button" style={btn} title="Usuń pole"
                      onClick={() => { emit(removePacketField(doc, index)); setSelected(undefined); }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
              Zakresy bitów przeliczają się same z szerokości i kolejności.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
