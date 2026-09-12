/**
 * diagramExport.ts — diagram z notatki jako plik SVG albo PNG.
 *
 * Tryb podglądu ma gotowy obraz: `mermaid.render` zwraca SVG jako tekst.
 * Do tej pory szedł prosto do `innerHTML` i nie było jak go stamtąd wyjąć, więc
 * jedyną drogą do wstawienia diagramu w prezentację czy zgłoszenie był zrzut
 * ekranu — razem z tłem strony i w rozdzielczości takiej, jaką akurat miał
 * monitor.
 *
 * SVG od Mermaida wymaga trzech poprawek, zanim stanie się plikiem:
 *
 *   • **przestrzeń nazw** — w dokumencie HTML bierze się z kontekstu, w osobnym
 *     pliku musi być zapisana, inaczej nic go nie otworzy;
 *   • **wymiary liczbowe** — Mermaid daje `width="100%"`, co bez rodzica znaczy
 *     „nie wiadomo ile"; liczby są w `viewBox`;
 *   • **tło** — przezroczyste wygląda dobrze w edytorze i znika na ciemnym
 *     slajdzie razem z napisami.
 *
 * Podział na czystą część (ten plik) i część korzystającą z DOM (canvas,
 * `URL.createObjectURL`) jest celowy: pierwsza da się sprawdzić testem, druga
 * jest kilkoma wywołaniami przeglądarki bez własnej logiki.
 */

export interface PrepareOptions {
  /** Kolor tła; `none` zostawia przezroczyste. */
  background?: string;
}

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
const DEFAULT_SIZE = { width: 800, height: 600 };

/**
 * Sam znacznik otwierający `<svg …>`.
 *
 * Wymiarów szukamy wyłącznie w nim: `width` i `height` mają w środku diagramu
 * dziesiątki wystąpień (każdy prostokąt je ma), a pierwsze trafienie w całym
 * tekście byłoby rozmiarem przypadkowego kształtu.
 */
function svgTag(svg: string): string {
  return /<svg[^>]*>/.exec(svg)?.[0] ?? '';
}

/** Rozmiar obrazu — z jawnych wymiarów, a gdy ich nie ma, z `viewBox`. */
export function svgSize(svg: string): { width: number; height: number } {
  const tag = svgTag(svg);
  const width = Number(/\bwidth="([\d.]+)(?:px)?"/.exec(tag)?.[1]);
  const height = Number(/\bheight="([\d.]+)(?:px)?"/.exec(tag)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };

  const viewBox = /viewBox="([^"]+)"/.exec(tag)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return { ...DEFAULT_SIZE };
}

/** SVG gotowy do zapisania na dysk albo przerysowania na canvas. */
export function prepareSvgForExport(svg: string, options: PrepareOptions = {}): string {
  const { width, height } = svgSize(svg);
  let out = svg;

  // Wszystkie poprawki dotyczą **znacznika otwierającego**, nie całego tekstu:
  // `width`, `height` i `style` mają w środku diagramu setki wystąpień.
  out = out.replace(/<svg[^>]*>/, (tag) => {
    let head = tag;
    if (!head.includes('xmlns=')) head = head.replace('<svg', `<svg ${XMLNS}`);

    // Wymiary procentowe zamieniamy na liczby; brakujące dopisujemy.
    head = head.replace(/\bwidth="[^"]*%"/, `width="${width}"`);
    head = head.replace(/\bheight="[^"]*%"/, `height="${height}"`);
    if (!/\bwidth="/.test(head)) head = head.replace('<svg', `<svg width="${width}"`);
    if (!/\bheight="/.test(head)) head = head.replace('<svg', `<svg height="${height}"`);

    // `max-width` od Mermaida ucinałby obraz przy skali większej niż 1.
    head = head.replace(/\s*style="([^"]*)"/, (_, style: string) => {
      const czysty = style.split(';').filter((rule) => !/max-width/i.test(rule)).join(';').trim();
      return czysty ? ` style="${czysty}"` : '';
    });
    return head;
  });

  const background = options.background ?? '#ffffff';
  if (background !== 'none') {
    // Tło jako pierwszy element, żeby leżało pod całą treścią.
    out = out.replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="${background}"/>`);
  }

  return out;
}

/** Zamiana polskich znaków na łacińskie — nazwa pliku ma być przenośna. */
const DIAKRYTYKI: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (znak) => DIAKRYTYKI[znak] ?? znak)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Pierwsze słowo nagłówka — `stateDiagram-v2` → `statediagram`. */
function kindOf(code: string): string | undefined {
  const first = code.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('---'));
  const word = /^([A-Za-z][A-Za-z0-9]*)/.exec(first ?? '')?.[1];
  return word?.toLowerCase();
}

/**
 * Nazwa pliku wyprowadzona z treści diagramu.
 *
 * Kolejność: tytuł z front mattera, tytuł z dyrektywy `title`, rodzaj diagramu,
 * słowo zastępcze. Nazwa ma coś znaczyć w katalogu Pobrane — `diagram (3).svg`
 * jest tym, czego chcemy uniknąć.
 */
export function diagramFileName(code: string, extension: 'svg' | 'png'): string {
  const frontMatterTitle = /^---\r?\n(?:.*\r?\n)*?title:\s*(.+?)\s*\r?\n/m.exec(code)?.[1];
  const inlineTitle = /^\s*title\s+(.+?)\s*$/m.exec(code)?.[1];

  const base = slug(frontMatterTitle ?? inlineTitle ?? '')
    || slug(kindOf(code) ?? '')
    || 'diagram';

  return `${base}.${extension}`;
}

// --- zapis na dysk -----------------------------------------------------------
// Poniżej nie ma już decyzji do podjęcia, tylko wywołania przeglądarki.

/** Podaje plik użytkownikowi przez zwykły odsyłacz z `download`. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Zwolnienie od razu po kliknięciu bywa za wcześnie w Safari; jedna klatka
  // wystarcza, a przetrzymywanie adresu blokowałoby pamięć obrazu.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Zapisuje diagram jako plik SVG. */
export function downloadSvg(svg: string, code: string): void {
  const prepared = prepareSvgForExport(svg);
  saveBlob(new Blob([prepared], { type: 'image/svg+xml' }), diagramFileName(code, 'svg'));
}

/**
 * Zapisuje diagram jako PNG.
 *
 * Skala większa od 1, bo diagram trafia najczęściej do prezentacji albo
 * dokumentu, gdzie jest powiększany — obraz w rozmiarze ekranowym wygląda tam
 * na rozmyty. Rysowanie idzie przez `Image` z adresu `data:`, a nie `blob:`,
 * bo `blob:` bywa traktowany jako inne źródło i „brudzi" canvas, przez co
 * `toBlob` kończy się błędem bezpieczeństwa.
 */
export async function downloadPng(svg: string, code: string, scale = 2): Promise<void> {
  const prepared = prepareSvgForExport(svg);
  const { width, height } = svgSize(prepared);

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Nie udało się wczytać obrazu diagramu'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Przeglądarka nie dała kontekstu 2D');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Nie udało się zapisać obrazu PNG');
  saveBlob(blob, diagramFileName(code, 'png'));
}
