/**
 * ScriptBlock — model napisany w dokumencie, w TypeScripcie.
 *
 * Blok wygląda i zachowuje się jak `sim`, bo model ma ten sam kontrakt —
 * różnica jest wyłącznie w tym, skąd pochodzi. Dzięki temu widoki, panel
 * parametrów i animacja są dosłownie tym samym kodem.
 *
 * Kod pokazujemy zwinięty. Czytelnik dokumentu ma najpierw zobaczyć zjawisko,
 * a autor jednym kliknięciem wraca do źródła — odwrotna kolejność zamieniłaby
 * artykuł w listing.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { runScript, suggestViews, SCRIPT_API_TYPES } from '@hestia/core-sci';
import { getCodeEditor } from './register';
import { ModelViews } from './ModelViews';
import type { WorkerFactory } from './useModelRunner';

export interface ScriptBlockProps {
  /** Identyfikator bloku z infostringu — trafia do nazwy pobieranego pliku. */
  blockId?: string;
  /**
   * Bez własnej ramki i nagłówka — daje je `BlockShell` po stronie hosta.
   *
   * Poza edytorem (podgląd, eksport statyczny) komponent bywa używany wprost i
   * wtedy ramka jest potrzebna, stąd przełącznik zamiast twardego usunięcia.
   */
  bare?: boolean;
  /** Kod TypeScript budujący model. */
  code: string;
  /** Zapis zmienionego kodu; brak = tryb tylko do odczytu. */
  onChange?: (next: string) => void;
  /**
   * Fabryka workera od hosta.
   *
   * Modele pisane w skrypcie bywają najcięższe w całej bazie (gaz w pudle
   * liczy się sekundami), więc to tutaj worker zarabia najbardziej.
   */
  workerFactory?: WorkerFactory;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderLeft: '4px solid #0ea5e9',
  borderRadius: 6,
  background: '#fff',
  padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
  color: '#334155',
};

export function ScriptBlock({ code, onChange, bare, workerFactory, blockId }: ScriptBlockProps) {
  const [draft, setDraft] = useState(code);
  const [editing, setEditing] = useState(false);
  // Uruchamiamy zapisany kod, nie bufor edycji: model ma się przeliczać po
  // zatwierdzeniu, a nie przy każdym naciśnięciu klawisza w środku wyrażenia.
  const [running, setRunning] = useState(code);
  const edytorHosta = getCodeEditor();

  const result = useMemo(() => runScript(running), [running]);
  const views = useMemo(() => (result.model ? suggestViews(result.model) : []), [result.model]);

  return (
    <div
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 8 }
          : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!bare && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0ea5e9' }}>model w skrypcie</span>
        )}
        <span style={label}>TypeScript</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => setEditing((v) => !v)}>
          {editing ? 'ukryj kod' : '‹›  kod'}
        </button>
        {editing && onChange && (
          <button
            type="button"
            style={{ ...btn, background: '#dbeafe', borderColor: '#2563eb', color: '#1e40af' }}
            onClick={() => {
              setRunning(draft);
              onChange(draft);
            }}
          >
            uruchom i zapisz
          </button>
        )}
        {editing && !onChange && (
          <button type="button" style={btn} onClick={() => setRunning(draft)}>
            uruchom
          </button>
        )}
      </div>

      {!bare && result.issues.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#b91c1c',
            background: '#fef2f2',
            borderRadius: 4,
            padding: '6px 8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {result.issues.map((issue, index) => (
            <div key={index}>{issue}</div>
          ))}
        </div>
      )}

      {editing && (
        /**
         * Ściąga z API — ten sam tekst, który host wstrzykuje do Monaco.
         *
         * Pole tekstowe nie podpowiada niczego, więc bez tej listy autor nie ma
         * skąd wiedzieć, że ma pod ręką metodę dla układów sztywnych albo
         * bibliotekę gotowych zjawisk. Pokazujemy **dosłownie** deklaracje,
         * a nie ich streszczenie: drugie źródło rozjechałoby się z pierwszym
         * przy najbliższej zmianie API.
         */
        <details style={{ fontSize: 11, color: '#475569' }}>
          <summary style={{ cursor: 'pointer' }}>co jest dostępne w skrypcie</summary>
          <pre
            data-testid="script-api"
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 10,
              lineHeight: 1.4,
              maxHeight: 220,
              overflow: 'auto',
              margin: '6px 0 0',
              padding: 8,
              borderRadius: 4,
              background: '#f1f5f9',
              color: '#0f172a',
            }}
          >
            {SCRIPT_API_TYPES.trim()}
          </pre>
        </details>
      )}

      {/*
       * Edytor hosta, gdy jest; inaczej pole tekstowe.
       *
       * To nie jest wybór estetyczny: Monaco zna deklaracje API rdzenia
       * (`SCRIPT_API_TYPES`), więc podpowiada sygnatury i pokazuje błędy typów
       * w miejscu pisania — a to jedyny powód, dla którego ten blok przyjmuje
       * TypeScript, a nie JavaScript.
       */}
      {editing &&
        (edytorHosta ? (
          edytorHosta({
            value: draft,
            onChange: setDraft,
            language: 'typescript',
            extraTypes: SCRIPT_API_TYPES,
            height: 320,
          })
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              lineHeight: 1.45,
              minHeight: 260,
              padding: 8,
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              resize: 'vertical',
            }}
          />
        ))}

      {result.model && (
        <ModelViews
          blockId={blockId}
          model={result.model}
          views={views}
          source={{ kind: 'script', code: running }}
          workerFactory={workerFactory}
        />
      )}
    </div>
  );
}
