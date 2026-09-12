/**
 * blocks.ts — rysunek i tablica jako bloki z identyfikatorem.
 *
 * Podręcznik odsyła do rysunków i tablic równie gęsto jak do wzorów. Dopóki
 * rysunek jest luźnym `![…](…)` w tekście, nie ma do czego zrobić odsyłacza —
 * nie ma identyfikatora. Blok go daje i przy okazji trzyma podpis razem
 * z obrazem, więc jedno nie odklei się od drugiego przy przenoszeniu akapitów.
 *
 * Blok niesie **to, co dokument i tak pokazuje**: dziś wycinek skanu, a od
 * podrozdziału 15-3 — gdy rysunki wynikają ze wzoru — kod, który je liczy.
 * Dzięki temu dymek odsyłacza rysuje dokładnie to samo, co treść; gdyby podgląd
 * miał własne źródło, obie wersje rozjechałyby się przy pierwszej poprawce.
 */
import { normalizeFigureWidth } from './figureWidth';

export interface BlockIssue {
  message: string;
}

/** Jedna krzywa panelu — podpis, wzór i styl kreski. */
export interface PlotCurve {
  label: string;
  expression: string;
  dashed: boolean;
}

export interface PlotPanel {
  /** Litera panelu z książki (a, b, c); brak dla rysunku jednopanelowego. */
  name?: string;
  curves: PlotCurve[];
}

/**
 * Rysunek liczony ze wzoru.
 *
 * Osie są **bez skal liczbowych** — podręcznik podpisuje je `A` i `T`, żeby
 * czytelnik patrzył na kształt, a nie na wartości. Dziedzina służy tylko do
 * próbkowania.
 */
export interface PlotSpec {
  variable: string;
  from: number;
  to: number;
  axisX?: string;
  axisY?: string;
  panels: PlotPanel[];
}

export interface FigureBlock {
  id: string;
  /** Źródło obrazu, gdy rysunek jest wycinkiem skanu. */
  image?: string;
  /** Tekst alternatywny obrazu — z markdownu. */
  alt?: string;
  /** Kod rysujący, gdy rysunek wynika ze wzoru. */
  script?: string;
  /** Krzywe, gdy rysunek jest wykresem funkcji. */
  plot?: PlotSpec;
  /** Podpis, przepisany z książki. */
  caption?: string;
  /**
   * Szerokość rysunku, np. `60%` albo `420px`.
   *
   * Własność **rysunku**, nie widoku: schemat i wykres o skrajnie różnych
   * proporcjach nie mogą zajmować tyle samo miejsca, a decyzja o tym należy do
   * autora dokumentu i ma zostać w pliku.
   */
  width?: string;
  /**
   * Panele rysunku (a, b, c).
   *
   * Póki rysunek jest jednym skanem wszystkich paneli, nie da się pokazać
   * samego 15-1b — lista służy wyłącznie do opisu i podpowiedzi przy odsyłaczu.
   * Gdy panele będą rysowane osobno, każdy dostanie własny identyfikator.
   */
  panels: string[];
  issues: BlockIssue[];
}

export interface TableBlock {
  id: string;
  caption?: string;
  /** Wiersze wraz z nagłówkiem; wiersz oddzielający jest odrzucany. */
  rows: string[][];
  issues: BlockIssue[];
}

/**
 * Wzorzec obrazu — źródło brane **zachłannie**, aż do ostatniego nawiasu.
 *
 * Wersja z `[^)\s]+` urywała się na nawiasie w środku (`javascript:alert(1)`),
 * przez co niebezpieczny zapis wymykał się sprawdzeniu i lądował w gałęzi „kod
 * rysujący". Lepiej dopasować wszystko i odrzucić świadomie.
 */
const OBRAZ = /^!\[([^\]]*)\]\((.+)\)$/;

/**
 * Czy źródło obrazu wolno wpuścić.
 *
 * Ta sama biała lista, co w czytniku: ścieżka względna, `http(s)` i `data:`
 * wyłącznie z obrazem rastrowym. Sprawdzamy już przy parsowaniu, żeby problem
 * zobaczył autor, a nie dopiero przeglądarka.
 */
function bezpieczneZrodlo(src: string): boolean {
  const schemat = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(src.trim());
  if (!schemat) return true;
  const nazwa = schemat[1].toLowerCase();
  if (nazwa === 'http' || nazwa === 'https') return true;
  return /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(src.trim());
}

/** Rozdziela wiersze na dyrektywy `@…` i treść, sklejając kontynuacje podpisu. */
function czytaj(code: string) {
  const tresc: string[] = [];
  const dyrektywy: Record<string, string> = {};
  let ostatnia: string | undefined;

  for (const surowa of code.split('\n')) {
    const linia = surowa.trim();
    if (!linia) continue;

    if (linia.startsWith('@')) {
      const spacja = linia.indexOf(' ');
      const nazwa = (spacja < 0 ? linia : linia.slice(0, spacja)).slice(1);
      dyrektywy[nazwa] = spacja < 0 ? '' : linia.slice(spacja + 1).trim();
      ostatnia = nazwa;
      continue;
    }

    // Wiersz wcięty kontynuuje ostatnią dyrektywę: podpis z książki bywa
    // dłuższy niż wiersz pliku i łamanie nie ma prawa go urwać.
    if (ostatnia && surowa.startsWith(' ')) {
      dyrektywy[ostatnia] = `${dyrektywy[ostatnia]} ${linia}`.trim();
      continue;
    }

    ostatnia = undefined;
    tresc.push(linia);
  }

  return { tresc, dyrektywy };
}

/**
 * Czyta panele i krzywe.
 *
 * Osobny przebieg po wierszach, bo **kolejność ma znaczenie**: krzywa należy do
 * ostatnio otwartego panelu, a `czytaj` zwraca dyrektywy jako słownik, który
 * kolejność gubi.
 */
function czytajWykres(code: string): PlotSpec | undefined {
  const panels: PlotPanel[] = [];
  let variable: string | undefined;
  let from = 0;
  let to = 1;
  let axisX: string | undefined;
  let axisY: string | undefined;
  let maKrzywe = false;
  let maDziedzine = false;

  for (const surowa of code.split('\n')) {
    const linia = surowa.trim();

    const domena = /^@domain\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)/.exec(linia);
    if (domena) {
      variable = domena[1];
      from = Number(domena[2]);
      to = Number(domena[3]);
      maDziedzine = true;
      continue;
    }

    const osie = /^@axis\s+(\S+)\s*,\s*(\S+)/.exec(linia);
    if (osie) { axisX = osie[1]; axisY = osie[2]; continue; }

    const panel = /^@panel\s+(\S+)/.exec(linia);
    if (panel) { panels.push({ name: panel[1], curves: [] }); continue; }

    const krzywa = /^@curve\s+([^:]+):\s*(.+)$/.exec(linia);
    if (krzywa) {
      const [wzor, styl] = krzywa[2].split('|').map((s) => s.trim());
      if (!panels.length) panels.push({ curves: [] });
      panels[panels.length - 1].curves.push({
        label: krzywa[1].trim(),
        expression: wzor,
        dashed: /dashed/.test(styl ?? ''),
      });
      maKrzywe = true;
    }
  }

  if (!maKrzywe) return undefined;
  return { variable: variable ?? 'x', from, to, axisX, axisY, panels, ...(maDziedzine ? {} : { brakDziedziny: true }) } as PlotSpec & { brakDziedziny?: boolean };
}

/** Szerokość z dyrektywy `@width` — wspólna dla rysunku i wykresu. */
function czytajSzerokosc(block: FigureBlock, dyrektywy: Record<string, string>): void {
  if (dyrektywy.width === undefined) return;

  const znormalizowana = normalizeFigureWidth(dyrektywy.width);
  if (!znormalizowana) {
    block.issues.push({
      message: `Rysunek „${block.id}" ma szerokość „${dyrektywy.width}", której nie rozumiem. `
        + 'Napisz np. „@width 60%" albo „@width 420px".',
    });
    return;
  }
  block.width = znormalizowana;
}

export function parseFigureBlock(id: string, code: string): FigureBlock {
  const { tresc, dyrektywy } = czytaj(code);
  const block: FigureBlock = { id, panels: [], issues: [] };

  const wykres = czytajWykres(code) as (PlotSpec & { brakDziedziny?: boolean }) | undefined;
  if (wykres) {
    if (wykres.brakDziedziny) {
      block.issues.push({ message: `Rysunek „${id}" ma krzywe, ale nie ma dziedziny („@domain t: 0..1").` });
    }
    delete wykres.brakDziedziny;
    block.plot = wykres;
    czytajSzerokosc(block, dyrektywy);
    if (dyrektywy.caption) block.caption = dyrektywy.caption;
    if (dyrektywy.panels) {
      block.panels = dyrektywy.panels.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return block;
  }

  if (dyrektywy.caption) block.caption = dyrektywy.caption;
  if (dyrektywy.panels) {
    block.panels = dyrektywy.panels.split(',').map((s) => s.trim()).filter(Boolean);
  }
  czytajSzerokosc(block, dyrektywy);

  if (!tresc.length) {
    block.issues.push({ message: `Rysunek „${id}" nie ma treści — ani obrazu, ani kodu rysującego.` });
    return block;
  }

  const obraz = OBRAZ.exec(tresc[0]);
  if (obraz) {
    if (!bezpieczneZrodlo(obraz[2])) {
      block.issues.push({ message: `Rysunek „${id}" ma niedozwolone źródło obrazu.` });
    } else {
      block.alt = obraz[1];
      block.image = obraz[2];
    }
    return block;
  }

  block.script = tresc.join('\n');
  return block;
}

export function parseTableBlock(id: string, code: string): TableBlock {
  const { tresc, dyrektywy } = czytaj(code);
  const block: TableBlock = { id, rows: [], issues: [] };

  if (dyrektywy.caption) block.caption = dyrektywy.caption;

  for (const linia of tresc) {
    if (!linia.startsWith('|')) continue;
    const komorki = linia.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
    // Wiersz oddzielający („|---|---|") należy do składni, nie do danych.
    if (komorki.every((k) => /^:?-{2,}:?$/.test(k))) continue;
    block.rows.push(komorki);
  }

  if (!block.rows.length) {
    block.issues.push({ message: `Tablica „${id}" nie ma żadnego wiersza.` });
  }

  return block;
}
