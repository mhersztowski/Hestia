/**
 * Path3DCanvas — krzywa w przestrzeni, na canvasie 2D.
 *
 * Świadomie **bez Three.js**, mimo że raport wskazuje `core-scene3d`. Orbita i
 * atraktor to krzywe parametryczne: nie mają brył, materiałów ani światła, więc
 * silnik 3D wniósłby wyłącznie zależność i drugi sposób rysowania obok
 * istniejących canvasów. Moment na `core-scene3d` (i na wydzielenie
 * `sci-viewer`) przyjdzie przy pierwszym zjawisku z prawdziwą geometrią —
 * planetami o teksturach, bryłą sztywną, polem na siatce.
 *
 * Rzut jest perspektywiczny, obrót myszą, bez zależności zewnętrznych.
 */
import { useEffect, useRef, useState } from 'react';
import { decimate, maxOf, minOf } from './sampling';

export interface Path3DCanvasProps {
  points: Array<[number, number, number]>;
  labels: [string, string, string];
  width?: number;
  height?: number;
  /** Punkt bieżący — wiąże rysunek z animacją. */
  cursor?: [number, number, number];
}

/** Obrót wokół osi pionowej i poziomej, w radianach. */
interface Camera { yaw: number; pitch: number }

export function Path3DCanvas({ points, labels, width = 320, height = 260, cursor }: Path3DCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<Camera>({ yaw: 0.6, pitch: 0.35 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || points.length < 2) return;
    const drawn = decimate(points, 4000);

    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Środek i promień chmury punktów — kadr dobiera się sam, więc suwak
    // parametru nie wyrzuca krzywej poza ekran.
    const center: [number, number, number] = [0, 1, 2].map((axis) => {
      const values = points.map((p) => p[axis]);
      return (minOf(values) + maxOf(values)) / 2;
    }) as [number, number, number];
    const radius = Math.max(
      ...points.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])),
      1e-9,
    );

    const distance = radius * 3.2;
    const scale = Math.min(width, height) * 0.42;

    const project = (p: [number, number, number]): [number, number, number] => {
      const dx = p[0] - center[0];
      const dy = p[1] - center[1];
      const dz = p[2] - center[2];

      const cosYaw = Math.cos(camera.yaw);
      const sinYaw = Math.sin(camera.yaw);
      const x1 = dx * cosYaw - dy * sinYaw;
      const y1 = dx * sinYaw + dy * cosYaw;

      const cosPitch = Math.cos(camera.pitch);
      const sinPitch = Math.sin(camera.pitch);
      const y2 = y1 * cosPitch - dz * sinPitch;
      const z2 = y1 * sinPitch + dz * cosPitch;

      // Perspektywa: bliższe punkty są większe. Bez niej sześcian osi wygląda
      // jak płaski romb i nie widać, która oś biegnie w głąb.
      const depth = distance + z2;
      const k = (distance * scale) / (Math.max(depth, 1e-6) * radius);
      return [width / 2 + x1 * k, height / 2 - y2 * k, depth];
    };

    // Osie: trzy odcinki od środka, długości promienia chmury.
    const axes: Array<[[number, number, number], string, string]> = [
      [[center[0] + radius, center[1], center[2]], labels[0], '#dc2626'],
      [[center[0], center[1] + radius, center[2]], labels[1], '#059669'],
      [[center[0], center[1], center[2] + radius], labels[2], '#2563eb'],
    ];
    const origin = project(center);
    ctx.font = '10px system-ui, sans-serif';
    for (const [end, label, color] of axes) {
      const p = project(end);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(origin[0], origin[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillText(label, p[0] + 3, p[1]);
    }

    // Krzywą rysujemy odcinkami, bo jaśniejszy odcień dalszych fragmentów
    // zastępuje brak przesłaniania — inaczej pętle atraktora zlewają się w plamę.
    for (let i = 1; i < drawn.length; i += 1) {
      const a = project(drawn[i - 1]);
      const b = project(drawn[i]);
      const depth = (a[2] + b[2]) / 2;
      const near = Math.max(0.15, Math.min(1, (distance * 1.6) / Math.max(depth, 1e-6)));
      ctx.strokeStyle = `rgba(37, 99, 235, ${near})`;
      ctx.lineWidth = 0.6 + near;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }

    if (cursor) {
      const p = project(cursor);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('przeciągnij, aby obrócić', 6, height - 6);
  }, [points, labels, width, height, cursor, camera]);

  return (
    <canvas
      ref={ref}
      style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
      onPointerDown={(e) => {
        dragRef.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        dragRef.current = { x: e.clientX, y: e.clientY };
        setCamera((previous) => ({
          yaw: previous.yaw + dx * 0.01,
          // Ograniczenie pochylenia — za biegunem obraz się przewraca.
          pitch: Math.max(-1.5, Math.min(1.5, previous.pitch + dy * 0.01)),
        }));
      }}
      onPointerUp={() => { dragRef.current = null; }}
    />
  );
}
