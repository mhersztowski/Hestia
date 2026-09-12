/**
 * XYCanvas — krzywa w płaszczyźnie.
 *
 * Jeden komponent obsługuje dwa widoki, bo to geometrycznie to samo: tor ciała
 * (x, y) i przestrzeń fazowa (zmienna, jej pochodna) różnią się wyłącznie tym,
 * co stoi na osiach. Osobne komponenty powielałyby całą obsługę skali.
 *
 * Proporcje osi są równe tylko dla toru — w przestrzeni fazowej osie mają różne
 * jednostki i wymuszanie proporcji spłaszczyłoby wykres bez powodu.
 */
import { useEffect, useRef } from 'react';
import { decimate, maxOf, minOf } from './sampling';

export interface XYCanvasProps {
  points: Array<[number, number]>;
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
  /** Punkt bieżący — wiąże wykres z animacją. */
  cursor?: [number, number];
  /** Czy jednostki obu osi są te same (tor w przestrzeni). */
  equalAxes?: boolean;
}

const PADDING = { left: 42, right: 12, top: 12, bottom: 24 };

export function XYCanvas({ points, xLabel, yLabel, width = 300, height = 220, cursor, equalAxes }: XYCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || points.length < 2) return;
    const drawn = decimate(points);

    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const xs = drawn.map((p) => p[0]);
    const ys = drawn.map((p) => p[1]);
    let xMin = minOf(xs);
    let xMax = maxOf(xs);
    let yMin = minOf(ys);
    let yMax = maxOf(ys);
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }

    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;

    if (equalAxes) {
      // Ta sama skala na obu osiach — inaczej rzut ukośny wyglądałby na
      // parabolę o zupełnie innej stromości niż w rzeczywistości.
      const scale = Math.min(plotW / (xMax - xMin), plotH / (yMax - yMin));
      const cx = (xMin + xMax) / 2;
      const cy = (yMin + yMax) / 2;
      xMin = cx - plotW / (2 * scale);
      xMax = cx + plotW / (2 * scale);
      yMin = cy - plotH / (2 * scale);
      yMax = cy + plotH / (2 * scale);
    }

    const sx = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const sy = (y: number) => PADDING.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    ctx.font = '10px system-ui, sans-serif';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotH);
    ctx.lineTo(width - PADDING.right, PADDING.top + plotH);
    ctx.stroke();

    // Oś zerowa, gdy mieści się w kadrze — bez niej nie widać, gdzie jest zero.
    if (yMin < 0 && yMax > 0) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(PADDING.left, sy(0));
      ctx.lineTo(width - PADDING.right, sy(0));
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(xLabel, width - PADDING.right - 24, height - 8);
    ctx.save();
    ctx.translate(11, PADDING.top + 12);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.fillText(format(yMax), 4, PADDING.top + 4);
    ctx.fillText(format(yMin), 4, PADDING.top + plotH);
    ctx.fillText(format(xMin), PADDING.left, height - 8);
    ctx.fillText(format(xMax), width - PADDING.right - 46, height - 8);

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    drawn.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(sx(x), sy(y));
      else ctx.lineTo(sx(x), sy(y));
    });
    ctx.stroke();

    if (cursor) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(sx(cursor[0]), sy(cursor[1]), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points, xLabel, yLabel, width, height, cursor, equalAxes]);

  return <canvas ref={ref} style={{ display: 'block' }} />;
}

function format(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1000 || abs < 0.01) return value.toExponential(1);
  return String(Number(value.toPrecision(3)));
}
