/**
 * InkCanvas — pisanie rysikiem, z wynikiem jako tekst albo LaTeX.
 *
 * Pióro **nie zostawia bitmapy**: zostawia listę pociągnięć. Obraz powstaje
 * dopiero na moment zapytania do modelu wizyjnego i zaraz znika — dzięki temu
 * rozwiązanie da się odtworzyć w historii, przerysować w innym rozmiarze
 * i rozpoznać jeszcze raz, gdy model będzie lepszy.
 *
 * Rozpoznawanie wchodzi **portem od hosta** (`recognize`), a nie zależnością
 * pakietu — tak samo jak `workerFactory` i `resolveRef`. `sci-blocks` nie ma
 * prawa wiedzieć, czy po drugiej stronie jest Claude, usługa czy atrapa
 * w teście.
 *
 * Stan rysowania siedzi w `ref`, nie w `useState`: rysik melduje położenie
 * szybciej, niż React zdąży przerysować, a przerysowanie na każde zdarzenie
 * pointera gubi punkty. Ta sama decyzja co w `StrokeCanvas`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { type InkStroke, serializeInk } from '@hestia/core-sci';

/** Co ma powstać z pisma. */
export type InkMode = 'latex' | 'text';

/** Port hosta: obraz → zapis. Brak = rozpoznawania nie ma, samo rysowanie. */
export type InkRecognizer = (image: Blob, mode: InkMode) => Promise<string>;

export interface InkCanvasProps {
  mode: InkMode;
  recognize?: InkRecognizer;
  /** Rozpoznany zapis trafia tutaj — host decyduje, co z nim zrobić. */
  onRecognized?: (value: string) => void;
  /** Pociągnięcia do zapisania razem z wynikiem; wołane przy każdej zmianie. */
  onStrokesChange?: (strokes: InkStroke[], serialized: string) => void;
  /** Pociągnięcia do odtworzenia — tryb podglądu historii. */
  value?: InkStroke[];
  /** Podgląd: bez rysowania i bez przycisków. */
  readOnly?: boolean;
  height?: number;
}

const PIORO = '#0f172a';

/** Rysuje pociągnięcia na kanwie. Grubość idzie z nacisku, gdy rysik go podaje. */
function przerysuj(canvas: HTMLCanvasElement, strokes: InkStroke[], biale: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  // Tło jest **białe, nie przezroczyste** — PNG z alfą model widzi jako czarne
  // tło z czarnym pismem, czyli nie widzi nic.
  ctx.fillStyle = biale ? '#ffffff' : 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PIORO;

  for (const stroke of strokes) {
    if (stroke.points.length < 2) {
      const p = stroke.points[0];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, stroke.width * (p.pressure || 0.5)), 0, Math.PI * 2);
      ctx.fillStyle = PIORO;
      ctx.fill();
      continue;
    }
    for (let i = 1; i < stroke.points.length; i += 1) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.6, stroke.width * ((a.pressure + b.pressure) / 2 || 0.5) * 2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function InkCanvas({
  mode, recognize, onRecognized, onStrokesChange, value, readOnly, height = 160,
}: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<InkStroke[]>(value ?? []);
  const biezaceRef = useRef<InkStroke | null>(null);
  const [pusto, setPusto] = useState((value ?? []).length === 0);
  const [pracuje, setPracuje] = useState(false);
  const [blad, setBlad] = useState<string>();

  useEffect(() => {
    if (value) {
      strokesRef.current = value;
      setPusto(value.length === 0);
    }
    const canvas = canvasRef.current;
    if (canvas) przerysuj(canvas, strokesRef.current, false);
  }, [value]);

  const punkt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      // Mysz nie ma nacisku i melduje 0 — bierzemy wtedy średni, żeby kreska
      // nie znikła.
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const start = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    // Przechwycenie wskaźnika jest **wygodą, nie warunkiem**: trzyma pióro przy
    // kanwie, gdy ręka wyjedzie poza nią. Nie każde środowisko je ma (jsdom nie
    // ma), a brak przechwycenia nie może wywracać pisania.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    biezaceRef.current = { width: 1.6, points: [punkt(e)] };
    strokesRef.current = [...strokesRef.current, biezaceRef.current];
    setPusto(false);
    setBlad(undefined);
  };

  const rysuj = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !biezaceRef.current) return;
    biezaceRef.current.points.push(punkt(e));
    const canvas = canvasRef.current;
    if (canvas) przerysuj(canvas, strokesRef.current, false);
  };

  const koniec = () => {
    if (!biezaceRef.current) return;
    biezaceRef.current = null;
    onStrokesChange?.(strokesRef.current, serializeInk(strokesRef.current));
  };

  const wyczysc = useCallback(() => {
    strokesRef.current = [];
    biezaceRef.current = null;
    setPusto(true);
    setBlad(undefined);
    const canvas = canvasRef.current;
    if (canvas) przerysuj(canvas, [], false);
    onStrokesChange?.([], serializeInk([]));
  }, [onStrokesChange]);

  const rozpoznaj = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !recognize) return;
    setPracuje(true);
    setBlad(undefined);
    try {
      // Osobna kanwa z **białym tłem** — ta na ekranie jest przezroczysta,
      // a przezroczystość w PNG czyta się jako czerń.
      const doWyslania = document.createElement('canvas');
      doWyslania.width = canvas.width;
      doWyslania.height = canvas.height;
      przerysuj(doWyslania, strokesRef.current, true);
      const blob = await new Promise<Blob | null>((res) => doWyslania.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Nie udało się przygotować obrazu.');

      // Rozpoznanie **przed** wywołaniem zwrotnym, w osobnym kroku.
      // `onRecognized?.(await recognize(...))` wygląda równoważnie, ale nie jest:
      // wywołanie opcjonalne pomija ewaluację argumentów, więc gdy host nie poda
      // `onRecognized`, model nie zostałby w ogóle zapytany, a przycisk mrugnąłby
      // i wrócił do stanu spoczynku bez śladu.
      const rozpoznany = await recognize(blob, mode);
      onRecognized?.(rozpoznany);
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e));
    } finally {
      setPracuje(false);
    }
  }, [recognize, mode, onRecognized]);

  const przycisk: CSSProperties = {
    fontSize: 12, padding: '4px 10px', border: '1px solid #cbd5e1',
    borderRadius: 6, background: '#fff', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={height * 2}
        onPointerDown={start}
        onPointerMove={rysuj}
        onPointerUp={koniec}
        onPointerLeave={koniec}
        style={{
          width: '100%', height, background: '#fff',
          border: '1px solid #cbd5e1', borderRadius: 6,
          // Bez tego przeciągnięcie rysikiem przewija stronę zamiast pisać.
          touchAction: 'none', cursor: readOnly ? 'default' : 'crosshair',
        }}
      />

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={przycisk} onClick={wyczysc} disabled={pusto}>
            wyczyść
          </button>
          {recognize && (
            <button type="button" style={przycisk} onClick={rozpoznaj} disabled={pusto || pracuje}>
              {pracuje ? 'rozpoznaję…' : mode === 'latex' ? 'rozpoznaj wzór' : 'rozpoznaj tekst'}
            </button>
          )}
          {!recognize && (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              rozpoznawanie niedostępne — brak modelu
            </span>
          )}
          {blad && <span style={{ fontSize: 11, color: '#b91c1c' }}>{blad}</span>}
        </div>
      )}
    </div>
  );
}
