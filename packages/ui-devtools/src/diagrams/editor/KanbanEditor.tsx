/**
 * KanbanEditor — tablica kanban: kolumny obok siebie, karty w pionie.
 *
 * Ani React Flow, ani SVG: tablica to zwykły układ pudełek, a karta zawiera
 * tekst, który musi się zawijać. HTML robi to sam, a w SVG trzeba by liczyć
 * łamanie wierszy ręcznie.
 *
 * Karty przenosi się między kolumnami przyciskami, nie przeciąganiem —
 * przeciąganie wymagałoby własnej obsługi wskaźnika, a strzałki działają też
 * z klawiatury i na dotyku.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DiagramDocument } from '../model/diagram';
import { KANBAN_PRIORITIES, cardCount, type KanbanCard, type KanbanPriority } from '../model/kanban';
import {
  addColumn, updateColumn, removeColumn, moveColumn,
  addCard, updateCard, removeCard, moveCard, moveCardToColumn,
} from '../model/kanbanOps';

export interface KanbanEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  readOnly?: boolean;
  height?: number | string;
}

const btn: CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};

/** Kolor paska priorytetu — ta sama skala co w Mermaidzie. */
const PRIORITY_COLOR: Record<KanbanPriority, string> = {
  'Very High': '#dc2626',
  High: '#f97316',
  Low: '#0ea5e9',
  'Very Low': '#94a3b8',
};

export function KanbanEditor({ document: doc, onChange, readOnly, height = 520 }: KanbanEditorProps) {
  const board = doc.kanban ?? { columns: [], unknown: [] };
  const [selected, setSelected] = useState<{ column: number; card?: number } | undefined>();
  const emit = useCallback((next: DiagramDocument) => onChange(next), [onChange]);

  const zaznaczonaKarta: KanbanCard | undefined = selected?.card !== undefined
    ? board.columns[selected.column]?.cards[selected.card]
    : undefined;

  /** Przenosi zaznaczoną kartę i zabiera zaznaczenie ze sobą. */
  const moveToColumn = (target: number) => {
    if (selected?.card === undefined) return;
    // Indeks w nowej kolumnie to jej dotychczasowa długość — `moveCardToColumn`
    // dokłada kartę na koniec.
    const index = board.columns[target].cards.length;
    emit(moveCardToColumn(doc, selected.column, selected.card, target));
    setSelected({ column: target, card: index });
  };

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button type="button" style={btn} onClick={() => emit(addColumn(doc, 'Nowa kolumna', selected?.column))}>
            + Kolumna
          </button>
          <button
            type="button"
            style={btn}
            disabled={selected === undefined}
            onClick={() => selected && emit(addCard(doc, selected.column, 'Nowe zadanie', selected.card))}
            title={selected === undefined ? 'Zaznacz kolumnę albo kartę' : 'Dodaj kartę w zaznaczonej kolumnie'}
          >
            + Karta
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            kolumn: {board.columns.length} · kart: {cardCount(board)}
          </span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8, padding: 8, overflowX: 'auto' }}>
        {board.columns.map((column, columnIndex) => {
          const aktywnaKolumna = selected?.column === columnIndex && selected.card === undefined;
          return (
            <div
              key={columnIndex}
              onClick={() => setSelected({ column: columnIndex })}
              style={{
                flex: '0 0 220px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 6,
                borderRadius: 6,
                background: '#f1f5f9',
                border: `1px solid ${aktywnaKolumna ? '#2563eb' : '#e2e8f0'}`,
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {readOnly ? (
                  <strong style={{ fontSize: 12, flex: 1 }}>{column.label}</strong>
                ) : (
                  <input
                    style={{ ...input, fontWeight: 600, background: 'transparent', border: 'none' }}
                    value={column.label}
                    onChange={(e) => emit(updateColumn(doc, columnIndex, { label: e.target.value }))}
                  />
                )}
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{column.cards.length}</span>
              </div>

              {!readOnly && (
                <div style={{ display: 'flex', gap: 3 }}>
                  <button type="button" style={btn} title="Kolumna w lewo" disabled={columnIndex === 0}
                    onClick={() => emit(moveColumn(doc, columnIndex, columnIndex - 1))}>←</button>
                  <button type="button" style={btn} title="Kolumna w prawo" disabled={columnIndex === board.columns.length - 1}
                    onClick={() => emit(moveColumn(doc, columnIndex, columnIndex + 1))}>→</button>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={btn} title="Usuń kolumnę razem z kartami"
                    onClick={() => { emit(removeColumn(doc, columnIndex)); setSelected(undefined); }}>×</button>
                </div>
              )}

              {column.cards.map((card, cardIndex) => {
                const aktywna = selected?.column === columnIndex && selected.card === cardIndex;
                return (
                  <div
                    key={cardIndex}
                    onClick={(e) => { e.stopPropagation(); setSelected({ column: columnIndex, card: cardIndex }); }}
                    style={{
                      background: '#fff',
                      // Krawędzie rozpisane co do boku: lewa niesie priorytet,
                      // a skrót `border` obok `borderLeft` gubi się przy
                      // ponownym renderze (React ostrzega o mieszaniu obu).
                      borderTop: `1px solid ${aktywna ? '#2563eb' : '#e2e8f0'}`,
                      borderRight: `1px solid ${aktywna ? '#2563eb' : '#e2e8f0'}`,
                      borderBottom: `1px solid ${aktywna ? '#2563eb' : '#e2e8f0'}`,
                      borderLeft: card.priority
                        ? `4px solid ${PRIORITY_COLOR[card.priority]}`
                        : `1px solid ${aktywna ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: 4,
                      padding: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ color: '#0f172a' }}>{card.label}</div>
                    {/* Metadane pod treścią, drobnym drukiem — na karcie liczy
                        się przede wszystkim, co jest do zrobienia. */}
                    {(card.ticket || card.assigned) && (
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, display: 'flex', gap: 6 }}>
                        {card.ticket && <span>{card.ticket}</span>}
                        {card.assigned && <span>@{card.assigned}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {board.columns.length === 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8', padding: 8 }}>
            Tablica bez kolumn — dodaj pierwszą.
          </div>
        )}
      </div>

      {/* Szczegóły zaznaczonej karty. Pasek pod tablicą, a nie nakładka, bo
          tablica przewija się w poziomie i nakładka zasłaniałaby kolumny. */}
      {!readOnly && zaznaczonaKarta && selected?.card !== undefined && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: '#f8fafc' }}>
          <label style={{ fontSize: 10, color: '#94a3b8', flex: '1 1 180px' }}>
            treść
            <input
              style={input}
              value={zaznaczonaKarta.label}
              onChange={(e) => emit(updateCard(doc, selected.column, selected.card!, { label: e.target.value }))}
            />
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8', flex: '0 1 120px' }}>
            zgłoszenie
            <input
              style={input}
              value={zaznaczonaKarta.ticket ?? ''}
              placeholder="np. MC-1"
              onChange={(e) => emit(updateCard(doc, selected.column, selected.card!, { ticket: e.target.value }))}
            />
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8', flex: '0 1 120px' }}>
            przypisane
            <input
              style={input}
              value={zaznaczonaKarta.assigned ?? ''}
              onChange={(e) => emit(updateCard(doc, selected.column, selected.card!, { assigned: e.target.value }))}
            />
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8', flex: '0 1 120px' }}>
            priorytet
            <select
              style={input}
              value={zaznaczonaKarta.priority ?? ''}
              onChange={(e) => emit(updateCard(doc, selected.column, selected.card!, {
                priority: (e.target.value || undefined) as KanbanPriority | undefined,
              }))}
            >
              <option value="">— brak —</option>
              {KANBAN_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 3 }}>
            {/* Karta trafia na koniec docelowej kolumny — zaznaczenie idzie
                za nią, żeby panel został otwarty na tej samej karcie i dało się
                ją przesuwać dalej bez ponownego klikania. */}
            <button type="button" style={btn} title="Do kolumny w lewo" disabled={selected.column === 0}
              onClick={() => moveToColumn(selected.column - 1)}>← kolumna</button>
            <button type="button" style={btn} title="Do kolumny w prawo" disabled={selected.column === board.columns.length - 1}
              onClick={() => moveToColumn(selected.column + 1)}>kolumna →</button>
            <button type="button" style={btn} title="Wyżej" disabled={selected.card === 0}
              onClick={() => {
                emit(moveCard(doc, selected.column, selected.card!, selected.card! - 1));
                setSelected({ column: selected.column, card: selected.card! - 1 });
              }}>↑</button>
            <button type="button" style={btn} title="Niżej"
              disabled={selected.card === board.columns[selected.column].cards.length - 1}
              onClick={() => {
                emit(moveCard(doc, selected.column, selected.card!, selected.card! + 1));
                setSelected({ column: selected.column, card: selected.card! + 1 });
              }}>↓</button>
            <button type="button" style={btn} title="Usuń kartę"
              onClick={() => { emit(removeCard(doc, selected.column, selected.card!)); setSelected({ column: selected.column }); }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
