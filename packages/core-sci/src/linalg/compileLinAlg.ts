/**
 * compileLinAlg.ts — blok algebry liniowej → scena i obliczenia.
 *
 * Odpowiednik `compileGraph` dla wielkości, które nie są liczbami. Wyrażenia
 * mają **własny, mały ewaluator** zamiast silnika matematycznego z reszty
 * projektu, i to jest decyzja, nie skrót:
 *
 *  • `A \cdot v` nie jest mnożeniem liczb — wynik zależy od typów operandów, a
 *    silnik numeryczny sprowadziłby wszystko do skalarów.
 *  • Zbiór operacji jest **domknięty i mały** (mnożenie, dodawanie, odwrotność,
 *    wyznacznik). Cały parser mieści się w kilkudziesięciu linijkach, które da
 *    się przeczytać obok wzoru z dokumentu.
 *  • Błędy typów (`v \cdot A`, odwrotność wektora) mają być **zgłoszone po
 *    ludzku**, a nie zamienione w NaN.
 *
 * Zasada z reszty projektu obowiązuje bez zmian: albo rozumiemy wyrażenie w
 * całości, albo mówimy wprost, czego nie rozumiemy.
 */
import type { FormulaBlock } from '../formula/parseFormula';
import { apply, compose, det, inverse, type Matrix2, type Vector2 } from './matrix';

export interface MatrixParam {
  name: string;
  value: Matrix2;
}

export interface VectorParam {
  name: string;
  value: Vector2;
}

export interface LinAlgResult {
  vectors: Record<string, Vector2>;
  matrices: Record<string, Matrix2>;
  scalars: Record<string, number>;
  /** Kłopoty napotkane przy liczeniu — np. odwracanie macierzy osobliwej. */
  issues: string[];
}

export interface LinAlgModel {
  matrices: MatrixParam[];
  vectors: VectorParam[];
  /**
   * Macierz definiująca scenę — ta, której animację pokazuje siatka.
   *
   * **Ostatnia policzona**, jeśli blok liczy jakąś macierz; inaczej pierwsza
   * zadeklarowana. Blok z `C = R \cdot D` jest o złożeniu, więc animowanie
   * samego `R` pokazywałoby co innego niż mówi tekst — a wyznacznik na ekranie
   * nie zgadzałby się z iloczynem wyznaczników składników.
   */
  transform?: string;
  /** Wektory do narysowania — wszystkie, jakie w bloku występują. */
  drawnVectors: string[];
  issues: string[];
  run(overrides: { vectors?: Record<string, Vector2>; matrices?: Record<string, Matrix2> }): LinAlgResult;
}

/** Wartość w trakcie liczenia — typ decyduje o tym, co znaczy operacja. */
type Value =
  | { kind: 'scalar'; value: number }
  | { kind: 'vector'; value: Vector2 }
  | { kind: 'matrix'; value: Matrix2 };

const LICZBY = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;

/** `[[1, 2], [3, 4]]` → macierz; `null`, gdy kształt się nie zgadza. */
function parseMatrix(text: string): Matrix2 | null {
  const liczby = text.match(LICZBY)?.map(Number) ?? [];
  if (liczby.length !== 4 || !liczby.every(Number.isFinite)) return null;
  return [[liczby[0], liczby[1]], [liczby[2], liczby[3]]];
}

/** `[1, 0.5]` → wektor; `null`, gdy to nie są dwie liczby. */
function parseVector(text: string): Vector2 | null {
  const liczby = text.match(LICZBY)?.map(Number) ?? [];
  if (liczby.length !== 2 || !liczby.every(Number.isFinite)) return null;
  return [liczby[0], liczby[1]];
}

/**
 * Ewaluator wyrażeń algebry.
 *
 * Gramatyka jest płaska z rozmysłem: suma składników, każdy składnik to ciąg
 * czynników mnożonych przez `\cdot`. Nawiasy występują tylko w `\det(...)` i w
 * zapisie wektora, więc pełny parser byłby narzędziem do problemu, którego nie
 * ma — a przy okazji ukryłby, jak mało operacji tu potrzeba.
 */
function evaluate(
  expression: string,
  scope: Record<string, Value>,
  issues: string[],
): Value | null {
  const skladniki = rozdzielSume(expression);
  let suma: Value | null = null;

  for (const skladnik of skladniki) {
    const wartosc = evaluateProduct(skladnik, scope, issues);
    if (!wartosc) return null;
    if (!suma) { suma = wartosc; continue; }

    if (suma.kind !== wartosc.kind) {
      issues.push(`Nie da się dodać ${nazwaTypu(suma)} do ${nazwaTypu(wartosc)}.`);
      return null;
    }
    suma = dodaj(suma, wartosc);
  }

  return suma;
}

/** Rozdziela sumę, nie wchodząc w nawiasy — inaczej `\det(a+b)` by się rozpadło. */
function rozdzielSume(expression: string): string[] {
  const czesci: string[] = [];
  let glebokosc = 0;
  let biezaca = '';

  for (const znak of expression) {
    if (znak === '(' || znak === '[' || znak === '{') glebokosc += 1;
    if (znak === ')' || znak === ']' || znak === '}') glebokosc -= 1;
    if (znak === '+' && glebokosc === 0) { czesci.push(biezaca); biezaca = ''; continue; }
    biezaca += znak;
  }
  czesci.push(biezaca);
  return czesci.map((c) => c.trim()).filter(Boolean);
}

function evaluateProduct(
  expression: string,
  scope: Record<string, Value>,
  issues: string[],
): Value | null {
  const czynniki = expression.split('\\cdot').map((c) => c.trim()).filter(Boolean);
  let wynik: Value | null = null;

  for (const czynnik of czynniki) {
    const wartosc = evaluateAtom(czynnik, scope, issues);
    if (!wartosc) return null;
    if (!wynik) { wynik = wartosc; continue; }

    const pomnozone = pomnoz(wynik, wartosc);
    if (!pomnozone) {
      issues.push(`Nie da się pomnożyć ${nazwaTypu(wynik)} przez ${nazwaTypu(wartosc)}.`);
      return null;
    }
    wynik = pomnozone;
  }

  return wynik;
}

function evaluateAtom(
  text: string,
  scope: Record<string, Value>,
  issues: string[],
): Value | null {
  const oczyszczony = text.trim();

  const wyznacznik = /^\\det\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)$/.exec(oczyszczony);
  if (wyznacznik) {
    const macierz = scope[wyznacznik[1]];
    if (macierz?.kind !== 'matrix') {
      issues.push(`„\\det" potrzebuje macierzy, a „${wyznacznik[1]}" nią nie jest.`);
      return null;
    }
    return { kind: 'scalar', value: det(macierz.value) };
  }

  const odwrotna = /^([A-Za-z][A-Za-z0-9_]*)\s*\^\s*\{?\s*-1\s*\}?$/.exec(oczyszczony);
  if (odwrotna) {
    const macierz = scope[odwrotna[1]];
    if (macierz?.kind !== 'matrix') {
      issues.push(`Odwracać można tylko macierz, a „${odwrotna[1]}" nią nie jest.`);
      return null;
    }
    const wynik = inverse(macierz.value);
    if (!wynik) {
      issues.push(`Macierzy „${odwrotna[1]}" nie da się odwrócić — jest osobliwa (wyznacznik zero).`);
      return null;
    }
    return { kind: 'matrix', value: wynik };
  }

  if (oczyszczony.startsWith('[[')) {
    const macierz = parseMatrix(oczyszczony);
    if (!macierz) { issues.push(`Nie umiem odczytać macierzy „${oczyszczony}".`); return null; }
    return { kind: 'matrix', value: macierz };
  }

  if (oczyszczony.startsWith('[')) {
    const wektor = parseVector(oczyszczony);
    if (!wektor) { issues.push(`Nie umiem odczytać wektora „${oczyszczony}".`); return null; }
    return { kind: 'vector', value: wektor };
  }

  if (/^-?\d/.test(oczyszczony)) {
    const liczba = Number(oczyszczony);
    if (Number.isFinite(liczba)) return { kind: 'scalar', value: liczba };
  }

  const znany = scope[oczyszczony];
  if (znany) return znany;

  issues.push(`Nie znam symbolu „${oczyszczony}" w tym bloku.`);
  return null;
}

function nazwaTypu(v: Value): string {
  return { scalar: 'liczby', vector: 'wektora', matrix: 'macierzy' }[v.kind];
}

function dodaj(a: Value, b: Value): Value {
  if (a.kind === 'scalar' && b.kind === 'scalar') return { kind: 'scalar', value: a.value + b.value };
  if (a.kind === 'vector' && b.kind === 'vector') {
    return { kind: 'vector', value: [a.value[0] + b.value[0], a.value[1] + b.value[1]] };
  }
  const m = a.value as Matrix2;
  const n = b.value as Matrix2;
  return {
    kind: 'matrix',
    value: [[m[0][0] + n[0][0], m[0][1] + n[0][1]], [m[1][0] + n[1][0], m[1][1] + n[1][1]]],
  };
}

function pomnoz(a: Value, b: Value): Value | null {
  if (a.kind === 'matrix' && b.kind === 'vector') return { kind: 'vector', value: apply(a.value, b.value) };
  if (a.kind === 'matrix' && b.kind === 'matrix') return { kind: 'matrix', value: compose(a.value, b.value) };
  if (a.kind === 'scalar' && b.kind === 'vector') {
    return { kind: 'vector', value: [a.value * b.value[0], a.value * b.value[1]] };
  }
  if (a.kind === 'scalar' && b.kind === 'scalar') return { kind: 'scalar', value: a.value * b.value };
  if (a.kind === 'scalar' && b.kind === 'matrix') {
    const m = b.value;
    return {
      kind: 'matrix',
      value: [[a.value * m[0][0], a.value * m[0][1]], [a.value * m[1][0], a.value * m[1][1]]],
    };
  }
  // Wektor razy macierz, wektor razy wektor: to nie są operacje, których ten
  // moduł uczy, więc lepiej powiedzieć wprost niż zgadywać intencję.
  return null;
}

/** Kompiluje blok `@linalg` do modelu sceny. */
export function compileLinAlg(block: FormulaBlock): LinAlgModel {
  const issues = block.issues.map((i) => i.message);
  const linalg = block.linalg ?? { matrices: [], vectors: [], definitions: [] };

  const matrices: MatrixParam[] = [];
  const vectors: VectorParam[] = [];

  for (const { name, text } of linalg.matrices) {
    const value = parseMatrix(text);
    if (!value) { issues.push(`Macierz „${name}" musi mieć kształt 2×2, np. [[1, 0], [0, 1]].`); continue; }
    matrices.push({ name, value });
  }
  for (const { name, text } of linalg.vectors) {
    const value = parseVector(text);
    if (!value) { issues.push(`Wektor „${name}" musi mieć dwie liczby, np. [1, 0.5].`); continue; }
    vectors.push({ name, value });
  }

  /** Buduje zakres i liczy definicje po kolei — kolejność zapisu jest kolejnością liczenia. */
  const policz = (
    overrides: { vectors?: Record<string, Vector2>; matrices?: Record<string, Matrix2> },
    zbierzIssues: string[],
  ): LinAlgResult => {
    const scope: Record<string, Value> = {};
    for (const m of matrices) {
      scope[m.name] = { kind: 'matrix', value: overrides.matrices?.[m.name] ?? m.value };
    }
    for (const v of vectors) {
      scope[v.name] = { kind: 'vector', value: overrides.vectors?.[v.name] ?? v.value };
    }

    for (const { name, expression } of linalg.definitions) {
      // Podmieniona wartość ma pierwszeństwo nad definicją: scena animująca
      // złożenie `C = R \cdot D` podstawia zinterpolowane `C`, a wszystko, co
      // od niego zależy, ma się przeliczyć z tej podmiany, nie z definicji.
      if (overrides.matrices?.[name] || overrides.vectors?.[name]) {
        const podmienione = overrides.matrices?.[name];
        scope[name] = podmienione
          ? { kind: 'matrix', value: podmienione }
          : { kind: 'vector', value: overrides.vectors![name] };
        continue;
      }

      const wartosc = evaluate(expression, scope, zbierzIssues);
      if (wartosc) scope[name] = wartosc;
    }

    const wynik: LinAlgResult = { vectors: {}, matrices: {}, scalars: {}, issues: zbierzIssues };
    for (const [name, value] of Object.entries(scope)) {
      if (value.kind === 'vector') wynik.vectors[name] = value.value;
      else if (value.kind === 'matrix') wynik.matrices[name] = value.value;
      else wynik.scalars[name] = value.value;
    }
    return wynik;
  };

  // Jeden przebieg „na sucho" przy kompilacji: nieznane symbole i błędy typów
  // mają być widoczne od razu w bloku, a nie dopiero po uruchomieniu sceny.
  const proba: string[] = [];
  const suchy = policz({}, proba);
  // Kłopoty zależne od wartości (osobliwa macierz) zostawiamy na czas liczenia —
  // po przeciągnięciu wektora mogą zniknąć albo się pojawić.
  issues.push(...proba.filter((i) => !/osobliw|odwróci/i.test(i)));

  // Definicje macierzowe są wynikiem, deklaracje składnikiem.
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
