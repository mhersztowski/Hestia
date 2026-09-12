/**
 * FieldBlock — symulacja pola na siatce, sterowana blokiem `field`.
 *
 * Odpowiednik `SimBlock` dla równań cząstkowych. Różnica jest w tym, co wraca z
 * modelu: nie trajektoria, po której da się interpolować dowolną chwilę, tylko
 * **ciąg klatek**. Animacja przewija klatki, a nie próbkuje czas — próbkowanie
 * między klatkami sugerowałoby dokładność, której nie ma.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  compilePde, formatIn, parseFormulaBlock, parseStrokes, serializeStrokes,
  type PdeResult, type Stroke,
} from '@hestia/core-sci';
import { StrokeCanvas } from './StrokeCanvas';
import { HeatmapCanvas } from './HeatmapCanvas';
import { downloadCanvasPng, downloadCsv, framesToCsv } from './eksport';

export interface FieldBlockProps {
  /** Bez własnej ramki — daje ją `BlockShell` po stronie hosta. */
  bare?: boolean;
  id: string;
  /** Treść bloku `formula` z dyrektywą `@pde`. */
  code: string;
  /** Nastawy z bloku `field`, jeśli autor je podał. */
  setup?: { values?: Record<string, number>; duration?: number; frames?: number };
  /**
   * Zapis zmienionego wzoru pola — po nim rysunek trafia do dokumentu.
   *
   * Brak znaczy tryb tylko do oglądania: rysować wciąż można, ale zmiana żyje
   * do przeładowania strony. Tak jest w eksporcie statycznym, gdzie nie ma
   * czego zapisać.
   */
  onFormulaChange?: (code: string) => void;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0', borderLeft: '4px solid #0ea5e9',
  borderRadius: 6, background: '#fff', padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};

/**
 * Podmienia dyrektywę `@strokes` w treści bloku wzoru.
 *
 * Zapis idzie do bloku `formula`, a nie `field`, bo rysunek jest **warunkiem
 * początkowym**, czyli częścią równania — a nie nastawą przebiegu.
 */
function zapiszRysunek(code: string, strokes: Stroke[]): string {
  const linia = `@strokes ${serializeStrokes(strokes)}`.trimEnd();
  return /^@strokes\b.*$/m.test(code)
    ? code.replace(/^@strokes\b.*$/m, linia)
    // Nowa dyrektywa ląduje tuż po `@init`, żeby warunki początkowe trzymały
    // się razem; bez `@init` — na końcu bloku.
    : /^@init\b.*$/m.test(code)
      ? code.replace(/^(@init\b.*)$/m, `$1\n${linia}`)
      : `${code.trimEnd()}\n${linia}\n`;
}

export function FieldBlock({ id, code, setup, bare, onFormulaChange }: FieldBlockProps) {
  // Rysunek żyje w stanie, żeby pociągnięcia pojawiały się od razu; do
  // dokumentu trafia dopiero po puszczeniu pióra.
  const [rysunek, setRysunek] = useState<Stroke[] | undefined>(undefined);
  const [tryb, setTryb] = useState<'oglad' | 'rysowanie'>('oglad');

  const zrodlo = useMemo(
    () => (rysunek ? zapiszRysunek(code, rysunek) : code),
    [code, rysunek],
  );
  const model = useMemo(() => compilePde(parseFormulaBlock(id, zrodlo)), [id, zrodlo]);

  const pociagniecia = useMemo(
    () => rysunek ?? parseStrokes(/^@strokes\b(.*)$/m.exec(code)?.[1] ?? ''),
    [rysunek, code],
  );

  const [values, setValues] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries(model.parameters.map((p) => [p.name, p.value])),
    ...setup?.values,
  }));
  const [klatka, setKlatka] = useState(0);
  const [gra, setGra] = useState(false);

  const duration = setup?.duration ?? 1;
  const liczbaKlatek = setup?.frames ?? 60;

  // Liczenie jest kosztowne (siatka × kroki), więc trzyma się `useMemo`:
  // przesuwanie klatki nie może uruchamiać symulacji od nowa.
  const wynik: PdeResult = useMemo(
    () => model.run(values, [0, duration], liczbaKlatek),
    [model, values, duration, liczbaKlatek],
  );

  useEffect(() => { setKlatka(0); }, [wynik]);

  useEffect(() => {
    if (!gra) return undefined;
    const timer = window.setInterval(() => {
      setKlatka((poprzednia) => (poprzednia + 1) % wynik.frames.length);
    }, 60);
    return () => window.clearInterval(timer);
  }, [gra, wynik]);

  const biezaca = wynik.frames[Math.min(klatka, wynik.frames.length - 1)];
  /** Płótno bieżącej klatki — potrzebne tylko przy pobieraniu obrazu. */
  const plotnoRef = useRef<HTMLCanvasElement | null>(null);

  return (
    <div style={bare
      ? { display: 'flex', flexDirection: 'column', gap: 8 }
      : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!bare && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0ea5e9' }}>pole</span>
          <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
          <span style={label}>
            {model.nx}×{model.ny} · {model.order === 'wave' ? 'równanie falowe' : 'dyfuzja'}
          </span>
        </div>
      )}

      {model.issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {model.issues.map((issue, index) => <div key={index}>{issue}</div>)}
        </div>
      )}

      {/* Wysokość z zawartości, nie sztywna: pod płótnem jest jeszcze podpis
          z zakresem wartości, a przycięcie kontenera do samego płótna
          wypychało go na pasek przycisków. */}
      <div style={{ position: 'relative', width: 320 }}>
        <HeatmapCanvas
          onCanvas={(el) => { plotnoRef.current = el; }}
          data={biezaca.data}
          nx={model.nx}
          ny={model.ny}
          min={wynik.min}
          max={wynik.max}
          label={model.field}
        />
        {tryb === 'rysowanie' && (
          <StrokeCanvas
            width={320}
            height={320}
            // Płótno rysowania kryje sam obraz pola, nie podpis pod nim.
            top={0}
            domainX={model.domainX}
            domainY={model.domainY}
            onChange={(update) => {
              // Punkt odniesienia to rysunek w stanie, a gdy go nie ma —
              // ten zapisany w dokumencie; inaczej pierwsze pociągnięcie
              // kasowałoby to, co autor narysował wcześniej.
              setRysunek((poprzedni) => update(poprzedni ?? pociagniecia));
              setKlatka(0);
            }}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={tryb === 'rysowanie' ? { ...btn, background: '#e0f2fe', borderColor: '#0ea5e9', color: '#075985' } : btn}
          onClick={() => { setTryb((t) => (t === 'rysowanie' ? 'oglad' : 'rysowanie')); setGra(false); }}
          title="Rysuj warunek początkowy. Piórem: nacisk steruje wysokością, gumka rysuje dołek."
        >
          ✎ rysuj
        </button>
        {tryb === 'rysowanie' && (
          <>
            <button
              type="button"
              style={btn}
              onClick={() => { setRysunek([]); setKlatka(0); }}
              title="Czyści rysunek; pole zostaje puste"
            >
              ⌫ wyczyść
            </button>
            {onFormulaChange && rysunek && (
              <button
                type="button"
                style={{ ...btn, borderColor: '#0ea5e9', color: '#075985' }}
                onClick={() => { onFormulaChange(zapiszRysunek(code, rysunek)); setRysunek(undefined); }}
                title="Zapisuje pociągnięcia we wzorze pola"
              >
                ↳ zapisz w dokumencie
              </button>
            )}
          </>
        )}
        <button type="button" style={btn} onClick={() => setGra((g) => !g)}>
          {gra ? '❚❚ pauza' : '▶ start'}
        </button>
        <button type="button" style={btn} onClick={() => { setGra(false); setKlatka(0); }}>
          ⟲ reset
        </button>
        <input
          type="range"
          min={0}
          max={wynik.frames.length - 1}
          value={Math.min(klatka, wynik.frames.length - 1)}
          onChange={(e) => { setGra(false); setKlatka(Number(e.target.value)); }}
          style={{ flex: 1, minWidth: 120 }}
        />
        <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>
          t = {biezaca.t.toFixed(2)} s
        </span>
        {/* Liczba kroków mówi, ile naprawdę kosztowała symulacja — przy siatce
            bliskiej granicy to jedyny sygnał, że warto ją zmniejszyć. */}
        <span style={label}>{wynik.steps} kroków</span>

        {/* Obraz bieżącej klatki i wszystkie klatki jako liczby. Rozdzielone,
            bo odpowiadają na różne pytania: „wstawię to do sprawozdania"
            i „policzę to sam, żeby sprawdzić". */}
        <button
          type="button"
          style={btn}
          onClick={() => { if (plotnoRef.current) downloadCanvasPng(plotnoRef.current, `${id}-t${biezaca.t.toFixed(2)}`); }}
          title="Pobierz bieżącą klatkę jako obraz PNG"
        >
          PNG
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => downloadCsv(framesToCsv(wynik.frames, model.nx, model.ny), id)}
          title="Pobierz wszystkie klatki jako CSV (t, ix, iy, wartość)"
        >
          CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {model.parameters.map((parameter) => (
          <label key={parameter.name} style={{ ...label, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>
              {parameter.name} = <strong style={{ color: '#0f172a' }}>
                {parameter.unit && parameter.unit !== '1'
                  ? formatIn(values[parameter.name] ?? parameter.value, parameter.unit, 3)
                  : Number((values[parameter.name] ?? parameter.value).toPrecision(3))}
              </strong>
            </span>
            <input
              type="range"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={values[parameter.name] ?? parameter.value}
              onChange={(e) => setValues((v) => ({ ...v, [parameter.name]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
