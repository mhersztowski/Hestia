/**
 * ink.ts — pismo odręczne jako pociągnięcia, nie jako obraz.
 *
 * To **nie to samo co `strokes.ts`**, choć obie rzeczy nazywają się
 * pociągnięciami. Tamte są plamkami gaussowskimi i kompilują się do wyrażenia
 * — rysunek jest tam warunkiem początkowym pola. Tutaj pociągnięcie jest
 * literą: nie ma z niego czego policzyć, ma je odczytać model wizyjny.
 *
 * Zapisujemy wektory, nie bitmapę, z tych samych powodów co tam:
 *
 *  • rozwiązanie da się odtworzyć w historii w dowolnym rozmiarze,
 *  • da się je rozpoznać **jeszcze raz**, gdy model będzie lepszy — bitmapa
 *    zamroziłaby jakość rozpoznania z dnia zapisu,
 *  • zapis jest tekstem, więc mieści się w dokumencie i w pliku postępów.
 *
 * Nacisk trzymamy, bo niesie grubość kreski — bez niego pismo odtworzone
 * z zapisu wygląda jak druk techniczny i gorzej się rozpoznaje.
 */

export interface InkPoint {
  x: number;
  y: number;
  /** 0–1; mysz nie ma nacisku, więc bywa wartością zastępczą. */
  pressure: number;
}

export interface InkStroke {
  /** Bazowa grubość; nacisk ją skaluje przy rysowaniu. */
  width: number;
  points: InkPoint[];
}

/** Zaokrąglenie zapisu — poniżej dziesiątych piksela pismo się nie zmienia. */
function krotko(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/**
 * Zapis do jednej linii.
 *
 * Format: pociągnięcia rozdzielone `;`, w każdym `szerokość:` i punkty po
 * przecinku jako `x/y/nacisk`. Zwięzły, bo rozwiązanie zadania to bywa
 * kilkaset punktów, a plik postępów wędruje między telefonem a komputerem.
 */
export function serializeInk(strokes: InkStroke[]): string {
  return strokes
    .filter((s) => s.points.length > 0)
    .map((s) => `${krotko(s.width)}:${s.points
      .map((p) => `${krotko(p.x)}/${krotko(p.y)}/${Math.round(p.pressure * 100) / 100}`)
      .join(',')}`)
    .join(';');
}

/**
 * Odczyt zapisu.
 *
 * Uszkodzony fragment jest **pomijany, a nie rzucany** — historia rozwiązań ma
 * się otworzyć nawet wtedy, gdy jedno pociągnięcie zapisało się źle. Utrata
 * kreski jest mniejszą szkodą niż utrata dostępu do całego rozwiązania.
 */
export function parseInk(text: string): InkStroke[] {
  const strokes: InkStroke[] = [];
  for (const kawalek of text.split(';')) {
    if (!kawalek.trim()) continue;
    const [surowaSzerokosc, surowePunkty] = kawalek.split(':');
    const width = Number.parseFloat(surowaSzerokosc);
    if (!Number.isFinite(width) || !surowePunkty) continue;

    const points: InkPoint[] = [];
    for (const p of surowePunkty.split(',')) {
      const [x, y, pressure] = p.split('/').map(Number.parseFloat);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y, pressure: Number.isFinite(pressure) ? pressure : 0.5 });
    }
    if (points.length) strokes.push({ width, points });
  }
  return strokes;
}

/** Czy w zapisie cokolwiek jest — pusty rysunek to nie to samo co brak zapisu. */
export function inkIsEmpty(strokes: InkStroke[]): boolean {
  return strokes.every((s) => s.points.length === 0);
}
