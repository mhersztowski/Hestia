/**
 * matrix3.ts — algebra liniowa w trzech wymiarach.
 *
 * Trzeci wymiar nie jest „tym samym, tylko więcej". Dokłada dwie rzeczy, dla
 * których warto go w ogóle pokazywać:
 *
 *  • **oś obrotu.** Obrót płaszczyzny nie ma kierunków własnych wcale; obrót
 *    przestrzeni ma dokładnie jeden i jest nim oś. To najczystszy przykład na
 *    to, że wektor własny bywa odpowiedzią na pytanie „wokół czego to się
 *    kręci", a nie tylko rachunkiem.
 *  • **podprzestrzenie o różnych wymiarach.** Jądro rzutu bywa prostą albo
 *    płaszczyzną, więc „utrata wymiaru" przestaje być abstrakcją i staje się
 *    czymś, na co da się popatrzeć.
 *
 * Wartości własne wymagają tu rozwiązania **równania sześciennego**. Robimy to
 * wzorem zamkniętym (Cardano dla przypadku trzech pierwiastków rzeczywistych,
 * podstawienie trygonometryczne dla reszty), a nie iteracją — dokładnie z tego
 * samego powodu co w 2D: bez iteracji nie ma pytania o zbieżność, a wynik jest
 * powtarzalny co do bitu.
 */

export type Vector3 = [number, number, number];
export type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export interface EigenPair3 {
  value: number;
  vector: Vector3;
}

export interface EigenResult3 {
  /** Ile rzeczywistych kierunków własnych znaleziono. */
  pairs: EigenPair3[];
}

const ZERO = 1e-9;

export function identityM3(): Matrix3 {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

export function applyM3(m: Matrix3, v: Vector3): Vector3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Złożenie „najpierw `b`, potem `a`" — jak w zapisie `A·B·v`. */
export function composeM3(a: Matrix3, b: Matrix3): Matrix3 {
  const wynik = identityM3();
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      wynik[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return wynik;
}

/** Wyznacznik — czynnik, przez który mnoży się **objętość**. */
export function detM3(m: Matrix3): number {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

function norm(v: Vector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vector3): Vector3 {
  const d = norm(v);
  return d > ZERO ? [v[0] / d, v[1] / d, v[2] / d] : [0, 0, 0];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Rząd przez eliminację z wyborem elementu głównego.
 *
 * Wybór największego elementu w kolumnie nie jest ozdobą: bez niego macierze o
 * bardzo różnych rzędach wielkości gubią wymiar przez błędy zaokrągleń, a
 * scena pokazywałaby wtedy płaszczyznę tam, gdzie jest przestrzeń.
 */
export function rankM3(m: Matrix3): number {
  const a = m.map((wiersz) => [...wiersz]) as number[][];
  let rzad = 0;

  for (let kolumna = 0; kolumna < 3 && rzad < 3; kolumna += 1) {
    let najlepszy = rzad;
    for (let i = rzad + 1; i < 3; i += 1) {
      if (Math.abs(a[i][kolumna]) > Math.abs(a[najlepszy][kolumna])) najlepszy = i;
    }
    if (Math.abs(a[najlepszy][kolumna]) <= ZERO) continue;

    [a[rzad], a[najlepszy]] = [a[najlepszy], a[rzad]];
    for (let i = rzad + 1; i < 3; i += 1) {
      const mnoznik = a[i][kolumna] / a[rzad][kolumna];
      for (let j = kolumna; j < 3; j += 1) a[i][j] -= mnoznik * a[rzad][j];
    }
    rzad += 1;
  }

  return rzad;
}

export function inverseM3(m: Matrix3): Matrix3 | null {
  const d = detM3(m);
  if (Math.abs(d) <= ZERO) return null;

  const dopelnienie = (i: number, j: number): number => {
    const wiersze = [0, 1, 2].filter((x) => x !== i);
    const kolumny = [0, 1, 2].filter((x) => x !== j);
    const minor = m[wiersze[0]][kolumny[0]] * m[wiersze[1]][kolumny[1]]
      - m[wiersze[0]][kolumny[1]] * m[wiersze[1]][kolumny[0]];
    return ((i + j) % 2 === 0 ? 1 : -1) * minor;
  };

  const wynik = identityM3();
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      // Transpozycja macierzy dopełnień — stąd zamienione indeksy.
      wynik[i][j] = dopelnienie(j, i) / d;
    }
  }
  return wynik;
}

/**
 * Baza jądra — kierunki, które przekształcenie zgniata do zera.
 *
 * To jest ta część obrazu, której w 2D prawie nie widać: jądro rzutu na
 * płaszczyznę jest prostą, jądro rzutu na prostą jest płaszczyzną.
 */
export function kernelBasis(m: Matrix3): Vector3[] {
  const wymiarJadra = 3 - rankM3(m);
  if (wymiarJadra === 0) return [];
  if (wymiarJadra === 3) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // Szukamy kierunków spełniających `M·v = 0` wśród iloczynów wektorowych par
  // wierszy: taki iloczyn jest prostopadły do obu, a więc leży w jądrze, gdy
  // wiersze rozpinają obraz.
  const kandydaci: Vector3[] = [];
  const wiersze = m as unknown as Vector3[];

  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as Array<[number, number]>) {
    const kandydat = normalize(cross(wiersze[i], wiersze[j]));
    if (norm(kandydat) > ZERO && norm(applyM3(m, kandydat)) < 1e-6) kandydaci.push(kandydat);
  }

  // Gdy iloczyny wektorowe nie wystarczą (jądro dwuwymiarowe), bierzemy
  // kierunki osiowe, które giną — dla rzutów to najczęstszy przypadek.
  if (kandydaci.length < wymiarJadra) {
    for (const os of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vector3[]) {
      if (norm(applyM3(m, os)) < 1e-6) kandydaci.push(os);
    }
  }

  return niezalezne(kandydaci).slice(0, wymiarJadra);
}

/** Wybiera z listy kierunki liniowo niezależne (z dokładnością do znaku). */
function niezalezne(vectors: Vector3[]): Vector3[] {
  const wynik: Vector3[] = [];
  for (const v of vectors) {
    const powtorzony = wynik.some((u) => norm(cross(u, v)) < 1e-6);
    if (!powtorzony) wynik.push(v);
  }
  return wynik;
}

/**
 * Pierwiastki rzeczywiste równania `λ³ + aλ² + bλ + c = 0`.
 *
 * Podstawienie trygonometryczne dla trzech pierwiastków rzeczywistych i wzór
 * Cardano dla jednego — obie drogi zamknięte, więc wynik nie zależy od liczby
 * iteracji ani od punktu startowego.
 */
function cubicRoots(a: number, b: number, c: number): number[] {
  // Podstawienie λ = t − a/3 usuwa wyraz kwadratowy: t³ + pt + q = 0.
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const przesuniecie = -a / 3;

  const wyroznik = (q * q) / 4 + (p * p * p) / 27;

  if (Math.abs(p) < 1e-12 && Math.abs(q) < 1e-12) return [przesuniecie];

  if (wyroznik > 1e-12) {
    // Jeden pierwiastek rzeczywisty.
    const pierwiastek = Math.sqrt(wyroznik);
    const u = Math.cbrt(-q / 2 + pierwiastek);
    const v = Math.cbrt(-q / 2 - pierwiastek);
    return [u + v + przesuniecie];
  }

  // Trzy pierwiastki rzeczywiste — postać trygonometryczna unika liczb
  // zespolonych, które w tym przypadku i tak by się skróciły.
  const promien = 2 * Math.sqrt(-p / 3);
  const kosinus = Math.max(-1, Math.min(1, (3 * q) / (p * promien)));
  const kat = Math.acos(kosinus) / 3;

  return [0, 1, 2].map((k) => promien * Math.cos(kat - (2 * Math.PI * k) / 3) + przesuniecie);
}

/**
 * Kierunek własny dla danej wartości własnej.
 *
 * Jądro `M − λI` znajdujemy przez iloczyny wektorowe wierszy: wynik jest
 * prostopadły do dwóch wierszy, więc leży w jądrze, o ile te wiersze rozpinają
 * obraz. Bierzemy parę dającą najdłuższy iloczyn — najkrótszy znaczyłby
 * wiersze niemal równoległe i wynik zdominowany przez błąd zaokrągleń.
 */
function eigenvector3(m: Matrix3, lambda: number): Vector3 | null {
  const A: Matrix3 = [
    [m[0][0] - lambda, m[0][1], m[0][2]],
    [m[1][0], m[1][1] - lambda, m[1][2]],
    [m[2][0], m[2][1], m[2][2] - lambda],
  ];

  const wiersze = A as unknown as Vector3[];
  let najlepszy: Vector3 | null = null;
  let najdluzszy = 1e-7;

  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as Array<[number, number]>) {
    const kandydat = cross(wiersze[i], wiersze[j]);
    const dlugosc = norm(kandydat);
    if (dlugosc > najdluzszy) {
      najdluzszy = dlugosc;
      najlepszy = normalize(kandydat);
    }
  }

  if (najlepszy) return najlepszy;

  // Wszystkie iloczyny znikome znaczy, że `M − λI` ma rząd co najwyżej jeden —
  // wtedy jądro jest co najmniej dwuwymiarowe i wystarczy dowolny kierunek
  // prostopadły do niezerowego wiersza.
  for (const wiersz of wiersze) {
    if (norm(wiersz) > ZERO) {
      for (const os of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vector3[]) {
        const kandydat = cross(wiersz, os);
        if (norm(kandydat) > 1e-7) return normalize(kandydat);
      }
    }
  }

  return [1, 0, 0];
}

/**
 * Wartości i kierunki własne macierzy 3×3.
 *
 * Powtórzone wartości własne zwracamy raz: dwie identyczne strzałki na scenie
 * wyglądałyby jak usterka rysowania, a nie jak degeneracja.
 */
export function eigenM3(m: Matrix3): EigenResult3 {
  const slad = m[0][0] + m[1][1] + m[2][2];
  const suma2x2 = (m[0][0] * m[1][1] - m[0][1] * m[1][0])
    + (m[0][0] * m[2][2] - m[0][2] * m[2][0])
    + (m[1][1] * m[2][2] - m[1][2] * m[2][1]);

  // λ³ − tr·λ² + (suma minorów)·λ − det = 0
  const pierwiastki = cubicRoots(-slad, suma2x2, -detM3(m));

  const pairs: EigenPair3[] = [];
  for (const value of pierwiastki) {
    if (pairs.some((p) => Math.abs(p.value - value) < 1e-6)) continue;
    const vector = eigenvector3(m, value);
    if (vector) pairs.push({ value, vector });
  }

  return { pairs };
}

/** Macierz w połowie drogi od identyczności — klatka animacji. */
export function interpolateM3(m: Matrix3, t: number): Matrix3 {
  const I = identityM3();
  const wynik = identityM3();
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      wynik[i][j] = I[i][j] + (m[i][j] - I[i][j]) * t;
    }
  }
  return wynik;
}
