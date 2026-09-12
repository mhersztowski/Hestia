/**
 * events.ts — zdarzenie jako miejsce zerowe, nie jako warunek sprawdzany po kroku.
 *
 * Różnica jest zasadnicza dla całego etapu. „Sprawdź po kroku, czy piłka jest
 * pod ziemią" daje chwilę odbicia z dokładnością **długości kroku** — a solver
 * adaptacyjny wydłuża krok dokładnie tam, gdzie ruch jest gładki, czyli
 * najczęściej tuż przed zdarzeniem. Spadek swobodny jest wielomianem, więc
 * metoda piątego rzędu liczy go bezbłędnie i potrafi przeskoczyć całe lądowanie
 * jednym krokiem.
 *
 * Postawione właściwie, zdarzenie jest równaniem: g(t, y) = 0. Chwilę zdarzenia
 * znajduje się szukaniem pierwiastka, a stan w dowolnym punkcie kroku daje dense
 * output — więc **nie kosztuje to ani jednego dodatkowego kroku całkowania**,
 * tylko kilkanaście wywołań samej funkcji zdarzenia.
 */
import type { State } from './trajectory';

/** Który kierunek przejścia przez zero uznajemy za zdarzenie. */
export type CrossingDirection = 'up' | 'down' | 'any';

export interface EventSpec {
  /** Nazwa do raportu — zwykle warunek, tak jak napisał go autor. */
  name?: string;
  /**
   * Funkcja zdarzenia: zdarzenie zachodzi tam, gdzie przechodzi przez zero.
   *
   * Dla warunku `y < 0` jest to po prostu `y`; dla `v > v_max` — `v - v_max`.
   * Zamiana warunku na funkcję jest tym, co pozwala z „czy już" zrobić „kiedy".
   */
  g: (t: number, y: State) => number;
  direction?: CrossingDirection;
  /** Czy zdarzenie kończy całkowanie. */
  stop?: boolean;
  /** Podmiana stanu w chwili zdarzenia (odbicie, przeskok). */
  apply?: (t: number, y: State) => State;
}

/** Zdarzenie, które faktycznie zaszło — do wyniku i do podpisu na wykresie. */
export interface EventHit {
  name?: string;
  t: number;
  /** Stan **w chwili zdarzenia**, jeszcze przed podmianą. */
  y: State;
  /** Który wpis z listy zdarzeń zadziałał. */
  index: number;
  stopped: boolean;
}

/**
 * Czy między dwoma wartościami funkcji zdarzenia doszło do przejścia przez zero.
 *
 * Zero na **początku** przedziału świadomie nie jest zdarzeniem: stan tuż po
 * odbiciu leży dokładnie na progu i bez tej reguły każde odbicie meldowałoby
 * się powtórnie w następnym kroku, w nieskończoność.
 */
export function crossesZero(before: number, after: number, direction: CrossingDirection = 'any'): boolean {
  if (before === 0) return false;
  if (before > 0 && after <= 0) return direction !== 'up';
  if (before < 0 && after >= 0) return direction !== 'down';
  return false;
}

/**
 * Szuka chwili, w której `g` przechodzi przez zero — metoda Illinois.
 *
 * Regula falsi zbiega szybko, ale przy funkcji wypukłej potrafi się „zaciąć":
 * jeden koniec przedziału zostaje w miejscu i zbieżność spada do liniowej.
 * Wariant Illinois połowi wartość na zastałym końcu, przez co przedział kurczy
 * się z obu stron — kilkanaście wywołań zamiast trzydziestu paru przy czystej
 * bisekcji, a to jest różnica odczuwalna, bo `g` liczy się z wyrażenia
 * skompilowanego z dokumentu.
 */
export function findEventTime(
  g: (t: number) => number,
  ta: number,
  tb: number,
  tolerance = 1e-12,
  maxIterations = 60,
): number | undefined {
  let a = ta;
  let b = tb;
  let ga = g(a);
  let gb = g(b);

  if (ga === 0) return a;
  if (gb === 0) return b;
  if (ga * gb > 0) return undefined;

  for (let i = 0; i < maxIterations; i += 1) {
    if (Math.abs(b - a) <= tolerance) break;

    // Punkt przecięcia siecznej z osią; przy dzieleniu przez zero (obie wartości
    // równe) wracamy do środka przedziału.
    const denominator = gb - ga;
    let c = denominator === 0 ? (a + b) / 2 : b - gb * ((b - a) / denominator);

    // Sieczna potrafi wypaść tuż przy końcu przedziału i wtedy postęp jest
    // pozorny — pilnujemy, żeby punkt próbny leżał w środku.
    const margin = Math.abs(b - a) * 1e-4;
    if (!(c > Math.min(a, b) + margin && c < Math.max(a, b) - margin)) c = (a + b) / 2;

    const gc = g(c);
    if (gc === 0) return c;

    if (ga * gc < 0) {
      b = c;
      gb = gc;
      // Illinois: koniec, który został, traci połowę wagi.
      ga /= 2;
    } else {
      a = c;
      ga = gc;
      gb /= 2;
    }
  }

  return (a + b) / 2;
}
