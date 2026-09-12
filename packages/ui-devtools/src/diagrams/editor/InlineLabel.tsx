/**
 * InlineLabel — etykieta edytowana wprost na diagramie.
 *
 * Kliknięcie w tekst zamienia go w pole edycji dokładnie w tym samym miejscu,
 * więc użytkownik nie traci kontekstu (okienko `prompt` wyrywało go z diagramu
 * i zasłaniało to, co właśnie zmieniał).
 *
 * Klik odróżniamy od przeciągnięcia po przebytej odległości: bez tego każda
 * próba przesunięcia węzła chwyconego za etykietę kończyłaby się otwarciem
 * edycji zamiast ruchem.
 *
 * Klasa `nodrag` jest konieczna: bez niej React Flow przechwytuje wciśnięcie
 * myszy jako początek przeciągania i nie da się zaznaczyć tekstu w polu.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { inlineEditKey, initialEditValue, resolveInlineEdit } from './inlineEdit';

export interface InlineLabelProps {
  value: string;
  /** Tekst pokazywany, gdy `value` jest puste (np. identyfikator węzła). */
  placeholder?: string;
  /**
   * Czy ten zastępczy tekst jest realną wartością (identyfikator węzła), czy
   * tylko zachętą („+ opis"). Decyduje, od czego zaczyna się edycja.
   */
  placeholderIsValue?: boolean;
  /** Pusty tekst jest poprawną wartością (opis przejścia). */
  allowEmpty?: boolean;
  onCommit: (next: string) => void;
  editable?: boolean;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

export function InlineLabel({
  value, placeholder, placeholderIsValue = false, allowEmpty = false, onCommit, editable = true, style, inputStyle,
}: InlineLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Miejsce wciśnięcia — służy do odróżnienia kliknięcia od przeciągnięcia. */
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const startValue = initialEditValue(value, placeholder ?? '', placeholderIsValue);
  useEffect(() => { if (!editing) setDraft(startValue); }, [startValue, editing]);
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    // Porównujemy z wartością startową, nie z pustą etykietą — inaczej
    // zatwierdzenie niezmienionego identyfikatora zapisywałoby go jako „nową"
    // etykietę przy każdym kliknięciu.
    const result = resolveInlineEdit(startValue, draft, allowEmpty);
    if (result.changed) onCommit(result.value);
    else setDraft(startValue);
  };

  if (!editing) {
    /** Ruch większy niż kilka pikseli znaczy „użytkownik przeciągał", nie „kliknął". */
    const DRAG_TOLERANCE_PX = 4;
    return (
      <span
        style={{ cursor: editable ? 'text' : 'default', ...style }}
        title={editable ? 'Kliknij, aby edytować' : undefined}
        onPointerDown={(e) => { pressedAt.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          if (!editable) return;
          const from = pressedAt.current;
          pressedAt.current = null;
          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG_TOLERANCE_PX) return;
          e.stopPropagation();
          setEditing(true);
        }}
        // Dwuklik zostaje jako druga droga — nawyk z innych edytorów.
        onDoubleClick={(e) => { if (!editable) return; e.stopPropagation(); setEditing(true); }}
      >
        {value || placeholder || ''}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="nodrag"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        const action = inlineEditKey(e);
        if (action === 'continue') return;
        e.preventDefault();
        e.stopPropagation();
        if (action === 'commit') commit();
        else { setDraft(startValue); setEditing(false); }
      }}
      // Zdarzenia myszy zatrzymujemy, żeby klik w polu nie zaznaczał węzła
      // ani nie zaczynał przeciągania płótna.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        font: 'inherit', color: 'inherit', textAlign: 'inherit',
        width: '100%', minWidth: 40, boxSizing: 'border-box',
        border: '1px solid #2563eb', borderRadius: 3, padding: '1px 4px',
        background: '#fff', outline: 'none',
        ...inputStyle,
      }}
    />
  );
}
