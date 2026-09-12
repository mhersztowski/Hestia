/**
 * SequenceEditor — edycja przebiegu: rysunek plus lista kroków.
 *
 * Dwie połowy, bo w sekwencji jedno bez drugiego nie działa. Rysunek pokazuje,
 * co się dzieje, ale nie da się w nim „przeciągnąć wiadomości" — jej miejsce
 * wynika z kolejności, nie z pozycji. Kolejność, zagnieżdżenie i treść zmienia
 * się więc na liście, a rysunek służy do czytania i wskazywania.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DiagramDocument } from '../model/diagram';
import {
  isBlock,
  type SequenceArrow, type SequenceBlock, type SequenceMessage, type SequenceNote,
  type SequenceStep, type StepPath,
} from '../model/sequence';
import {
  addParticipant, addSection, insertIntoSection, insertStep, moveStep, newBlock,
  removeParticipant, removeStep, renameParticipant, setAutonumber, updateParticipant, updateStep,
} from '../model/sequenceOps';
import { SequenceView } from './SequenceView';

export interface SequenceEditorProps {
  document: DiagramDocument;
  onChange: (next: DiagramDocument) => void;
  readOnly?: boolean;
  height?: number | string;
}

const ARROWS: Array<{ value: SequenceArrow; label: string }> = [
  { value: 'solidArrow', label: '→ wywołanie' },
  { value: 'dottedArrow', label: '⇠ odpowiedź' },
  { value: 'solidOpen', label: '→ async' },
  { value: 'solid', label: '— bez grotu' },
  { value: 'dotted', label: '· przerywana' },
  { value: 'solidCross', label: '✕ utracony' },
  { value: 'dottedCross', label: '✕ przerywana' },
  { value: 'dottedOpen', label: '· async' },
  { value: 'biSolid', label: '↔ dwustronna' },
];

const BLOCKS: Array<{ value: 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect'; label: string }> = [
  { value: 'loop', label: 'pętla' },
  { value: 'alt', label: 'wybór (alt/else)' },
  { value: 'opt', label: 'opcjonalnie' },
  { value: 'par', label: 'równolegle' },
  { value: 'critical', label: 'krytyczne' },
  { value: 'break', label: 'przerwanie' },
  { value: 'rect', label: 'ramka' },
];

const btn: CSSProperties = {
  fontSize: 11, padding: '3px 8px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const input: CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box',
};

export function SequenceEditor({ document: doc, onChange, readOnly, height = 520 }: SequenceEditorProps) {
  const script = doc.sequence ?? { participants: [], steps: [] };
  const [selected, setSelected] = useState<StepPath | undefined>();
  const [selectedParticipant, setSelectedParticipant] = useState<string | undefined>();
  // Panel zabiera stałą szerokość, a przy wąskim oknie diagram robi się przez to
  // ciasny — schowanie go oddaje całe miejsce rysunkowi.
  const [panelOpen, setPanelOpen] = useState(true);
  // Przewinięcie kontenera trzymamy tutaj, bo to on jest elementem przewijanym;
  // widok sam nie ma jak się o nim dowiedzieć bez sięgania po przodka w DOM.
  const [scroll, setScroll] = useState({ top: 0, height: 0 });
  const paneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pane = paneRef.current;
    if (pane) setScroll({ top: pane.scrollTop, height: pane.clientHeight });
  }, [doc]);

  const emit = useCallback((next: DiagramDocument) => onChange(next), [onChange]);
  const uczestnicy = script.participants.map((p) => p.id);
  const domyslny = (index: number) => uczestnicy[index] ?? uczestnicy[0] ?? 'A';

  const dodajWiadomosc = useCallback(() => {
    const step: SequenceMessage = {
      kind: 'message', from: domyslny(0), to: domyslny(1), arrow: 'solidArrow', text: 'wiadomość',
    };
    // Zaznaczony blok przyjmuje krok do środka — najczęściej właśnie po to się
    // go zaznacza. Zaznaczona wiadomość dostaje nową tuż pod sobą.
    const doBloku = !!selected && isBlock(stepUnder(script.steps, selected) ?? { kind: 'raw', text: '' });
    emit(doBloku
      ? insertIntoSection(doc, [...selected!, 0], step)
      : insertStep(doc, selected ?? [], step));
    // Zaznaczenie przechodzi na nowy krok: bez tego kolejne „+ Wiadomość"
    // wstawiały się wciąż w to samo miejsce, więc powstawały w odwrotnej
    // kolejności niż pisane.
    setSelected(nextSelection(script.steps, selected, doBloku));
  }, [doc, script, selected, emit]);

  const dodajBlok = useCallback((kind: typeof BLOCKS[number]['value']) => {
    emit(insertStep(doc, selected ?? [], newBlock(kind, kind === 'alt' ? 'warunek' : 'opis')));
    setSelected(nextSelection(script.steps, selected, false));
  }, [doc, script, selected, emit]);

  const dodajNotatke = useCallback(() => {
    const step: SequenceNote = { kind: 'note', placement: 'over', targets: [domyslny(0)], text: 'notatka' };
    emit(insertStep(doc, selected ?? [], step));
  }, [doc, selected, emit]);

  /**
   * Gdzie trafi nowy krok — pokazywane wprost na przyciskach.
   *
   * Reguła („za zaznaczonym, a bez zaznaczenia na koniec") jest prosta, ale
   * niewidoczna: przycisk „+ Wiadomość" wyglądał jak zawsze dopisujący na
   * końcu, więc wstawianie w środek wydawało się niemożliwe.
   */
  const zaznaczonyKrok = selected ? stepUnder(script.steps, selected) : undefined;
  const gdzie = !zaznaczonyKrok ? 'na koniec'
    : isBlock(zaznaczonyKrok) ? `do bloku ${zaznaczonyKrok.block}`
      : 'po zaznaczonym';

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button type="button" style={btn} onClick={() => emit(addParticipant(doc, `U${script.participants.length + 1}`))}>+ Uczestnik</button>
          <button type="button" style={btn} onClick={dodajWiadomosc} title={`Wstaw wiadomość ${gdzie}`}>
            + Wiadomość
          </button>
          <button type="button" style={btn} onClick={dodajNotatke} title={`Wstaw notatkę ${gdzie}`}>
            + Notatka
          </button>
          <select
            style={{ ...btn, width: 'auto' }}
            value=""
            title={`Wstaw blok ${gdzie}`}
            onChange={(e) => { if (e.target.value) dodajBlok(e.target.value as typeof BLOCKS[number]['value']); }}
          >
            <option value="">+ Blok…</option>
            {BLOCKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={!!script.autonumber}
              onChange={(e) => emit(setAutonumber(doc, e.target.checked))}
            />
            numeruj
          </label>
          {/* Bez tego napisu reguła wstawiania pozostaje domysłem. */}
          <span style={{ fontSize: 11, color: '#64748b' }}>
            wstawiam <strong style={{ color: '#334155' }}>{gdzie}</strong>
            {!zaznaczonyKrok && ' — zaznacz krok, aby wstawić w środku'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            style={btn}
            onClick={() => setPanelOpen((open) => !open)}
            title={panelOpen ? 'Ukryj panel właściwości' : 'Pokaż panel właściwości'}
          >
            {panelOpen ? 'Ukryj panel ›' : '‹ Panel'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Rysunek: czytanie i wskazywanie. */}
        <div
          ref={paneRef}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
          style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 8 }}
        >
          <SequenceView
            script={script}
            selected={selected}
            onSelect={readOnly ? undefined : (path) => {
              setSelected(path);
              setSelectedParticipant(undefined);
              // Klik w element to prośba o jego właściwości — schowany panel
              // sprawiałby wrażenie, że zaznaczenie nic nie robi.
              setPanelOpen(true);
            }}
            onSelectParticipant={readOnly ? undefined : (id) => {
              setSelectedParticipant(id);
              setSelected(undefined);
              setPanelOpen(true);
            }}
            selectedParticipant={selectedParticipant}
            scrollTop={scroll.top}
            viewportHeight={scroll.height}
          />
        </div>

        {!readOnly && panelOpen && (
          <div style={{ width: 264, flexShrink: 0, borderLeft: '1px solid #e2e8f0', overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedParticipant ? (
              <ParticipantForm
                doc={doc}
                id={selectedParticipant}
                onChange={(next, nextId) => { emit(next); if (nextId) setSelectedParticipant(nextId); }}
                onRemove={() => { emit(removeParticipant(doc, selectedParticipant)); setSelectedParticipant(undefined); }}
              />
            ) : selected ? (
              <StepForm
                doc={doc}
                path={selected}
                step={stepUnder(script.steps, selected)}
                participants={uczestnicy}
                onChange={emit}
                onRemove={() => { emit(removeStep(doc, selected)); setSelected(undefined); }}
              />
            ) : (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Kliknij wiadomość, blok, notatkę albo nagłówek uczestnika, aby go zmienić.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Ścieżka kroku wstawionego przed chwilą.
 *
 * Przy wstawianiu za zaznaczonym nowy krok ma indeks o jeden większy; przy
 * wstawianiu do bloku ląduje na końcu jego pierwszej sekcji.
 */
function nextSelection(
  steps: SequenceStep[],
  selected: StepPath | undefined,
  intoBlock: boolean,
): StepPath | undefined {
  if (!selected) return undefined;
  if (!intoBlock) return [...selected.slice(0, -1), selected[selected.length - 1] + 1];
  const block = stepUnder(steps, selected);
  if (!block || !isBlock(block)) return selected;
  return [...selected, 0, block.sections[0].steps.length];
}

/** Krok pod ścieżką — schodzi naprzemiennie przez kroki i sekcje. */
function stepUnder(steps: SequenceStep[], path: StepPath): SequenceStep | undefined {
  let current: SequenceStep | undefined = steps[path[0]];
  for (let i = 1; i < path.length; i += 2) {
    if (!current || !isBlock(current)) return undefined;
    current = current.sections[path[i]]?.steps[path[i + 1]];
  }
  return current;
}

function ParticipantForm({ doc, id, onChange, onRemove }: {
  doc: DiagramDocument;
  id: string;
  onChange: (next: DiagramDocument, nextId?: string) => void;
  onRemove: () => void;
}) {
  const participant = doc.sequence?.participants.find((p) => p.id === id);
  if (!participant) return null;

  return (
    <>
      <strong style={{ fontSize: 12 }}>Uczestnik</strong>
      <label style={{ fontSize: 10, color: '#94a3b8' }}>
        identyfikator (nazwa w kodzie)
        <input
          style={input}
          value={participant.id}
          onChange={(e) => onChange(renameParticipant(doc, id, e.target.value), e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
        />
      </label>
      <label style={{ fontSize: 10, color: '#94a3b8' }}>
        opis na diagramie
        <input
          style={input}
          value={participant.label}
          placeholder={participant.id}
          onChange={(e) => onChange(updateParticipant(doc, id, { label: e.target.value }))}
        />
      </label>
      <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="checkbox"
          checked={!!participant.isActor}
          onChange={(e) => onChange(updateParticipant(doc, id, { isActor: e.target.checked }))}
        />
        aktor (ludzik)
      </label>
      <button type="button" style={btn} onClick={onRemove}>Usuń uczestnika</button>
    </>
  );
}

function StepForm({ doc, path, step, participants, onChange, onRemove }: {
  doc: DiagramDocument;
  path: StepPath;
  step?: SequenceStep;
  participants: string[];
  onChange: (next: DiagramDocument) => void;
  onRemove: () => void;
}) {
  if (!step) return null;
  const zmien = (patch: Partial<SequenceStep>) => onChange(updateStep(doc, path, patch));

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <strong style={{ fontSize: 12, flex: 1 }}>
          {step.kind === 'message' ? 'Wiadomość' : step.kind === 'note' ? 'Notatka' : isBlock(step) ? 'Blok' : step.kind}
        </strong>
        <button type="button" style={btn} title="W górę" onClick={() => onChange(moveStep(doc, path, -1))}>↑</button>
        <button type="button" style={btn} title="W dół" onClick={() => onChange(moveStep(doc, path, 1))}>↓</button>
        <button type="button" style={btn} title="Usuń" onClick={onRemove}>×</button>
      </div>

      {step.kind === 'message' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={{ fontSize: 10, color: '#94a3b8' }}>
              od
              <select style={input} value={step.from} onChange={(e) => zmien({ from: e.target.value } as Partial<SequenceMessage>)}>
                {participants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 10, color: '#94a3b8' }}>
              do
              <select style={input} value={step.to} onChange={(e) => zmien({ to: e.target.value } as Partial<SequenceMessage>)}>
                {participants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            treść
            <input style={input} value={step.text} onChange={(e) => zmien({ text: e.target.value } as Partial<SequenceMessage>)} />
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            rodzaj strzałki
            <select style={input} value={step.arrow} onChange={(e) => zmien({ arrow: e.target.value as SequenceArrow } as Partial<SequenceMessage>)}>
              {ARROWS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
          {/* Aktywacja i dezaktywacja wykluczają się: jedna wiadomość nie może
              jednocześnie otwierać i zamykać paska aktywności. */}
          <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={!!step.activate}
              onChange={(e) => zmien({ activate: e.target.checked, deactivate: false } as Partial<SequenceMessage>)}
            />
            uruchamia odbiorcę (+)
          </label>
          <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={!!step.deactivate}
              onChange={(e) => zmien({ deactivate: e.target.checked, activate: false } as Partial<SequenceMessage>)}
            />
            kończy nadawcę (−)
          </label>
        </>
      )}

      {step.kind === 'note' && (
        <>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            treść
            <input style={input} value={step.text} onChange={(e) => zmien({ text: e.target.value } as Partial<SequenceNote>)} />
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            położenie
            <select style={input} value={step.placement} onChange={(e) => zmien({ placement: e.target.value } as Partial<SequenceNote>)}>
              <option value="over">nad</option>
              <option value="left of">po lewej</option>
              <option value="right of">po prawej</option>
            </select>
          </label>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            dotyczy (po przecinku)
            <input
              style={input}
              value={step.targets.join(',')}
              onChange={(e) => zmien({ targets: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } as Partial<SequenceNote>)}
            />
          </label>
        </>
      )}

      {isBlock(step) && (
        <>
          <label style={{ fontSize: 10, color: '#94a3b8' }}>
            tytuł
            <input style={input} value={step.title ?? ''} onChange={(e) => zmien({ title: e.target.value } as Partial<SequenceBlock>)} />
          </label>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {step.block} · sekcji: {step.sections.length}
          </div>
          <button type="button" style={btn} onClick={() => onChange(addSection(doc, path, 'kolejna'))}>
            + sekcja ({step.block === 'alt' ? 'else' : step.block === 'par' ? 'and' : 'option'})
          </button>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            Nowe kroki wpadają do środka bloku, dopóki jest zaznaczony.
          </div>
        </>
      )}

      {step.kind === 'raw' && (
        <div style={{ fontSize: 11, color: '#64748b' }}>
          Linia spoza modelu — zachowana bez zmian:
          <code style={{ display: 'block', marginTop: 4 }}>{step.text}</code>
        </div>
      )}
    </>
  );
}
