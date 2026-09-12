/**
 * eksport.ts — wyjmowanie wyników z dokumentu: obraz i dane.
 *
 * Powód: z bazy nie dało się wyjąć niczego. Ani wykresu do sprawozdania, ani
 * liczb do sprawdzenia w Pythonie — a to są dokładnie te dwa scenariusze, po
 * które ktoś sięga, budując interaktywną bazę wiedzy. Dane i tak są w pamięci,
 * więc koszt jest znikomy, a brak był dotkliwy.
 *
 * Podział jak w eksporcie diagramów: czysta część (układanie CSV, nazwa pliku)
 * daje się sprawdzić testem, a zapis na dysk to kilka wywołań przeglądarki bez
 * własnej logiki.
 */

/** Przebiegi w czasie: nazwa → pary `[t, wartość]`. */
export type Series = Record<string, Array<[number, number]>>;

/** Klatka pola na siatce — tak, jak zwraca ją solver PDE. */
export interface FrameLike {
  t: number;
  data: Float32Array | Float64Array | number[];
}

/**
 * Przebiegi jako CSV: pierwsza kolumna to czas, dalej po jednej na wielkość.
 *
 * Wielkości o różnej liczbie próbek **wyrównujemy po czasie**: wielkość liczona
 * rzadziej albo urwana zdarzeniem nie może przesuwać kolumn, bo wtedy plik
 * kłamie o tym, co z czym się wiąże. Brak wartości zostaje pusty — tak czyta go
 * i arkusz, i pandas.
 *
 * Kropka dziesiętna i przecinek jako separator: Python i R czytają to bez
 * ustawień, a arkusz w polskiej lokalizacji poradzi sobie przy imporcie.
 * Odwrotny wybór wymagałby ustawień od każdego odbiorcy.
 */
export function seriesToCsv(series: Series): string {
  const nazwy = Object.keys(series);
  if (nazwy.length === 0) return 't';

  const czasy = [...new Set(nazwy.flatMap((name) => series[name].map(([t]) => t)))]
    .sort((a, b) => a - b);

  const poCzasie = new Map<string, Map<number, number>>();
  for (const name of nazwy) poCzasie.set(name, new Map(series[name]));

  const wiersze = czasy.map((t) => {
    const wartosci = nazwy.map((name) => {
      const wartosc = poCzasie.get(name)!.get(t);
      return wartosc === undefined ? '' : String(wartosc);
    });
    return [String(t), ...wartosci].join(',');
  });

  return [['t', ...nazwy].join(','), ...wiersze].join('\n');
}

/**
 * Klatki pola jako CSV — po jednym wierszu na punkt siatki.
 *
 * Zapis „długi" (`t, ix, iy, wartość`), a nie macierz na klatkę: tak czyta go
 * każde narzędzie do danych bez pisania parsera, a rozmiar siatki jest
 * ograniczony do 128×128, więc plik zostaje w rozsądnych granicach.
 */
export function framesToCsv(frames: FrameLike[], nx: number, ny: number): string {
  const naglowek = 't,ix,iy,wartosc';
  const wiersze: string[] = [];

  for (const frame of frames) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        wiersze.push(`${frame.t},${ix},${iy},${frame.data[iy * nx + ix]}`);
      }
    }
  }

  return [naglowek, ...wiersze].join('\n');
}

const DIAKRYTYKI: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

/** Nazwa pliku z identyfikatora bloku — ma coś znaczyć w katalogu Pobrane. */
export function exportFileName(id: string | undefined, extension: string): string {
  const slug = (id ?? '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (znak) => DIAKRYTYKI[znak] ?? znak)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${slug || 'wynik'}.${extension}`;
}

// --- zapis na dysk -----------------------------------------------------------

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Zapisuje tekst jako plik CSV. */
export function downloadCsv(csv: string, id: string | undefined): void {
  // BOM, bo bez niego Excel czyta polskie znaki w nagłówkach jako krzaki.
  saveBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), exportFileName(id, 'csv'));
}

/**
 * Zapisuje zawartość płótna jako PNG.
 *
 * Skala większa od 1, bo wykres trafia najczęściej do dokumentu, w którym jest
 * powiększany — obraz w rozmiarze ekranowym wygląda tam na rozmyty. Rysujemy
 * na białym tle: przezroczyste znika na ciemnym slajdzie razem z osiami.
 */
export function downloadCanvasPng(canvas: HTMLCanvasElement, id: string | undefined, scale = 2): void {
  const cel = document.createElement('canvas');
  cel.width = Math.round(canvas.width * scale);
  cel.height = Math.round(canvas.height * scale);

  const ctx = cel.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cel.width, cel.height);
  ctx.drawImage(canvas, 0, 0, cel.width, cel.height);

  cel.toBlob((blob) => {
    if (blob) saveBlob(blob, exportFileName(id, 'png'));
  }, 'image/png');
}
