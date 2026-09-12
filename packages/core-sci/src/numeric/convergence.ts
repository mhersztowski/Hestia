/**
 * convergence.ts — ile wart jest policzony wynik.
 *
 * To jest miejsce, w którym silnik naukowy rozchodzi się z silnikiem gry.
 * Gra pyta „czy wygląda dobrze"; tutaj trzeba odpowiedzieć „jak daleko to jest
 * od prawdy" — i to **bez znajomości rozwiązania dokładnego**, bo dla modelu
 * złożonego z wzorów w dokumencie żadnego wzoru zamkniętego nie ma.
 *
 * Odpowiedź daje samo zagęszczanie kroku. Jeśli metoda jest rzędu p, to jej
 * błąd zachowuje się jak C·hᵖ, więc dwukrotne zmniejszenie kroku dzieli błąd
 * przez 2ᵖ. Nie znamy ani C, ani prawdy, ale **różnice między kolejnymi
 * siatkami znamy** — i z nich wychodzi jedno i drugie:
 *
 *   • iloraz kolejnych różnic daje **rząd metody** (log₂ tego ilorazu),
 *   • sama różnica podzielona przez (2ᵖ − 1) daje **błąd najgęstszej siatki**
 *     (ekstrapolacja Richardsona).
 *
 * Rząd wychodzi tu z pomiaru, choć teoretycznie jest znany — i to jest sedno:
 * rozjazd między rzędem zmierzonym a teoretycznym oznacza, że coś jest nie tak
 * (krok za duży, zdarzenie w środku przedziału, nieciągła prawa strona).
 * Narzędzie, które by ten rząd zakładało, przemilczałoby dokładnie te przypadki,
 * dla których powstało.
 */
import type { State } from './trajectory';
import type { Trajectory } from './trajectory';

/** Jeden przebieg badania: krok i stan, do którego doprowadził. */
export interface ConvergenceLevel {
  dt: number;
  state: State;
}

/** Błąd jednej zmiennej stanu — bo metry i metry na sekundę nie sumują się. */
export interface VariableError {
  name: string;
  /** Oszacowanie błędu bezwzględnego, w jednostce tej zmiennej. */
  error: number;
  /** Ten sam błąd odniesiony do wartości zmiennej. */
  relative: number;
}

export interface ConvergenceReport {
  /** Chwila, w której porównywano stany. */
  at: number;
  /** Przebiegi od najrzadszego do najgęstszego. */
  levels: ConvergenceLevel[];
  /** Zmierzony rząd metody; brak, gdy pomiar nie ma sensu. */
  order?: number;
  /** Oszacowanie błędu najgęstszego przebiegu w normie maksimum. */
  error?: number;
  /** Błąd względny — ten sam błąd odniesiony do wielkości rozwiązania. */
  relative?: number;
  /** Rozbicie błędu na zmienne stanu; puste, gdy rzędu nie udało się zmierzyć. */
  perVariable: VariableError[];
  /** Co poszło nie tak — pusta lista znaczy „raport jest wiarygodny". */
  issues: string[];
}

export interface ConvergenceOptions {
  /** Krok najrzadszej siatki; każda następna jest dwa razy gęstsza. */
  dt: number;
  /** Chwila porównania; domyślnie koniec policzonego przedziału. */
  at?: number;
  /** Ile siatek policzyć — trzy to minimum, przy którym rząd da się zmierzyć. */
  levels?: number;
}

/**
 * Poniżej tego progu różnica między siatkami to już tylko arytmetyka.
 *
 * Podwójna precyzja ma ~16 cyfr znaczących; bierzemy z zapasem cztery rzędy,
 * bo błędy zaokrągleń narastają przez tysiące kroków, a nie pojedynczo.
 */
const MACHINE_NOISE = 1e-12;

/** Norma maksimum — najostrożniejsza z możliwych, bo nie uśrednia błędu. */
function maxNorm(values: number[]): number {
  return values.reduce((biggest, value) => Math.max(biggest, Math.abs(value)), 0);
}

function difference(a: State, b: State): number[] {
  return a.map((value, i) => value - b[i]);
}

/**
 * Ekstrapolacja Richardsona: dwa przybliżenia rzędu p dają jedno lepsze.
 *
 * Wydzielone i wystawione, bo przydaje się poza badaniem zbieżności — wszędzie
 * tam, gdzie znany jest rząd metody i chce się wycisnąć z dwóch przebiegów
 * dokładność, której żaden z nich sam nie ma.
 */
export function richardson(coarse: number, fine: number, order: number): number {
  return fine + (fine - coarse) / (2 ** order - 1);
}

/**
 * Bada zbieżność, licząc to samo na coraz gęstszych siatkach.
 *
 * Wejściem jest **funkcja uruchamiająca przebieg**, a nie model — dzięki temu
 * to samo narzędzie zbada model z grafu wzorów, model ze skryptu i wywołanie
 * solvera wprost. Badanie nie musi wiedzieć, co liczy; wystarczy, że umie
 * poprosić o ten sam przebieg z innym krokiem.
 */
export function studyConvergence(
  run: (dt: number) => Trajectory,
  options: ConvergenceOptions,
): ConvergenceReport {
  const count = Math.max(1, Math.round(options.levels ?? 3));
  const issues: string[] = [];
  const levels: ConvergenceLevel[] = [];
  let names: string[] = [];
  let at = options.at ?? 0;

  for (let k = 0; k < count; k += 1) {
    const dt = options.dt / 2 ** k;
    let trajectory: Trajectory;
    try {
      trajectory = run(dt);
    } catch (error) {
      issues.push(`Przebieg z krokiem ${dt} nie policzył się: ${(error as Error).message}`);
      break;
    }
    if (k === 0) {
      names = trajectory.stateNames;
      at = options.at ?? trajectory.t1;
    }
    levels.push({ dt, state: trajectory.at(at) });
  }

  const report: ConvergenceReport = { at, levels, perVariable: [], issues };

  // Kolejność sprawdzeń jest istotna: rozbieżność i niezgodne stany trzeba
  // wyłapać przed liczeniem różnic, bo NaN przechodzi przez każdą arytmetykę
  // bez protestu i wyszedłby jako „rząd metody".
  const diverged = levels.filter((level) => level.state.some((value) => !Number.isFinite(value)));
  if (diverged.length) {
    issues.push(
      `Rozwiązanie rozbiegło się do nieskończoności przy kroku ${diverged.map((l) => l.dt).join(', ')}`
      + ' — przy tej metodzie i tym kroku wynik nie istnieje, więc nie ma czego mierzyć.',
    );
    return report;
  }

  const width = levels[0]?.state.length ?? 0;
  if (levels.some((level) => level.state.length !== width)) {
    issues.push('Przebiegi mają różną liczbę zmiennych stanu — to nie są warianty tego samego modelu.');
    return report;
  }

  if (levels.length < 3) {
    issues.push(`Do zmierzenia rzędu potrzeba trzech siatek, a policzono ${levels.length}.`);
    return report;
  }

  // Różnice bierzemy z dwóch **najgęstszych** par, bo dopiero tam metoda jest
  // w swoim zakresie asymptotycznym — przy zgrubnym kroku rząd bywa zaniżony
  // przez wyrazy wyższych rzędów, których teoria nie obiecuje.
  const last = levels.length - 1;
  const coarseDiff = difference(levels[last - 2].state, levels[last - 1].state);
  const fineDiff = difference(levels[last - 1].state, levels[last].state);

  const coarseNorm = maxNorm(coarseDiff);
  const fineNorm = maxNorm(fineDiff);
  const scale = Math.max(maxNorm(levels[last].state), 1);

  if (fineNorm <= MACHINE_NOISE * scale || coarseNorm <= MACHINE_NOISE * scale) {
    issues.push(
      'Różnice między siatkami są na poziomie precyzji maszynowej — metoda odtwarza to rozwiązanie'
      + ' dokładnie, więc rzędu nie da się zmierzyć (i nie trzeba: błędu metody tu nie ma).',
    );
    return report;
  }

  const order = Math.log2(coarseNorm / fineNorm);
  if (!Number.isFinite(order) || order <= 0) {
    issues.push('Zagęszczenie kroku nie zmniejszyło różnic — metoda nie zbiega dla tego układu.');
    return report;
  }

  const growth = 2 ** order - 1;
  report.order = order;
  report.error = fineNorm / growth;
  report.relative = report.error / scale;
  report.perVariable = levels[last].state.map((value, i) => {
    const error = Math.abs(fineDiff[i]) / growth;
    return {
      name: names[i] ?? `y${i}`,
      error,
      // Zmienna przechodząca przez zero (prędkość w punkcie zwrotnym) dałaby
      // nieskończony błąd względny — odnosimy ją wtedy do skali całego stanu.
      relative: error / Math.max(Math.abs(value), scale * MACHINE_NOISE, Number.MIN_VALUE),
    };
  });

  return report;
}
