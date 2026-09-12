/**
 * textureData.ts — obraz tekstury wyjęty z pamięci do postaci, którą da się zapisać.
 *
 * Plik `.glb` niesie teksturę **w sobie**: loader rozpakowuje ją do obiektu
 * w pamięci i tyle. Model sceny zna dwa sposoby wskazania tekstury — ścieżkę
 * w VFS i gotowy adres — a żaden z nich nie opisuje obrazu, który istnieje
 * wyłącznie w pamięci karty graficznej. Bez przepisania go na trwałe tekstura
 * znika w chwili zapisania sceny, a do tego czasu nie ma czym jej nazwać.
 *
 * Dlatego przy imporcie przerysowujemy obraz na płótno i zapisujemy jako
 * `data:`. Scena rośnie — i to jest cena za to, żeby plik był samowystarczalny,
 * tak jak samowystarczalny był `.glb`, z którego przyszedł.
 *
 * Rysownik jest wstrzykiwany, bo `document.createElement('canvas')` nie istnieje
 * poza przeglądarką; dzięki temu logika daje się sprawdzić testem.
 */

/** Cokolwiek, co da się narysować na płótnie — obraz, bitmapa, inne płótno. */
export interface ZrodloObrazu {
  width?: number;
  height?: number;
}

export interface Rysownik {
  /** Zwraca `data:`-URL obrazu albo `null`, gdy nie da się go przerysować. */
  narysuj(zrodlo: ZrodloObrazu, szerokosc: number, wysokosc: number, format: string): string | null;
}

/** Rysownik oparty na płótnie przeglądarki. */
export const rysownikPrzegladarki: Rysownik = {
  narysuj(zrodlo, szerokosc, wysokosc, format) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = szerokosc;
    canvas.height = wysokosc;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(zrodlo as CanvasImageSource, 0, 0, szerokosc, wysokosc);
      return canvas.toDataURL(format);
    } catch {
      // Obraz z innego źródła „brudzi" płótno i `toDataURL` rzuca. Przy imporcie
      // z pliku to się nie zdarza, ale przy teksturze spod adresu — owszem.
      return null;
    }
  },
};

export interface OpcjeTekstury {
  /** Dłuższy bok, do którego skalujemy. Domyślnie bez zmiany rozmiaru. */
  maxRozmiar?: number;
  format?: string;
  rysownik?: Rysownik;
}

export interface WynikTekstury {
  dataUrl: string | null;
  /** Rozmiar zapisu w kilobajtach — do decyzji, czy ostrzegać o wadze sceny. */
  kb: number;
  powod?: string;
}

/**
 * Zamienia obraz tekstury na `data:`-URL.
 *
 * Duże tekstury skalujemy: mapa 4096×4096 w base64 to kilkanaście megabajtów
 * w pliku sceny, a scena z kilkoma takimi przestaje się otwierać. Skalowanie
 * jest stratne i dlatego domyślnie **wyłączone** — decyzję podejmuje wołający,
 * bo tylko on wie, czy to ilustracja, czy materiał produkcyjny.
 */
export function dataUrlZObrazu(
  obraz: ZrodloObrazu | null | undefined,
  opcje: OpcjeTekstury = {},
): WynikTekstury {
  if (!obraz) return { dataUrl: null, kb: 0, powod: 'Tekstura nie ma obrazu.' };

  const szer = obraz.width ?? 0;
  const wys = obraz.height ?? 0;
  if (!szer || !wys) {
    return { dataUrl: null, kb: 0, powod: 'Obraz tekstury nie ma wymiarów.' };
  }

  const skala = opcje.maxRozmiar ? Math.min(1, opcje.maxRozmiar / Math.max(szer, wys)) : 1;
  const doceloweSzer = Math.max(1, Math.round(szer * skala));
  const doceloweWys = Math.max(1, Math.round(wys * skala));

  const rysownik = opcje.rysownik ?? rysownikPrzegladarki;
  const dataUrl = rysownik.narysuj(obraz, doceloweSzer, doceloweWys, opcje.format ?? 'image/png');

  if (!dataUrl) {
    return { dataUrl: null, kb: 0, powod: 'Nie udało się przerysować obrazu tekstury.' };
  }

  // Base64 niesie 3 bajty na 4 znaki — stąd przelicznik.
  const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
  return { dataUrl, kb };
}
