/**
 * procedures.ts — algebra jako procedura krokowa.
 *
 * Eliminacja Gaussa i Gram-Schmidt nie są wzorami, tylko **przepisami**, i to
 * jest powód, dla którego mają tu osobny moduł: zwracają listę stanów
 * pośrednich z opisem, a nie sam wynik. Wpina się to wprost w tryb walkthrough
 * (`sci-core/graph/walkthrough`), gdzie czytelnik przechodzi krok po kroku i
 * po każdym widzi scenę.
 *
 * Wynikiem lekcji jest droga, nie liczba na końcu — dlatego „pokaż kroki" nie
 * jest tu opcją debugowania, tylko główną funkcją modułu.
 */
import { apply, type Matrix2, type Vector2 } from './matrix';

const ZERO = 1e-12;

export interface GaussStep {
  /** Stan macierzy współczynników po tym kroku. */
  matrix: Matrix2;
  /** Prawa strona układu po tym kroku. */
  rhs: Vector2;
  description: string;
  /** Wypełnione tylko w kroku końcowym i tylko gdy rozwiązanie istnieje. */
  solution?: Vector2;
}

export interface GramSchmidtStep {
  /** Wektory widoczne po tym kroku — nazwa → wartość. */
  vectors: Record<string, Vector2>;
  description: string;
}

const liczba = (x: number) => Number(x.toPrecision(4));

/**
 * Eliminacja Gaussa dla układu 2×2, krok po kroku.
 *
 * Zamiana wierszy nie jest ozdobą: bez niej zero na przekątnej daje dzielenie
 * przez zero i tabelę „NaN" bez wyjaśnienia, zamiast lekcji o tym, dlaczego
 * kolejność równań nie ma znaczenia.
 */
export function gaussSteps(a: Matrix2, b: Vector2): GaussStep[] {
  const kroki: GaussStep[] = [];
  let M: Matrix2 = [[a[0][0], a[0][1]], [a[1][0], a[1][1]]];
  let R: Vector2 = [b[0], b[1]];

  const zapisz = (description: string, solution?: Vector2) => {
    kroki.push({
      matrix: [[M[0][0], M[0][1]], [M[1][0], M[1][1]]],
      rhs: [R[0], R[1]],
      description,
      solution,
    });
  };

  zapisz('Układ wyjściowy.');

  if (Math.abs(M[0][0]) <= ZERO && Math.abs(M[1][0]) > ZERO) {
    M = [M[1], M[0]] as Matrix2;
    R = [R[1], R[0]];
    zapisz('Zamieniamy wiersze — na przekątnej nie może stać zero.');
  }

  if (Math.abs(M[0][0]) > ZERO) {
    const mnoznik = M[1][0] / M[0][0];
    M = [M[0], [M[1][0] - mnoznik * M[0][0], M[1][1] - mnoznik * M[0][1]]] as Matrix2;
    R = [R[0], R[1] - mnoznik * R[0]];
    zapisz(`Od drugiego wiersza odejmujemy pierwszy razy ${liczba(mnoznik)} — pod przekątną zostaje zero.`);
  }

  // Po eliminacji drugie równanie ma postać `0·x + M₁₁·y = R₁`.
  if (Math.abs(M[1][1]) <= ZERO) {
    if (Math.abs(R[1]) > ZERO) {
      zapisz('Drugie równanie mówi „0 = liczba różna od zera" — układ jest sprzeczny, nie ma rozwiązania.');
    } else {
      zapisz('Drugie równanie znikło całkowicie — równania są zależne, rozwiązań jest nieskończenie wiele.');
    }
    return kroki;
  }

  const y = R[1] / M[1][1];
  zapisz(`Z drugiego równania: y = ${liczba(y)}.`);

  const x = (R[0] - M[0][1] * y) / M[0][0];
  zapisz(`Podstawiamy do pierwszego: x = ${liczba(x)}.`, [x, y]);

  return kroki;
}

/**
 * Ortogonalizacja Grama-Schmidta dla dwóch wektorów, krok po kroku.
 *
 * Rzut drugiego wektora na pierwszy jest osobnym krokiem z rozmysłem: to on
 * jest sednem procedury. Bez niego widać tylko dwie strzałki, które nagle
 * stają się prostopadłe, i cała rzecz wygląda na sztuczkę.
 */
export function gramSchmidtSteps(a: Vector2, b: Vector2): GramSchmidtStep[] {
  const kroki: GramSchmidtStep[] = [];
  const zapisz = (vectors: Record<string, Vector2>, description: string) =>
    kroki.push({ vectors, description });

  zapisz({ a, b }, 'Dwa wektory wyjściowe. Szukamy bazy prostopadłej rozpinającej to samo.');

  const dlugoscA = Math.hypot(a[0], a[1]);
  if (dlugoscA <= ZERO) {
    zapisz({ a, b }, 'Pierwszy wektor jest zerowy — nie wyznacza kierunku, więc nie ma od czego zacząć.');
    return kroki;
  }

  const e1: Vector2 = [a[0] / dlugoscA, a[1] / dlugoscA];
  zapisz({ a, b, e_1: e1 }, 'Pierwszy kierunek zostaje bez zmian — skracamy go tylko do długości jeden.');

  const rzutSkalar = b[0] * e1[0] + b[1] * e1[1];
  const p: Vector2 = [e1[0] * rzutSkalar, e1[1] * rzutSkalar];
  zapisz(
    { a, b, e_1: e1, p },
    `Liczymy rzut b na pierwszy kierunek: p = ${liczba(rzutSkalar)}·e₁. To ta część b, która leży wzdłuż e₁.`,
  );

  const reszta: Vector2 = [b[0] - p[0], b[1] - p[1]];
  const dlugoscReszty = Math.hypot(reszta[0], reszta[1]);

  if (dlugoscReszty <= 1e-9) {
    zapisz(
      { a, b, e_1: e1, p },
      'Po odjęciu rzutu nie zostaje nic — wektory są równoległe i nie rozpinają płaszczyzny.',
    );
    return kroki;
  }

  zapisz({ a, b, e_1: e1, p, r: reszta }, 'Odejmujemy rzut od b. Reszta jest już prostopadła do e₁.');

  const e2: Vector2 = [reszta[0] / dlugoscReszty, reszta[1] / dlugoscReszty];
  zapisz(
    { e_1: e1, e_2: e2 },
    'Skracamy resztę do długości jeden. e₁ i e₂ tworzą bazę ortonormalną.',
  );

  return kroki;
}

/** Sprawdza, czy para wektorów jest ortonormalna — do zadań i testów. */
export function isOrthonormal(e1: Vector2, e2: Vector2, tolerance = 1e-9): boolean {
  return Math.abs(Math.hypot(...e1) - 1) < tolerance
    && Math.abs(Math.hypot(...e2) - 1) < tolerance
    && Math.abs(e1[0] * e2[0] + e1[1] * e2[1]) < tolerance;
}

/** Obraz wektora — skrót używany przez sceny procedur. */
export { apply };

// --- eliminacja Gaussa dla dowolnego rozmiaru --------------------------------

/** Krok procedury dla układu `n × n`. */
export interface GaussStepN {
  matrix: number[][];
  rhs: number[];
  description: string;
  /** Wypełnione tylko w kroku końcowym i tylko gdy rozwiązanie istnieje. */
  solution?: number[];
}

/**
 * Eliminacja Gaussa z wyborem elementu głównego, krok po kroku.
 *
 * Wersja 2×2 pokazuje pomysł, ale nie pokazuje **procedury**: przy dwóch
 * równaniach jest jeden krok eliminacji, a wybór elementu głównego nie ma czego
 * wybierać. Sens metody — powtarzalny przebieg kolumna po kolumnie — widać
 * dopiero od 3×3.
 *
 * Element główny wybieramy **największy co do wartości bezwzględnej**, a nie
 * pierwszy niezerowy, i mówimy o tym w opisie kroku. To nie jest szczegół
 * numeryczny do przemilczenia: dzielenie przez małą liczbę powiększa błąd
 * zaokrągleń, a układ „prawie osobliwy" jest właśnie tym miejscem, gdzie
 * czytelnik ma zobaczyć różnicę między „metoda działa" a „metoda działa
 * dokładnie".
 */
export function gaussStepsN(a: number[][], b: number[]): GaussStepN[] {
  const n = a.length;
  const kroki: GaussStepN[] = [];
  const M = a.map((row) => [...row]);
  const R = [...b];

  const zapisz = (description: string, solution?: number[]) => {
    kroki.push({ matrix: M.map((row) => [...row]), rhs: [...R], description, solution });
  };

  zapisz('Układ wyjściowy.');

  for (let k = 0; k < n; k += 1) {
    // Wybór elementu głównego.
    let najlepszy = k;
    for (let i = k + 1; i < n; i += 1) {
      if (Math.abs(M[i][k]) > Math.abs(M[najlepszy][k])) najlepszy = i;
    }

    if (najlepszy !== k) {
      [M[k], M[najlepszy]] = [M[najlepszy], M[k]];
      [R[k], R[najlepszy]] = [R[najlepszy], R[k]];
      zapisz(
        `Zamieniamy wiersz ${k + 1} z ${najlepszy + 1}: na przekątnej ma stać `
        + 'największy co do wartości bezwzględnej element kolumny. Dzielenie przez małą '
        + 'liczbę powiększyłoby błąd zaokrągleń.',
      );
    }

    if (Math.abs(M[k][k]) <= ZERO) continue; // Kolumna pusta — niewiadoma zostaje wolna.

    for (let i = k + 1; i < n; i += 1) {
      if (Math.abs(M[i][k]) <= ZERO) continue;
      const mnoznik = M[i][k] / M[k][k];
      for (let j = k; j < n; j += 1) M[i][j] -= mnoznik * M[k][j];
      R[i] -= mnoznik * R[k];
      zapisz(
        `Od wiersza ${i + 1} odejmujemy wiersz ${k + 1} razy ${liczba(mnoznik)} — `
        + `w kolumnie ${k + 1} zostaje zero.`,
      );
    }
  }

  // Po eliminacji: wiersz zerowy z niezerową prawą stroną znaczy sprzeczność,
  // a z zerową — niewiadomą, której nic nie wyznacza.
  for (let i = 0; i < n; i += 1) {
    const pusty = M[i].every((x) => Math.abs(x) <= ZERO);
    if (!pusty) continue;
    if (Math.abs(R[i]) > ZERO) {
      zapisz(`Wiersz ${i + 1} mówi „0 = ${liczba(R[i])}" — układ jest sprzeczny, rozwiązania nie ma.`);
    } else {
      zapisz(`Wiersz ${i + 1} zniknął w całości — układ jest nieoznaczony, rozwiązań jest nieskończenie wiele.`);
    }
    return kroki;
  }

  // Podstawienie wstecz.
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let suma = R[i];
    for (let j = i + 1; j < n; j += 1) suma -= M[i][j] * x[j];
    x[i] = suma / M[i][i];
  }

  zapisz(
    'Podstawiamy wstecz: ostatnie równanie ma jedną niewiadomą, a każde wyżej '
    + 'korzysta z już wyliczonych.',
    x,
  );
  return kroki;
}
