/**
 * PlotView — dokument wykresu na płótnie.
 *
 * Spina trzy warstwy z `sci-core`: liczenie dokumentu (`evaluateDocument`),
 * próbkowanie krzywych (`sampleFunction`) i widok (`PlotStage`). Sam nie
 * zawiera matematyki — jest miejscem, w którym wynik liczenia staje się
 * ścieżką na płótnie.
 *
 * ## Kiedy co się przelicza
 *
 * Liczenie dokumentu zależy od wyrażeń i wartości suwaków; próbkowanie —
 * dodatkowo od widoku. Rozdzielone, bo przy przesuwaniu wykresu myszą wyrażenia
 * się nie zmieniają: rekompilacja przy każdej klatce przeciągania kosztowałaby
 * kilkanaście milisekund na krzywą i zamieniłaby płynny ruch w skoki.
 */

import { useMemo } from 'react';
import {
  evaluateDocument,
  marchImplicit,
  sampleFunction,
  worldToScreen,
  type PlotDocument,
  type Size,
  type Viewport,
} from '@hestia/core-sci';
import { PlotStage } from './PlotStage';

export interface PlotViewProps {
  document: PlotDocument;
  onViewportChange: (next: Viewport) => void;
  /** Wartości z suwaków; mają pierwszeństwo przed zapisem w wierszu. */
  parameters?: Record<string, number>;
  height?: number | string;
}

/** Wzór linii przerywanej dla danego stylu; pusty = linia ciągła. */
function dashPattern(dash: 'solid' | 'dashed' | 'dotted', width: number): number[] {
  if (dash === 'dashed') return [width * 3, width * 2.5];
  if (dash === 'dotted') return [width * 0.1, width * 2];
  return [];
}

export function PlotView({ document, onViewportChange, parameters, height }: PlotViewProps) {
  // Liczenie zależy od wyrażeń i suwaków — nie od widoku. Przeciąganie wykresu
  // nie może uruchamiać kompilacji.
  const evaluated = useMemo(() => evaluateDocument(document, parameters), [document, parameters]);

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, viewport: Viewport, size: Size) => {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (const row of document.rows) {
        if (row.hidden) continue;
        const wynik = evaluated.rows.find((r) => r.id === row.id);
        if (!wynik) continue;

        ctx.strokeStyle = row.style.color;
        ctx.fillStyle = row.style.color;
        ctx.lineWidth = row.style.width;
        ctx.setLineDash(dashPattern(row.style.dash, row.style.width));

        if (wynik.point) {
          const p = worldToScreen(viewport, size, wynik.point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, row.style.width * 2.2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        /*
         * Krzywa uwikłana i nierówność idą inną drogą: nie da się ich przebiec
         * po osi, więc dzielimy okno na komórki i szukamy zmiany znaku
         * (`marchImplicit`). Rozdzielczość wiążemy z szerokością płótna —
         * na małym bloku w notatce nie ma sensu liczyć siatki jak na całej
         * stronie.
         */
        if (wynik.fn2) {
          const wynikSiatki = marchImplicit(wynik.fn2, viewport, {
            resolution: Math.max(24, Math.min(64, Math.round(size.width / 12))),
            fill: wynik.fill,
          });

          if (wynik.fill) {
            ctx.globalAlpha = 0.25;
            for (const komorka of wynikSiatki.fills) {
              const a = worldToScreen(viewport, size, { x: komorka.x, y: komorka.y });
              const b = worldToScreen(viewport, size, {
                x: komorka.x + komorka.width,
                y: komorka.y + komorka.height,
              });
              // Pół piksela zapasu: sąsiednie komórki rysowane osobno zostawiają
              // między sobą jasne szpary, które układają się w widoczną kratę.
              ctx.fillRect(
                Math.min(a.x, b.x) - 0.5,
                Math.min(a.y, b.y) - 0.5,
                Math.abs(b.x - a.x) + 1,
                Math.abs(b.y - a.y) + 1
              );
            }
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          for (const [p, q] of wynikSiatki.segments) {
            const a = worldToScreen(viewport, size, { x: p[0], y: p[1] });
            const b = worldToScreen(viewport, size, { x: q[0], y: q[1] });
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
          continue;
        }

        if (!wynik.fn) continue;

        /*
         * Krzywa `x = g(y)` jest próbkowana po osi y, więc zakresem jest
         * wysokość widoku, a współrzędne przy rysowaniu wchodzą odwrotnie.
         * Bez tego prosta pionowa `x = 3` w ogóle by nie powstała — po osi x
         * ma tylko jedną wartość.
         */
        const poY = wynik.kind === 'explicit-x';
        const segments = sampleFunction(wynik.fn, {
          xMin: poY ? viewport.yMin : viewport.xMin,
          xMax: poY ? viewport.yMax : viewport.xMax,
          // Zakres „przeciwnej" osi służy wykrywaniu asymptot, więc też się
          // zamienia.
          yMin: poY ? viewport.xMin : viewport.yMin,
          yMax: poY ? viewport.xMax : viewport.yMax,
          initialSamples: Math.max(64, Math.round(size.width / 4)),
        });

        for (const segment of segments) {
          ctx.beginPath();
          segment.points.forEach(([a, b], i) => {
            const p = worldToScreen(viewport, size, poY ? { x: b, y: a } : { x: a, y: b });
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
        }
      }

      ctx.setLineDash([]);
    },
    [document.rows, evaluated]
  );

  return (
    <PlotStage
      viewport={document.viewport}
      onViewportChange={onViewportChange}
      settings={document.settings}
      onDraw={draw}
      height={height}
    />
  );
}
