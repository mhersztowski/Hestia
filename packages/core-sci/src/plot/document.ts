/**
 * document.ts — model dokumentu wykresu i jego zapis.
 *
 * Dokument to lista wierszy plus widok i ustawienia osi. Trafia do bloku
 * markdown jako JSON, więc rządzą nim dwie zasady:
 *
 *  • **W pliku leży wyrażenie, nie wynik jego rozpoznania.** Rodzaj wiersza
 *    (`explicit-y`, `constant`, …) jest pochodną zapisu i odtwarza się przy
 *    wczytaniu. Gdyby leżał obok, dokument trzymałby dwie prawdy, które przy
 *    pierwszej zmianie parsera przestają się zgadzać.
 *  • **Wartości domyślne nie są zapisywane.** Inaczej każdy wykres wnosiłby do
 *    repozytorium trzydzieści linii, z których żadna nic nie znaczy, a różnica
 *    w pliku przestałaby pokazywać zmianę. Ta sama reguła obowiązuje w Rysiku.
 */

import { parsePlotRow, type ParsedPlotRow } from './parseRow';

/** Wersja formatu zapisu; rośnie przy zmianie niezgodnej wstecz. */
export const PLOT_FORMAT_VERSION = 1;

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const DEFAULT_VIEWPORT: Viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

export interface PlotSettings {
  grid: boolean;
  minorGrid: boolean;
  axisNumbers: boolean;
  arrows: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  xLabel: string;
  yLabel: string;
  /**
   * Jednostka kąta.
   *
   * To nie jest ustawienie widoku, tylko **znaczenie zapisu**: przy stopniach
   * `\sin(x)` liczy się z innego argumentu. Dlatego siedzi w dokumencie i musi
   * wejść do kompilacji, a nie tylko do rysowania.
   */
  angleUnit: 'radians' | 'degrees';
}

export const DEFAULT_SETTINGS: PlotSettings = {
  grid: true,
  minorGrid: true,
  axisNumbers: true,
  arrows: false,
  showXAxis: true,
  showYAxis: true,
  xLabel: '',
  yLabel: '',
  angleUnit: 'radians',
};

export interface RowStyle {
  color: string;
  /** Grubość linii w pikselach. */
  width: number;
  dash: 'solid' | 'dashed' | 'dotted';
}

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_SLIDER: SliderSpec = { min: -10, max: 10, step: 0.1 };

/** Kolejne kolory krzywych — te same, których używa Desmos. */
export const ROW_COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#000000', '#fa7e19'];

export interface PlotRow {
  id: string;
  /** Zapis wiersza w LaTeX-u — jedyne, co trafia do pliku. */
  latex: string;
  /** Rozpoznanie; pochodna `latex`, liczona przy wczytaniu i przy edycji. */
  parsed: ParsedPlotRow;
  style: RowStyle;
  /** Obecny tylko przy wierszach, które wprowadzają parametr. */
  slider?: SliderSpec;
  hidden: boolean;
}

export interface PlotDocument {
  rows: PlotRow[];
  viewport: Viewport;
  settings: PlotSettings;
  /** Uwagi z wczytywania — uszkodzony zapis, nieznana wersja formatu. */
  issues: string[];
}

let licznik = 0;

/** Identyfikator wiersza; stały przez cały czas życia dokumentu. */
function nextId(): string {
  licznik += 1;
  return `r${licznik.toString(36)}`;
}

function styleFor(index: number): RowStyle {
  return { color: ROW_COLORS[index % ROW_COLORS.length], width: 2.5, dash: 'solid' };
}

/**
 * Czy wiersz wprowadza parametr, przy którym ma sens suwak.
 *
 * Tylko definicja stałej. Wykres suwaka nie dostaje — po `y = x^2` nie ma czego
 * przesuwać; parametry wykresu mieszkają we własnych wierszach.
 */
function sliderFor(parsed: ParsedPlotRow): SliderSpec | undefined {
  return parsed.kind === 'constant' ? { ...DEFAULT_SLIDER } : undefined;
}

function makeRow(latex: string, index: number): PlotRow {
  const parsed = parsePlotRow(latex);
  return { id: nextId(), latex, parsed, style: styleFor(index), slider: sliderFor(parsed), hidden: false };
}

/** Nowy dokument: jeden pusty wiersz i domyślny widok. */
export function createPlotDocument(): PlotDocument {
  return {
    // Lista Desmosa nigdy nie jest pusta — zawsze czeka wiersz do wpisania.
    rows: [makeRow('', 0)],
    viewport: { ...DEFAULT_VIEWPORT },
    settings: { ...DEFAULT_SETTINGS },
    issues: [],
  };
}

export function addRow(doc: PlotDocument, latex: string): PlotDocument {
  return { ...doc, rows: [...doc.rows, makeRow(latex, doc.rows.length)] };
}

export function removeRow(doc: PlotDocument, id: string): PlotDocument {
  const rows = doc.rows.filter((r) => r.id !== id);
  // Skasowanie ostatniego wiersza zostawiłoby listę bez miejsca na wpisanie
  // czegokolwiek.
  return { ...doc, rows: rows.length > 0 ? rows : [makeRow('', 0)] };
}

/**
 * Podmienia treść wiersza i rozpoznaje go na nowo.
 *
 * Kolor i widoczność zostają: są wyborem autora, a nie własnością wyrażenia —
 * poprawka we wzorze nie może przemalować krzywej. Suwak przeliczamy, bo
 * `y = x` po zmianie na `a = 5` przestaje być wykresem, a zaczyna parametrem.
 */
export function updateRow(doc: PlotDocument, id: string, latex: string): PlotDocument {
  return {
    ...doc,
    rows: doc.rows.map((row) => {
      if (row.id !== id) return row;
      const parsed = parsePlotRow(latex);
      const slider = sliderFor(parsed);
      return {
        ...row,
        latex,
        parsed,
        // Zakres ustawiony ręcznie przeżywa edycję wzoru.
        slider: slider ? row.slider ?? slider : undefined,
      };
    }),
  };
}

/** Kształt zapisu w pliku — świadomie płaski i bez pól pochodnych. */
interface StoredRow {
  latex: string;
  color?: string;
  width?: number;
  dash?: RowStyle['dash'];
  hidden?: boolean;
  slider?: SliderSpec;
}

interface StoredDocument {
  version: number;
  rows: StoredRow[];
  viewport?: Partial<Viewport>;
  settings?: Partial<PlotSettings>;
}

/** Pola różniące się od domyślnych — reszta nie trafia do pliku. */
function changedOnly<T extends object>(value: T, defaults: T): Partial<T> | undefined {
  const out: Partial<T> = {};
  let any = false;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    if (value[key] !== defaults[key]) {
      out[key] = value[key];
      any = true;
    }
  }
  return any ? out : undefined;
}

export function serializePlotDocument(doc: PlotDocument): string {
  const stored: StoredDocument = {
    version: PLOT_FORMAT_VERSION,
    rows: doc.rows.map((row, index) => {
      const domyslny = styleFor(index);
      const out: StoredRow = { latex: row.latex };
      if (row.style.color !== domyslny.color) out.color = row.style.color;
      if (row.style.width !== domyslny.width) out.width = row.style.width;
      if (row.style.dash !== domyslny.dash) out.dash = row.style.dash;
      if (row.hidden) out.hidden = true;
      if (row.slider && changedOnly(row.slider, DEFAULT_SLIDER)) out.slider = row.slider;
      return out;
    }),
  };

  const viewport = changedOnly(doc.viewport, DEFAULT_VIEWPORT);
  if (viewport) stored.viewport = viewport;

  const settings = changedOnly(doc.settings, DEFAULT_SETTINGS);
  if (settings) stored.settings = settings;

  return JSON.stringify(stored, null, 2);
}

export function parsePlotDocument(text: string): PlotDocument {
  const trimmed = text.trim();
  if (!trimmed) return createPlotDocument();

  const issues: string[] = [];
  let stored: StoredDocument;

  try {
    stored = JSON.parse(trimmed) as StoredDocument;
  } catch (err) {
    /*
     * Blok w markdownie bywa edytowany ręcznie, a wykres jest jednym z wielu
     * elementów dokumentu — wyjątek wywróciłby całą stronę zamiast jednego
     * bloku. Wracamy pustym dokumentem i mówimy, co jest nie tak.
     */
    const doc = createPlotDocument();
    doc.issues.push(`Nie umiem odczytać zapisu wykresu: ${(err as Error).message}`);
    return doc;
  }

  if (stored.version !== PLOT_FORMAT_VERSION) {
    issues.push(
      `Zapis pochodzi z wersji ${stored.version ?? '(nieznanej)'}, a ta aplikacja rozumie ${PLOT_FORMAT_VERSION}. `
      + 'Wczytuję, co się da.',
    );
  }

  const rows = (stored.rows ?? []).map((row, index) => {
    const parsed = parsePlotRow(row.latex ?? '');
    const domyslny = styleFor(index);
    return {
      id: nextId(),
      latex: row.latex ?? '',
      parsed,
      style: {
        color: row.color ?? domyslny.color,
        width: row.width ?? domyslny.width,
        dash: row.dash ?? domyslny.dash,
      },
      slider: row.slider ?? sliderFor(parsed),
      hidden: row.hidden ?? false,
    } satisfies PlotRow;
  });

  return {
    rows: rows.length > 0 ? rows : [makeRow('', 0)],
    viewport: { ...DEFAULT_VIEWPORT, ...stored.viewport },
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
    issues,
  };
}
