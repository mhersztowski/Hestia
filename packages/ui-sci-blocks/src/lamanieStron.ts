/**
 * lamanieStron.ts — gdzie kończy się strona w trybie czytania.
 *
 * Dzielenie treści co stałą wysokość jest proste i **złe**: granica wypada
 * wtedy w połowie wzoru albo w środku symulacji, a czytelnik dostaje pół
 * rysunku na dole jednej strony i pół na górze drugiej. W książce tak się nie
 * składa — łamie się między elementami.
 *
 * Dlatego strona zaczyna się tam, gdzie zaczyna się element, który nie zmieścił
 * się na poprzedniej. Strony mają wtedy **różne wysokości**, a przewijanie idzie
 * do zapamiętanego przesunięcia, nie do wielokrotności jednej liczby.
 *
 * Element wyższy niż widok jest osobnym przypadkiem: nie da się go zmieścić
 * nigdzie. Dzielimy go wtedy tak jak dawniej, co widok — bo jedyna alternatywa
 * to nie pokazać go wcale.
 *
 * Funkcja jest czysta i operuje na liczbach, nie na węzłach DOM. Pomiar należy
 * do komponentu, a rozstrzyganie, gdzie łamać — tutaj; inaczej nie dałoby się
 * tego sprawdzić bez przeglądarki.
 */

export interface ElementTresci {
  /** Górna krawędź względem początku treści. */
  top: number;
  height: number;
}

/**
 * Przesunięcia początków stron. Pierwsza zawsze zaczyna się od zera.
 *
 * @param elementy Elementy najwyższego poziomu w kolejności dokumentu.
 * @param widok Wysokość okna czytania.
 * @param calosc Wysokość całej treści — domyka ostatnią stronę.
 */
export function punktyLamania(elementy: ElementTresci[], widok: number, calosc: number): number[] {
  if (widok <= 0) return [0];

  const punkty = [0];
  /** Początek strony, którą właśnie zapełniamy. */
  let poczatek = 0;

  for (const element of elementy) {
    const dol = element.top + element.height;
    if (dol <= poczatek + widok) continue;

    // Element zaczyna się za daleko, żeby zmieścić go w całości — nowa strona
    // zaczyna się od jego góry. Gdy sam jest wyższy niż widok, nie ma czego
    // ratować: dzielimy go co widok, żeby dało się go w ogóle przeczytać.
    if (element.top > poczatek) {
      poczatek = element.top;
      punkty.push(poczatek);
    }

    while (element.top + element.height > poczatek + widok) {
      poczatek += widok;
      punkty.push(poczatek);
    }

    // Po podzieleniu wysokiego elementu bieżąca strona zaczyna się na jego
    // ostatnim kawałku i może przyjąć jeszcze kolejne elementy.
  }

  // Strona pusta na końcu (treść skończyła się równo z granicą) tylko myli
  // licznikiem „5 / 6" przy czterech stronach z treścią.
  while (punkty.length > 1 && punkty[punkty.length - 1] >= calosc) punkty.pop();

  return punkty;
}

/**
 * Numer strony zawierającej dane miejsce dokumentu.
 *
 * Potrzebne przy przełączaniu trybu czytania: czytelnik jest w połowie
 * rozdziału i zmienia „przewijanie" na „strony". Otwarcie wtedy pierwszej
 * strony każe mu szukać miejsca, w którym przed chwilą był — a to jedyna rzecz,
 * której tryb czytania nie ma prawa gubić.
 *
 * Bierzemy ostatnią stronę zaczynającą się **nie później** niż wskazane
 * miejsce, bo strona zaczyna się na swoim punkcie i sięga do następnego.
 *
 * Zaokrąglamy obie strony porównania zamiast dokładać tolerancję: pomiar układu
 * zwraca ułamki (699,97 zamiast 700), a luz w porównaniu przesuwałby granicę
 * o piksel i miejsce tuż przed końcem strony trafiałoby już na następną.
 */
export function stronaDlaOffsetu(punkty: number[], offset: number): number {
  const cel = Math.round(offset);
  let wynik = 0;
  for (let i = 0; i < punkty.length; i += 1) {
    if (Math.round(punkty[i]) <= cel) wynik = i;
    else break;
  }
  return wynik;
}
