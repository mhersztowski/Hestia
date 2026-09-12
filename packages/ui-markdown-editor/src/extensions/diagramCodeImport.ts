/**
 * diagramCodeImport.ts — diagram klas z kodu źródłowego, w bloku notatki.
 *
 * Backend zna już całą trudną część: `POST /api/users/{u}/uml/sync` parsuje
 * TypeScript, JavaScript, Pythona, C i C++ (`@hestia/node-devtools`) i zwraca
 * projekt UML, a `web-devtools` tłumaczy go na model diagramu. Tutaj mieszkają
 * dwie rzeczy, których żadna z tych warstw nie zna:
 *
 *   • **skąd wziął się ten diagram** — zapisane w bloku, żeby odświeżenie nie
 *     wymagało powtarzania wyboru plików;
 *   • **co się zmieniło** przy odświeżeniu.
 *
 * Porównanie robimy po stronie klienta, na modelu diagramu, choć `devtools` ma
 * własne `describeChanges`. Tamto działa na `UmlProject` — a trzymanie projektu
 * razem z historią commitów w bloku markdown znaczyłoby kilkadziesiąt kilobajtów
 * JSON-a w notatce po to, żeby raz na jakiś czas pokazać listę zmian.
 *
 * **Wartość importu jest w odświeżaniu, nie w pierwszym przebiegu.** Narysowanie
 * trzech klas ręcznie zajmuje minutę; tego, że diagram architektury w notatce
 * jest z kodu sprzed tygodnia, nie da się zobaczyć bez takiego porównania.
 */
import {
  readSectionLines, splitFrontMatter, withFrontMatter, writeSectionLines,
  type DiagramDocument,
} from '@hestia/ui-devtools/diagrams';

/** Skąd pochodzi diagram — tyle, ile potrzeba do powtórzenia importu. */
export interface CodeSource {
  /** Katalog względem korzenia użytkownika (albo `mycastle-code/…`). */
  dir: string;
  /** Wybrane pliki względem `dir`; pusta lista = cały katalog. */
  files: string[];
}

const SECTION = 'source';

/** Źródło zapisane w bloku; `undefined`, gdy diagram nie pochodzi z kodu. */
export function readCodeSource(code: string): CodeSource | undefined {
  const { frontMatter } = splitFrontMatter(code);
  if (!frontMatter) return undefined;

  const lines = readSectionLines(frontMatter, SECTION);
  const dir = lines.map((l) => /^\s+dir:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
  if (!dir) return undefined;

  const raw = lines.map((l) => /^\s+files:\s*\[(.*)\]\s*$/.exec(l)?.[1]).find((v) => v !== undefined);
  const files = (raw ?? '').split(',').map((f) => f.trim()).filter(Boolean);

  return { dir, files };
}

/**
 * Blok z zapisanym źródłem importu.
 *
 * Sekcja `source` leży w tym samym bloku `---`, co `positions` z układem —
 * zapis jednej nie może kasować drugiej, o co dba `writeSectionLines`.
 */
export function writeCodeSource(code: string, source: CodeSource): string {
  const { frontMatter, body } = splitFrontMatter(code);
  const lines = [`  dir: ${source.dir}`, `  files: [${source.files.join(', ')}]`];
  return withFrontMatter(writeSectionLines(frontMatter || undefined, SECTION, lines), body);
}

// --- porównanie po odświeżeniu ----------------------------------------------

/** Odmiana rzeczownika po liczbie — „1 składowa", „2 składowe", „5 składowych". */
function odmien(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const ostatnia = n % 10;
  const dziesiatki = n % 100;
  const bliska = ostatnia >= 2 && ostatnia <= 4 && !(dziesiatki >= 12 && dziesiatki <= 14);
  return bliska ? few : many;
}

/** Zapis składowych klasy — do porównania „czy to jeszcze ta sama klasa". */
function membersOf(doc: DiagramDocument, id: string): string[] {
  return (doc.nodes.find((n) => n.id === id)?.members ?? []).map((m) => m.raw.trim());
}

/**
 * Co się zmieniło między dwiema wersjami diagramu — po jednym zdaniu na rzecz.
 *
 * Świadomie **nie wypisujemy każdej składowej z osobna**: odświeżenie po
 * tygodniu pracy w kodzie dałoby listę na kilkaset linii, której nikt nie
 * przeczyta. Liczba mówi to samo i mieści się w jednym wierszu.
 */
export function describeDiff(before: DiagramDocument, after: DiagramDocument): string[] {
  const out: string[] = [];

  const stare = new Set(before.nodes.map((n) => n.id));
  const nowe = new Set(after.nodes.map((n) => n.id));

  for (const id of [...nowe].filter((n) => !stare.has(n)).sort()) out.push(`dodano klasę ${id}`);
  for (const id of [...stare].filter((n) => !nowe.has(n)).sort()) out.push(`usunięto klasę ${id}`);

  for (const id of [...nowe].filter((n) => stare.has(n)).sort()) {
    const przed = membersOf(before, id);
    const po = membersOf(after, id);
    if (przed.join('\n') === po.join('\n')) continue;

    const roznica = po.length - przed.length;
    if (roznica > 0) {
      out.push(`${id}: ${roznica} ${odmien(roznica, 'składowa więcej', 'składowe więcej', 'składowych więcej')}`);
    } else if (roznica < 0) {
      const n = -roznica;
      out.push(`${id}: ${n} ${odmien(n, 'składowa mniej', 'składowe mniej', 'składowych mniej')}`);
    } else {
      out.push(`${id}: zmieniono składowe`);
    }
  }

  // Relacje porównujemy zbiorczo: pojedyncza zmieniona krawędź w diagramie
  // z kodu prawie zawsze znaczy zmianę typu pola, o której mówi już linia wyżej.
  const klucz = (e: { source: string; target: string; relation?: string }) => `${e.source}>${e.target}:${e.relation ?? ''}`;
  const relacjePrzed = new Set(before.edges.map(klucz));
  const relacjePo = new Set(after.edges.map(klucz));
  const dodane = [...relacjePo].filter((r) => !relacjePrzed.has(r)).length;
  const usuniete = [...relacjePrzed].filter((r) => !relacjePo.has(r)).length;

  if (dodane > 0) out.push(`dodano ${dodane} ${odmien(dodane, 'relację', 'relacje', 'relacji')}`);
  if (usuniete > 0) out.push(`usunięto ${usuniete} ${odmien(usuniete, 'relację', 'relacje', 'relacji')}`);

  return out;
}

/**
 * Nazwa zalogowanego użytkownika, czytana z tego samego miejsca co `AuthProvider`.
 *
 * Nie hook, choć kontekst istnieje: `useAuth` rzuca poza providerem, a widok
 * bloku bywa renderowany bez niego (testy, podgląd, eksport statyczny). Import
 * z kodu jest tam po prostu niedostępny i to jest właściwe zachowanie — gorsze
 * byłoby wywalenie całego bloku z powodu funkcji, której nikt w tym trybie
 * nie użyje.
 */
export function currentUserName(): string | undefined {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const session = raw ? (JSON.parse(raw) as { user?: { name?: string } }) : undefined;
    return session?.user?.name;
  } catch {
    return undefined;
  }
}
