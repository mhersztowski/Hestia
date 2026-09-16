/**
 * PlotRowList — lewa kolumna kalkulatora: lista wyrażeń.
 *
 * Układ wzorowany na Desmosie i to nie jest ozdoba: numer wiersza, kolorowa
 * ikonka rodzaju i pole wzoru w jednym pasku dają się przeczytać jednym
 * spojrzeniem — widać, ile jest krzywych, która jest która i co dokładnie jest
 * rysowane.
 *
 * ## Dwa stany wiersza
 *
 * Poza edycją wzór jest **złożony** (KaTeX) — tak, jak wygląda w podręczniku.
 * Po kliknięciu wchodzi edytor matematyki (`MathField`, MathLive), w którym
 * kursor chodzi po strukturze wzoru, a na dotyku pojawia się klawiatura
 * matematyczna. Ta sama para komponentów obsługuje wzory w wykładach, więc
 * kalkulator nie wprowadza trzeciego sposobu pisania matematyki.
 *
 * Gdyby edytor się nie wczytał, wiersz pokazuje zwykłe pole tekstowe z LaTeX-em.
 * Bez tego awaria jednego modułu zamieniałaby kalkulator w obrazek.
 */

import { useEffect, useRef, useState } from 'react';
import type { PlotDocument, PlotRow } from '@hestia/core-sci';
import { Math as MathView } from './Math';
import { MathField } from './MathField';

export interface PlotRowListProps {
  document: PlotDocument;
  /** Uwagi z liczenia, wiersz → lista komunikatów. */
  issuesByRow?: Map<string, string[]>;
  onChangeRow: (id: string, latex: string) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onToggleHidden: (id: string) => void;
  /** Zmiana wartości suwaka; brak = suwaki nieaktywne. */
  onParameterChange?: (name: string, value: number) => void;
  parameters?: Record<string, number>;
  /** Nazwy parametrów, które właśnie się animują. */
  animating?: Set<string>;
  onToggleAnimation?: (name: string) => void;
  /** Zmiana zakresu i kroku suwaka — należy do dokumentu, więc idzie wyżej. */
  onSliderSpecChange?: (id: string, spec: { min: number; max: number; step: number }) => void;
}

/** Znak rodzaju wiersza w kolorowej ikonce — jak w Desmosie. */
function rowGlyph(row: PlotRow): string {
  switch (row.parsed.kind) {
    case 'explicit-y':
    case 'explicit-x':
    case 'implicit':
      return '∿';
    case 'inequality':
      return '◪';
    case 'point':
      return '•';
    case 'constant':
      return '=';
    case 'function':
      return 'ƒ';
    case 'value':
      return '#';
    default:
      return '';
  }
}

function RowEditor({
  latex,
  onCommit,
  onCancel,
}: {
  latex: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [zapasowe, setZapasowe] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * Wykrycie, że edytor matematyki nie wstał.
   *
   * `MathField` sam zgłasza błąd tekstem, ale w kalkulatorze nie ma trybu
   * źródłowego, do którego mógłby odesłać — bez pola zapasowego wiersza nie
   * dałoby się w ogóle wypełnić.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const host = boxRef.current;
      if (host && host.querySelector('math-field') === null) setZapasowe(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (zapasowe) {
    return (
      <input
        autoFocus
        defaultValue={latex}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%',
          font: 'inherit',
          padding: 4,
          border: '1px solid #cbd5e1',
          borderRadius: 4,
        }}
      />
    );
  }

  return (
    <div ref={boxRef}>
      <MathField latex={latex} onCommit={onCommit} onCancel={onCancel} />
    </div>
  );
}

function Slider({
  name,
  value,
  spec,
  playing,
  onChange,
  onTogglePlay,
  onSpecChange,
}: {
  name: string;
  value: number;
  spec: { min: number; max: number; step: number };
  playing: boolean;
  onChange: (v: number) => void;
  onTogglePlay: () => void;
  onSpecChange: (spec: { min: number; max: number; step: number }) => void;
}) {
  const [ustawienia, setUstawienia] = useState(false);

  return (
    <div style={{ padding: '2px 8px 6px 44px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Przycisk odtwarzania przy suwaku, nie w menu: animacja parametru to
            najczęstszy sposób pokazania, co dany współczynnik robi z wykresem. */}
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={`${playing ? 'Zatrzymaj' : 'Animuj'} ${name}`}
          title={playing ? 'Zatrzymaj' : 'Animuj'}
          style={{
            width: 22,
            height: 22,
            border: '1px solid #cbd5e1',
            borderRadius: '50%',
            background: playing ? '#eff6ff' : '#fff',
            cursor: 'pointer',
            fontSize: 10,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <span style={{ fontSize: 12, minWidth: 52, fontVariantNumeric: 'tabular-nums' }}>
          {name} = {Number(value.toFixed(3))}
        </span>

        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
          aria-label={`suwak ${name}`}
        />

        <button
          type="button"
          onClick={() => setUstawienia((u) => !u)}
          aria-label={`Zakres suwaka ${name}`}
          title="Zakres i krok"
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: 14,
            padding: 0,
          }}
        >
          ⋯
        </button>
      </div>

      {ustawienia && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, alignItems: 'center' }}>
          {(
            [
              ['min', 'od'],
              ['max', 'do'],
              ['step', 'krok'],
            ] as const
          ).map(([pole, etykieta]) => (
            <label key={pole} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {etykieta}
              <input
                type="number"
                value={spec[pole]}
                onChange={(e) => onSpecChange({ ...spec, [pole]: Number(e.target.value) })}
                aria-label={`${etykieta} suwaka ${name}`}
                style={{ width: 56, fontSize: 11, padding: '2px 4px' }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlotRowList({
  document: doc,
  issuesByRow,
  onChangeRow,
  onAddRow,
  onRemoveRow,
  onToggleHidden,
  onParameterChange,
  parameters,
  animating,
  onToggleAnimation,
  onSliderSpecChange,
}: PlotRowListProps) {
  const [editing, setEditing] = useState<string | undefined>();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 6,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={onAddRow}
          title="Dodaj wyrażenie"
          aria-label="Dodaj wyrażenie"
          style={{
            fontSize: 20,
            lineHeight: 1,
            width: 32,
            height: 32,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {doc.rows.map((row, index) => {
          const issues = [...row.parsed.issues, ...(issuesByRow?.get(row.id) ?? [])];
          const wEdycji = editing === row.id;
          const parametr = row.parsed.kind === 'constant' ? row.parsed.name : undefined;

          return (
            <div key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 44 }}>
                <div
                  style={{
                    width: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#94a3b8',
                    background: '#f8fafc',
                  }}
                >
                  {index + 1}
                </div>

                {/* Kolorowa ikonka: kliknięcie ukrywa krzywą, nie kasuje wiersza —
                    tak jak w Desmosie, gdzie to najczęstsza operacja przy
                    porównywaniu kilku funkcji. */}
                <button
                  type="button"
                  onClick={() => onToggleHidden(row.id)}
                  title={row.hidden ? 'Pokaż' : 'Ukryj'}
                  aria-label={`${row.hidden ? 'Pokaż' : 'Ukryj'} wiersz ${index + 1}`}
                  style={{
                    width: 22,
                    border: 'none',
                    cursor: 'pointer',
                    color: '#fff',
                    fontSize: 13,
                    background:
                      row.parsed.kind === 'blank'
                        ? 'transparent'
                        : row.hidden
                          ? '#cbd5e1'
                          : row.style.color,
                  }}
                >
                  {rowGlyph(row)}
                </button>

                <div
                  style={{ flex: 1, minWidth: 0, padding: '6px 8px', cursor: 'text' }}
                  onClick={() => {
                    if (!wEdycji) setEditing(row.id);
                  }}
                >
                  {wEdycji ? (
                    <RowEditor
                      latex={row.latex}
                      onCommit={(next) => {
                        onChangeRow(row.id, next);
                        setEditing(undefined);
                      }}
                      onCancel={() => setEditing(undefined)}
                    />
                  ) : row.latex ? (
                    <MathView latex={row.latex} block={false} />
                  ) : (
                    <span style={{ color: '#cbd5e1', fontSize: 13 }}>wpisz wyrażenie…</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveRow(row.id)}
                  title="Usuń wiersz"
                  aria-label={`Usuń wiersz ${index + 1}`}
                  style={{
                    width: 28,
                    border: 'none',
                    background: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  ×
                </button>
              </div>

              {parametr && onParameterChange && row.slider && (
                <Slider
                  name={parametr}
                  value={parameters?.[parametr] ?? 0}
                  spec={row.slider}
                  playing={animating?.has(parametr) ?? false}
                  onChange={(v) => onParameterChange(parametr, v)}
                  onTogglePlay={() => onToggleAnimation?.(parametr)}
                  onSpecChange={(spec) => onSliderSpecChange?.(row.id, spec)}
                />
              )}

              {issues.length > 0 && (
                <div style={{ padding: '0 8px 6px 44px', fontSize: 11, color: '#b91c1c' }}>
                  {issues.map((issue) => (
                    <div key={issue}>{issue}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
