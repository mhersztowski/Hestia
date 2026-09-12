/**
 * PlotStage — płótno wykresu: siatka, osie, przesuwanie i skalowanie.
 *
 * Osobny komponent, a nie rozbudowa `PlotCanvas`. Tamto płótno rysuje wynik
 * symulacji: stały zakres, oś opisana `t [s]`, żadnej interakcji. Dołożenie do
 * niego trybu interaktywnego oznaczałoby, że każda zmiana w kalkulatorze
 * dotyka wykresów w wykładach fizyki — a te mają wyglądać tak samo za rok.
 *
 * Cała arytmetyka widoku siedzi w `sci-core/plot/viewport`. Tutaj zostaje
 * rysowanie i zdarzenia wskaźnika, czyli to, czego bez przeglądarki nie da się
 * sprawdzić.
 *
 * ## Dlaczego proporcje są wymuszone
 *
 * Przy jednakowej skali w obu osiach okrąg wygląda jak okrąg. Zakres y jest
 * więc pochodną zakresu x i kształtu płótna — dokładnie tak, jak w Desmosie,
 * gdzie przy −10 ≤ x ≤ 10 na telefonie stoi −16,49 ≤ y ≤ 16,49.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  fitAspect, minorStep, niceTicks, panByPixels, screenToWorld, worldToScreen, zoomAt,
  type Point, type Size, type Viewport,
} from '@hestia/core-sci';

export interface PlotStageSettings {
  grid: boolean;
  minorGrid: boolean;
  axisNumbers: boolean;
  arrows: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  xLabel: string;
  yLabel: string;
}

export interface PlotStageProps {
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  settings: PlotStageSettings;
  /** Rysowanie treści nad siatką — krzywe dojdą w kolejnym etapie. */
  onDraw?: (ctx: CanvasRenderingContext2D, viewport: Viewport, size: Size) => void;
  height?: number | string;
}

/** Ile podziałek chcemy widzieć na osi; z tego bierze się krok. */
const TICKS_TARGET = 8;

const COLORS = {
  background: '#ffffff',
  minor: '#e8e8e8',
  major: '#c8c8c8',
  axis: '#000000',
  text: '#4a4a4a',
};

/** Etykieta podziałki bez śmieci z arytmetyki i bez wykładników dla zwykłych liczb. */
function formatTick(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-4) return value.toExponential(1).replace('e', '·10^');
  // `toPrecision` zostawiłoby „5.00"; liczba na osi ma być krótka.
  return String(Number(value.toPrecision(12)));
}

export function PlotStage({ viewport, onViewportChange, settings, onDraw, height = 420 }: PlotStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  /*
   * Stan przeciągania w ref, nie w stanie Reacta.
   *
   * Wskaźnik melduje położenie częściej, niż React zdąży przerenderować; przy
   * trzymaniu tego w stanie każde zdarzenie widziałoby nieaktualny początek
   * przeciągnięcia i wykres skakałby zamiast płynąć. Ten sam powód, dla którego
   * `StrokeCanvas` trzyma pociągnięcie w ref.
   */
  const dragRef = useRef<{ pointerId: number; last: Point } | undefined>(undefined);

  // Rozmiar płótna z obserwatora, a nie z propsów: blok w notatce zmienia
  // szerokość razem z oknem, a proporcje osi zależą od kształtu płótna.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const update = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Zmiana kształtu płótna przelicza zakres y, żeby jednostka została kwadratem.
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const dopasowany = fitAspect(viewport, size, 'x');
    if (Math.abs(dopasowany.yMin - viewport.yMin) > 1e-9 || Math.abs(dopasowany.yMax - viewport.yMax) > 1e-9) {
      onViewportChange(dopasowany);
    }
  }, [size.width, size.height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, size.width, size.height);

    const xTicks = niceTicks(viewport.xMin, viewport.xMax, TICKS_TARGET);
    const yTicks = niceTicks(viewport.yMin, viewport.yMax, TICKS_TARGET);
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;

    const pionowa = (worldX: number, color: string, width: number) => {
      const { x } = worldToScreen(viewport, size, { x: worldX, y: 0 });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      // Pół piksela: linia o grubości 1 narysowana na całkowitej współrzędnej
      // rozmywa się na dwa rzędy pikseli i siatka wygląda na szarą.
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, size.height);
      ctx.stroke();
    };
    const pozioma = (worldY: number, color: string, width: number) => {
      const { y } = worldToScreen(viewport, size, { x: 0, y: worldY });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(size.width, Math.round(y) + 0.5);
      ctx.stroke();
    };

    if (settings.grid && settings.minorGrid) {
      const mx = minorStep(xStep);
      const my = minorStep(yStep);
      for (let v = Math.ceil(viewport.xMin / mx) * mx; v <= viewport.xMax; v += mx) pionowa(v, COLORS.minor, 1);
      for (let v = Math.ceil(viewport.yMin / my) * my; v <= viewport.yMax; v += my) pozioma(v, COLORS.minor, 1);
    }

    if (settings.grid) {
      for (const v of xTicks) pionowa(v, COLORS.major, 1);
      for (const v of yTicks) pozioma(v, COLORS.major, 1);
    }

    // Osie rysujemy po siatce, żeby leżały na wierzchu.
    const origin = worldToScreen(viewport, size, { x: 0, y: 0 });
    if (settings.showXAxis) pozioma(0, COLORS.axis, 1.4);
    if (settings.showYAxis) pionowa(0, COLORS.axis, 1.4);

    if (settings.arrows) {
      ctx.fillStyle = COLORS.axis;
      const grot = 6;
      if (settings.showXAxis) {
        ctx.beginPath();
        ctx.moveTo(size.width, origin.y);
        ctx.lineTo(size.width - grot * 1.6, origin.y - grot);
        ctx.lineTo(size.width - grot * 1.6, origin.y + grot);
        ctx.fill();
      }
      if (settings.showYAxis) {
        ctx.beginPath();
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x - grot, grot * 1.6);
        ctx.lineTo(origin.x + grot, grot * 1.6);
        ctx.fill();
      }
    }

    if (settings.axisNumbers) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '12px system-ui, sans-serif';

      /*
       * Etykiety przy osi, ale nie poza płótnem.
       *
       * Po odjechaniu widoku oś wychodzi poza ekran; bez dociśnięcia opisy
       * znikałyby razem z nią i wykres zostawałby bez skali. Desmos w tej
       * sytuacji przykleja liczby do krawędzi.
       */
      const labelY = Math.min(Math.max(origin.y, 14), size.height - 6);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of xTicks) {
        if (v === 0) continue;
        const { x } = worldToScreen(viewport, size, { x: v, y: 0 });
        ctx.fillText(formatTick(v), x, labelY + 4);
      }

      const labelX = Math.min(Math.max(origin.x, 6), size.width - 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of yTicks) {
        if (v === 0) continue;
        const { y } = worldToScreen(viewport, size, { x: 0, y: v });
        ctx.fillText(formatTick(v), labelX - 6, y);
      }

      if (settings.showXAxis && settings.showYAxis) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('0', labelX - 6, labelY + 4);
      }
    }

    if (settings.xLabel) {
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(settings.xLabel, size.width - 8, Math.min(origin.y - 6, size.height - 8));
    }
    if (settings.yLabel) {
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(settings.yLabel, Math.max(origin.x + 8, 8), 8);
    }

    onDraw?.(ctx, viewport, size);
  }, [viewport, size, settings, onDraw]);

  useEffect(draw, [draw]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.last.x;
    const dy = e.clientY - drag.last.y;
    drag.last = { x: e.clientX, y: e.clientY };
    onViewportChange(panByPixels(viewport, size, dx, dy));
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = undefined;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    // Krok proporcjonalny do obrotu, nie skokowy: przy gładkim kółku i na
    // gładziku skok co „ząbek" daje szarpanie.
    const factor = Math.exp(e.deltaY * 0.0015);
    // Shift skaluje samą oś y — przydaje się przy funkcjach o bardzo różnych
    // rzędach wielkości.
    const axes = e.shiftKey ? { x: false, y: true } : { x: true, y: true };
    onViewportChange(zoomAt(viewport, size, factor, anchor, axes));
  };

  return (
    <div
      ref={boxRef}
      style={{ position: 'relative', width: '100%', height, touchAction: 'none', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab' }}
      />
    </div>
  );
}

/** Współrzędne świata pod wskaźnikiem — do odczytu położenia kursora. */
export function pointerWorld(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
  viewport: Viewport,
): Point {
  const rect = element.getBoundingClientRect();
  return screenToWorld(
    viewport,
    { width: rect.width, height: rect.height },
    { x: event.clientX - rect.left, y: event.clientY - rect.top },
  );
}
