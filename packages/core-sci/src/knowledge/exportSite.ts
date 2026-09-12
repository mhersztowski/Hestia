/**
 * exportSite.ts — baza wiedzy jako zestaw plików statycznych.
 *
 * Raport (Etap 4) chce eksportu, który da się położyć na dowolnym hostingu i
 * otworzyć bez backendu. Warunek, który decyduje o tym, czy to ma sens:
 * **eksportujemy dokument, nie jego zrzut**. Do strony trafia markdown ze
 * wzorami, a symulacja liczy się na miejscu z tego samego grafu co w edytorze.
 * Obrazek wyniku byłby czymś innym — czytelnik nie mógłby ruszyć suwaka.
 *
 * Moduł jest **czystą funkcją**: dokumenty na wejściu, lista plików na wyjściu.
 * Zapis na dysk należy do skryptu buildu, dzięki czemu całość da się sprawdzić
 * testem bez systemu plików, a ten sam kod obsłuży eksport z przeglądarki
 * (pobranie ZIP-a) i z linii poleceń.
 */
import { parseFrontMatter } from './index';

export interface SourceDocument {
  /** Ścieżka względem katalogu bazy, np. `mechanika/wahadlo.md`. */
  path: string;
  markdown: string;
}

export interface SiteFile {
  path: string;
  content: string;
}

export interface ExportOptions {
  /** Tytuł całej bazy — nagłówek katalogu i tytuł strony głównej. */
  title: string;
  /**
   * Nazwa pliku ze skryptem montującym bloki.
   *
   * Sam skrypt powstaje w buildzie (Vite), nie tutaj — ta funkcja odpowiada za
   * strukturę strony, nie za bundlowanie.
   */
  script?: string;
  /** Arkusz stylów dołączany do każdej strony, jeśli build go wytwarza. */
  stylesheet?: string;
}

/** Ścieżka strony HTML odpowiadającej dokumentowi. */
export function pagePath(documentPath: string): string {
  return documentPath.replace(/\.md$/i, '.html');
}

/**
 * Ścieżka względna z podkatalogu do korzenia bazy.
 *
 * Baza bywa otwierana wprost z pliku (`file://`) albo wystawiona w podkatalogu
 * serwera, więc odwołania bezwzględne (`/sci.js`) prowadziłyby donikąd.
 */
function toRoot(documentPath: string): string {
  const depth = documentPath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

/** Ucieczka znaków, które w treści HTML znaczą coś innego niż tekst. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Osadzenie markdownu w `<script type="application/json">`.
 *
 * `JSON.stringify` nie wystarcza: dokument o HTML-u zawiera w treści dosłowne
 * `</script>`, które zamknęłoby tag i wyrzuciło resztę dokumentu na stronę jako
 * widoczny tekst. Zakodowanie ukośnika naprawia to bez zmiany treści — po
 * `JSON.parse` wraca dokładnie ten sam ciąg znaków.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    // U+2028/U+2029 są w JavaScripcie legalnym końcem wiersza, ale w JSON-ie
    // nie — dosłowne przechodzą przez `JSON.stringify` i psują parsowanie.
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Treść dla czytelnika bez JavaScriptu.
 *
 * Nie próbujemy tu renderować markdownu — wystarczy sam tekst akapitów, żeby
 * strona nie była pusta i żeby wyszukiwarka miała co zindeksować. Bloki kodu
 * pomijamy: wzór w LaTeX-u bez składu jest szumem, a nie treścią.
 */
function plainText(markdown: string): string {
  const { body } = parseFrontMatter(markdown);
  const bezBlokow = body.replace(/```[\s\S]*?```/g, '');
  return bezBlokow
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; font: 15px/1.65 -apple-system, "Segoe UI", system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  a { color: #2563eb; }
  nav { max-width: 760px; margin: 0 auto; padding: 12px 16px; font-size: 13px; }
  ul.katalog { list-style: none; padding: 0; }
  ul.katalog li { padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
  ul.katalog .tagi { font-size: 12px; color: #64748b; }
`;

function page(options: {
  title: string;
  root: string;
  body: string;
  head?: string;
  script?: string;
  stylesheet?: string;
}): string {
  const { title, root, body, head = '', script, stylesheet } = options;
  return [
    '<!doctype html>',
    '<html lang="pl">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    // Wszystkie odwołania na stronie są liczone od korzenia bazy. Bez tego
    // arkusz wbudowany w bundel szukałby fontów względem podkatalogu
    // dokumentu — wzory renderowałyby się czcionką zastępczą.
    root ? `<base href="${root}">` : '',
    stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : '',
    `<style>${STYLE}</style>`,
    head,
    '</head>',
    '<body>',
    body,
    // Klasyczny skrypt, nie moduł: przeglądarka blokuje moduły wczytywane z
    // `file://`, a baza ma się otwierać także po skopiowaniu na dysk. Worker
    // jest w bundlu jako blob, więc liczenie poza wątkiem interfejsu zostaje.
    script ? `<script src="${script}"></script>` : '',
    '</body>',
    '</html>',
    '',
  ].filter(Boolean).join('\n');
}

/**
 * Buduje pliki statycznej wersji bazy.
 *
 * Prerekwizyty w nagłówkach dokumentów są zapisane **tytułami**, bo tak się je
 * pisze wygodnie. Manifest tłumaczy je na ścieżki stron — bez tego graf wiedzy
 * po eksporcie rozpadłby się na luźne strony.
 */
export function exportSite(documents: SourceDocument[], options: ExportOptions): SiteFile[] {
  const { title, script = 'sci.js', stylesheet } = options;

  const opisy = documents.map((document) => {
    const { meta, body } = parseFrontMatter(document.markdown);
    return {
      source: document,
      page: pagePath(document.path),
      title: meta.title ?? document.path.replace(/\.md$/i, ''),
      tags: meta.tags,
      requires: meta.requires,
      body,
    };
  });

  const stronaWgTytulu = new Map(opisy.map((d) => [d.title, d.page]));

  const files: SiteFile[] = opisy.map((document) => {
    const dane = embedJson({ path: document.page, markdown: document.source.markdown });

    return {
      path: document.page,
      content: page({
        title: document.title,
        root: toRoot(document.page),
        script,
        stylesheet,
        body: [
          '<nav><a href="index.html">← katalog</a></nav>',
          '<main id="sci-root">',
          // Treść tekstowa zostaje w HTML-u: przed hydratacją i bez JS strona
          // wciąż da się przeczytać, a wyszukiwarka ma co zindeksować.
          `<noscript>${plainText(document.source.markdown)}</noscript>`,
          '</main>',
          `<script type="application/json" id="sci-document">${dane}</script>`,
        ].join('\n'),
      }),
    };
  });

  const pozycje = opisy.map((document) => [
    '<li>',
    `<a href="${document.page}">${escapeHtml(document.title)}</a>`,
    document.tags.length ? `<div class="tagi">${escapeHtml(document.tags.join(' · '))}</div>` : '',
    '</li>',
  ].filter(Boolean).join(''));

  files.push({
    path: 'index.html',
    content: page({
      title,
      root: '',
      script,
      stylesheet,
      body: [
        '<main id="sci-root">',
        `<h1>${escapeHtml(title)}</h1>`,
        `<ul class="katalog">${pozycje.join('\n')}</ul>`,
        '</main>',
        // Katalog dostaje **pełne dokumenty**, bo wyszukiwarka, graf wiedzy i
        // kolejność nauki liczą się z treści — z indeksu tytułów powstałaby
        // goła lista linków. Ceną jest rozmiar strony głównej; wybieramy go
        // świadomie, bo alternatywa (dociąganie fetch-em) zabija scenariusz
        // „skopiuj bazę na pendrive i otwórz z pliku".
        //
        // Ścieżki zostają w postaci `.md`, bo indeks bazy jest budowany z
        // dokumentów; zamianę na `.html` robi warstwa nawigacji.
        `<script type="application/json" id="sci-index">${embedJson({
          documents: documents.map((d) => ({ path: d.path, markdown: d.markdown })),
        })}</script>`,
      ].join('\n'),
    }),
  });

  files.push({
    path: 'manifest.json',
    content: `${JSON.stringify({
      title,
      documents: opisy.map((document) => ({
        path: document.page,
        title: document.title,
        tags: document.tags,
        // Nierozpoznany prerekwizyt zostaje tytułem — lepsze niż zgubienie go
        // po cichu, bo w wyniku widać, czego w bazie brakuje.
        requires: document.requires.map((wymagany) => stronaWgTytulu.get(wymagany) ?? wymagany),
      })),
    }, null, 2)}\n`,
  });

  return files;
}
