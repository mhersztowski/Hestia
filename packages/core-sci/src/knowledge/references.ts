/**
 * references.ts — odsyłacze między fragmentami bazy.
 *
 * Podręcznik jest gęstą siecią odesłań: „zgodnie z równaniem (15-9)", „patrz
 * rys. 15-1b", „porównać z przykładem 3". W tomie pierwszym Resnicka jest ich
 * **3191** — więcej niż wzorów i rysunków razem. Bez wsparcia takie zdanie jest
 * martwą literą i czytelnik szuka ręcznie.
 *
 * Jedna decyzja przesądza o całej reszcie: **odsyłacz wskazuje identyfikator,
 * nigdy ścieżkę**. Rozwiązuje go indeks bazy, więc przeniesienie katalogu z
 * książką jest przebudową indeksu, a nie edycją tysięcy odsyłaczy. To dlatego
 * identyfikatory muszą być unikalne w całej bazie i dlatego niosą przedrostek
 * książki (`rh1-15-…`) — sam numer rozdziału nie wystarcza, bo każda książka ma
 * rozdział 15.
 *
 * Zapis `((id))` albo `((id|podpis))`. Podpis pozwala napisać zdanie po polsku
 * zamiast wklejać identyfikator w środek tekstu.
 */

export interface Reference {
  id: string;
  /** Tekst do pokazania; brak = pokazujemy nazwę celu z indeksu. */
  label?: string;
  /** Położenie w tekście źródłowym — do podmiany przy edycji. */
  start: number;
  end: number;
}

export interface ReferenceIndex {
  /**
   * Wszystkie cele w jednej mapie — z `buildIndex`.
   *
   * Ma pierwszeństwo przed `formulaHome`/`termHome`, które zostają dla
   * wywołań sprzed rozszerzenia odsyłaczy na rysunki, tablice i paragrafy.
   */
  anchors?: Map<string, { path: string; kind: ReferenceKind }>;
  /** Identyfikator wzoru → ścieżka dokumentu, w którym mieszka. */
  formulaHome: Map<string, string>;
  /** Identyfikator hasła słownika → ścieżka dokumentu. */
  termHome?: Map<string, string>;
  /** Ścieżka dokumentu → jego tytuł. Brak = nie umiemy nazwać dokumentu. */
  documentTitles?: Map<string, string>;
}

/**
 * Co jest po drugiej stronie odsyłacza — od tego zależy wygląd podglądu.
 *
 * `section` zachowuje się inaczej niż reszta: nie ma czego pokazać w dymku
 * poza tytułem, a kliknięcie ma **przewinąć albo przejść**, nie otworzyć podgląd.
 */
/**
 * Co może być celem odsyłacza.
 *
 * Lista musi być zgodna z `AnchorKind` w `knowledge/index.ts` — to ta sama
 * rzecz widziana z dwóch stron, a rozjazd objawia się dopiero w hoście, przy
 * przypisaniu mapy kotwic.
 */
export type ReferenceKind =
  | 'formula' | 'term' | 'figure' | 'table' | 'section' | 'callout' | 'law' | 'exercise';

export interface ResolvedReference {
  found: boolean;
  path?: string;
  documentTitle?: string;
  kind?: ReferenceKind;
  /** Czy cel leży w tym samym dokumencie — wtedy to przewinięcie, nie nawigacja. */
  sameDocument: boolean;
}

/**
 * Wzorzec odsyłacza: `((id))` albo `((id|podpis))`.
 *
 * **Nie `[[…]]`.** Ten zapis jest już zajęty przez edytor Markdown na
 * obsidianowe linki do plików w Drive (`[[notatka]]` → `drive/notatka.md`),
 * więc odsyłacz do wzoru zamieniał się tam w link do nieistniejącego pliku.
 * Podwójny nawias okrągły znaczy w Roam i Logseq „odniesienie do bloku" — a my
 * właśnie wskazujemy fragment, nie plik.
 *
 * Identyfikator zaczyna się od litery i zawiera tylko litery, cyfry, myślnik
 * i podkreślnik. Dzięki temu zwykły nawias w zdaniu („(patrz (a) wyżej)") nie
 * jest brany za odsyłacz.
 *
 * Podpis **może być złamany na wiersze** — plik źródłowy jest zawijany, więc
 * „paragrafu\n6-3" jest zapisem normalnym, a nie błędem. Nie może za to
 * zawierać nawiasu zamykającego, co powstrzymuje dopasowanie przed ucieczką
 * poza odsyłacz.
 */
const ODSYLACZ = /\(\(([A-Za-z][A-Za-z0-9_-]*)(?:\|([^)]+))?\)\)/g;

export function parseReferences(text: string): Reference[] {
  const wynik: Reference[] = [];

  for (const dopasowanie of text.matchAll(ODSYLACZ)) {
    wynik.push({
      id: dopasowanie[1],
      // Złamanie wiersza w podpisie jest zapisem, nie treścią — akapit i tak
      // składa się na nowo, więc sklejamy w jedną linię.
      label: dopasowanie[2]?.replace(/\s+/g, ' ').trim(),
      start: dopasowanie.index!,
      end: dopasowanie.index! + dopasowanie[0].length,
    });
  }

  return wynik;
}

/**
 * Znajduje dokument, w którym mieszka cel odsyłacza.
 *
 * `currentPath` służy wyłącznie do rozpoznania, czy cel jest w tym samym
 * dokumencie — **nie** wpływa na samo rozwiązanie. Gdyby wpływał, przeniesienie
 * dokumentu zmieniałoby znaczenie jego odsyłaczy.
 */
export function resolveReference(
  id: string,
  index: ReferenceIndex,
  currentPath: string,
): ResolvedReference {
  const cel = index.anchors?.get(id)
    ?? (index.formulaHome.has(id)
      ? { path: index.formulaHome.get(id)!, kind: 'formula' as ReferenceKind }
      : index.termHome?.has(id)
        ? { path: index.termHome.get(id)!, kind: 'term' as ReferenceKind }
        : undefined);

  if (!cel) return { found: false, sameDocument: false };

  return {
    found: true,
    path: cel.path,
    kind: cel.kind,
    documentTitle: index.documentTitles?.get(cel.path),
    sameDocument: cel.path === currentPath,
  };
}

export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; id: string; label?: string };

/**
 * Rozbija tekst na fragmenty i odsyłacze.
 *
 * Widok składa z tego akapit: fragmenty idą jak zwykły markdown, odsyłacze
 * dostają własny element z podglądem celu.
 */
export function splitByReferences(text: string): TextPart[] {
  const odsylacze = parseReferences(text);
  if (!odsylacze.length) return [{ kind: 'text', text }];

  const czesci: TextPart[] = [];
  let pozycja = 0;

  for (const ref of odsylacze) {
    if (ref.start > pozycja) {
      czesci.push({ kind: 'text', text: text.slice(pozycja, ref.start) });
    }
    czesci.push({ kind: 'ref', id: ref.id, label: ref.label });
    pozycja = ref.end;
  }

  if (pozycja < text.length) czesci.push({ kind: 'text', text: text.slice(pozycja) });
  return czesci;
}

/**
 * Odsyłacze prowadzące donikąd.
 *
 * Zgłaszamy je jawnie, bo cichy link do nieistniejącego celu wygląda jak
 * działający — czytelnik klika i nic się nie dzieje.
 */
export function danglingReferences(
  text: string,
  index: ReferenceIndex,
): string[] {
  return parseReferences(text)
    .filter((ref) => !index.anchors?.has(ref.id)
      && !index.formulaHome.has(ref.id)
      && !index.termHome?.has(ref.id))
    .map((ref) => ref.id);
}
