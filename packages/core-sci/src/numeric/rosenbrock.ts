/**
 * rosenbrock.ts — układy sztywne, czyli takie, w których krok narzuca stabilność,
 * a nie dokładność.
 *
 * Sztywność bierze się ze współistnienia dwóch skal czasu, z których szybka już
 * wygasła. Obwód RC po ułamku sekundy nie robi nic ciekawego, ale metoda jawna
 * musi go dalej liczyć krokiem rzędu stałej czasowej — inaczej rozwiązanie nie
 * tyle traci dokładność, co eksploduje. To nie jest problem złego dobrania
 * kroku: dla y' = −10⁶·y granica stabilności RK4 wynosi około 2,8·10⁻⁶ s
 * niezależnie od tego, jak gładkie jest rozwiązanie.
 *
 * Metoda niejawna tej granicy nie ma. Płaci za to w każdym kroku jakobianem
 * i układem równań — dlatego **nie jest domyślna**: dla zwykłego wahadła byłaby
 * kilkakrotnie droższa bez żadnego zysku.
 *
 * Wybrana metoda to **RODAS3** (Sandu i in.): cztery stopnie, rząd 3
 * z wbudowanym rozwiązaniem rzędu 2, γ = ½, L-stabilna. L-stabilność znaczy,
 * że składowe szybkie **gasną** zamiast oscylować wokół zera z kroku na krok —
 * to jest ta różnica, którą widać na wykresie.
 *
 * Rząd 3, a nie 2, z powodu ekonomii, nie elegancji. Prostsza para 2(1)
 * (ROS2, napisana tu najpierw) jest poprawna, ale jej estymator jest rzędu
 * pierwszego, więc krok skaluje się jak √tol zamiast tol^(1/3). Zmierzone:
 * obwód RC o stałej czasowej mikrosekundy liczony przez sekundę wyczerpywał
 * limit dwustu tysięcy kroków — czyli metoda dla układów sztywnych przegrywała
 * na najbardziej sztywnym przykładzie, jaki można wymyślić. Para 3(2) ma też
 * estymator, który wolno przepuścić przez `I − γhJ`, i dopiero wtedy ten chwyt
 * ma sens: różnica rozwiązań rzędu 3 i 2 jest już mała, więc filtr tłumi szum
 * sztywnych kierunków, a nie sam sygnał.
 *
 * Rosenbrock, a nie w pełni niejawna metoda z iteracją Newtona, bo tu układ
 * liniowy rozwiązuje się **raz na stopień**, bez pętli iteracyjnej w środku.
 * Dla modeli dydaktycznych (kilka–kilkanaście zmiennych) to najlepszy stosunek
 * prostoty do możliwości.
 *
 * **Układ liczymy w postaci autonomicznej**: czas wchodzi do stanu jako
 * dodatkowa zmienna o pochodnej równej jedności. Bez tego metoda gubi człon
 * z ∂f/∂t i przestaje być rzędu drugiego dla równań z jawnym wymuszeniem —
 * zmierzone na y' = −10⁶(y − cos t): błąd rzędu 10⁴ zamiast 10⁻⁶. Wymuszenie
 * jest zaś regułą, a nie wyjątkiem, w układach, dla których ta metoda powstała
 * (obwód RLC ze źródłem, oscylator wymuszony). Autonomizacja załatwia to bez
 * osobnej ścieżki: jakobian liczony z rozszerzonego stanu **sam** zawiera
 * kolumnę ∂f/∂t.
 */
import { Trajectory, hermiteInterpolant, type Derivative, type Interpolant, type Sample, type State } from './trajectory';
import { solveLinear } from './linsolve';
import { IntegrationError, type AdaptiveOptions } from './dopri5';

/**
 * γ = ½ — wartość, przy której RODAS3 jest L-stabilna.
 *
 * Sama A-stabilność (brak ograniczenia kroku) nie wystarcza: przy γ dobranym
 * tylko pod rząd metody szybka składowa zmienia znak w każdym kroku i wykres
 * pokazuje drgania, których w rozwiązaniu nie ma.
 */
const GAMMA = 0.5;

/**
 * Współczynniki RODAS3 w konwencji `(I − γhJ)·kᵢ = h·f(y + Σaᵢⱼkⱼ) + Σcᵢⱼkⱼ`.
 *
 * Prawą stronę mnoży się przez γ — to nie jest szczegół zapisu. Bez tego
 * mnożnika suma wag dla stałej prawej strony daje 4 zamiast 1, więc metoda
 * przestaje być zbieżna do właściwego rozwiązania; pomiar rzędu pokazywał
 * wtedy 1,09 zamiast 3. Zapisane wprost i sprawdzone **pomiarem rzędu** (patrz
 * test „jest metodą trzeciego rzędu"), bo pomyłka w tych liczbach nie wywraca
 * obliczeń, tylko po cichu obniża rząd — a tego nie widać w żadnym pojedynczym
 * wyniku.
 */
const A31 = 2, A41 = 2, A43 = 1;
const C21 = 4, C31 = 1, C32 = -1, C41 = 1, C42 = -1, C43 = -8 / 3;
const M1 = 2, M3 = 1, M4 = 1;

const SAFETY = 0.9;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 5;

export interface RosenbrockOptions extends AdaptiveOptions {
  /**
   * Jakobian podany wprost: `J[i][j] = ∂f_i/∂y_j`.
   *
   * Bez niego liczymy go różnicami skończonymi, co kosztuje `n` wywołań prawej
   * strony na krok. Autor, który zna pochodne, dostaje wynik tańszy i wolny od
   * błędu różniczkowania.
   */
  jacobian?: (t: number, y: State) => number[][];
}

/**
 * Jakobian z różnic skończonych.
 *
 * Przyrost dobrany jako pierwiastek precyzji maszynowej razy skala zmiennej:
 * mniejszy tonie w błędzie zaokrągleń licznika, większy przestaje przybliżać
 * pochodną. Przy sztywnych układach wartości bywają bardzo różnych rzędów,
 * więc skala musi być liczona **osobno dla każdej zmiennej**.
 */
function numericJacobian(F: (Y: State) => State, Y: State, F0: State): number[][] {
  const n = Y.length;
  const J: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let j = 0; j < n; j += 1) {
    const delta = Math.max(Math.abs(Y[j]), 1e-8) * 1.49e-8;
    const shifted = [...Y];
    shifted[j] += delta;
    const FShifted = F(shifted);
    for (let i = 0; i < n; i += 1) J[i][j] = (FShifted[i] - F0[i]) / delta;
  }

  return J;
}

function defaultNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `y${i}`);
}

/**
 * Całkuje układ metodą ROS2 z adaptacyjnym krokiem.
 *
 * Interfejs jest ten sam co `dopri5` — z jednym dodatkiem (`jacobian`) — bo
 * wybór metody ma być decyzją o fizyce układu, a nie o tym, jak przepisać
 * wywołanie.
 */
export function rosenbrock(
  f: Derivative,
  y0: State,
  tSpan: [number, number],
  options: RosenbrockOptions = {},
): Trajectory {
  const { rtol = 1e-6, atol = 1e-9, maxSteps = 1_000_000, dense = true, onStep } = options;

  const [t0, tEnd] = tSpan;
  const span = tEnd - t0;
  const n = y0.length;
  const names = options.stateNames ?? defaultNames(n);

  if (!(span > 0) || n === 0) return new Trajectory([{ t: t0, y: [...y0] }], names);

  const maxStep = options.maxStep ?? span;
  const minStep = options.minStep ?? Math.abs(span) * 1e-12;

  const samples: Sample[] = [{ t: t0, y: [...y0] }];
  const interpolants: Interpolant[] = [];

  /** Prawa strona w postaci autonomicznej: ostatnia składowa to czas, ẏ = 1. */
  const F = (Y: State): State => [...f(Y[n], Y.slice(0, n)), 1];

  let t = t0;
  let y = [...y0];
  let h = Math.min(maxStep, Math.max(minStep, options.dt ?? span / 100));
  let steps = 0;

  while (t < tEnd) {
    steps += 1;
    if (steps > maxSteps) {
      throw new IntegrationError(
        `Przekroczono limit ${maxSteps} kroków metody niejawnej na przedziale [${t0}, ${tEnd}] `
        + `(doszedłem do t = ${t.toPrecision(4)}). Skoro nie pomogła nawet metoda bez ograniczenia `
        + 'stabilnościowego, problem leży w samym rozwiązaniu — sprawdź, czy nie ma osobliwości.',
      );
    }
    if (h < minStep) {
      throw new IntegrationError(
        `Krok metody niejawnej zszedł poniżej ${minStep.toPrecision(3)} przy t = ${t.toPrecision(4)}.`,
      );
    }

    const ostatni = t + h >= tEnd;
    if (ostatni) h = tEnd - t;

    const f0 = f(t, y);
    const Y = [...y, t];
    const F0 = [...f0, 1];

    /**
     * Jakobian rozszerzony: n kolumn od zmiennych stanu, ostatnia od czasu.
     *
     * Jakobian podany przez autora dotyczy samych zmiennych stanu, więc kolumnę
     * czasową dolicza się różnicą — inaczej trzeba by żądać od autora także
     * ∂f/∂t, czyli wiedzy, której podanie jest trudniejsze niż sam zysk.
     */
    const J = options.jacobian
      ? (() => {
        const podany = options.jacobian!(t, y);
        const dt = Math.max(Math.abs(t), 1e-8) * 1.49e-8;
        const fShift = f(t + dt, y);
        return [
          ...podany.map((row, i) => [...row, (fShift[i] - f0[i]) / dt]),
          new Array<number>(n + 1).fill(0),
        ];
      })()
      : numericJacobian(F, Y, F0);

    // Macierz układu: I − γhJ. Ta sama dla obu stopni, więc rozkład można by
    // policzyć raz — przy rozmiarach modeli z dokumentu nie ma to znaczenia,
    // a osobne wywołania czytają się jaśniej.
    const W: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 },
      (_unused, j) => (i === j ? 1 : 0) - GAMMA * h * J[i][j]));

    const k1 = solveLinear(W, F0.map((v) => GAMMA * h * v));
    if (!k1) {
      // Macierz osobliwa: krótszy krok zwykle ją poprawia, bo `I` zaczyna
      // dominować nad `γhJ`.
      h *= MIN_FACTOR;
      continue;
    }

    // Drugi stopień liczy prawą stronę w tym samym punkcie co pierwszy (a₂ⱼ = 0);
    // cała jego treść siedzi w członie z k₁.
    const k2 = solveLinear(W, F0.map((v, i) => GAMMA * (h * v + C21 * k1[i])));
    if (!k2) { h *= MIN_FACTOR; continue; }

    const Y3 = Y.map((v, i) => v + A31 * k1[i]);
    const F3 = F(Y3);
    const k3 = solveLinear(W, F3.map((v, i) => GAMMA * (h * v + C31 * k1[i] + C32 * k2[i])));
    if (!k3) { h *= MIN_FACTOR; continue; }

    const Y4 = Y.map((v, i) => v + A41 * k1[i] + A43 * k3[i]);
    const F4 = F(Y4);
    const k4 = solveLinear(W, F4.map((v, i) => GAMMA * (h * v + C41 * k1[i] + C42 * k2[i] + C43 * k3[i])));
    if (!k4) { h *= MIN_FACTOR; continue; }

    const yNext = y.map((v, i) => v + M1 * k1[i] + M3 * k3[i] + M4 * k4[i]);

    /**
     * Oszacowanie błędu: różnica rozwiązań rzędu 3 i 2 to po prostu `k₄`.
     *
     * Tak dobrano wagi wbudowanego rozwiązania — i dlatego estymator nic nie
     * kosztuje. Wcześniejsza para 2(1) wymagała wyboru między estymatorem
     * uczciwym (drogim: √tol) a przefiltrowanym (tanim, ale ślepym na błąd
     * w kierunku sztywnym). Tutaj problem znika, bo `k₄` jest już wielkością
     * małego rzędu.
     */
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const skala = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNext[i]));
      sum += (k4[i] / skala) ** 2;
    }
    const err = Math.sqrt(sum / n);

    const dobry = Number.isFinite(err) && err <= 1;
    /**
     * Nowa długość kroku. Wykładnik ⅓ — para 3(2), błąd maleje z trzecią potęgą.
     *
     * Zero błędu trzeba obsłużyć osobno i **przeciwnie** do wartości
     * niepoliczalnych: `err = 0` znaczy „krok idealny, wydłuż maksymalnie",
     * a `NaN` znaczy „rozwiązanie uciekło, skróć". Wrzucone do jednego worka
     * (jak było na początku) dawały zapętlenie: układ dochodził do stanu
     * ustalonego, błąd stawał się dokładnie zerem i solver zaczynał skracać krok
     * aż do granicy — mimo że liczył bezbłędnie.
     */
    const factor = !Number.isFinite(err)
      ? MIN_FACTOR
      : (err === 0
        ? MAX_FACTOR
        : Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, SAFETY * err ** (-1 / 3))));

    if (!dobry) {
      h = Math.max(minStep / 2, h * Math.min(1, factor));
      continue;
    }

    const tNext = ostatni ? tEnd : t + h;
    if (dense) {
      // Hermite z pochodnych w końcach kroku: dla metody drugiego rzędu to
      // dokładnie tyle wiedzy o wnętrzu kroku, ile realnie mamy.
      interpolants.push(hermiteInterpolant(y, yNext, h, f0, f(tNext, yNext)));
    }

    // Zdarzenia obsługujemy tak, jak robiły to metody o stałym kroku: sprawdzeniem
    // po kroku. Rozwiązywanie ich wewnątrz kroku (jak w `dopri5`) miałoby tu
    // mniejszy sens — krok metody niejawnej bywa długi, ale interpolant Hermite'a
    // jest tylko trzeciego stopnia, więc chwila zdarzenia i tak byłaby gorsza
    // niż samo rozwiązanie.
    let stan = yNext;
    const reakcja = onStep?.(tNext, stan);
    if (reakcja && reakcja !== 'stop') stan = reakcja;

    samples.push({ t: tNext, y: [...stan] });
    t = tNext;
    y = stan;

    if (reakcja === 'stop') break;
    h = Math.min(maxStep, h * factor);
  }

  return new Trajectory(samples, names, dense ? interpolants : undefined);
}
