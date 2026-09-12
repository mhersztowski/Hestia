/**
 * SolutionDialog — okno rozwiązywania zadania i historia podejść.
 *
 * Dwa tryby, bo zadanie rozwiązuje się dwoma sposobami i **żaden nie zastępuje
 * drugiego**: `md` (tekst z LaTeX-em — da się przeszukać, poprawić, skopiować)
 * i `odręcznie` (szybsze przy rachunku, wierne temu, co ręka naprawdę zrobiła).
 * Wybór należy do czytelnika, nie do programu.
 *
 * W obu trybach osobne jest **pole odpowiedzi**: droga rozwiązania zostaje
 * treścią, a wynik idzie do sprawdzenia kluczem zadania. To rozdzielenie jest
 * celowe — automat ocenia to, co da się ocenić, a wyprowadzenia nie udaje, że
 * rozumie.
 *
 * Okno jest zwykłym `div`-em z nakładką, nie portalem do `body`: pakiet nie ma
 * zależności od biblioteki komponentów, a blok zadania i tak siedzi w kolumnie
 * tekstu o ograniczonej szerokości.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { parseInk, type Solution, type SolutionMode } from '@hestia/core-sci';
import { InkCanvas, type InkRecognizer } from './InkCanvas';
import { inline } from './inlineText';

export interface SolutionDraft {
  mode: SolutionMode;
  content: string;
  answer?: string;
}

export interface SolutionDialogProps {
  title: string;
  /** Rozpoznawanie pisma; brak = tryb odręczny bez zamiany na tekst. */
  recognize?: InkRecognizer;
  /** Zapis podejścia razem z datą — datę stempluje host. */
  onSave: (draft: SolutionDraft) => void;
  onClose: () => void;
  /** Wstępna odpowiedź — to, co czytelnik zdążył wpisać w bloku. */
  initialAnswer?: string;
}

const nakladka: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16,
};

const okno: CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 16, width: 'min(720px, 100%)',
  maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
};

const btn: CSSProperties = {
  fontSize: 12, padding: '5px 12px', border: '1px solid #cbd5e1',
  borderRadius: 6, background: '#fff', cursor: 'pointer',
};

export function SolutionDialog({
  title, recognize, onSave, onClose, initialAnswer = '',
}: SolutionDialogProps) {
  const [mode, setMode] = useState<SolutionMode>('md');
  const [md, setMd] = useState('');
  const [ink, setInk] = useState('');
  const [answer, setAnswer] = useState(initialAnswer);

  const pusto = mode === 'md' ? !md.trim() : !ink;

  return (
    <div style={nakladka} role="dialog" aria-modal="true" aria-label={`Rozwiązanie: ${title}`}>
      <div style={okno}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1, fontSize: 14 }}>{title}</strong>
          <button type="button" style={btn} onClick={onClose}>zamknij</button>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={{ ...btn, background: mode === 'md' ? '#eff6ff' : '#fff' }}
            onClick={() => setMode('md')}
          >
            tekst i LaTeX
          </button>
          <button
            type="button"
            style={{ ...btn, background: mode === 'ink' ? '#eff6ff' : '#fff' }}
            onClick={() => setMode('ink')}
          >
            odręcznie
          </button>
        </div>

        {mode === 'md' ? (
          <>
            <textarea
              value={md}
              onChange={(e) => setMd(e.target.value)}
              placeholder={'Wyprowadzenie. Wzory w LaTeX-u między znakami dolara, np. $T = 2\\pi\\sqrt{m/k}$.'}
              rows={8}
              style={{
                width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13,
                padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical',
              }}
            />
            {/* Podgląd składu — LaTeX w polu tekstowym jest nieczytelny, a to on
                jest treścią rozwiązania, nie jego zapis źródłowy. */}
            {md.trim() && (
              <div style={{ fontSize: 13, lineHeight: 1.6, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
                {inline(md)}
              </div>
            )}
          </>
        ) : (
          <InkCanvas
            mode="latex"
            height={260}
            recognize={recognize}
            onStrokesChange={(_s, serialized) => setInk(serialized)}
            onRecognized={setAnswer}
          />
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Wynik:</span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="np. 0,28 s"
            style={{
              flex: 1, fontSize: 13, padding: '5px 8px',
              border: '1px solid #cbd5e1', borderRadius: 6,
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            style={{ ...btn, borderColor: '#0f766e', color: '#0f766e' }}
            disabled={pusto}
            onClick={() => onSave({ mode, content: mode === 'md' ? md : ink, answer: answer || undefined })}
          >
            zapisz rozwiązanie
          </button>
          {pusto && (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {mode === 'md' ? 'Napisz wyprowadzenie.' : 'Napisz rozwiązanie rysikiem.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface SolutionHistoryProps {
  solutions: Solution[];
  onClose: () => void;
}

/** Historia podejść — ten sam widok md i pisma, tylko do odczytu. */
export function SolutionHistory({ solutions, onClose }: SolutionHistoryProps) {
  const [nr, setNr] = useState(0);
  const wybrane = solutions[nr];

  return (
    <div style={nakladka} role="dialog" aria-modal="true" aria-label="Historia rozwiązań">
      <div style={okno}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1, fontSize: 14 }}>Historia rozwiązań</strong>
          <button type="button" style={btn} onClick={onClose}>zamknij</button>
        </div>

        {solutions.length === 0 && (
          <span style={{ fontSize: 13, color: '#64748b' }}>Jeszcze nic tu nie ma.</span>
        )}

        {solutions.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {solutions.map((s, i) => (
                <button
                  key={`${s.at}-${i}`}
                  type="button"
                  style={{ ...btn, background: i === nr ? '#eff6ff' : '#fff' }}
                  onClick={() => setNr(i)}
                >
                  {new Date(s.at).toLocaleDateString('pl-PL')}
                  {' · '}
                  {s.mode === 'md' ? 'tekst' : 'pismo'}
                </button>
              ))}
            </div>

            {wybrane?.answer && (
              <div style={{ fontSize: 13 }}>
                Wynik: <strong>{wybrane.answer}</strong>
              </div>
            )}

            {wybrane?.mode === 'md' ? (
              <div style={{ fontSize: 13, lineHeight: 1.6, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
                {inline(wybrane.content)}
              </div>
            ) : (
              /* Pismo odtwarzamy z **wektorów**, nie z obrazu — dlatego historia
                 wygląda tak samo na telefonie i na monitorze. */
              <InkCanvas mode="latex" readOnly height={260} value={parseInk(wybrane?.content ?? '')} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
