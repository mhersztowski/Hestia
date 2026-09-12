/**
 * AngularStage — ramię obrotowe: promień o stałej długości, obracany o kąt.
 *
 * Widok nie wie nic o wahadle. Dostaje kąt i promień, bo tyle wynika z typów:
 * zmienna stanu o wymiarze kąta plus parametr o wymiarze długości. Ta sama
 * animacja obsłuży tarczę, ramię czy koło zamachowe — o wyborze decyduje
 * `suggestViews` w rdzeniu, na podstawie jednostek.
 */
import { useEffect, useRef } from 'react';

export interface AngularStageProps {
  /** Kąt wychylenia w radianach. */
  theta: number;
  /** Długość zawieszenia w metrach. */
  length: number;
  width?: number;
  height?: number;
  /** Ślad ostatnich położeń — pokazuje, gdzie ciężarek już był. */
  trail?: number[];
}

export function AngularStage({ theta, length, width = 240, height = 200, trail = [] }: AngularStageProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pivotX = width / 2;
    const pivotY = 24;
    // Skala dobrana tak, żeby wahadło wypełniało kadr niezależnie od długości —
    // inaczej suwak długości zmieniałby rozmiar rysunku zamiast fizyki.
    const scale = (height - pivotY - 30) / Math.max(length, 1e-6);

    const bobX = pivotX + Math.sin(theta) * length * scale;
    const bobY = pivotY + Math.cos(theta) * length * scale;

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + length * scale);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trail.forEach((angle, index) => {
        const x = pivotX + Math.sin(angle) * length * scale;
        const y = pivotY + Math.cos(angle) * length * scale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(bobX, bobY, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`θ = ${(theta * 180 / Math.PI).toFixed(1)}°`, 6, height - 8);
  }, [theta, length, width, height, trail]);

  return <canvas ref={ref} style={{ display: 'block' }} />;
}
