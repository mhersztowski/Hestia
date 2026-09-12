/**
 * matrix.ts — algebra liniowa 2D jako typy wielkości.
 *
 * Raport (§3.6c) zauważa, że mechanizm „typ → widok" z 3.6b nie kończy się na
 * fizyce: wektor i macierz też mają kanoniczne przedstawienie. Wektor to
 * strzałka, macierz to **deformacja siatki**, podprzestrzeń to prosta albo
 * płaszczyzna. Jeśli graf zna te typy, dokument z `w = A \cdot v` rysuje scenę
 * bez linijki kodu widoku — tak samo jak `T = 2\pi\sqrt{L/g}` sam wie, że jest
 * liczbą w sekundach.
 *
 * Moduł liczy tylko rzeczy, które **widać na scenie**: wyznacznik jako zmianę
 * pola, wektory własne jako kierunki bez skręcenia, rangę jako liczbę
 * zachowanych wymiarów. Wszystko dla 2×2 ma wzory zamknięte, więc nie ma tu
 * ani iteracji, ani tolerancji zbieżności — tylko arytmetyka.
 *
 * Wymiar trzeci dojdzie osobno; sceny 2D wystarczają dla większości dydaktyki
 * i nie wymagają silnika 3D, a mieszanie obu w jednym module zaciemniłoby to,
 * co w algebrze jest naprawdę dwuwymiarowe.
 */

export type Vector2 = [number, number];
/** Wiersze macierzy: `[[a, b], [c, d]]` działa jak `[a b; c d]`. */
export type Matrix2 = [[number, number], [number, number]];

export interface EigenPair {
  value: number;
  /** Kierunek własny, znormalizowany — na scenie liczy się kierunek, nie długość. */
  vector: Vector2;
}

export interface EigenResult {
  /**
   * Czy wartości własne są rzeczywiste.
   *
   * Obrót nie ma rzeczywistych kierunków własnych i to jest **prawda o
   * przekształceniu**, a nie brak wyniku — scena ma to pokazać, więc model
   * musi to umieć powiedzieć.
   */
  real: boolean;
  /** Pary; przy zdegenerowanej macierzy jedna, przy obrocie żadna. */
  pairs: EigenPair[];
}

/** Poniżej tego progu traktujemy liczbę jak zero — po zaokrągleniach `det` bywa 1e-17. */
const ZERO = 1e-12;

export function identity(): Matrix2 {
  return [[1, 0], [0, 1]];
}

export function apply(m: Matrix2, v: Vector2): Vector2 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1],
    m[1][0] * v[0] + m[1][1] * v[1],
  ];
}

/**
 * Złożenie „najpierw `b`, potem `a`" — jak w zapisie `A·B·v`.
 *
 * Kolejność jest tu jedyną rzeczą, którą da się pomylić bez żadnego objawu
 * poza złym obrazem, więc nazwa i komentarz są ważniejsze niż sam kod.
 */
export function compose(a: Matrix2, b: Matrix2): Matrix2 {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

/** Wyznacznik — czynnik, przez który mnoży się pole. Ujemny odwraca orientację. */
export function det(m: Matrix2): number {
  return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

/** Ile wymiarów przeżywa przekształcenie. */
export function rank(m: Matrix2): number {
  if (Math.abs(det(m)) > ZERO) return 2;
  const niezerowa = m.some((wiersz) => wiersz.some((x) => Math.abs(x) > ZERO));
  return niezerowa ? 1 : 0;
}

/** Odwrotność albo `null`, gdy przekształcenie traci wymiar i nie da się go cofnąć. */
export function inverse(m: Matrix2): Matrix2 | null {
  const d = det(m);
  if (Math.abs(d) <= ZERO) return null;
  return [[m[1][1] / d, -m[0][1] / d], [-m[1][0] / d, m[0][0] / d]];
}

function normalize(v: Vector2): Vector2 {
  const dlugosc = Math.hypot(v[0], v[1]);
  return dlugosc > ZERO ? [v[0] / dlugosc, v[1] / dlugosc] : [0, 0];
}

/**
 * Kierunek własny dla danej wartości własnej.
 *
 * Szukamy jądra `M - λI`. Który wiersz wziąć, zależy od macierzy — przy
 * ścinaniu jeden z nich jest zerowy i dałby wektor zerowy, więc wybieramy ten
 * o większej normie.
 */
function eigenvectorFor(m: Matrix2, lambda: number): Vector2 | null {
  const a = m[0][0] - lambda;
  const b = m[0][1];
  const c = m[1][0];
  const d = m[1][1] - lambda;

  if (Math.hypot(a, b) > Math.hypot(c, d)) {
    if (Math.hypot(a, b) <= ZERO) return null;
    return normalize([-b, a]);
  }
  if (Math.hypot(c, d) <= ZERO) return null;
  return normalize([-d, c]);
}

/**
 * Wartości i wektory własne macierzy 2×2.
 *
 * Wzór zamknięty z równania charakterystycznego `λ² - tr·λ + det = 0` — bez
 * iteracji, więc bez pytania o zbieżność.
 */
export function eigen(m: Matrix2): EigenResult {
  const slad = m[0][0] + m[1][1];
  const wyznacznik = det(m);
  const delta = slad * slad - 4 * wyznacznik;

  if (delta < -ZERO) return { real: false, pairs: [] };

  const pierwiastek = Math.sqrt(Math.max(delta, 0));
  const wartosci = delta <= ZERO
    // Podwójna wartość własna: zwracamy jedną, bo dwie identyczne strzałki na
    // scenie wyglądałyby jak usterka rysowania, a nie jak degeneracja.
    ? [slad / 2]
    : [(slad + pierwiastek) / 2, (slad - pierwiastek) / 2];

  const pairs = wartosci
    .map((value) => ({ value, vector: eigenvectorFor(m, value) }))
    .filter((p): p is EigenPair => p.vector !== null);

  return { real: true, pairs };
}

/**
 * Macierz w połowie drogi od identyczności — klatka animacji przekształcenia.
 *
 * Interpolacja jest **liniowa po współczynnikach**, nie po rozkładzie na obrót
 * i skalowanie. To celowe: przy odbiciu wyznacznik przechodzi przez zero i w
 * połowie animacji płaszczyzna zapada się w prostą. Tak właśnie jest — nie da
 * się odbić płaszczyzny bez przejścia przez zero — i scena ma to pokazać, a
 * nie obejść ładniejszą drogą przez trzeci wymiar.
 */
export function interpolate(m: Matrix2, t: number): Matrix2 {
  const i = identity();
  const mieszaj = (a: number, b: number) => a + (b - a) * t;
  return [
    [mieszaj(i[0][0], m[0][0]), mieszaj(i[0][1], m[0][1])],
    [mieszaj(i[1][0], m[1][0]), mieszaj(i[1][1], m[1][1])],
  ];
}
