/**
 * Odczyt i przepisywanie deklaracji składowych klasy (`signal`, `property`,
 * `variable`) w źródle TypeScript — warstwa czysto tekstowa, bez Monaco.
 *
 * Mieszka osobno, bo `VisualMinisLibPlugin.tsx` importuje Blockly i Monaco,
 * więc nie daje się wczytać w teście jednostkowym; a to właśnie ta logika
 * (gdzie kończy się deklaracja, co jest metodą, a co polem) psuje plik
 * użytkownika, kiedy jest błędna.
 */

export interface SignalArg {
  /** Nazwa elementu tupli. Pusta, gdy sygnał zapisano bez nazw. */
  name: string;
  type: string;
}

export interface SignalPortLite { name: string; type: string }

/* ── Skaner źródła ───────────────────────────────────────────────────────── */

/**
 * Gdy pod `i` zaczyna się string, template albo komentarz — zwraca indeks
 * pierwszego znaku za nim, inaczej −1. Wszystkie skanery poniżej używają
 * tego, żeby klamra w napisie nie przesuwała im głębokości bloku.
 */
function skipNonCode(code: string, i: number): number {
  const c = code[i];
  if (c === '/' && code[i + 1] === '/') {
    const nl = code.indexOf('\n', i);
    return nl === -1 ? code.length : nl;
  }
  if (c === '/' && code[i + 1] === '*') {
    const end = code.indexOf('*/', i + 2);
    return end === -1 ? code.length : end + 2;
  }
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1;
    while (j < code.length) {
      if (code[j] === '\\') { j += 2; continue; }
      if (code[j] === c) return j + 1;
      j++;
    }
    return code.length;
  }
  return -1;
}

const OPEN = '([{';
const CLOSE = ')]}';

/** Dzieli listę po przecinkach na najwyższym poziomie zagnieżdżenia. */
export function splitTopLevel(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const skip = skipNonCode(s, i);
    if (skip >= 0) { i = skip; continue; }
    const c = s[i];
    if (OPEN.includes(c) || c === '<') depth++;
    else if (CLOSE.includes(c) || c === '>') depth--;
    else if (c === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    i++;
  }
  if (s.slice(start).trim()) out.push(s.slice(start));
  return out;
}

/** Indeks pierwszego `ch` na najwyższym poziomie zagnieżdżenia, albo −1. */
function topLevelIndexOf(s: string, ch: string): number {
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const skip = skipNonCode(s, i);
    if (skip >= 0) { i = skip; continue; }
    const c = s[i];
    if (OPEN.includes(c) || c === '<') depth++;
    else if (CLOSE.includes(c) || c === '>') depth--;
    else if (c === ch && depth === 0) return i;
    i++;
  }
  return -1;
}

/** Czyta zbalansowany `<…>` zaczynający się pod `open`. */
function readGeneric(code: string, open: number): { content: string; end: number } | null {
  if (code[open] !== '<') return null;
  let depth = 0;
  let i = open;
  while (i < code.length) {
    const skip = skipNonCode(code, i);
    if (skip >= 0) { i = skip; continue; }
    const c = code[i];
    if (c === '<') depth++;
    else if (c === '>') {
      depth--;
      if (depth === 0) return { content: code.slice(open + 1, i), end: i + 1 };
    }
    i++;
  }
  return null;
}

/* ── Argumenty sygnału ───────────────────────────────────────────────────── */

/**
 * `[x: number, y: string]` → dwa argumenty. Typ spoza tupli (starszy zapis
 * `Signal<number>`) daje jeden nienazwany argument zamiast pustej listy —
 * inaczej panel skasowałby użytkownikowi typ, którego nie zrozumiał.
 */
export function parseSignalArgs(typeStr: string): SignalArg[] {
  const t = (typeStr ?? '').trim();
  if (!t) return [];
  const inner = t.startsWith('[') && t.endsWith(']') ? t.slice(1, -1) : t;
  if (!inner.trim()) return [];
  return splitTopLevel(inner).map((part) => {
    const colon = topLevelIndexOf(part, ':');
    if (colon < 0) return { name: '', type: part.trim() };
    const rawName = part.slice(0, colon).trim();
    // Lewa strona musi wyglądać jak nazwa elementu tupli; `{ a: 1 }` czy
    // `(x: number) => void` mają dwukropek, ale nazwą nie są.
    if (!/^\w+\??$/.test(rawName)) return { name: '', type: part.trim() };
    return { name: rawName.replace(/\?$/, ''), type: part.slice(colon + 1).trim() };
  });
}

/**
 * Odwrotność `parseSignalArgs`. TypeScript nie pozwala mieszać nazwanych
 * i nienazwanych elementów tupli, więc albo nazwy mają wszyscy, albo nikt —
 * brakujące dostają zastępcze `argN`, bo kod ma się kompilować.
 */
export function formatSignalArgs(args: SignalArg[]): string {
  if (args.length === 0) return '[]';
  const anyNamed = args.some((a) => a.name.trim());
  const parts = args.map((a, i) => {
    const type = a.type.trim() || 'unknown';
    if (!anyNamed) return type;
    return `${a.name.trim() || `arg${i + 1}`}: ${type}`;
  });
  return `[${parts.join(', ')}]`;
}

/**
 * Lista parametrów metody: `v: number, opis: string` → dwa argumenty.
 * Odrębna od tupli sygnału, bo nie ma nawiasów i nazwa jest tu obowiązkowa.
 */
export function parseParamList(raw: string): SignalArg[] {
  const t = (raw ?? '').trim();
  if (!t) return [];
  return splitTopLevel(t).map((part, i) => {
    const colon = topLevelIndexOf(part, ':');
    if (colon < 0) return { name: part.trim() || `arg${i + 1}`, type: 'unknown' };
    const name = part.slice(0, colon).trim().replace(/^(?:readonly|public|private|protected)\s+/, '');
    return { name: name.replace(/\?$/, '') || `arg${i + 1}`, type: part.slice(colon + 1).trim() || 'unknown' };
  });
}

/** Odwrotność `parseParamList` — postać wprost do wstawienia między nawiasy. */
export function formatParamList(args: SignalArg[]): string {
  return args
    .map((a, i) => `${a.name.trim() || `arg${i + 1}`}: ${a.type.trim() || 'unknown'}`)
    .join(', ');
}

/* ── Generatory deklaracji ───────────────────────────────────────────────── */

export function buildSignalMember(name: string, args: SignalArg[]): string {
  return `readonly ${name} = new Signal<${formatSignalArgs(args)}>();`;
}

export function buildPropertyMember(name: string, type: string, defaultVal: string): string {
  return `readonly ${name} = new MProperty<${type.trim() || 'unknown'}>(${defaultVal.trim() || 'undefined'});`;
}

export function buildVariableMember(name: string, type: string, value: string): string {
  return `${name}: ${type.trim() || 'unknown'} = ${value.trim() || 'undefined'};`;
}

/* ── Lokalizacja klasy i jej pól ─────────────────────────────────────────── */

/**
 * Pozycje początków składowych klasy w jej ciele — czyli miejsca, w których
 * wolno anchorować dopasowanie deklaracji. Bez tego skan łapie deklaracje
 * z wnętrza metod: parametr slotu `s: Signal<…>` albo `const x = new Signal()`
 * wyglądają dokładnie jak pole klasy, więc slot pojawiał się w panelu
 * jako sygnał.
 */
function topLevelMemberStarts(body: string): number[] {
  const starts: number[] = [];
  let depth = 0;
  let atMemberStart = true;
  let i = 0;
  while (i < body.length) {
    const skip = skipNonCode(body, i);
    if (skip >= 0) { i = skip; continue; }
    const c = body[i];
    if (/\s/.test(c)) { i++; continue; }
    if (depth === 0 && atMemberStart) {
      starts.push(i);
      atMemberStart = false;
    }
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) {
      depth--;
      if (depth === 0 && c === '}') atMemberStart = true;
    } else if (c === ';' && depth === 0) atMemberStart = true;
    i++;
  }
  return starts;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Zakres ciała klasy: `start` tuż za `{`, `end` na zamykającym `}`. */
export function findClassBody(code: string, className: string): { start: number; end: number } | null {
  const re = new RegExp(`class\\s+${escRe(className)}\\b[^{]*\\{`);
  const m = re.exec(code);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < code.length) {
    const skip = skipNonCode(code, i);
    if (skip >= 0) { i = skip; continue; }
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return { start, end: i };
    }
    i++;
  }
  return null;
}

/**
 * Zakres deklaracji pola `fieldName` (od modyfikatorów do średnika włącznie).
 * Szuka wyłącznie na poziomie ciała klasy, więc `this.stan` w metodzie nie
 * udaje deklaracji, a metoda `stan()` nie udaje pola.
 */
export function findFieldRange(code: string, className: string, fieldName: string): { start: number; end: number } | null {
  const body = findClassBody(code, className);
  if (!body) return null;
  const inner = code.slice(body.start, body.end);
  const declRe = new RegExp(
    `^(?:(?:readonly|public|private|protected|static|override|declare|abstract)\\s+)*${escRe(fieldName)}\\s*(!?\\s*:|=)`,
  );
  for (const start of topLevelMemberStarts(inner)) {
    if (!declRe.test(inner.slice(start))) continue;
    // Koniec deklaracji = pierwszy średnik na poziomie 0. Wartość domyślna
    // bywa wyrażeniem z nawiasami — dlatego liczymy głębokość.
    let d = 0;
    let j = start;
    while (j < inner.length) {
      const skip = skipNonCode(inner, j);
      if (skip >= 0) { j = skip; continue; }
      const k = inner[j];
      if (OPEN.includes(k) || k === '<') d++;
      else if (CLOSE.includes(k) || k === '>') d--;
      else if (k === ';' && d === 0) return { start: body.start + start, end: body.start + j + 1 };
      j++;
    }
    return null;
  }
  return null;
}

/** Czy klasa deklaruje takie pole? Panel po tym poznaje, co da się edytować. */
export function hasFieldInCode(code: string, className: string, fieldName: string): boolean {
  return findFieldRange(code, className, fieldName) !== null;
}

/** Podmienia całą deklarację pola na `newMember`. `null`, gdy pola nie ma. */
export function replaceFieldInCode(
  code: string, className: string, fieldName: string, newMember: string,
): string | null {
  const r = findFieldRange(code, className, fieldName);
  if (!r) return null;
  return code.slice(0, r.start) + newMember + code.slice(r.end);
}

/** Usuwa deklarację pola razem z jej wierszem. `null`, gdy pola nie ma. */
export function removeFieldFromCode(code: string, className: string, fieldName: string): string | null {
  const r = findFieldRange(code, className, fieldName);
  if (!r) return null;
  // Zjadamy wiodące wcięcie i kończący znak nowej linii, żeby po usunięciu
  // nie została pusta linia z samymi spacjami.
  let start = r.start;
  while (start > 0 && (code[start - 1] === ' ' || code[start - 1] === '\t')) start--;
  let end = r.end;
  while (end < code.length && (code[end] === ' ' || code[end] === '\t')) end++;
  if (code[end] === '\n') end++;
  else if (start > 0 && code[start - 1] === '\n') start--;
  return code.slice(0, start) + code.slice(end);
}

/**
 * Zmienia nazwę składowej wraz z jej użyciami: `this.<nazwa>` wewnątrz klasy
 * oraz `<instancja>.<nazwa>` w całym pliku. Bez tego zmiana nazwy sygnału
 * zrywa istniejące `connect()` — a graf pokazywałby połączenie donikąd.
 */
export function renameMemberInCode(
  code: string, className: string, instanceVars: string[], oldName: string, newName: string,
): string {
  if (!oldName || !newName || oldName === newName) return code;
  const body = findClassBody(code, className);
  let out = code;
  if (body) {
    const before = out.slice(0, body.start);
    const inner = out.slice(body.start, body.end)
      .replace(new RegExp(`\\bthis\\.${escRe(oldName)}\\b`, 'g'), `this.${newName}`)
      .replace(
        new RegExp(`(^|\\n)(\\s*(?:(?:readonly|public|private|protected|static|override|declare|abstract)\\s+)*)${escRe(oldName)}(\\s*(?:!?\\s*:|=))`, 'g'),
        `$1$2${newName}$3`,
      );
    out = before + inner + out.slice(body.end);
  }
  for (const v of instanceVars) {
    out = out.replace(new RegExp(`\\b${escRe(v)}\\.${escRe(oldName)}\\b`, 'g'), `${v}.${newName}`);
  }
  return out;
}

/* ── Parsowanie portów sygnałów ──────────────────────────────────────────── */

/** Deklaracje `X<…>` pola: `readonly a = new X<…>()` albo `a!: X<…>`. */
function scanGenericFields(body: string, ctor: string): SignalPortLite[] {
  const out: SignalPortLite[] = [];
  const re = new RegExp(
    `^(?:(?:readonly|public|private|protected|static|override|declare)\\s+)*(\\w+)\\s*(?:!?\\s*:\\s*${ctor}\\b|=\\s*new\\s+${ctor}\\b)`,
  );
  for (const start of topLevelMemberStarts(body)) {
    const m = re.exec(body.slice(start));
    if (!m) continue;
    // `new Signal()` bez parametru typu to sygnał bez argumentów — parser
    // wymagający generyka gubił go bez śladu.
    const g = readGeneric(body, start + m[0].length);
    out.push({ name: m[1], type: g ? g.content.trim() : '' });
  }
  return out;
}

/**
 * Sygnały klasy: własne `Signal<…>` plus wirtualne `<prop>.changed`
 * wystawiane przez `MProperty<…>`.
 */
export function parseSignalPorts(body: string): SignalPortLite[] {
  return [
    ...scanGenericFields(body, 'Signal'),
    ...scanGenericFields(body, 'MProperty').map((p) => ({ name: `${p.name}.changed`, type: p.type })),
  ];
}
