/**
 * HeatmapCanvas — pole na siatce jako mapa kolorów.
 *
 * Rysujemy przez `ImageData` w rozdzielczości **siatki**, a nie płótna, i
 * pozwalamy przeglądarce przeskalować obraz. Rysowanie prostokąt po prostokącie
 * przy 128×128 to 16 tysięcy wywołań `fillRect` na klatkę; kopia bufora to
 * jedno wywołanie.
 *
 * Skala kolorów jest wspólna dla całego przebiegu, nie dla klatki. Skalowanie
 * per klatka wygląda efektowniej, ale kłamie: stygnące pole miałoby zawsze ten
 * sam najcieplejszy kolor i nie byłoby widać, że stygnie.
 */
import { useEffect, useRef } from 'react';

export interface HeatmapCanvasProps {
  /**
   * Uchwyt do płótna dla hosta — po to, żeby dało się pobrać obraz.
   *
   * Callback, a nie `forwardRef`: blok pola potrzebuje płótna tylko przy
   * kliknięciu „PNG", a nie w każdym renderze.
   */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  data: Float32Array;
  nx: number;
  ny: number;
  min: number;
  max: number;
  width?: number;
  height?: number;
  /** Podpis osi wartości — zwykle nazwa pola z jednostką. */
  label?: string;
}

/**
 * Paleta od zimnej do ciepłej, przez neutralną biel w środku zakresu.
 *
 * Wybór ma znaczenie merytoryczne: pola falowe zmieniają znak, więc zero musi
 * być rozpoznawalne. Paleta jednokierunkowa (czarny→biały) chowa węzły fali.
 */
function kolor(wartosc: number, out: Uint8ClampedArray, offset: number): void {
  // −1 → niebieski, 0 → biały, +1 → czerwony.
  const t = Math.max(-1, Math.min(1, wartosc));
  if (t >= 0) {
    out[offset] = 255;
    out[offset + 1] = Math.round(255 * (1 - t * 0.85));
    out[offset + 2] = Math.round(255 * (1 - t));
  } else {
    out[offset] = Math.round(255 * (1 + t));
    out[offset + 1] = Math.round(255 * (1 + t * 0.85));
    out[offset + 2] = 255;
  }
  out[offset + 3] = 255;
}

export function HeatmapCanvas({
  data, nx, ny, min, max, width = 320, height = 320, label, onCanvas,
}: HeatmapCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const obraz = ctx.createImageData(nx, ny);
    // Zakres symetryczny wokół zera, gdy pole zmienia znak — inaczej biel
    // wypadłaby w przypadkowym miejscu i przestałaby znaczyć zero.
    const zasieg = min < 0 ? Math.max(Math.abs(min), Math.abs(max)) : max - min;
    const skala = zasieg > 0 ? zasieg : 1;

    for (let i = 0; i < data.length; i += 1) {
      const znormalizowana = min < 0 ? data[i] / skala : (data[i] - min) / skala;
      kolor(znormalizowana, obraz.data, i * 4);
    }

    // Bufor w rozdzielczości siatki trafia najpierw na płótno pomocnicze, żeby
    // przeskalowanie zrobiła przeglądarka — `putImageData` skalowania nie zna.
    const pomocnicze = document.createElement('canvas');
    pomocnicze.width = nx;
    pomocnicze.height = ny;
    pomocnicze.getContext('2d')?.putImageData(obraz, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Wygładzanie włączone: siatka jest próbką pola ciągłego, więc widoczne
    // kwadraty sugerowałyby strukturę, której w zjawisku nie ma.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pomocnicze, 0, 0, canvas.width, canvas.height);
  }, [data, nx, ny, min, max]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <canvas
        ref={(el) => { ref.current = el; onCanvas?.(el); }}
        width={width}
        height={height}
        style={{ width, height, borderRadius: 4, border: '1px solid #e2e8f0', display: 'block' }}
      />
      {label && (
        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{label}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {min.toPrecision(3)} … {max.toPrecision(3)}
          </span>
        </div>
      )}
    </div>
  );
}
