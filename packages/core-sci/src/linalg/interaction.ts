/**
 * interaction.ts — chwytanie i prowadzenie wektorów na scenie.
 *
 * Raport (§3.6c) zastępuje suwak **uchwytem końca strzałki**: parametr
 * wektorowy przeciąga się po płaszczyźnie, a graf przelicza wszystko poniżej.
 * Zysk jest dydaktyczny, nie estetyczny — „przeciągnij v i znajdź kierunek, w
 * którym Av leży na v" zamienia definicję wektora własnego w coś, co się
 * odkrywa, a nie zapamiętuje.
 *
 * Logika mieszka tutaj, a nie w komponencie, bo nie ma w niej nic z
 * przeglądarki: to geometria, którą da się sprawdzić testem.
 */
import { apply, eigen, type Matrix2, type Vector2 } from './matrix';

const ZERO = 1e-12;

/**
 * Który wektor jest pod wskaźnikiem.
 *
 * Promień trafienia jest w **jednostkach sceny**, a nie w ułamku długości
 * wektora: inaczej wektor bliski zeru byłby nie do złapania dokładnie wtedy,
 * gdy trzeba go wyciągnąć z powrotem.
 */
export function pickVector(
  point: Vector2,
  vectors: Array<{ name: string; value: Vector2 }>,
  radius: number,
): string | undefined {
  let najblizszy: string | undefined;
  let najmniejsza = radius;

  for (const { name, value } of vectors) {
    const odleglosc = Math.hypot(point[0] - value[0], point[1] - value[1]);
    if (odleglosc <= najmniejsza) {
      najmniejsza = odleglosc;
      najblizszy = name;
    }
  }

  return najblizszy;
}

/**
 * Jak bardzo obraz wektora leży na nim samym: 1 = dokładnie, 0 = prostopadle.
 *
 * Bierzemy **wartość bezwzględną** cosinusa, bo ujemna wartość własna odwraca
 * zwrot, a kierunek zostaje ten sam. Bez tego odbicie „nie miałoby" wektorów
 * własnych, choć ma dwa.
 */
export function alignment(m: Matrix2, v: Vector2): number {
  const dlugoscV = Math.hypot(v[0], v[1]);
  if (dlugoscV <= ZERO) return 0;

  const obraz = apply(m, v);
  const dlugoscObrazu = Math.hypot(obraz[0], obraz[1]);
  // Obraz zerowy znaczy, że wektor leży w jądrze — kierunek ginie, więc nie ma
  // czego porównywać.
  if (dlugoscObrazu <= ZERO) return 0;

  const iloczyn = v[0] * obraz[0] + v[1] * obraz[1];
  return Math.abs(iloczyn) / (dlugoscV * dlugoscObrazu);
}

/**
 * Przyciąga wektor do najbliższego kierunku własnego, jeśli jest blisko.
 *
 * Bez przyciągania trafienie w kierunek własny myszą jest kwestią przypadku i
 * czytelnik nigdy nie zobaczy dokładnego „Av leży na v". Przyciągamy sam
 * kierunek — długość zostaje, bo wektor własny nie ma wyróżnionej skali.
 *
 * `null`, gdy nie ma czego przyciągać: przy obrocie brak kierunków własnych
 * jest prawdą o przekształceniu i nie wolno jej zatrzeć.
 */
export function snapToEigen(m: Matrix2, v: Vector2, tolerance: number): Vector2 | null {
  const dlugosc = Math.hypot(v[0], v[1]);
  if (dlugosc <= ZERO) return null;

  const wynik = eigen(m);
  if (!wynik.real || !wynik.pairs.length) return null;

  const kierunek: Vector2 = [v[0] / dlugosc, v[1] / dlugosc];
  let najlepszy: Vector2 | null = null;
  let najmniejszaOdleglosc = tolerance;

  for (const { vector } of wynik.pairs) {
    // Sprawdzamy oba zwroty tej samej prostej — kierunek własny nie ma strony.
    for (const znak of [1, -1]) {
      const kandydat: Vector2 = [vector[0] * znak, vector[1] * znak];
      const odleglosc = Math.hypot(kierunek[0] - kandydat[0], kierunek[1] - kandydat[1]);
      if (odleglosc < najmniejszaOdleglosc) {
        najmniejszaOdleglosc = odleglosc;
        najlepszy = [kandydat[0] * dlugosc, kandydat[1] * dlugosc];
      }
    }
  }

  return najlepszy;
}
