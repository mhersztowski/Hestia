/**
 * Statyczny (heurystyczny) parser kodu skryptu pod kątem obiektów QObject:
 *  - znajduje klasy zdefiniowane w kodzie, które dziedziczą (tranzytywnie) po
 *    `QObject` (z packages/core/browser/qt/qobject.module.js);
 *  - znajduje instancje tych klas (`const x = new Foo(parent)`), ich nazwy,
 *    `objectName`, właściwości (`setProperty`) oraz relacje rodzic-dziecko
 *    (argument konstruktora / `setParent` / `addChild`), budując hierarchię.
 *
 * Parsowanie jest regexowe i celowo proste (inspektor, nie kompilator): obsługuje
 * typowe wzorce kodu. Zwraca też offsety deklaracji (do operacji cut/paste).
 */

export interface QObjProp { key: string; value: string }

export interface QObjInstance {
  /** Unikalny identyfikator w drzewie (nazwa zmiennej). */
  id: string;
  varName: string;
  className: string;
  objectName?: string;
  parentVar: string | null;
  properties: QObjProp[];
  /** Offsety znakowe instrukcji deklaracji `const x = new …;` w kodzie. */
  declStart: number;
  declEnd: number;
  line: number;
  children: QObjInstance[];
}

export interface QObjParse {
  /** Klasy zdefiniowane w kodzie dziedziczące po QObject (do menu „New"). */
  classes: string[];
  /** Instancje bez rodzica (korzenie drzewa). */
  roots: QObjInstance[];
  /** Wszystkie instancje (płasko). */
  flat: QObjInstance[];
  /** Zadeklarowane właściwości (`static properties = {...}`) per klasa — nazwy,
   *  scalone wzdłuż łańcucha dziedziczenia klas z kodu (+ `objectName` dla
   *  klas QObject). Fallback gdy introspekcja runtime niedostępna. */
  classProperties: Record<string, string[]>;
}

const ID = '[A-Za-z_$][\\w$]*';

/** Wytnij literał obiektu po `{` (dopasowanie nawiasów; ignoruje proste stringi). */
function balancedBraces(code: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return code.slice(openIdx, i + 1); }
  }
  return '';
}

/** Klucze najwyższego poziomu literału `{ a: …, b: … }`. */
function topLevelKeys(objLiteral: string): string[] {
  const inner = objLiteral.slice(1, -1); // bez zewnętrznych { }
  const keys: string[] = [];
  let depth = 0;
  let atKeyPos = true; // czy jesteśmy na początku segmentu (po { lub ,)
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '(' || ch === '[') { depth++; atKeyPos = false; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; continue; }
    if (depth === 0) {
      if (ch === ',') { atKeyPos = true; continue; }
      if (atKeyPos && /\s/.test(ch)) continue;
      if (atKeyPos) {
        const rest = inner.slice(i);
        const km = /^['"]?([A-Za-z_$][\w$]*)['"]?\s*:/.exec(rest);
        if (km) keys.push(km[1]);
        atKeyPos = false;
      }
    }
  }
  return keys;
}

/** Mapa klasa → nazwy zadeklarowanych właściwości (own), z `static properties`. */
function ownDeclaredProps(code: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const classRe = new RegExp(`\\bclass\\s+(${ID})\\b`, 'g');
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(code))) {
    const clsName = cm[1];
    const bodyStart = code.indexOf('{', cm.index);
    if (bodyStart < 0) continue;
    const body = balancedBraces(code, bodyStart);
    const pm = /\bstatic\s+properties\s*=\s*{/.exec(body);
    if (!pm) continue;
    const objStart = body.indexOf('{', pm.index + pm[0].length - 1);
    const obj = balancedBraces(body, objStart);
    if (obj) out.set(clsName, topLevelKeys(obj));
  }
  return out;
}

/** Mapa dziedziczenia klas z kodu → zbiór klas dziedziczących po QObject. */
function qobjectDerivedClasses(code: string): Set<string> {
  const parentOf = new Map<string, string>();
  const re = new RegExp(`\\bclass\\s+(${ID})\\s+extends\\s+(${ID})`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) parentOf.set(m[1], m[2]);

  const derived = new Set<string>();
  const reaches = (name: string, seen = new Set<string>()): boolean => {
    if (name === 'QObject') return true;
    if (seen.has(name)) return false;
    seen.add(name);
    const p = parentOf.get(name);
    return p ? reaches(p, seen) : false;
  };
  for (const cls of parentOf.keys()) if (reaches(cls)) derived.add(cls);
  return derived;
}

/** Pierwszy argument konstruktora (jeśli to prosty identyfikator). */
function firstArgIdent(args: string): string | null {
  const a = args.split(',')[0]?.trim() ?? '';
  return new RegExp(`^${ID}$`).test(a) ? a : null;
}

export function parseQObjects(code: string): QObjParse {
  const derived = qobjectDerivedClasses(code);
  // Klasa jest „obiektem QObject" gdy dziedziczy po QObject albo jest samym QObject.
  const isQ = (cls: string) => cls === 'QObject' || derived.has(cls);

  // 1) Instancje przypisane do zmiennej, w dwóch formach:
  //    - konstruktor:  const x = new Class(args)
  //    - fabryka:       const x = Class.create(args)  /  Class.of(args)
  //      (biblioteki QObject/qt są static-first, więc fabryki są częste).
  const instRe = new RegExp(
    `\\b(?:const|let|var)\\s+(${ID})\\s*=\\s*(?:new\\s+(${ID})\\s*\\(([^)]*)\\)|(${ID})\\.(?:create|of)\\s*\\(([^)]*)\\))\\s*;?`,
    'g',
  );
  const byVar = new Map<string, QObjInstance>();
  const flat: QObjInstance[] = [];
  let m: RegExpExecArray | null;
  while ((m = instRe.exec(code))) {
    const varName = m[1];
    const className = m[2] ?? m[4];   // new Class(...)  |  Class.create/of(...)
    const args = m[3] ?? m[5] ?? '';
    if (!className || !isQ(className)) continue;
    const inst: QObjInstance = {
      id: varName,
      varName,
      className,
      parentVar: firstArgIdent(args),
      properties: [],
      declStart: m.index,
      declEnd: m.index + m[0].length,
      line: code.slice(0, m.index).split('\n').length,
      children: [],
    };
    byVar.set(varName, inst);
    flat.push(inst);
  }

  // 2) objectName / parent / properties z wywołań metod na zmiennej.
  for (const inst of flat) {
    const v = inst.varName.replace(/[$]/g, '\\$&');
    const name = new RegExp(`\\b${v}\\.setObjectName\\(\\s*['"\`]([^'"\`]*)['"\`]`).exec(code);
    if (name) inst.objectName = name[1];

    const sp = new RegExp(`\\b${v}\\.setParent\\(\\s*(${ID})`).exec(code);
    if (sp && byVar.has(sp[1])) inst.parentVar = sp[1];

    // p.addChild(v)  → parent = p
    const ac = new RegExp(`\\b(${ID})\\.addChild\\(\\s*${v}\\b`).exec(code);
    if (ac && byVar.has(ac[1])) inst.parentVar = ac[1];

    // QObject.setParent(v, p) / QObject.addChild(p, v)
    const qsp = new RegExp(`QObject\\.setParent\\(\\s*${v}\\s*,\\s*(${ID})`).exec(code);
    if (qsp && byVar.has(qsp[1])) inst.parentVar = qsp[1];
    const qac = new RegExp(`QObject\\.addChild\\(\\s*(${ID})\\s*,\\s*${v}\\b`).exec(code);
    if (qac && byVar.has(qac[1])) inst.parentVar = qac[1];

    // setProperty('k', value)
    const propRe = new RegExp(`\\b${v}\\.setProperty\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*,\\s*([^)]+)\\)`, 'g');
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(code))) inst.properties.push({ key: pm[1], value: pm[2].trim() });

    // Bezpośrednie przypisania pól: v.foo = bar;
    const assignRe = new RegExp(`\\b${v}\\.(${ID})\\s*=\\s*([^;\\n]+)`, 'g');
    let am: RegExpExecArray | null;
    while ((am = assignRe.exec(code))) {
      const key = am[1];
      if (key === 'objectName') continue; // pseudo, obsłużone wyżej
      inst.properties.push({ key, value: am[2].trim() });
    }
  }

  // 3) Hierarchia: podłącz dzieci do rodziców; korzenie = bez rodzica.
  const roots: QObjInstance[] = [];
  for (const inst of flat) {
    const parent = inst.parentVar ? byVar.get(inst.parentVar) : null;
    if (parent && parent !== inst) parent.children.push(inst);
    else roots.push(inst);
  }

  // 4) Zadeklarowane właściwości per klasa (static properties) scalone wzdłuż
  //    łańcucha dziedziczenia klas z kodu + bazowy `objectName` dla QObject.
  const parentOf = new Map<string, string>();
  {
    const re = new RegExp(`\\bclass\\s+(${ID})\\s+extends\\s+(${ID})`, 'g');
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(code))) parentOf.set(cm[1], cm[2]);
  }
  const own = ownDeclaredProps(code);
  const classProperties: Record<string, string[]> = {};
  const resolve = (name: string, seen = new Set<string>()): string[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    const acc = new Set<string>();
    if (name === 'QObject') acc.add('objectName');
    const p = parentOf.get(name);
    if (p) for (const k of resolve(p, seen)) acc.add(k);
    for (const k of own.get(name) ?? []) acc.add(k);
    return [...acc];
  };
  // Dla każdej klasy QObject-pochodnej (+ samego QObject) policz właściwości.
  for (const cls of [...derived, 'QObject']) classProperties[cls] = resolve(cls);

  return { classes: [...derived].sort(), roots, flat, classProperties };
}
