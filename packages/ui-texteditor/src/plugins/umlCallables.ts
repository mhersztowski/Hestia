/**
 * umlCallables.ts — funkcje z projektów UML dostępne w edytorze Blockly slotów.
 *
 * Projekt UML (`*.umlproj.json` ze strony Programming/UML) opisuje klasy i moduły
 * wraz z metodami. Do wywołania z poziomu slotu nadają się dwie grupy:
 *   • funkcje globalne — metody węzła typu `module` (czyli funkcje eksportowane
 *     z pliku),
 *   • metody statyczne klas — wołane bez instancji, więc nie wymagają niczego,
 *     czego slot nie ma pod ręką.
 * Metod instancyjnych świadomie nie wystawiamy: slot nie wie, na jakim obiekcie
 * miałby je wywołać.
 *
 * Kategoria `async` (nadawana przez parser TS przy generowaniu UML z kodu) jest
 * przenoszona do wywołania jako `await` — bez tego wygenerowany kod dostawałby
 * `Promise` zamiast wyniku.
 */

/**
 * Metadane dokumentacji TSDoc zapisane w projekcie UML (przez „Z kodu" albo
 * ręcznie). Kształt zgodny z `UmlDoc` z devtools — kopiujemy, nie tłumaczymy.
 */
export interface UmlCallableDoc {
  summary?: string;
  remarks?: string;
  /** Opisy argumentów po nazwie. */
  params?: Record<string, string>;
  returns?: string;
  examples?: string[];
  deprecated?: string;
  see?: string[];
  tags?: string[];
}

/** Kształt projektu UML — tylko to, czego naprawdę używamy. */
export interface UmlProjectLike {
  name?: string;
  diagrams?: Array<{
    nodes?: Array<{
      data?: {
        kind?: string;
        name?: string;
        linkedFile?: string;
        doc?: UmlCallableDoc;
        members?: Array<{ kind?: string; text?: string; category?: string; doc?: UmlCallableDoc }>;
      };
    }>;
  }>;
}

/** Pojedyncza funkcja możliwa do wywołania z bloczka. */
export interface UmlCallable {
  /** Klucz stabilny w obrębie sesji — trafia do pola bloczka. */
  id: string;
  /** Nazwa projektu UML (do pogrupowania na liście). */
  project: string;
  /** Nazwa klasy/modułu, w którym funkcja jest zdefiniowana. */
  owner: string;
  /** `module` = funkcja globalna, `class` = metoda statyczna. */
  ownerKind: 'module' | 'class';
  name: string;
  /** Nazwy parametrów (kolejność jak w sygnaturze). */
  params: string[];
  /** Typy parametrów w tej samej kolejności; `undefined` = brak adnotacji w UML. */
  paramTypes: Array<string | undefined>;
  returnType?: string;
  isAsync: boolean;
  /** Plik źródłowy (ścieżka względem katalogu użytkownika) — podstawa importu. */
  file?: string;
  /** Wyrażenie wywołania bez argumentów, np. `Api.loadAll` albo `topLevel`. */
  callee: string;
  /** Nazwa, którą trzeba zaimportować (klasa dla metod statycznych, funkcja dla globalnych). */
  importName: string;
  /** Etykieta na liście wyboru. */
  label: string;
  /** Dokumentacja funkcji z UML — zasila podpowiedź na bloczku. */
  doc?: UmlCallableDoc;
  /** Dokumentacja klasy/modułu, w którym funkcja siedzi (kontekst dla opisu). */
  ownerDoc?: UmlCallableDoc;
}

const SIGILS = '+-#~';

/** Rozkłada wiersz UML (`+ static async fn(a: string): Promise<void>`) na części. */
export function parseMemberLine(text: string): {
  name: string;
  params: string[];
  paramTypes: Array<string | undefined>;
  returnType?: string;
  isStatic: boolean;
  isAsync: boolean;
} | null {
  let s = String(text ?? '').trim();
  if (!s) return null;
  if (SIGILS.includes(s[0])) s = s.slice(1).trim();

  let isStatic = false;
  let isAsync = false;
  // Modyfikatory mogą wystąpić w dowolnej kolejności — projekt bywa edytowany ręcznie.
  for (;;) {
    if (s.startsWith('static ')) { isStatic = true; s = s.slice(7).trim(); continue; }
    if (s.startsWith('async ')) { isAsync = true; s = s.slice(6).trim(); continue; }
    break;
  }

  const open = s.indexOf('(');
  if (open < 0) return null;                      // pole, nie metoda
  const close = s.lastIndexOf(')');
  if (close < open) return null;

  const name = s.slice(0, open).trim();
  if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return null;

  const rawParams = s.slice(open + 1, close).trim();
  const params: string[] = [];
  const paramTypes: Array<string | undefined> = [];
  if (rawParams) {
    for (const part of splitParams(rawParams)) {
      const colon = part.indexOf(':');
      const rawName = (colon >= 0 ? part.slice(0, colon) : part).trim();
      const paramName = rawName.replace(/[?.]/g, '').trim();
      if (!paramName) continue;
      params.push(paramName);
      const type = colon >= 0 ? part.slice(colon + 1).trim() : '';
      // `name?: T` znaczy, że wolno pominąć argument — zapisujemy to w typie,
      // żeby kontrola argumentów nie krzyczała o brakującą wartość.
      paramTypes.push(type ? (rawName.includes('?') ? `${type} | undefined` : type) : undefined);
    }
  }

  const after = s.slice(close + 1).trim();
  const returnType = after.startsWith(':') ? after.slice(1).trim() : undefined;
  return { name, params, paramTypes, returnType, isStatic, isAsync };
}

/** Dzieli listę parametrów po przecinkach spoza nawiasów — `Map<string, number>` to jeden parametr. */
function splitParams(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if ('<([{'.includes(c)) depth++;
    else if ('>)]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(raw.slice(start, i)); start = i + 1; }
  }
  out.push(raw.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

/** Czy wiersz jest oznaczony jako asynchroniczny (kategoria z parsera albo słowo w tekście). */
function memberIsAsync(member: { text?: string; category?: string }, parsedAsync: boolean): boolean {
  return parsedAsync || member.category === 'async';
}

/**
 * Wyciąga z projektu UML wszystkie funkcje nadające się do wywołania z bloczka.
 * `projectKey` trafia do identyfikatorów, żeby dwie funkcje o tej samej nazwie
 * z różnych projektów nie zlały się w jedną pozycję listy.
 */
export function extractCallables(project: UmlProjectLike, projectKey: string): UmlCallable[] {
  const out: UmlCallable[] = [];
  const seen = new Set<string>();
  const projectName = project.name ?? projectKey;

  for (const diagram of project.diagrams ?? []) {
    for (const node of diagram.nodes ?? []) {
      const data = node.data;
      if (!data?.name) continue;
      const isModule = data.kind === 'module';
      const ownerKind: 'module' | 'class' = isModule ? 'module' : 'class';

      for (const member of data.members ?? []) {
        if (member.kind !== 'method') continue;
        const parsed = parseMemberLine(member.text ?? '');
        if (!parsed) continue;
        // Z klas bierzemy tylko statyczne — instancyjne nie mają w slocie obiektu,
        // na którym miałyby zadziałać.
        if (!isModule && !parsed.isStatic) continue;
        if (parsed.name === 'constructor') continue;

        const callee = isModule ? parsed.name : `${data.name}.${parsed.name}`;
        const id = `${projectKey}::${data.name}::${parsed.name}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const isAsync = memberIsAsync(member, parsed.isAsync);
        out.push({
          id,
          project: projectName,
          owner: data.name,
          ownerKind,
          name: parsed.name,
          params: parsed.params,
          paramTypes: parsed.paramTypes,
          returnType: parsed.returnType,
          isAsync,
          file: data.linkedFile,
          callee,
          importName: isModule ? parsed.name : data.name,
          label: `${isAsync ? 'async ' : ''}${callee}(${parsed.params.join(', ')})`,
          ...(member.doc ? { doc: member.doc } : {}),
          ...(data.doc ? { ownerDoc: data.doc } : {}),
        });
      }
    }
  }
  return out.sort((a, b) => a.callee.localeCompare(b.callee));
}

/**
 * Specyfikator importu dla funkcji — ścieżka względna od pliku, w którym plugin
 * jest otwarty. Oba pliki opisane są ścieżkami względem katalogu użytkownika,
 * więc wynik to zwykłe `./x` albo `../y/z` (bez rozszerzenia, jak w TS).
 * `null`, gdy UML nie wie, z jakiego pliku pochodzi symbol, albo gdy funkcja
 * mieszka w tym samym pliku (wtedy import byłby błędem).
 */
export function importSpecifierFor(callable: UmlCallable, currentFile: string): string | null {
  const target = normalize(callable.file ?? '');
  const from = normalize(currentFile);
  if (!target) return null;
  if (target === from) return null;

  const fromDir = from.split('/').slice(0, -1);
  const targetParts = target.replace(/\.(ts|tsx|js|jsx|mts|cts)$/i, '').split('/');

  let common = 0;
  while (common < fromDir.length && common < targetParts.length - 1 && fromDir[common] === targetParts[common]) common++;

  const up = fromDir.length - common;
  const down = targetParts.slice(common);
  const rel = [...Array(up).fill('..'), ...down].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function normalize(p: string): string {
  return String(p ?? '').replace(/^\/+/, '').replace(/\\/g, '/');
}

/**
 * Typ bloczka Blockly dla funkcji. Musi być stabilny między sesjami (zapisany
 * workspace slotu odwołuje się do typu bloczka po nazwie) i bezpieczny jako
 * identyfikator — stąd sanitacja zamiast surowego id z projektu.
 */
export function blockTypeFor(callable: UmlCallable): string {
  const safe = `${callable.owner}_${callable.name}`.replace(/[^A-Za-z0-9_]/g, '_');
  return `uml_${safe}`;
}

/**
 * Nazwa kategorii w toolboxie: dla metod statycznych — nazwa klasy, dla funkcji
 * globalnych — nazwa pliku modułu (bez ścieżki i rozszerzenia). Plik jest tu
 * czytelniejszy niż nazwa węzła UML, bo to on jest źródłem importu.
 */
export function categoryFor(callable: UmlCallable): string {
  if (callable.ownerKind === 'class') return callable.owner;
  const base = (callable.file ?? '').split('/').pop() ?? '';
  return base.replace(/\.(ts|tsx|js|jsx|mts|cts)$/i, '') || callable.owner;
}

/** Czy funkcja zwraca wartość — decyduje, czy bloczek ma wyjście, czy jest instrukcją. */
export function returnsValue(callable: UmlCallable): boolean {
  const t = (callable.returnType ?? '').replace(/\s+/g, '');
  if (!t) return false;
  return !(t === 'void' || t === 'Promise<void>' || t === 'undefined' || t === 'Promise<undefined>');
}

/** Grupuje funkcje w kategorie toolboxa (posortowane, stabilne). */
export function groupByCategory(callables: UmlCallable[]): Array<{ category: string; items: UmlCallable[] }> {
  const map = new Map<string, UmlCallable[]>();
  for (const c of callables) {
    const key = categoryFor(c);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return [...map.entries()]
    .map(([category, items]) => ({ category, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Kod wywołania dla generatora Blockly. Funkcja `async` dostaje `await` — slot
 * jest generowany jako ciało metody async, więc `await` jest tam legalny.
 */
export function callExpression(callable: UmlCallable, args: string[]): string {
  const call = `${callable.callee}(${args.join(', ')})`;
  return callable.isAsync ? `await ${call}` : call;
}

/** Typ (klasa/interfejs/enum/struktura) zadeklarowany w projekcie UML. */
export interface UmlType {
  name: string;
  /** `class` | `interface` | `enum` | `struct` | `abstract` — do ikony i podpowiedzi. */
  kind: string;
  project: string;
  /** Plik źródłowy z UML — pozwala dopisać import, gdy typ zostanie użyty. */
  file?: string;
}

/**
 * Wyciąga z projektu UML wszystkie NAZWANE TYPY. Moduły pomijamy: to pliki
 * z funkcjami, nie typy, których dałoby się użyć w adnotacji zmiennej.
 */
export function extractTypes(project: UmlProjectLike, projectKey: string): UmlType[] {
  const out: UmlType[] = [];
  const seen = new Set<string>();
  const projectName = project.name ?? projectKey;

  for (const diagram of project.diagrams ?? []) {
    for (const node of diagram.nodes ?? []) {
      const data = node.data;
      if (!data?.name || data.kind === 'module') continue;
      if (seen.has(data.name)) continue;
      seen.add(data.name);
      out.push({ name: data.name, kind: data.kind ?? 'class', project: projectName, file: data.linkedFile });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Czy funkcja ma jakąkolwiek dokumentację (decyduje o ikonie na bloczku). */
export function hasDoc(doc?: UmlCallableDoc): boolean {
  if (!doc) return false;
  return Object.values(doc).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''));
}

/** Wiersze podpowiedzi dla funkcji — gotowe do wyświetlenia w popupie. */
export interface DocSection {
  /** Nagłówek sekcji; pusty dla samego opisu. */
  title: string;
  /** Treść — dla argumentów każdy wpis to `nazwa — opis`. */
  lines: string[];
  /** Czy treść ma być pokazana czcionką o stałej szerokości (przykłady kodu). */
  code?: boolean;
}

/**
 * Rozkłada dokumentację na sekcje w kolejności, w jakiej czyta się dokumentację:
 * ostrzeżenie o wycofaniu, opis, uwagi, argumenty, zwracana wartość, przykłady.
 * Argumenty bez opisu w TSDoc też trafiają na listę — brak opisu jest wtedy
 * widoczny, zamiast wyglądać na brak argumentu.
 */
export function docSections(callable: UmlCallable): DocSection[] {
  const doc = callable.doc;
  if (!doc) return [];
  const out: DocSection[] = [];

  if (doc.deprecated !== undefined) {
    out.push({ title: '⚠ Przestarzałe', lines: [doc.deprecated || 'Bez uzasadnienia w kodzie.'] });
  }
  if (doc.summary) out.push({ title: '', lines: doc.summary.split('\n') });
  if (doc.remarks) out.push({ title: 'Uwagi', lines: doc.remarks.split('\n') });

  if (callable.params.length) {
    const lines = callable.params.map((name, i) => {
      const type = callable.paramTypes[i];
      const description = doc.params?.[name];
      const head = type ? `${name}: ${type}` : name;
      return description ? `${head} — ${description}` : head;
    });
    out.push({ title: 'Argumenty', lines });
  }

  if (doc.returns || callable.returnType) {
    const type = callable.returnType ? `${callable.returnType}` : '';
    const text = [type, doc.returns].filter(Boolean).join(' — ');
    out.push({ title: 'Zwraca', lines: [text] });
  }
  if (doc.examples?.length) out.push({ title: 'Przykład', lines: doc.examples[0].split('\n'), code: true });
  if (doc.see?.length) out.push({ title: 'Zobacz', lines: doc.see });

  return out;
}
