/**
 * argTypeCheck.ts — kontrola typów argumentów w wywołaniach funkcji z UML.
 *
 * Plugin nie ma kompilatora TypeScriptu, więc porównanie typów jest z natury
 * przybliżone. Zasada nadrzędna: **zgłaszamy tylko oczywiste niezgodności**.
 * Wątpliwość zawsze rozstrzygamy na korzyść użytkownika — fałszywy alarm przy
 * poprawnym kodzie jest gorszy niż przeoczony błąd, bo uczy ignorowania ostrzeżeń.
 */

/** Typy prymitywne, dla których sprzeczność da się stwierdzić pewnie. */
const PRIMITIVES = new Set(['string', 'number', 'boolean', 'bigint', 'symbol']);

/**
 * Typy pochłaniające wszystko w OBU kierunkach.
 *
 * `unknown` świadomie tu nie należy: w TypeScripcie przyjmuje każdą wartość,
 * ale sam nie daje się nikomu przypisać (`f(x: Conn)` z argumentem `unknown`
 * to błąd). Dlatego jest obsłużony osobno, kierunkowo.
 */
const WILDCARDS = new Set(['any', 'object', '', 'void', 'never']);

/** Zdejmuje ozdobniki, które nie zmieniają rozstrzygnięcia (spacje, nawiasy, `readonly`). */
export function normalizeType(type: string | undefined | null): string {
  let t = String(type ?? '').trim();
  if (!t) return '';
  t = t.replace(/\breadonly\s+/g, '').replace(/\s+/g, '');
  // `(string|number)` → `string|number`
  while (t.startsWith('(') && t.endsWith(')')) t = t.slice(1, -1);
  return t;
}

/** Rozbija unię na składniki (`string|null` → ['string','null']). */
function unionParts(type: string): string[] {
  const t = normalizeType(type);
  if (!t.includes('|')) return [t];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ('<([{'.includes(c)) depth++;
    else if ('>)]}'.includes(c)) depth--;
    else if (c === '|' && depth === 0) { out.push(t.slice(start, i)); start = i + 1; }
  }
  out.push(t.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

/** `Promise<T>` → `T`; wynik `await` ma już typ rozpakowany. */
export function unwrapPromise(type: string): string {
  const t = normalizeType(type);
  const m = /^Promise<(.+)>$/.exec(t);
  return m ? m[1] : t;
}

/** Czy typ jest tablicą (`T[]` albo `Array<T>`). */
function isArrayType(t: string): boolean {
  return /\[\]$/.test(t) || /^(Readonly)?Array</.test(t);
}

/**
 * Czy wartość typu `actual` wolno podać tam, gdzie oczekiwany jest `expected`.
 *
 * Zwraca `true` również wtedy, gdy po prostu nie wiemy — np. typ własny,
 * generyk albo brak adnotacji. Fałsz pojawia się tylko dla sprzeczności, które
 * widać bez analizy semantycznej: inny prymityw, prymityw vs tablica, prymityw
 * vs typ obiektowy.
 */
export function typesCompatible(expected: string | undefined, actual: string | undefined): boolean {
  const exp = normalizeType(expected);
  const act = normalizeType(actual);
  if (!exp || !act) return true;
  if (exp === act) return true;
  if (WILDCARDS.has(exp) || WILDCARDS.has(act)) return true;
  // `unknown` jako OCZEKIWANY przyjmuje wszystko…
  if (exp === 'unknown') return true;
  // …ale jako WARTOŚĆ nie pasuje nigdzie (poza any/unknown, obsłużonym wyżej).
  // To najczęstszy realny błąd: domyślny typ zmiennej i rzutowania w bloczkach
  // to `unknown`, więc podanie go do funkcji o typowanym parametrze trzeba zgłosić.
  if (act === 'unknown') return false;

  // Unia po stronie oczekiwanej: wystarczy zgodność z jednym wariantem.
  const expParts = unionParts(exp);
  if (expParts.length > 1) return expParts.some((p) => typesCompatible(p, act));
  // Unia po stronie wartości: musi pasować cała (każdy wariant).
  const actParts = unionParts(act);
  if (actParts.length > 1) return actParts.every((p) => typesCompatible(exp, p));

  if (exp === 'null' || exp === 'undefined' || act === 'null' || act === 'undefined') {
    // Bez informacji o `strictNullChecks` nie kłócimy się o null/undefined.
    return true;
  }

  const expPrim = PRIMITIVES.has(exp);
  const actPrim = PRIMITIVES.has(act);

  if (expPrim && actPrim) return exp === act;
  if (expPrim !== actPrim) {
    // Prymityw kontra coś innego: sprzeczność tylko gdy druga strona to tablica
    // albo znany typ złożony. Nieznana nazwa może być aliasem prymitywu.
    const other = expPrim ? act : exp;
    if (isArrayType(other)) return false;
    if (/^(Map|Set|Promise|Record)</.test(other)) return false;
    return !PRIMITIVES.has(expPrim ? exp : act) || looksLikeClassName(other) === false;
  }

  if (isArrayType(exp) !== isArrayType(act)) return false;
  // Dwa różne typy nazwane (klasy, interfejsy) — dziedziczenia nie znamy,
  // więc nie orzekamy o niezgodności.
  return true;
}

/** Nazwa wyglądająca na typ nazwany (klasa/interfejs) — wielka litera na starcie. */
function looksLikeClassName(t: string): boolean {
  return /^[A-Z]/.test(t);
}

export interface ArgIssue {
  /** Indeks argumentu (0-based) — pozwala wskazać konkretne wejście bloczka. */
  index: number;
  paramName: string;
  expected: string;
  actual: string;
  message: string;
}

/**
 * Porównuje typy argumentów wywołania z sygnaturą funkcji.
 * `actualTypes[i] === undefined` znaczy „nie wiadomo" i nie jest zgłaszane.
 */
export function checkCallArgs(
  callee: string,
  paramNames: string[],
  paramTypes: Array<string | undefined>,
  actualTypes: Array<string | undefined>,
): ArgIssue[] {
  const issues: ArgIssue[] = [];
  for (let i = 0; i < paramNames.length; i++) {
    const expected = paramTypes[i];
    const actual = actualTypes[i];
    if (!expected || !actual) continue;
    if (typesCompatible(expected, actual)) continue;
    issues.push({
      index: i,
      paramName: paramNames[i],
      expected: normalizeType(expected),
      actual: normalizeType(actual),
      message: `${callee}: argument ${i + 1} „${paramNames[i]}" oczekuje ${normalizeType(expected)}, a dostaje ${normalizeType(actual)}`,
    });
  }
  return issues;
}

/** Jednolity tekst do chmurki ostrzeżenia na bloczku. */
export function formatIssues(issues: ArgIssue[]): string {
  if (issues.length === 0) return '';
  const head = issues.length === 1 ? 'Niezgodny typ argumentu:' : `Niezgodne typy argumentów (${issues.length}):`;
  return [head, ...issues.map((i) => `• ${i.message}`)].join('\n');
}
