/**
 * dopri5.ts — Dormand–Prince 5(4) z adaptacyjnym krokiem i dense output.
 *
 * Pierwszy solver w tym pakiecie, któremu podaje się **tolerancję zamiast
 * kroku**. To zmiana pytania zadawanego autorowi dokumentu: „jak gęsto liczyć"
 * jest pytaniem o metodę numeryczną, na które fizyk nie zna odpowiedzi, a „jak
 * dokładnie" jest pytaniem o zjawisko i odpowiedź na nie zna zawsze.
 *
 * Metoda liczy **dwa przybliżenia naraz** — rzędu 5 i rzędu 4 — z tych samych
 * siedmiu próbek pochodnej. Ich różnica jest oszacowaniem błędu kroku, i to ona
 * steruje gęstością: tam, gdzie rozwiązanie zakręca (peryhelium orbity), krok
 * sam się skraca, a na prostym odcinku sam rośnie. Stały krok musi wszędzie
 * użyć tego najkrótszego — stąd kilkukrotna różnica w liczbie wywołań prawej
 * strony przy tej samej dokładności.
 *
 * **FSAL** (First Same As Last): siódma próbka zaakceptowanego kroku jest
 * pierwszą próbką następnego, więc krok kosztuje sześć wywołań `f`, nie siedem.
 * Warunkiem jest niezmieniony stan na styku kroków — dlatego po zdarzeniu,
 * które podmienia stan, liczymy `k1` od nowa.
 *
 * Dense output (Hairer) daje wielomian rzędu 4 **wewnątrz kroku**. Bez niego
 * adaptacja byłaby stratą: solver liczyłby rzadko i celnie, a animacja czytałaby
 * z cięciwy między odległymi próbkami i pokazywała łamaną.
 */
import {
  Trajectory, evalInterpolant,
  type Derivative, type Interpolant, type Sample, type State, type StepHook,
} from './trajectory';
import { crossesZero, findEventTime, type EventHit, type EventSpec } from './events';

// Tablica Butchera Dormanda–Prince'a. Ułamki zapisane wprost, bo w tej postaci
// da się je porównać ze źródłem — przeliczone na dziesiętne byłyby nie do
// sprawdzenia, a pomyłka w ostatniej cyfrze psuje rząd metody po cichu.
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84;

const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;

/** Różnice wag rzędu 5 i 4 — z nich powstaje oszacowanie błędu kroku. */
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920,
  E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

/** Współczynniki dense output (Hairer, Nørsett, Wanner). */
const D1 = -12715105075 / 11282082432;
const D3 = 87487479700 / 32700410799;
const D4 = -10690763975 / 1880347072;
const D5 = 701980252875 / 199316789632;
const D6 = -1453857185 / 822651844;
const D7 = 69997945 / 29380423;

/** Bezpiecznik sterowania krokiem: celujemy nieco poniżej tolerancji. */
const SAFETY = 0.9;
/** Krok nie skacze o więcej niż te czynniki — inaczej sterowanie oscyluje. */
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 5;

export interface AdaptiveOptions {
  /**
   * Tolerancja względna — ile cyfr znaczących ma się zgadzać.
   *
   * To jest jedyne pokrętło, którego autor dokumentu naprawdę potrzebuje.
   */
  rtol?: number;
  /**
   * Tolerancja bezwzględna — próg, poniżej którego wielkość uznajemy za zero.
   *
   * Bez niej zmienna przechodząca przez zero (prędkość w punkcie zwrotnym)
   * wymuszałaby nieskończenie drobny krok, bo błąd względny przy zerze nie ma
   * sensu.
   */
  atol?: number;
  /** Krok startowy — tylko wskazówka; solver zmienia go od pierwszego kroku. */
  dt?: number;
  /** Górne ograniczenie kroku; przydatne, gdy zjawisko ma zdarzenia do trafienia. */
  maxStep?: number;
  /** Poniżej tego kroku uznajemy, że układ jest nie do policzenia tą metodą. */
  minStep?: number;
  /** Zabezpieczenie przed liczeniem bez końca. */
  maxSteps?: number;
  stateNames?: string[];
  onStep?: StepHook;
  /** Czy zapisywać interpolanty kroków; domyślnie tak. */
  dense?: boolean;
  /**
   * Zdarzenia rozwiązywane **wewnątrz** kroku.
   *
   * Inaczej niż `onStep`, który tylko ogląda stan po kroku: tu chwila zdarzenia
   * jest wyznaczana jako miejsce zerowe funkcji `g`, więc nie zależy od tego,
   * jak długi krok akurat wypadł. Przy adaptacji to jedyny sposób — solver
   * wydłuża krok właśnie tam, gdzie ruch jest gładki, czyli zwykle tuż przed
   * progiem.
   */
  events?: EventSpec[];
  /** Dokładność wyznaczania chwili zdarzenia; domyślnie z `rtol`. */
  eventTolerance?: number;
}

/** Nieudane całkowanie — osobny typ, żeby host odróżnił je od błędu w modelu. */
export class IntegrationError extends Error {}

function defaultNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `y${i}`);
}

/**
 * Buduje interpolant kroku z siedmiu próbek pochodnej.
 *
 * Wartości są domykane w tablicach `r1..r5`, więc trajektoria trzyma pięć
 * wektorów na krok zamiast całego kontekstu solvera.
 */
function makeInterpolant(y0: State, y1: State, h: number, k1: State, k3: State, k4: State, k5: State, k6: State, k7: State): Interpolant {
  const n = y0.length;
  const r1 = [...y0];
  const r2 = new Array<number>(n);
  const r3 = new Array<number>(n);
  const r4 = new Array<number>(n);
  const r5 = new Array<number>(n);

  for (let i = 0; i < n; i += 1) {
    const diff = y1[i] - y0[i];
    const bspl = h * k1[i] - diff;
    r2[i] = diff;
    r3[i] = bspl;
    r4[i] = diff - h * k7[i] - bspl;
    r5[i] = h * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]);
  }

  return { r1, r2, r3, r4, r5, scale: 1 };
}

/**
 * Całkuje układ z zadaną tolerancją, dobierając krok samodzielnie.
 *
 * Rzuca `IntegrationError`, gdy zadanie okazuje się niewykonalne tą metodą —
 * cicha odpowiedź byłaby tu gorsza niż brak odpowiedzi, bo wykres z za dużym
 * krokiem wygląda równie przekonująco jak poprawny.
 */
export function dopri5(
  f: Derivative,
  y0: State,
  tSpan: [number, number],
  options: AdaptiveOptions = {},
): Trajectory {
  const {
    rtol = 1e-6, atol = 1e-9, maxSteps = 1_000_000, dense = true, onStep, events = [],
  } = options;
  // Chwila zdarzenia z dokładnością proporcjonalną do tolerancji rozwiązania:
  // wyznaczanie jej dokładniej niż samo rozwiązanie byłoby pracą bez pokrycia.
  const eventTolerance = options.eventTolerance ?? Math.max(rtol * 1e-3, 1e-14);

  const [t0, tEnd] = tSpan;
  const span = tEnd - t0;
  const n = y0.length;
  const names = options.stateNames ?? defaultNames(n);

  if (!(span > 0) || n === 0) return new Trajectory([{ t: t0, y: [...y0] }], names);

  const maxStep = options.maxStep ?? span;
  const minStep = options.minStep ?? Math.abs(span) * 1e-12;

  const samples: Sample[] = [{ t: t0, y: [...y0] }];
  const interpolants: Interpolant[] = [];
  const hits: EventHit[] = [];

  let t = t0;
  let y = [...y0];
  // Krok startowy jest tylko zgadywaniem — sterowanie poprawi go w jednym,
  // najwyżej dwóch krokach, więc nie ma powodu dobierać go wyrafinowanie.
  let h = Math.min(maxStep, Math.max(minStep, options.dt ?? span / 100));

  /**
   * Bufory przydzielone raz; wyniki prawej strony **kopiujemy**.
   *
   * Siedem tablic na krok to przy dziesiątkach tysięcy kroków setki tysięcy
   * obiektów dla odśmiecacza. Kopiowanie zamiast trzymania zwróconych tablic
   * kosztuje n przypisań, a zdejmuje ciche założenie, że `f` nigdy nie oddaje
   * tej samej tablicy dwa razy — model, który liczy pochodne do własnego
   * bufora, jest zupełnie legalny.
   */
  const stage = new Array<number>(n);
  let k1 = new Array<number>(n);
  const k2 = new Array<number>(n);
  const k3 = new Array<number>(n);
  const k4 = new Array<number>(n);
  const k5 = new Array<number>(n);
  const k6 = new Array<number>(n);
  let k7 = new Array<number>(n);
  const yStage6 = new Array<number>(n);
  const kopiuj = (from: State, to: number[]) => { for (let i = 0; i < n; i += 1) to[i] = from[i]; };

  kopiuj(f(t, y), k1);
  let steps = 0;
  /** Ile kroków z rzędu wygląda na ograniczone stabilnością, a nie dokładnością. */
  let stiffCount = 0;
  // Wartości funkcji zdarzeń na początku kroku. Trzymane, a nie liczone dwa
  // razy, bo `g` bywa wyrażeniem skompilowanym z dokumentu — a przede wszystkim
  // dlatego, że po zdarzeniu punkt startowy leży **dokładnie** na zerze i to on
  // musi być punktem odniesienia, żeby to samo odbicie nie zameldowało się
  // ponownie w następnym kroku.
  let gPrev = events.map((event) => event.g(t, y));
  /**
   * Które zdarzenie właśnie zaszło i zostawiło stan na swoim progu.
   *
   * Flaga, a nie sprawdzenie `g === 0`: chwila zdarzenia jest wynikiem szukania
   * z tolerancją, więc wartość na progu bywa rzędu 1e-11 — i **z dowolnym
   * znakiem**. Piłka odbita od ziemi zostaje wtedy o włos pod nią, a porównanie
   * znaków w następnym kroku nie widzi już żadnego przejścia i całe kolejne
   * odbicie przepada.
   */
  let justFired = events.map(() => false);

  while (t < tEnd) {
    steps += 1;
    if (steps > maxSteps) {
      throw new IntegrationError(
        `Przekroczono limit ${maxSteps} kroków na przedziale [${t0}, ${tEnd}] (doszedłem do t = ${t.toPrecision(4)}). `
        + 'Zwykle znaczy to, że układ jest sztywny — jawna metoda musi wtedy trzymać krok '
        + 'mikroskopijny ze względu na stabilność, choć samo rozwiązanie jest gładkie.',
      );
    }
    if (h < minStep) {
      throw new IntegrationError(
        `Krok całkowania zszedł poniżej ${minStep.toPrecision(3)} przy t = ${t.toPrecision(4)}. `
        + 'Tolerancji nie da się spełnić — najczęściej dlatego, że rozwiązanie ma tam '
        + 'osobliwość albo prawa strona równania nie jest ciągła.',
      );
    }

    // Ostatni krok dociągamy dokładnie do końca przedziału: `t + h` po drodze
    // nazbierałoby błędu zaokrągleń, a koniec przedziału jest tą jedną chwilą,
    // o którą wołający pyta najczęściej.
    const ostatni = t + h >= tEnd;
    if (ostatni) h = tEnd - t;

    for (let i = 0; i < n; i += 1) stage[i] = y[i] + h * A21 * k1[i];
    kopiuj(f(t + C2 * h, stage), k2);
    for (let i = 0; i < n; i += 1) stage[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
    kopiuj(f(t + C3 * h, stage), k3);
    for (let i = 0; i < n; i += 1) stage[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    kopiuj(f(t + C4 * h, stage), k4);
    for (let i = 0; i < n; i += 1) {
      stage[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    }
    kopiuj(f(t + C5 * h, stage), k5);
    for (let i = 0; i < n; i += 1) {
      yStage6[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    }
    kopiuj(f(t + h, yStage6), k6);

    // Stan po kroku zostaje w trajektorii, więc to jedyna tablica, która musi
    // być nowa.
    const yNext = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      yNext[i] = y[i] + h * (A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
    }
    // Siódma próbka jest zarazem pierwszą próbką następnego kroku (FSAL).
    kopiuj(f(t + h, yNext), k7);

    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const błąd = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      const skala = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNext[i]));
      sum += (błąd / skala) ** 2;
    }
    const err = Math.sqrt(sum / n);

    // `err` bywa NaN, gdy rozwiązanie uciekło do nieskończoności. Porównanie
    // `err > 1` byłoby wtedy fałszywe i solver **zaakceptowałby** krok — stąd
    // jawne pytanie o skończoność zamiast samej nierówności.
    /**
     * Wykrycie sztywności — po co czekać na wyczerpanie limitu kroków.
     *
     * Dwie ostatnie próbki pochodnej są liczone w tej samej chwili `t + h`,
     * więc iloraz ich różnicy przez różnicę stanów przybliża **największą co do
     * modułu wartość własną jakobianu** pomnożoną przez krok. Gdy `h·λ`
     * przekracza granicę stabilności metody (dla Dormanda–Prince'a około 3,25),
     * krok jest ograniczany przez stabilność, a nie przez dokładność — i to
     * jest definicja sztywności.
     *
     * Liczy się dopiero seria takich kroków: pojedyncze przekroczenie zdarza się
     * przy gwałtownej zmianie i samo mija. Bez tej detekcji sztywny układ kończył
     * się komunikatem o limicie kroków dopiero po dwustu tysiącach kroków, czyli
     * po kilku sekundach zamrożonej strony.
     */
    const dstate = Math.hypot(...yNext.map((v, i) => v - yStage6[i]));
    const dslope = Math.hypot(...k7.map((v, i) => v - k6[i]));
    if (dstate > 0 && h * (dslope / dstate) > 3.25) stiffCount += 1;
    else stiffCount = Math.max(0, stiffCount - 1);

    if (stiffCount > 15) {
      throw new IntegrationError(
        `Układ jest sztywny (przy t = ${t.toPrecision(4)} krok ogranicza stabilność, nie dokładność). `
        + 'Metoda jawna musiałaby liczyć go krokiem rzędu odwrotności największej wartości własnej, '
        + 'niezależnie od tego, jak gładkie jest rozwiązanie. Użyj metody niejawnej: `@solver rosenbrock`.',
      );
    }

    const dobry = Number.isFinite(err) && err <= 1;
    // Zero błędu i błąd niepoliczalny wymagają **przeciwnych** reakcji: pierwsze
    // znaczy „krok idealny, wydłuż", drugie „rozwiązanie uciekło, skróć".
    // Wielomian niskiego stopnia daje dokładne zero, więc to nie jest przypadek
    // teoretyczny.
    const factor = !Number.isFinite(err)
      ? MIN_FACTOR
      : (err === 0
        ? MAX_FACTOR
        : Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, SAFETY * err ** -0.2)));

    if (!dobry) {
      h = Math.max(minStep / 2, h * Math.min(1, factor));
      continue;
    }

    const tNext = ostatni ? tEnd : t + h;
    let stan = yNext;
    // Interpolant potrzebny jest także wtedy, gdy `dense` jest wyłączone —
    // to on pozwala zajrzeć w środek kroku przy szukaniu chwili zdarzenia.
    const interpolant = (dense || events.length)
      ? makeInterpolant(y, yNext, h, k1, k3, k4, k5, k6, k7)
      : undefined;

    /**
     * Najwcześniejsze zdarzenie w tym kroku.
     *
     * Najwcześniejsze, bo po nim stan się zmienia i wszystko, co miało zajść
     * później, trzeba policzyć od nowa — na trajektorii, która już jest inna.
     */
    let hit: { index: number; t: number; y: State } | undefined;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const gAfter = event.g(tNext, yNext);

      /**
       * Punkt odniesienia dla znaku.
       *
       * Zwykle jest nim wartość z początku kroku. Wyjątkiem jest krok tuż po
       * zdarzeniu: stan leży wtedy na progu (co do tolerancji szukania), więc
       * jego znak jest przypadkowy i nic nie mówi. Zaglądamy wtedy w głąb
       * kroku — piłka, która właśnie odbiła się od ziemi, ma tam już dodatnią
       * wysokość, więc kolejne lądowanie zostanie wykryte nawet wtedy, gdy cały
       * lot zmieści się w jednym kroku (a przy adaptacji mieści się często, bo
       * lot jest parabolą, którą metoda piątego rzędu liczy bezbłędnie).
       */
      const wystartowałZProgu = justFired[i];
      const tFrom = wystartowałZProgu ? t + h * 1e-6 : t;
      const gBefore = wystartowałZProgu
        ? event.g(tFrom, evalInterpolant(interpolant!, 1e-6))
        : gPrev[i];

      if (!crossesZero(gBefore, gAfter, event.direction)) continue;

      const tStar = findEventTime(
        (tau) => event.g(tau, evalInterpolant(interpolant!, (tau - t) / h)),
        tFrom, tNext, eventTolerance,
      );
      if (tStar === undefined) continue;
      if (!hit || tStar < hit.t) {
        hit = { index: i, t: tStar, y: evalInterpolant(interpolant!, (tStar - t) / h) };
      }
    }

    if (hit) {
      const event = events[hit.index];
      // Krok kończy się w chwili zdarzenia, więc jego interpolant też trzeba
      // przyciąć: obowiązuje teraz na krótszym przedziale.
      if (dense && interpolant) interpolants.push({ ...interpolant, scale: (hit.t - t) / h });
      samples.push({ t: hit.t, y: [...hit.y] });
      hits.push({ name: event.name, t: hit.t, y: [...hit.y], index: hit.index, stopped: !!event.stop });

      if (event.stop) break;

      t = hit.t;
      y = event.apply ? event.apply(hit.t, hit.y) : hit.y;
      // Po podmianie stanu siódma próbka poprzedniego kroku nic już nie znaczy.
      kopiuj(f(t, y), k1);
      gPrev = events.map((e) => e.g(t, y));
      justFired = events.map((_, i) => i === hit!.index);
      h = Math.min(maxStep, Math.max(minStep, Math.min(h * factor, tEnd - t)));
      continue;
    }

    if (dense && interpolant) interpolants.push(interpolant);

    const reakcja = onStep?.(tNext, stan);
    if (reakcja && reakcja !== 'stop') {
      stan = reakcja;
      // Podmieniony stan unieważnia interpolant kroku, który do niego doprowadził:
      // opisuje przebieg kończący się gdzie indziej niż zapisana próbka. Nic
      // lepszego niż odcinek między końcami o tym kroku już nie wiemy — i to
      // jest właśnie ten gorszy tryb, którego unika się, podając `events`.
      if (dense) {
        const zero = y.map(() => 0);
        interpolants[interpolants.length - 1] = {
          r1: [...y], r2: stan.map((v, i) => v - y[i]), r3: zero, r4: zero, r5: zero, scale: 1,
        };
      }
    }

    samples.push({ t: tNext, y: [...stan] });
    t = tNext;
    y = stan;
    gPrev = events.map((event) => event.g(t, y));
    justFired = events.map(() => false);

    if (reakcja === 'stop') break;

    // FSAL działa tylko wtedy, gdy stan na styku kroków się nie zmienił.
    // Zamiana buforów zamiast przypisania — obie tablice zostają w obiegu.
    if (reakcja) kopiuj(f(t, y), k1);
    else { const przed = k1; k1 = k7; k7 = przed; }
    h = Math.min(maxStep, h * factor);
  }

  return new Trajectory(samples, names, dense ? interpolants : undefined, hits);
}
