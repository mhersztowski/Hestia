/**
 * SciPlot — kalkulator wykresów: lista wyrażeń obok płótna.
 *
 * Komponent trzyma stan dokumentu i wartości suwaków, i jest tym, co osadza się
 * zarówno w bloku markdown, jak i na całej stronie. Poza nim zostaje tylko
 * decyzja, skąd bierze się dokument i gdzie wraca — blok zapisuje go w treści
 * notatki, strona w pliku.
 *
 * ## Dlaczego wartości suwaków są osobno od dokumentu
 *
 * Przesunięcie suwaka ma przerysować wykres, ale **nie ma zmieniać zapisu**.
 * Gdyby wartość wracała do wiersza, każde drgnięcie palcem brudziłoby notatkę
 * i zapełniało historię zmian. Dokument trzyma to, co autor napisał; suwak
 * trzyma to, co akurat ogląda.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  addRow,
  createPlotDocument,
  evaluateDocument,
  removeRow,
  sampleSurface,
  updateRow,
  type PlotDocument,
  type Viewport,
} from '@hestia/core-sci';
import { PlotRowList } from './PlotRowList';
import { PlotView } from './PlotView';
import { SurfaceStage } from './SurfaceStage';
import { useSliderAnimation, type AnimatedSlider } from './useSliderAnimation';

export interface SciPlotProps {
  /** Dokument początkowy; brak = nowy, pusty. */
  initialDocument?: PlotDocument;
  /** Zapis po każdej zmianie treści — nie po ruchu suwaka. */
  onDocumentChange?: (next: PlotDocument) => void;
  height?: number | string;
  /** Szerokość panelu wyrażeń w pikselach. */
  panelWidth?: number;
}

export function SciPlot({
  initialDocument,
  onDocumentChange,
  height = 460,
  panelWidth = 320,
}: SciPlotProps) {
  const [doc, setDoc] = useState<PlotDocument>(() => initialDocument ?? createPlotDocument());
  const [parameters, setParameters] = useState<Record<string, number>>({});
  /** Parametry, które właśnie biegną. Nazwa, nie identyfikator wiersza —
      animacja dotyczy wartości, a ta może być użyta w kilku wierszach. */
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  /** Zmiana treści: przelicz, zgłoś na zewnątrz. */
  const zmien = useCallback(
    (next: PlotDocument) => {
      setDoc(next);
      onDocumentChange?.(next);
    },
    [onDocumentChange]
  );

  /*
   * Przesunięcie widoku nie idzie przez `onDocumentChange`.
   *
   * Przeciąganie wykresu myszą to dziesiątki zdarzeń na sekundę; zapisywanie
   * każdego z nich do notatki byłoby zapisem bez treści. Widok wraca do zapisu
   * dopiero razem z inną zmianą.
   */
  const zmienWidok = useCallback((viewport: Viewport) => {
    setDoc((prev) => ({ ...prev, viewport }));
  }, []);

  const evaluated = useMemo(() => evaluateDocument(doc, parameters), [doc, parameters]);

  /**
   * Wartości suwaków uzupełnione o to, co policzył dokument.
   *
   * Suwak musi mieć wartość, zanim ktokolwiek go dotknie — inaczej pierwsze
   * przesunięcie skakałoby z zera do miejsca kliknięcia.
   */
  const wartosci = useMemo(
    () => ({ ...evaluated.scope, ...parameters }),
    [evaluated.scope, parameters]
  );

  /** Suwaki do animowania — z wierszy, których parametr jest włączony. */
  const animatedSliders = useMemo<AnimatedSlider[]>(() => {
    const out: AnimatedSlider[] = [];
    for (const row of doc.rows) {
      const name = row.parsed.kind === 'constant' ? row.parsed.name : undefined;
      if (!name || !row.slider || !animating.has(name)) continue;
      out.push({
        name,
        spec: row.slider,
        // Odbicie, nie pętla: przy pętli krzywa skacze z krańca na kraniec,
        // a przy odbiciu wraca tą samą drogą i widać, co parametr robi.
        playback: { mode: 'bounce', speed: (row.slider.max - row.slider.min) / 4 },
        value: wartosci[name] ?? row.slider.min,
      });
    }
    return out;
  }, [doc.rows, animating, wartosci]);

  useSliderAnimation(
    animatedSliders,
    useCallback((values, finished) => {
      setParameters((p) => ({ ...p, ...values }));
      if (finished.length > 0) {
        setAnimating((a) => {
          const next = new Set(a);
          for (const name of finished) next.delete(name);
          return next;
        });
      }
    }, [])
  );

  const issuesByRow = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of evaluated.rows) {
      if (row.issues.length > 0) map.set(row.id, row.issues);
    }
    return map;
  }, [evaluated]);

  /**
   * Powierzchnie próbkowane na siatce.
   *
   * Rozdzielczość jest stała i celowo niewielka: 48 × 48 to 2304 punkty, czyli
   * tyle, ile widać, a każdy ruch suwaka przelicza je od nowa.
   */
  const powierzchnie = useMemo(
    () =>
      doc.rows
        .filter((row) => row.parsed.kind === 'surface' && !row.hidden)
        .map((row) => ({
          id: row.id,
          latex: row.latex,
          grid: sampleSurface(row.parsed.body, doc.viewport, wartosci, 48),
        }))
        .filter((p) => p.grid.values.length > 0),
    [doc.rows, doc.viewport, wartosci]
  );

  return (
    <div
      style={{
        display: 'flex',
        height,
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: panelWidth, flexShrink: 0, borderRight: '1px solid #e2e8f0' }}>
        <PlotRowList
          document={doc}
          issuesByRow={issuesByRow}
          parameters={wartosci}
          onChangeRow={(id, latex) => zmien(updateRow(doc, id, latex))}
          onAddRow={() => zmien(addRow(doc, ''))}
          onRemoveRow={(id) => zmien(removeRow(doc, id))}
          onToggleHidden={(id) =>
            zmien({
              ...doc,
              rows: doc.rows.map((r) => (r.id === id ? { ...r, hidden: !r.hidden } : r)),
            })
          }
          onParameterChange={(name, value) => {
            // Chwyt za suwak zatrzymuje animację — inaczej wartość wyrywałaby
            // się spod palca przy każdej klatce.
            setAnimating((a) => {
              const next = new Set(a);
              next.delete(name);
              return next;
            });
            setParameters((p) => ({ ...p, [name]: value }));
          }}
          animating={animating}
          onToggleAnimation={(name) =>
            setAnimating((a) => {
              const next = new Set(a);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            })
          }
          onSliderSpecChange={(id, spec) =>
            zmien({
              ...doc,
              rows: doc.rows.map((r) => (r.id === id ? { ...r, slider: spec } : r)),
            })
          }
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <PlotView
          document={doc}
          onViewportChange={zmienWidok}
          parameters={wartosci}
          height="100%"
        />

        {/* Powierzchnie mają własną scenę: rzut płaski nie pokazuje siodła ani
            ekstremów, a to jedyny powód, dla którego ktoś pisze `z = f(x, y)`.
            Stoi pod wykresem płaskim, bo dokument bywa mieszany. */}
        {powierzchnie.map((p) => (
          <div key={p.id} style={{ padding: 8 }}>
            <div
              style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontFamily: 'monospace' }}
            >
              {p.latex}
            </div>
            <SurfaceStage grid={p.grid} />
          </div>
        ))}
      </div>

      {evaluated.issues.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: panelWidth + 16,
            fontSize: 12,
            color: '#b91c1c',
          }}
        >
          {evaluated.issues.map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </div>
      )}
    </div>
  );
}
