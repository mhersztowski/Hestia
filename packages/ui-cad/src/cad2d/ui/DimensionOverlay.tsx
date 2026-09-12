import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CadRenderer } from '../renderer/CadRenderer';
import type { DimensionLabel } from '../tools/types';

interface Props {
  labels: DimensionLabel[];
  renderer: CadRenderer | null;
  /** Called after a param value changes — triggers a live redraw of the preview. */
  onCommit?: () => void;
  /** Enter / ✓ → confirm the current phase (advance) or finalize the shape. */
  onCommitDraft?: () => void;
  /**
   * Touch and pen mode — the pills can be tapped to edit them. With a mouse
   * (false) they let clicks through instead, so they do not get in the way of
   * clicking points on the canvas; the keyboard still reaches them, because the
   * first one takes focus by itself.
   */
  touchMode?: boolean;
}

/** Extract the trailing numeric part from a dimension text such as "L: 45.23" or "∠ 45.0°". */
function extractNumber(text: string): string {
  const m = text.match(/(-?\d+\.?\d*)\s*[°%]?\s*$/);
  return m ? m[1] : '0';
}

export function DimensionOverlay({ labels, renderer, onCommit, onCommitDraft, touchMode = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // A "fresh" field is one nobody has typed into yet. Its value follows the
  // mouse and its text is selected, so the first character typed replaces the
  // whole of it rather than being appended.
  const [fresh, setFresh] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // A request to focus the field — tapping a label on a phone has to open the keyboard within the tap gesture.
  const wantFocus = useRef(false);
  // The signature of the parameter set that Escape dismissed — it stops the auto-focus until the phase changes.
  const dismissedSig = useRef<string | null>(null);

  // Edytowalne etykiety z ich identyfikatorem (fallback: indeks).
  const editable = labels
    .map((l, i) => ({ l, id: l.id ?? String(i) }))
    .filter((x) => x.l.editable && x.l.onEdit);
  const ids = editable.map((x) => x.id);
  const sig = ids.join('|');
  const active = editingId != null ? editable.find((x) => x.id === editingId) : undefined;

  // The first parameter takes focus both when a new shape starts and when the
  // set of parameters changes (an arc: radius and start angle, then the end
  // angle). Escape only silences the phase it was pressed in.
  useEffect(() => {
    const has = ids.length > 0;
    if (has && !active && dismissedSig.current !== sig) {
      setEditingId(ids[0]);
      setFresh(true);
      wantFocus.current = true;
    } else if (!has) {
      if (editingId != null) { setEditingId(null); setFresh(true); }
      dismissedSig.current = null; // the shape is done — the next one may take focus again
    }
  });

  // Until something is typed, the field shows the live value the mouse is producing.
  useEffect(() => {
    if (active && fresh) setEditValue(extractNumber(active.l.text));
  });

  // Focus on request, and select the whole text while the field is fresh — the first character then replaces it.
  useLayoutEffect(() => {
    if (!active) return;
    const el = inputRef.current;
    if (!el) return;
    if (wantFocus.current) { el.focus(); wantFocus.current = false; }
    if (fresh) el.select();
  });

  if (!renderer || labels.length === 0) return null;

  /** Applies the value live: the geometry changes as one types. */
  const applyLive = (raw: string, label: DimensionLabel) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && label.onEdit) {
      label.onEdit(v);
      onCommit?.();
    }
  };

  const activate = (id: string) => {
    setEditingId(id);
    setFresh(true);
    wantFocus.current = true; // opens the keyboard on a phone, within the tap gesture
  };

  /** Clicking another parameter accepts the current one, as Tab does, and moves to the one clicked. */
  const switchTo = (id: string) => {
    if (active && active.id !== id) applyLive(editValue, active.l);
    activate(id);
  };

  const gotoNextParam = () => {
    if (active) applyLive(editValue, active.l);
    if (ids.length <= 1) { setFresh(true); wantFocus.current = true; return; }
    const pos = ids.indexOf(editingId ?? ids[0]);
    activate(ids[(pos + 1) % ids.length]);
  };

  const commitAll = () => {
    if (active) applyLive(editValue, active.l);
    onCommitDraft?.();
    setEditingId(null);
    setFresh(true);
  };

  const dismiss = () => {
    dismissedSig.current = sig;
    setEditingId(null);
  };

  const multiParam = ids.length > 1;

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 26, height: 22, padding: '0 6px', borderRadius: 3, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700, lineHeight: 1,
    fontFamily: 'monospace', touchAction: 'manipulation',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {labels.map((label, i) => {
        const id = label.id ?? String(i);
        if (id === editingId) return null; // the active parameter is drawn below, as one lasting input
        const screen = renderer.worldToScreen(label.worldX, label.worldY);
        const x = screen.x + (label.offsetX ?? 0);
        const y = screen.y + (label.offsetY ?? 0);
        const isPrimary = !label.variant || label.variant === 'primary';
        const isEditable = !!label.editable && !!label.onEdit;
        const unit = label.unit ?? (label.text.includes('°') ? '°' : 'mm');

        return (
          <div
            key={id}
            style={{
              position: 'absolute', left: x, top: y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: (isEditable && touchMode) ? 'auto' : 'none', zIndex: 1,
            }}
          >
            <div
              onClick={isEditable ? (e) => { e.stopPropagation(); switchTo(id); } : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: isPrimary ? 'rgba(10,20,30,0.85)' : 'rgba(10,20,30,0.65)',
                fontSize: 12, fontFamily: 'monospace',
                padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                border: `1px solid ${isEditable ? 'rgba(79,195,247,0.6)' : 'rgba(79,195,247,0.3)'}`,
                userSelect: 'none', cursor: isEditable ? 'pointer' : 'default',
              }}
              title={isEditable ? 'Click to edit' : undefined}
            >
              {label.prefix && (
                <span style={{ color: isPrimary ? '#e8eef2' : '#a0d8ef', fontWeight: 700 }}>{label.prefix}</span>
              )}
              <span style={{
                color: isPrimary ? '#e8eef2' : '#a0d8ef',
                fontWeight: 700,
              }}>{extractNumber(label.text)}</span>
              <span style={{ color: '#9fb0ba', fontWeight: 400 }}>{unit}</span>
            </div>
          </div>
        );
      })}

      {/* The active parameter — one input that lasts, so focus and the phone's keyboard survive switching between them. */}
      {active && (() => {
        const label = active.l;
        const screen = renderer.worldToScreen(label.worldX, label.worldY);
        const x = screen.x + (label.offsetX ?? 0);
        const y = screen.y + (label.offsetY ?? 0);
        const unit = label.unit ?? (label.text.includes('°') ? '°' : 'mm');
        return (
          <div style={{
            position: 'absolute', left: x, top: y,
            transform: 'translate(-50%, -50%)', pointerEvents: touchMode ? 'auto' : 'none', zIndex: 20,
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(10,20,30,0.92)', border: '1.5px solid #4fc3f7', borderRadius: 4,
              padding: '2px 6px', boxShadow: '0 0 8px rgba(79,195,247,0.5)', fontFamily: 'monospace', fontSize: 12,
            }}>
              <input
                ref={inputRef}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                // type=text rather than number: Chrome ignores .select() on a
                // number input, so the first character would append instead of
                // replacing. inputMode=decimal still gets the numeric keypad.
                type="text"
                inputMode="decimal"
                value={editValue}
                onFocus={e => e.currentTarget.select()}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9.\-]/g, '');
                  setFresh(false);
                  setEditValue(raw);
                  applyLive(raw, label); // live — the geometry changes at once
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitAll(); }
                  else if (e.key === 'Tab') { e.preventDefault(); gotoNextParam(); }
                  else if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
                  e.stopPropagation();
                }}
                style={{
                  width: 58, background: '#2a6cff', color: '#fff', border: 'none', borderRadius: 2,
                  padding: '1px 3px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                  textAlign: 'right', outline: 'none',
                }}
              />
              <span style={{ color: '#cfd8dc' }}>{unit}</span>

              {/* Buttons for touch and pen — Tab and Enter without a hardware keyboard. */}
              {multiParam && (
                <button
                  type="button"
                  title="Next parameter (Tab)"
                  onPointerDown={e => e.preventDefault()} // nie odbieraj focusu polu → klawiatura zostaje
                  onClick={e => { e.stopPropagation(); gotoNextParam(); }}
                  style={{ ...btnStyle, background: '#1976d2', color: '#fff' }}
                >→</button>
              )}
              <button
                type="button"
                title="Commit (Enter)"
                onPointerDown={e => e.preventDefault()}
                onClick={e => { e.stopPropagation(); commitAll(); }}
                style={{ ...btnStyle, background: '#2e7d32', color: '#fff' }}
              >✓</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
