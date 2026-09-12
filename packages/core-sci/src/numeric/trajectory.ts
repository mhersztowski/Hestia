/**
 * trajectory.ts — wynik całkowania jako próbki z interpolacją.
 *
 * Solver i renderer mają różne kroki: solver dobiera krok pod dokładność, a
 * renderer pod klatki ekranu. Gdyby renderer czytał wprost tablicę kroków,
 * zmiana dokładności zmieniałaby płynność animacji — dlatego trajektoria
 * udostępnia **odczyt po czasie**, a nie po indeksie.
 */

import type { EventHit } from './events';

/** Stan układu — wektor liczb w kolejności zmiennych stanu. */
export type State = number[];

export interface Sample {
  t: number;
  y: State;
}

/**
 * Przebieg wewnątrz jednego kroku solvera, zapisany jako **dane**.
 *
 * Solver wyższego rzędu zna stan w środku kroku, nie tylko na jego końcach —
 * ta wiedza powstaje przy okazji liczenia i przepada, jeśli się jej nie zapisze.
 * Bez niej odczyt między próbkami sprowadza się do cięciwy, a przy adaptacji
 * próbki bywają odległe o sekundy.
 *
 * Dane, a nie domknięcie, z jednego konkretnego powodu: model liczy się
 * w workerze, a przez `postMessage` przechodzą wyłącznie struktury. Interpolant
 * zapisany jako funkcja ginąłby dokładnie na tej granicy, więc animacja
 * w aplikacji czytałaby po cięciwie mimo że solver policzył lepiej.
 */
export interface Interpolant {
  /** Współczynniki postaci Hairera, po jednym wektorze na człon wielomianu. */
  r1: number[];
  r2: number[];
  r3: number[];
  r4: number[];
  r5: number[];
  /**
   * Ułamek kroku, na którym interpolant obowiązuje.
   *
   * Krok przerwany zdarzeniem kończy się wcześniej, niż go policzono — wtedy
   * `theta` z przedziału [0, 1] odnosi się do skróconego odcinka, a wielomian
   * trzeba czytać w punkcie `theta · scale`.
   */
  scale: number;
}

/**
 * Interpolant Hermite'a z wartości i pochodnych na końcach kroku.
 *
 * Dla metod niższego rzędu to wszystko, co realnie wiadomo o wnętrzu kroku:
 * dwa stany i dwie pochodne dają wielomian trzeciego stopnia. Zapisujemy go
 * w tej samej postaci co dense output Dormanda–Prince'a (człon czwartego rzędu
 * zostaje zerowy), żeby odczyt z trajektorii nie musiał wiedzieć, która metoda
 * ją policzyła.
 */
export function hermiteInterpolant(y0: State, y1: State, h: number, f0: State, f1: State): Interpolant {
  const n = y0.length;
  const r2 = new Array<number>(n);
  const r3 = new Array<number>(n);
  const r4 = new Array<number>(n);
  const r5 = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i += 1) {
    const diff = y1[i] - y0[i];
    const bspl = h * f0[i] - diff;
    r2[i] = diff;
    r3[i] = bspl;
    r4[i] = diff - h * f1[i] - bspl;
  }

  return { r1: [...y0], r2, r3, r4, r5, scale: 1 };
}

/** Stan w środku kroku; `theta` biegnie od 0 do 1 po zapisanym odcinku. */
export function evalInterpolant(interpolant: Interpolant, theta: number): State {
  const { r1, r2, r3, r4, r5, scale } = interpolant;
  const s = theta * scale;
  const s1 = 1 - s;
  const out = new Array<number>(r1.length);
  for (let i = 0; i < r1.length; i += 1) {
    out[i] = r1[i] + s * (r2[i] + s1 * (r3[i] + s * (r4[i] + s1 * r5[i])));
  }
  return out;
}

export class Trajectory {
  constructor(
    readonly samples: Sample[],
    /** Nazwy zmiennych stanu w kolejności wektora — po nich czyta się wynik. */
    readonly stateNames: string[],
    /**
     * Interpolanty kroków: `interpolants[i]` obowiązuje między próbką `i` a `i+1`.
     *
     * Opcjonalne, bo solvery o stałym kroku ich nie mają i nie muszą — przy
     * gęstych próbkach cięciwa wystarcza.
     */
    readonly interpolants?: Interpolant[],
    /**
     * Zdarzenia, które zaszły po drodze — z chwilą wyznaczoną, a nie zgadniętą.
     *
     * Trzymane przy trajektorii, bo dotyczą **tego** przebiegu: czas lotu jest
     * wynikiem symulacji tak samo jak położenie, tylko odpowiada na pytanie
     * „kiedy", a nie „gdzie".
     */
    readonly events?: EventHit[],
  ) {}

  get t0(): number { return this.samples[0]?.t ?? 0; }
  get t1(): number { return this.samples[this.samples.length - 1]?.t ?? 0; }
  get length(): number { return this.samples.length; }

  /**
   * Stan w dowolnej chwili — interpolacja liniowa między próbkami.
   *
   * Poza zakresem zwraca skrajną próbkę zamiast ekstrapolować: przedłużanie
   * trajektorii poza policzony przedział to zgadywanie, a na wykresie wygląda
   * jak wynik obliczeń.
   */
  at(t: number): State {
    const { samples } = this;
    if (!samples.length) return [];
    if (t <= samples[0].t) return [...samples[0].y];
    if (t >= samples[samples.length - 1].t) return [...samples[samples.length - 1].y];

    // Wyszukiwanie binarne — trajektoria bywa długa, a renderer pyta co klatkę.
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) lo = mid;
      else hi = mid;
    }

    const a = samples[lo];
    const b = samples[hi];
    const span = b.t - a.t;
    const u = span === 0 ? 0 : (t - a.t) / span;

    // Gdy solver zostawił interpolant tego kroku, czytamy z niego: cięciwa
    // między dwiema odległymi próbkami myli się o rzędy wielkości bardziej niż
    // sam solver, który je policzył.
    const interpolant = this.interpolants?.[lo];
    if (interpolant) return evalInterpolant(interpolant, u);

    return a.y.map((value, i) => value + (b.y[i] - value) * u);
  }

  /** Wartość jednej zmiennej stanu w chwili `t`. */
  value(name: string, t: number): number {
    const index = this.stateNames.indexOf(name);
    return index < 0 ? Number.NaN : this.at(t)[index];
  }

  /** Przebieg jednej zmiennej — pary [t, wartość] do wykresu. */
  series(name: string): Array<[number, number]> {
    const index = this.stateNames.indexOf(name);
    if (index < 0) return [];
    return this.samples.map((sample) => [sample.t, sample.y[index]]);
  }
}

/** Prawa strona układu: dy/dt = f(t, y). */
export type Derivative = (t: number, y: State) => State;

/**
 * Reakcja na stan po kroku.
 *
 * Zwrócony wektor zastępuje stan (odbicie, przeskok), `'stop'` kończy
 * całkowanie, `undefined` znaczy „nic się nie stało". Zdarzenia obsługujemy
 * między krokami, a nie w prawej stronie równania: skok prędkości przy odbiciu
 * nie jest pochodną i wstawiony do `f` rozsypałby każdy solver wyższego rzędu.
 */
export type StepHook = (t: number, y: State) => State | 'stop' | undefined;

export interface SolveOptions {
  /** Krok całkowania; solvery o stałym kroku używają go wprost. */
  dt: number;
  /**
   * Co ile kroków zapisywać próbkę.
   *
   * Dokładność wymaga małego kroku, a wykres nie potrzebuje miliona punktów —
   * to są dwie różne potrzeby i mają dwa różne pokrętła.
   */
  sampleEvery?: number;
}
