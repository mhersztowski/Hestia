/**
 * compileLinAlg3.ts — blok algebry w trzech wymiarach.
 *
 * Osobny moduł od `compileLinAlg`, a nie wspólny ewaluator sparametryzowany
 * wymiarem. Powód jest praktyczny: uogólnienie wymagałoby typów zależnych od
 * długości tablicy, a zysk byłby żaden — operacje są te same, ale wymiar w
 * dokumencie jest **stały i znany z zapisu**, więc jedna ścieżka nigdy nie
 * miesza się z drugą.
 *
 * Wspólne zostaje to, co naprawdę wspólne: składnia bloku i sposób zgłaszania
 * błędów.
 */
import type { FormulaBlock } from '../formula/parseFormula';
import {
  applyM3, composeM3, detM3, inverseM3, type Matrix3, type Vector3,
} from './matrix3';

export interface LinAlg3Result {
  vectors: Record<string, Vector3>;
  matrices: Record<string, Matrix3>;
  scalars: Record<string, number>;
  issues: string[];
}

export interface LinAlg3Model {
  matrices: Array<{ name: string; value: Matrix3 }>;
  vectors: Array<{ name: string; value: Vector3 }>;
  transform?: string;
  drawnVectors: string[];
  issues: string[];
  run(overrides: {
    vectors?: Record<string, Vector3>;
    matrices?: Record<string, Matrix3>;
  }): LinAlg3Result;
}

type Value =
  | { kind: 'scalar'; value: number }
  | { kind: 'vector'; value: Vector3 }
  | { kind: 'matrix'; value: Matrix3 };

const LICZBY = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;

function parseMatrix3(text: string): Matrix3 | null {
  const l = text.match(LICZBY)?.map(Number) ?? [];
  if (l.length !== 9 || !l.every(Number.isFinite)) return null;
  return [[l[0], l[1], l[2]], [l[3], l[4], l[5]], [l[6], l[7], l[8]]];
}

function parseVector3(text: string): Vector3 | null {
  const l = text.match(LICZBY)?.map(Number) ?? [];
  if (l.length !== 3 || !l.every(Number.isFinite)) return null;
  return [l[0], l[1], l[2]];
}

const nazwaTypu = (v: Value) => ({ scalar: 'liczby', vector: 'wektora', matrix: 'macierzy' }[v.kind]);

function pomnoz(a: Value, b: Value): Value | null {
  if (a.kind === 'matrix' && b.kind === 'vector') return { kind: 'vector', value: applyM3(a.value, b.value) };
  if (a.kind === 'matrix' && b.kind === 'matrix') return { kind: 'matrix', value: composeM3(a.value, b.value) };
  if (a.kind === 'scalar' && b.kind === 'vector') {
    return { kind: 'vector', value: [a.value * b.value[0], a.value * b.value[1], a.value * b.value[2]] };
  }
  if (a.kind === 'scalar' && b.kind === 'scalar') return { kind: 'scalar', value: a.value * b.value };
  return null;
}

function dodaj(a: Value, b: Value): Value | null {
  if (a.kind === 'scalar' && b.kind === 'scalar') return { kind: 'scalar', value: a.value + b.value };
  if (a.kind === 'vector' && b.kind === 'vector') {
    return {
      kind: 'vector',
      value: [a.value[0] + b.value[0], a.value[1] + b.value[1], a.value[2] + b.value[2]],
    };
  }
  return null;
}

function evaluateAtom(text: string, scope: Record<string, Value>, issues: string[]): Value | null {
  const t = text.trim();

  const wyznacznik = /^\\det\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)$/.exec(t);
  if (wyznacznik) {
    const m = scope[wyznacznik[1]];
    if (m?.kind !== 'matrix') {
      issues.push(`„\\det" potrzebuje macierzy, a „${wyznacznik[1]}" nią nie jest.`);
      return null;
    }
    return { kind: 'scalar', value: detM3(m.value) };
  }

  const odwrotna = /^([A-Za-z][A-Za-z0-9_]*)\s*\^\s*\{?\s*-1\s*\}?$/.exec(t);
  if (odwrotna) {
    const m = scope[odwrotna[1]];
    if (m?.kind !== 'matrix') {
      issues.push(`Odwracać można tylko macierz, a „${odwrotna[1]}" nią nie jest.`);
      return null;
    }
    const wynik = inverseM3(m.value);
    if (!wynik) {
      issues.push(`Macierzy „${odwrotna[1]}" nie da się odwrócić — zgniata przestrzeń, więc traci informację.`);
      return null;
    }
    return { kind: 'matrix', value: wynik };
  }

  if (t.startsWith('[[')) {
    const m = parseMatrix3(t);
    if (!m) { issues.push(`Nie umiem odczytać macierzy „${t}".`); return null; }
    return { kind: 'matrix', value: m };
  }
  if (t.startsWith('[')) {
    const v = parseVector3(t);
    if (!v) { issues.push(`Nie umiem odczytać wektora „${t}".`); return null; }
    return { kind: 'vector', value: v };
  }
  if (/^-?\d/.test(t)) {
    const liczba = Number(t);
    if (Number.isFinite(liczba)) return { kind: 'scalar', value: liczba };
  }

  const znany = scope[t];
  if (znany) return znany;

  issues.push(`Nie znam symbolu „${t}" w tym bloku.`);
  return null;
}

/** Suma iloczynów — ta sama płaska gramatyka co w wersji dwuwymiarowej. */
function evaluate(expression: string, scope: Record<string, Value>, issues: string[]): Value | null {
  let suma: Value | null = null;

  for (const skladnik of rozdzielSume(expression)) {
    let iloczyn: Value | null = null;
    for (const czynnik of skladnik.split('\\cdot').map((c) => c.trim()).filter(Boolean)) {
      const wartosc = evaluateAtom(czynnik, scope, issues);
      if (!wartosc) return null;
      if (!iloczyn) { iloczyn = wartosc; continue; }

      const pomnozone = pomnoz(iloczyn, wartosc);
      if (!pomnozone) {
        issues.push(`Nie da się pomnożyć ${nazwaTypu(iloczyn)} przez ${nazwaTypu(wartosc)}.`);
        return null;
      }
      iloczyn = pomnozone;
    }
    if (!iloczyn) continue;
    if (!suma) { suma = iloczyn; continue; }

    const dodane = dodaj(suma, iloczyn);
    if (!dodane) {
      issues.push(`Nie da się dodać ${nazwaTypu(suma)} do ${nazwaTypu(iloczyn)}.`);
      return null;
    }
    suma = dodane;
  }

  return suma;
}

function rozdzielSume(expression: string): string[] {
  const czesci: string[] = [];
  let glebokosc = 0;
  let biezaca = '';

  for (const znak of expression) {
    if ('(['.includes(znak)) glebokosc += 1;
    if (')]'.includes(znak)) glebokosc -= 1;
    if (znak === '+' && glebokosc === 0) { czesci.push(biezaca); biezaca = ''; continue; }
    biezaca += znak;
  }
  czesci.push(biezaca);
  return czesci.map((c) => c.trim()).filter(Boolean);
}

export function compileLinAlg3(block: FormulaBlock): LinAlg3Model {
  const issues = block.issues.map((i) => i.message);
  const linalg = block.linalg ?? { matrices: [], vectors: [], definitions: [] };

  const matrices: Array<{ name: string; value: Matrix3 }> = [];
  const vectors: Array<{ name: string; value: Vector3 }> = [];

  for (const { name, text } of linalg.matrices) {
    const value = parseMatrix3(text);
    if (!value) {
      issues.push(`Macierz „${name}" musi mieć kształt 3×3, np. [[1,0,0],[0,1,0],[0,0,1]].`);
      continue;
    }
    matrices.push({ name, value });
  }
  for (const { name, text } of linalg.vectors) {
    const value = parseVector3(text);
    if (!value) { issues.push(`Wektor „${name}" musi mieć trzy liczby, np. [1, 0, 0].`); continue; }
    vectors.push({ name, value });
  }

  const policz = (
    overrides: { vectors?: Record<string, Vector3>; matrices?: Record<string, Matrix3> },
    zbierz: string[],
  ): LinAlg3Result => {
    const scope: Record<string, Value> = {};
    for (const m of matrices) {
      scope[m.name] = { kind: 'matrix', value: overrides.matrices?.[m.name] ?? m.value };
    }
    for (const v of vectors) {
      scope[v.name] = { kind: 'vector', value: overrides.vectors?.[v.name] ?? v.value };
    }

    for (const { name, expression } of linalg.definitions) {
      // Podmiana ma pierwszeństwo nad definicją — tak samo jak w 2D, żeby dało
      // się animować policzoną macierz złożenia.
      const podmieniona = overrides.matrices?.[name];
      const podmieniony = overrides.vectors?.[name];
      if (podmieniona) { scope[name] = { kind: 'matrix', value: podmieniona }; continue; }
      if (podmieniony) { scope[name] = { kind: 'vector', value: podmieniony }; continue; }

      const wartosc = evaluate(expression, scope, zbierz);
      if (wartosc) scope[name] = wartosc;
    }

    const wynik: LinAlg3Result = { vectors: {}, matrices: {}, scalars: {}, issues: zbierz };
    for (const [name, value] of Object.entries(scope)) {
      if (value.kind === 'vector') wynik.vectors[name] = value.value;
      else if (value.kind === 'matrix') wynik.matrices[name] = value.value;
      else wynik.scalars[name] = value.value;
    }
    return wynik;
  };

  const proba: string[] = [];
  const suchy = policz({}, proba);
  issues.push(...proba.filter((i) => !/odwróci|zgniata/i.test(i)));

  const policzoneMacierze = linalg.definitions
    .map((d) => d.name)
    .filter((name) => suchy.matrices[name] !== undefined);

  return {
    matrices,
    vectors,
    transform: policzoneMacierze[policzoneMacierze.length - 1] ?? matrices[0]?.name,
    drawnVectors: Object.keys(suchy.vectors),
    issues,
    run: (overrides) => policz(overrides, []),
  };
}
