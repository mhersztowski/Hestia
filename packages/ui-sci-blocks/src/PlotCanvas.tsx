/**
 * PlotCanvas — wykres przebiegu na canvasie 2D.
 *
 * Canvas, nie SVG: przebieg ma kilkaset punktów i przerysowuje się przy każdym
 * ruchu suwaka, a wtedy tyle węzłów DOM kosztuje więcej niż samo rysowanie.
 *
 * Świadomie bez biblioteki wykresów — to jest osie, siatka i łamana. Moment na
 * Observable Plot przyjdzie przy pierwszym wykresie, którego nie da się tak
 * narysować (skale logarytmiczne, legendy, interakcja), nie wcześniej.
 */
import { useEffect, useRef } from 'react';
import { decimate, maxOf, minOf } from './sampling';

export interface PlotSeries {
  label: string;
  points: Array<[number, number]>;
  color: string;
}

export interface PlotCanvasProps {
  series: PlotSeries[];
  width?: number;
  height?: number;
  xLabel?: string;
  /** Pionowa kreska „teraz" — wiąże wykres z animacją. */
  marker?: number;
}

const PADDING = { left: 44, right: 10, top: 10, bottom: 22 };

export function PlotCanvas({ series, width = 460, height = 170, xLabel = 't [s]', marker }: PlotCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Rysujemy w pikselach urządzenia — bez tego linie są rozmyte na ekranach
    // o wysokiej gęstości, co przy cienkim przebiegu widać od razu.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Rysujemy przerzedzone przebiegi — zakres liczymy z nich samych, żeby oś
    // odpowiadała temu, co widać.
    const drawn = series.map((s) => ({ ...s, points: decimate(s.points) }));
    const points = drawn.flatMap((s) => s.points);
    if (!points.length) return;

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const xMin = minOf(xs);
    const xMax = maxOf(xs);
    let yMin = minOf(ys);
    let yMax = maxOf(ys);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    // Zapas, żeby szczyty nie dotykały krawędzi ramki.
    const margin = (yMax - yMin) * 0.08;
    yMin -= margin;
    yMax += margin;

    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    const sx = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const sy = (y: number) => PADDING.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.font = '10px system-ui, sans-serif';
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#94a3b8';
    ctx.lineWidth = 1;

    // Siatka pozioma z podpisami wartości — bez niej wykres nie mówi „ile".
    for (let i = 0; i <= 4; i += 1) {
      const value = yMin + ((yMax - yMin) * i) / 4;
      const y = sy(value);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();
      ctx.fillText(formatTick(value), 4, y + 3);
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotH);
    ctx.lineTo(width - PADDING.right, PADDING.top + plotH);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(xLabel, width - PADDING.right - 28, height - 6);
    ctx.fillText(formatTick(xMin), PADDING.left, height - 6);
    ctx.fillText(formatTick(xMax), width - PADDING.right - 52, height - 6);

    for (const s of drawn) {
      if (s.points.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      s.points.forEach(([x, y], index) => {
        const px = sx(x);
        const py = sy(y);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    if (marker !== undefined && marker >= xMin && marker <= xMax) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(marker), PADDING.top);
      ctx.lineTo(sx(marker), PADDING.top + plotH);
      ctx.stroke();
    }

    // Legenda tylko przy więcej niż jednym przebiegu — przy jednym byłaby szumem.
    if (series.length > 1) {
      let x = PADDING.left + 6;
      for (const s of series) {
        ctx.fillStyle = s.color;
        ctx.fillRect(x, PADDING.top + 2, 8, 3);
        ctx.fillStyle = '#475569';
        ctx.fillText(s.label, x + 12, PADDING.top + 8);
        x += 20 + ctx.measureText(s.label).width;
      }
    }
  }, [series, width, height, xLabel, marker]);

  return <canvas ref={ref} style={{ display: 'block' }} />;
}

/** Podpis osi: krótko, ale bez gubienia rzędu wielkości. */
function formatTick(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1000 || abs < 0.01) return value.toExponential(1);
  return String(Number(value.toPrecision(3)));
}
