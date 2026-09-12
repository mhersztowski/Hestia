/**
 * layoutFrontMatter.ts — układ diagramu zapisany w bloku `---`.
 *
 * Mermaid nie ma współrzędnych: układ liczy renderer przy każdym rysowaniu.
 * Edytorowi graficznemu to nie wystarcza — ręczne rozmieszczenie musi przeżyć
 * zamknięcie notatki, inaczej jest pracą do wyrzucenia.
 *
 * Front matter jest na to właściwym miejscem, bo:
 *   • Mermaid go czyta i **pomija nieznane klucze**, więc diagram dalej się
 *     renderuje wszędzie, gdzie renderował się dotąd (sprawdzone jego własnym
 *     parserem);
 *   • zostaje jeden plik — układ nie wymaga pliku towarzyszącego, co przeczyłoby
 *     temu, że notatka jest samowystarczalna;
 *   • blok stoi na początku, więc różnica w repozytorium pokazuje zmianę układu
 *     osobno od zmiany treści diagramu.
 *
 * Klucz nazywa się `positions`, a **nie** `layout`: `layout` od Mermaida 11 jest
 * jego własnym ustawieniem (wybór silnika rozmieszczania, `dagre`/`elk`)
 * i zajęcie go znaczyłoby ciche nadpisywanie cudzej konfiguracji.
 *
 * Zapis jest **mini-YAML-em pisanym ręcznie**, bez biblioteki: sekcja ma jeden
 * kształt (`nazwa: [liczby]`), a wciągnięcie parsera YAML do pakietu
 * przeglądarkowego kosztowałoby więcej niż wszystko, co tu robimy.
 */

/** Położenie i (dla grup) rozmiar elementu. */
export interface StoredBox {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type LayoutMap = Record<string, StoredBox>;

const SECTION = 'positions';
/** `  A: [120, 40]` albo `  G: [0, 0, 300, 200]` */
const ENTRY = /^\s+([A-Za-z0-9_.-]+)\s*:\s*\[([^\]]*)\]\s*$/;

/** Czy linia zaczyna nowy klucz najwyższego poziomu (kończy sekcję). */
function isTopLevelKey(line: string): boolean {
  return /^[A-Za-z0-9_.-]+\s*:/.test(line);
}

/**
 * Wcięte linie sekcji `nazwa:` bloku `---`; pusta lista, gdy sekcji nie ma.
 *
 * Sekcji jest już więcej niż jedna (`positions` z układem, `source` ze
 * wskazaniem plików źródłowych przy imporcie z kodu), więc odczyt i zapis są
 * tu wspólne. Bez tego druga sekcja kasowałaby pierwszą przy każdym zapisie —
 * a to jest awaria widoczna dopiero po zamknięciu notatki.
 */
export function readSectionLines(frontMatter: string, name: string): string[] {
  const lines = frontMatter.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${name}:`);
  if (start === -1) return [];

  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') break;
    if (isTopLevelKey(line)) break;
    out.push(line);
  }
  return out;
}

/** Blok `---` z podmienioną sekcją; `undefined`, gdy nie zostało nic do zapisania. */
export function writeSectionLines(
  frontMatter: string | undefined,
  name: string,
  sectionLines: string[],
): string | undefined {
  const rest = otherLines(frontMatter, name);
  if (sectionLines.length === 0) {
    return rest.length > 0 ? ['---', ...rest, '---'].join('\n') : undefined;
  }
  return ['---', ...rest, `${name}:`, ...sectionLines, '---'].join('\n');
}

/** Pozycje zapisane w bloku; pusta mapa, gdy sekcji nie ma. */
export function readPositions(frontMatter: string): LayoutMap {
  const lines = readSectionLines(frontMatter, SECTION);

  const out: LayoutMap = {};
  for (const line of lines) {
    const entry = ENTRY.exec(line);
    if (!entry) continue;

    const numbers = entry[2].split(',').map((part) => Number(part.trim()));
    // Nieczytelny wpis pomijamy zamiast zerować całą mapę: blok bywa
    // poprawiany ręcznie, a jeden zepsuty wiersz nie może kasować układu.
    if (numbers.some((n) => !Number.isFinite(n))) continue;

    if (numbers.length === 2) out[entry[1]] = { x: numbers[0], y: numbers[1] };
    else if (numbers.length === 4) {
      out[entry[1]] = { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
    }
  }
  return out;
}

/** Linie bloku bez ograniczników i bez wskazanej sekcji. */
function otherLines(frontMatter: string | undefined, name: string): string[] {
  if (!frontMatter) return [];
  const lines = frontMatter.split('\n').filter((line) => line.trim() !== '---');
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.trim() === `${name}:`) { inSection = true; continue; }
    if (inSection && !isTopLevelKey(line)) continue;
    inSection = false;
    out.push(line);
  }
  return out;
}

/**
 * Blok z wpisanym układem; `undefined`, gdy nie ma już czego zapisywać.
 *
 * Współrzędne zaokrąglamy: piksel jest najmniejszą jednostką, którą widać,
 * a ogon zmiennoprzecinkowy robiłby różnicę w pliku przy każdym drgnięciu myszy.
 */
export function writePositions(
  frontMatter: string | undefined,
  layout: LayoutMap,
): string | undefined {
  const section = Object.keys(layout).sort().map((id) => {
    const box = layout[id];
    const numbers = box.width !== undefined && box.height !== undefined
      ? [box.x, box.y, box.width, box.height]
      : [box.x, box.y];
    return `  ${id}: [${numbers.map(Math.round).join(', ')}]`;
  });

  return writeSectionLines(frontMatter, SECTION, section);
}
