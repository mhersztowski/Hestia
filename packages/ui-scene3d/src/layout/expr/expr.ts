/**
 * Ograniczony język wyrażeń dla `{expr: "..."}`.
 *
 * Świadomie NIE jest to JavaScript i nie ma tu `eval`. Wyrażenie musi dać się
 * przeanalizować statycznie (zależności do grafu reaktywnego), bezpiecznie
 * wykonać przy eksporcie i pokazać w panelu. Zakres: liczby, stringi, boole,
 * identyfikatory, operatory arytmetyczne/porównania/logiczne, wywołania funkcji
 * z zamkniętej listy i operator warunkowy `? :`.
 */

export type ExprValue = number | string | boolean;

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const OPERATORS = [
  '<=', '>=', '==', '!=', '&&', '||',
  '+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>', '?', ':', '!',
];

export class ExprError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`Nieprawidłowa liczba na pozycji ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue; }
        v += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError('Niezamknięty cudzysłów');
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find(o => src.startsWith(o, i));
    if (!op) throw new ExprError(`Nieznany znak „${c}” na pozycji ${i}`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

// ─────────────────────────────────────────────────────────── AST

type Node =
  | { n: 'lit'; v: ExprValue }
  | { n: 'var'; name: string }
  | { n: 'un'; op: string; a: Node }
  | { n: 'bin'; op: string; a: Node; b: Node }
  | { n: 'cond'; c: Node; a: Node; b: Node }
  | { n: 'call'; name: string; args: Node[] };

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
  '^': 7,
};

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpr(0);
    if (this.i < this.tokens.length) throw new ExprError('Nadmiarowe znaki na końcu wyrażenia');
    return node;
  }

  private peek(): Token | undefined { return this.tokens[this.i]; }

  private eatOp(op: string): boolean {
    const t = this.peek();
    if (t && t.t === 'op' && t.v === op) { this.i++; return true; }
    return false;
  }

  private expectOp(op: string): void {
    if (!this.eatOp(op)) throw new ExprError(`Oczekiwano „${op}”`);
  }

  private parseExpr(minPrec: number): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op') break;
      if (t.v === '?' && minPrec === 0) {
        this.i++;
        const a = this.parseExpr(0);
        this.expectOp(':');
        const b = this.parseExpr(0);
        left = { n: 'cond', c: left, a, b };
        continue;
      }
      const prec = BINARY_PRECEDENCE[t.v];
      if (prec === undefined || prec < minPrec) break;
      this.i++;
      // `^` jest prawostronnie łączne, reszta lewostronnie.
      const right = this.parseExpr(t.v === '^' ? prec : prec + 1);
      left = { n: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.eatOp('-')) return { n: 'un', op: '-', a: this.parseUnary() };
    if (this.eatOp('+')) return this.parseUnary();
    if (this.eatOp('!')) return { n: 'un', op: '!', a: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (!t) throw new ExprError('Nieoczekiwany koniec wyrażenia');
    if (t.t === 'num') { this.i++; return { n: 'lit', v: t.v }; }
    if (t.t === 'str') { this.i++; return { n: 'lit', v: t.v }; }
    if (t.t === 'id') {
      this.i++;
      if (t.v === 'true') return { n: 'lit', v: true };
      if (t.v === 'false') return { n: 'lit', v: false };
      if (this.eatOp('(')) {
        const args: Node[] = [];
        if (!this.eatOp(')')) {
          do { args.push(this.parseExpr(0)); } while (this.eatOp(','));
          this.expectOp(')');
        }
        return { n: 'call', name: t.v, args };
      }
      return { n: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      this.i++;
      const node = this.parseExpr(0);
      this.expectOp(')');
      return node;
    }
    throw new ExprError(`Nieoczekiwany token „${'v' in t ? t.v : ''}”`);
  }
}

// ─────────────────────────────────────────────────────────── funkcje

const DEG = Math.PI / 180;

export const EXPR_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  pow: Math.pow,
  exp: Math.exp,
  log: Math.log,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sind: x => Math.sin(x * DEG),
  cosd: x => Math.cos(x * DEG),
  deg: x => x / DEG,
  rad: x => x * DEG,
  clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
  lerp: (a, b, t) => a + (b - a) * t,
  sign: Math.sign,
  mod: (a, b) => ((a % b) + b) % b,
  /** Przybliżona wysokość Słońca [deg] — pomocnicza dla scen terenu. */
  solarElevation: (dayOfYear, hour, lat) => {
    const decl = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81)) * DEG);
    const ha = (hour - 12) * 15;
    const s =
      Math.sin(lat * DEG) * Math.sin(decl * DEG) +
      Math.cos(lat * DEG) * Math.cos(decl * DEG) * Math.cos(ha * DEG);
    return Math.asin(Math.min(1, Math.max(-1, s))) / DEG;
  },
};

export const EXPR_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

// ─────────────────────────────────────────────────────────── API

const cache = new Map<string, Node>();

function compile(code: string): Node {
  const hit = cache.get(code);
  if (hit) return hit;
  const node = new Parser(tokenize(code)).parse();
  cache.set(code, node);
  return node;
}

/** Nazwy zmiennych, od których wyrażenie zależy (bez stałych wbudowanych). */
export function exprDeps(code: string): string[] {
  const seen = new Set<string>();
  const walk = (node: Node): void => {
    switch (node.n) {
      case 'var':
        if (!(node.name in EXPR_CONSTANTS)) seen.add(node.name);
        break;
      case 'un': walk(node.a); break;
      case 'bin': walk(node.a); walk(node.b); break;
      case 'cond': walk(node.c); walk(node.a); walk(node.b); break;
      case 'call': node.args.forEach(walk); break;
      default: break;
    }
  };
  try {
    walk(compile(code));
  } catch {
    return [];
  }
  return [...seen].sort();
}

export function isValidExpr(code: string): boolean {
  try { compile(code); return true; } catch { return false; }
}

export function evalExpr(code: string, scope: Record<string, ExprValue> = {}): ExprValue {
  return evalNode(compile(code), scope);
}

function evalNode(node: Node, scope: Record<string, ExprValue>): ExprValue {
  switch (node.n) {
    case 'lit':
      return node.v;
    case 'var': {
      if (node.name in scope) return scope[node.name];
      if (node.name in EXPR_CONSTANTS) return EXPR_CONSTANTS[node.name];
      throw new ExprError(`Nieznana zmienna „${node.name}”`);
    }
    case 'un': {
      const a = evalNode(node.a, scope);
      if (node.op === '-') return -num(a);
      return !truthy(a);
    }
    case 'bin':
      return evalBin(node.op, evalNode(node.a, scope), evalNode(node.b, scope));
    case 'cond':
      return truthy(evalNode(node.c, scope)) ? evalNode(node.a, scope) : evalNode(node.b, scope);
    case 'call': {
      const fn = EXPR_FUNCTIONS[node.name];
      if (!fn) throw new ExprError(`Nieznana funkcja „${node.name}”`);
      return fn(...node.args.map(a => num(evalNode(a, scope))));
    }
  }
}

function evalBin(op: string, a: ExprValue, b: ExprValue): ExprValue {
  switch (op) {
    case '+': return typeof a === 'string' || typeof b === 'string' ? `${a}${b}` : num(a) + num(b);
    case '-': return num(a) - num(b);
    case '*': return num(a) * num(b);
    case '/': return num(a) / num(b);
    case '%': return num(a) % num(b);
    case '^': return num(a) ** num(b);
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return num(a) < num(b);
    case '>': return num(a) > num(b);
    case '<=': return num(a) <= num(b);
    case '>=': return num(a) >= num(b);
    case '&&': return truthy(a) ? b : a;
    case '||': return truthy(a) ? a : b;
    default: throw new ExprError(`Nieznany operator „${op}”`);
  }
}

function num(v: ExprValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new ExprError(`„${v}” nie jest liczbą`);
  return n;
}

function truthy(v: ExprValue): boolean {
  return typeof v === 'boolean' ? v : Boolean(v);
}
