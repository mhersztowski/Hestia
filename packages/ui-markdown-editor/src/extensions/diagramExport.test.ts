/**
 * Wyjmowanie diagramu z notatki jako obrazu.
 *
 * Tryb podglądu ma gotowy SVG — `mermaid.render` zwraca go jako tekst. Do tej
 * pory lądował wyłącznie w `innerHTML`, więc jedyną drogą do wstawienia
 * diagramu w prezentację był zrzut ekranu.
 *
 * Sam SVG od Mermaida nie nadaje się do zapisania na dysk bez poprawek: bywa
 * bez `xmlns` (w dokumencie HTML nie jest potrzebny, w osobnym pliku owszem),
 * ma szerokość `100%` zamiast liczby i przezroczyste tło.
 */
import { describe, it, expect } from 'vitest';
import { prepareSvgForExport, diagramFileName, svgSize } from './diagramExport';

const SVG = '<svg id="m1" width="100%" style="max-width: 320px;" viewBox="0 0 320 180">'
  + '<g><rect width="10" height="10"/></g></svg>';

describe('prepareSvgForExport', () => {
  it('dokłada przestrzeń nazw, gdy jej nie ma', () => {
    // Bez `xmlns` plik `.svg` nie otworzy się w przeglądarce ani w Inkscapie —
    // w dokumencie HTML działa, bo przestrzeń bierze się z kontekstu.
    expect(prepareSvgForExport(SVG)).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('nie dubluje istniejącej przestrzeni nazw', () => {
    const zXmlns = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    const wynik = prepareSvgForExport(zXmlns);
    expect(wynik.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1);
  });

  it('zamienia szerokość procentową na liczbę z viewBoksa', () => {
    // `width="100%"` znaczy „tyle, ile da rodzic". W pliku rodzica nie ma,
    // więc obraz wychodzi wielkości okna albo zerowy.
    const wynik = prepareSvgForExport(SVG);
    expect(wynik).toContain('width="320"');
    expect(wynik).toContain('height="180"');
  });

  it('usuwa ograniczenie szerokości ze stylu', () => {
    // `max-width` od Mermaida ucina eksport w skali większej niż 1.
    expect(prepareSvgForExport(SVG)).not.toContain('max-width');
  });

  it('wstawia białe tło', () => {
    // Przezroczyste tło w prezentacji na ciemnym slajdzie daje czarne napisy
    // na czarnym — a tego nie widać, dopóki nie jest za późno.
    const wynik = prepareSvgForExport(SVG);
    expect(wynik).toContain('<rect');
    expect(wynik).toContain('#ffffff');
  });

  it('pozwala nie wstawiać tła', () => {
    expect(prepareSvgForExport(SVG, { background: 'none' })).not.toContain('#ffffff');
  });
});

describe('svgSize', () => {
  it('czyta rozmiar z viewBoksa', () => {
    expect(svgSize(SVG)).toEqual({ width: 320, height: 180 });
  });

  it('woli jawne wymiary, gdy są liczbami', () => {
    const svg = '<svg width="640" height="480" viewBox="0 0 320 240"></svg>';
    expect(svgSize(svg)).toEqual({ width: 640, height: 480 });
  });

  it('bez żadnego wymiaru daje rozsądny domyślny', () => {
    expect(svgSize('<svg></svg>')).toEqual({ width: 800, height: 600 });
  });
});

describe('diagramFileName', () => {
  it('bierze tytuł z front mattera', () => {
    const kod = ['---', 'title: Przepływ zamówienia', '---', 'flowchart TB', '  A --> B'].join('\n');
    expect(diagramFileName(kod, 'svg')).toBe('przeplyw-zamowienia.svg');
  });

  it('bierze tytuł z dyrektywy `title` w treści', () => {
    const kod = ['gantt', '  title Plan wdrożenia', '  section A'].join('\n');
    expect(diagramFileName(kod, 'png')).toBe('plan-wdrozenia.png');
  });

  it('bez tytułu używa rodzaju diagramu', () => {
    expect(diagramFileName('stateDiagram-v2\n  [*] --> A', 'svg')).toBe('statediagram.svg');
    expect(diagramFileName('flowchart TB\n  A --> B', 'svg')).toBe('flowchart.svg');
  });

  it('bez rozpoznania czegokolwiek daje nazwę zastępczą', () => {
    expect(diagramFileName('', 'svg')).toBe('diagram.svg');
  });

  it('zamienia polskie znaki i odrzuca to, czego nie wolno w nazwie pliku', () => {
    const kod = ['---', 'title: Zażółć gęślą jaźń / v2', '---', 'flowchart TB'].join('\n');
    expect(diagramFileName(kod, 'svg')).toBe('zazolc-gesla-jazn-v2.svg');
  });

  it('przycina bardzo długi tytuł', () => {
    const kod = ['---', `title: ${'a'.repeat(200)}`, '---', 'flowchart TB'].join('\n');
    const nazwa = diagramFileName(kod, 'svg');
    expect(nazwa.length).toBeLessThanOrEqual(64);
    expect(nazwa.endsWith('.svg')).toBe(true);
  });
});

describe('downloadSvg', () => {
  it('podaje plik z nazwą z tytułu i typem SVG', async () => {
    // @vitest-environment jsdom nie jest tu potrzebne dla całego pliku —
    // ten jeden przypadek dostaje minimalne atrapy przeglądarki.
    const { downloadSvg } = await import('./diagramExport');

    const utworzone: Blob[] = [];
    const kliknięte: Array<{ download: string }> = [];
    const globalAny = globalThis as unknown as Record<string, unknown>;
    const poprzedniURL = globalAny.URL;
    const poprzedniDocument = globalAny.document;

    globalAny.URL = { createObjectURL: (b: Blob) => { utworzone.push(b); return 'blob:x'; }, revokeObjectURL: () => {} };
    globalAny.document = {
      createElement: () => {
        const link = { href: '', download: '', click: () => kliknięte.push(link) };
        return link;
      },
    };

    try {
      downloadSvg('<svg viewBox="0 0 10 10"></svg>', '---\ntitle: Mój diagram\n---\nflowchart TB');
    } finally {
      globalAny.URL = poprzedniURL;
      globalAny.document = poprzedniDocument;
    }

    expect(utworzone[0].type).toBe('image/svg+xml');
    expect(kliknięte[0].download).toBe('moj-diagram.svg');
  });
});
