/**
 * Eksport statyczny bazy wiedzy.
 *
 * Warunek, który decyduje o tym, czy eksport ma sens: **wyeksportowany dokument
 * ma być tym samym dokumentem**, a nie jego zrzutem. Symulacja liczy się z tych
 * samych wzorów, bo do strony trafia markdown, a nie obrazek wyniku.
 *
 * Testy pilnują trzech rzeczy, na których taki eksport zwykle się wykłada:
 * osadzenia treści (znak `</script>` w markdownie), ścieżek względnych między
 * stronami w podkatalogach, i tego, żeby strona bez JS nie była pusta.
 */
import { describe, it, expect } from 'vitest';
import { exportSite } from './exportSite';

const WAHADLO = {
  path: 'mechanika/wahadlo.md',
  markdown: [
    '---', 'title: Wahadło matematyczne', 'tags: [mechanika]', '---',
    '# Wahadło matematyczne', '',
    'Okres małych drgań nie zależy od amplitudy.', '',
    '```formula:okres',
    'T = 2\\pi\\sqrt{\\frac{L}{g}}',
    '@vars T: s, L: m, g: m/s^2',
    '```',
  ].join('\n'),
};

const ORBITA = {
  path: 'astronomia/orbita.md',
  markdown: [
    '---', 'title: Orbita kołowa', 'tags: [astronomia]', 'requires: [Wahadło matematyczne]', '---',
    '# Orbita kołowa', '', 'Prędkość kołowa wynika z równowagi sił.',
  ].join('\n'),
};

const strona = (files: ReturnType<typeof exportSite>, path: string) =>
  files.find((f) => f.path === path)!;

describe('exportSite', () => {
  const files = exportSite([WAHADLO, ORBITA], { title: 'Baza wiedzy' });

  it('daje stronę na dokument plus katalog i skrypt', () => {
    const sciezki = files.map((f) => f.path).sort();
    expect(sciezki).toContain('index.html');
    expect(sciezki).toContain('mechanika/wahadlo.html');
    expect(sciezki).toContain('astronomia/orbita.html');
    // Skrypt jest wspólny — jedna kopia na całą bazę, nie na dokument.
    expect(sciezki.filter((p) => p.endsWith('.js'))).toHaveLength(0);
  });

  /** Odczyt osadzonych danych tak, jak zrobi to strona po załadowaniu. */
  const osadzone = (html: string, id: string) => {
    const wzorzec = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`);
    return JSON.parse(html.match(wzorzec)![1]);
  };

  it('osadza markdown, a nie wynik jego renderowania', () => {
    // To jest sedno eksportu: strona niesie źródło, więc symulacja liczy się z
    // tych samych wzorów co w edytorze. Zrzut obrazu byłby czymś innym.
    //
    // Sprawdzamy przez `JSON.parse`, a nie przez wyszukanie tekstu w HTML-u:
    // backslashe LaTeX-a są w osadzeniu podwojone i tak ma być — znaczenie ma
    // to, co odzyska strona, nie to, jak wygląda zapis.
    const dane = osadzone(strona(files, 'mechanika/wahadlo.html').content, 'sci-document');
    expect(dane.markdown).toBe(WAHADLO.markdown);
    expect(dane.markdown).toContain('T = 2\\pi\\sqrt{\\frac{L}{g}}');
  });

  it('nie daje się rozbić znakiem zamykającym skrypt', () => {
    // Markdown o HTML-u zawiera `</script>` w treści. Wklejony dosłownie
    // zamknąłby tag i reszta dokumentu wylądowałaby w widocznym tekście.
    const zlosliwy = {
      path: 'web/tagi.md',
      markdown: '# Tagi\n\nZamknięcie skryptu zapisujemy jako </script> w tekście.',
    };
    const html = exportSite([zlosliwy], { title: 'T' })
      .find((f) => f.path === 'web/tagi.html')!.content;

    expect(html).not.toContain('</script> w tekście');
    // Treść ma przetrwać w całości — chodzi o zakodowanie, nie o wycięcie.
    expect(osadzone(html, 'sci-document').markdown).toBe(zlosliwy.markdown);
  });

  it('dokument w podkatalogu liczy odwołania od korzenia bazy', () => {
    // Bez tego baza otwarta z pliku (`file://`) albo z podkatalogu serwera
    // ładuje skrypt i fonty z nieistniejącego miejsca. `<base>` załatwia to
    // raz dla wszystkiego — także dla ścieżek wbudowanych w arkusz stylów.
    const html = strona(files, 'mechanika/wahadlo.html').content;
    expect(html).toContain('<base href="../">');
    expect(html).toContain('src="sci.js"');

    // Strona w korzeniu nie potrzebuje `<base>` i nie powinna go dostać.
    expect(strona(files, 'index.html').content).not.toContain('<base');
  });

  it('strona bez JS pokazuje treść, nie pustkę', () => {
    const html = strona(files, 'mechanika/wahadlo.html').content;
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
    expect(noscript).toContain('Okres małych drgań');
  });

  it('katalog linkuje do wszystkich dokumentów', () => {
    const html = strona(files, 'index.html').content;
    expect(html).toContain('href="mechanika/wahadlo.html"');
    expect(html).toContain('href="astronomia/orbita.html"');
    expect(html).toContain('Wahadło matematyczne');
  });

  it('katalog niesie pełne dokumenty, nie same tytuły', () => {
    // Wyszukiwarka, graf wiedzy i kolejność nauki liczą się z treści — bez niej
    // katalog po eksporcie byłby gołą listą linków, a nie tym samym katalogiem.
    const dane = osadzone(strona(files, 'index.html').content, 'sci-index');
    expect(dane.documents).toHaveLength(2);
    expect(dane.documents.find((d: { path: string }) => d.path === 'mechanika/wahadlo.md').markdown)
      .toBe(WAHADLO.markdown);
  });

  it('tytuł strony bierze się z nagłówka dokumentu', () => {
    expect(strona(files, 'mechanika/wahadlo.html').content)
      .toContain('<title>Wahadło matematyczne');
  });

  it('manifest opisuje bazę w postaci nadającej się do przeszukania', () => {
    const manifest = JSON.parse(strona(files, 'manifest.json').content);
    expect(manifest.documents).toHaveLength(2);
    expect(manifest.documents[0]).toMatchObject({ path: expect.any(String), title: expect.any(String) });
    // Prerekwizyt zapisany tytułem musi wskazywać na ścieżkę — inaczej graf
    // wiedzy po eksporcie rozpada się na luźne strony.
    const orbita = manifest.documents.find((d: { title: string }) => d.title === 'Orbita kołowa');
    expect(orbita.requires).toEqual(['mechanika/wahadlo.html']);
  });

  it('polskie znaki przechodzą przez eksport', () => {
    const html = strona(files, 'mechanika/wahadlo.html').content;
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain('Wahadło');
  });
});
