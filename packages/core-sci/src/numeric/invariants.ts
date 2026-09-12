/**
 * invariants.ts — czy to, co miało zostać stałe, zostało stałe.
 *
 * Fizyka daje darmowy test poprawności: energia układu zachowawczego, pęd
 * układu izolowanego, moment pędu przy sile centralnej. Żaden solver nie
 * zachowuje ich dokładnie, ale **sposób, w jaki je psuje, jest jego cechą** —
 * i to najważniejsza rzecz, jaką da się o metodzie powiedzieć:
 *
 *  • Euler pompuje energię w układ; po pięćdziesięciu sekundach oscylator ma
 *    jej dwa razy tyle, co na starcie, i nikt tego nie zauważy patrząc na ładny
 *    wykres sinusa.
 *  • Verlet też się myli, ale jego błąd **oscyluje wokół stałej** — po tysiącu
 *    okresów orbita jest wciąż tą orbitą.
 *  • RK4 z dobrze dobranym krokiem myli się poniżej progu widzialności.
 *
 * Silnik gry nie ma takiego modułu, bo nie ma komu meldować wyniku pomiaru:
 * gracz nie dostaje raportu, tylko obraz. Tutaj raport jest częścią wyniku.
 *
 * Moduł mierzy, ale **niczego nie poprawia**. Rzutowanie stanu z powrotem na
 * powierzchnię stałej energii byłoby kuszące i błędne: dostalibyśmy wykres,
 * który wygląda na dokładny, i utracili jedyny sygnał mówiący, że krok jest
 * za duży.
 */
import type { State, Trajectory } from './trajectory';

/** Jak metoda obchodzi się z wielkością, która miała być stała. */
export type InvariantTrend =
  /** Zmiana poniżej progu widzialności — nie ma o czym mówić. */
  | 'stable'
  /** Błąd ograniczony, wraca do siebie; cecha metod symplektycznych. */
  | 'oscillation'
  /** Błąd narasta w jedną stronę; wynik długiej symulacji jest bez wartości. */
  | 'drift';

export interface InvariantReport {
  name: string;
  /** Wartość na początku przebiegu — punkt odniesienia dla całej reszty. */
  initial: number;
  /** Największe odchylenie od wartości początkowej, co do modułu. */
  maxDeviation: number;
  /** To samo odniesione do skali wielkości. */
  relative: number;
  trend: InvariantTrend;
  /**
   * Względna zmiana na jednostkę czasu, ze znakiem.
   *
   * Na jednostkę **czasu**, nie na krok: inaczej ta sama metoda z innym krokiem
   * dawałaby nieporównywalne liczby, a porównywalność jest tu całym sensem.
   */
  ratePerUnitTime: number;
  /** Przebieg niezmiennika — do narysowania obok wyniku. */
  values: Array<[number, number]>;
  issues: string[];
}

export interface InvariantOptions {
  name?: string;
  /** Ile punktów zmierzyć; poniżej tej liczby bierzemy wszystkie próbki. */
  samples?: number;
  /**
   * Poniżej tego odchylenia względnego mówimy „stały".
   *
   * Domyślnie 1e-9: dziesięć rzędów nad szumem podwójnej precyzji, a wciąż
   * daleko poniżej czegokolwiek, co miałoby znaczenie fizyczne.
   */
  tolerance?: number;
}

/** Nachylenie prostej najlepiej dopasowanej — do odróżnienia dryfu od oscylacji. */
function slopeOf(points: Array<[number, number]>): number {
  const n = points.length;
  if (n < 2) return 0;
  const meanT = points.reduce((sum, [t]) => sum + t, 0) / n;
  const meanV = points.reduce((sum, [, v]) => sum + v, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (const [t, v] of points) {
    covariance += (t - meanT) * (v - meanV);
    variance += (t - meanT) ** 2;
  }
  return variance === 0 ? 0 : covariance / variance;
}

/**
 * Mierzy, jak zachowała się wielkość, która miała pozostać stała.
 *
 * Niezmiennik przychodzi jako **funkcja stanu**, a nie jako nazwa wielkości
 * z modelu: dzięki temu ten sam pomiar obsłuży energię policzoną z wzoru
 * w dokumencie, pęd zsumowany po ciałach w skrypcie i cokolwiek, co autorowi
 * przyjdzie do głowy sprawdzić.
 */
export function measureInvariant(
  trajectory: Trajectory,
  evaluate: (state: State, t: number) => number,
  options: InvariantOptions = {},
): InvariantReport {
  const { name = 'niezmiennik', samples = 2000, tolerance = 1e-9 } = options;
  const issues: string[] = [];

  // Próbkujemy co k-tą próbkę trajektorii, a nie równomiernie po czasie:
  // odczyt przez `at()` interpoluje, a interpolacja wygładza dokładnie to
  // drganie niezmiennika, które chcemy zobaczyć.
  const all = trajectory.samples;
  const stride = Math.max(1, Math.ceil(all.length / Math.max(2, samples)));
  const picked = all.filter((_, i) => i % stride === 0);
  if (all.length && picked[picked.length - 1] !== all[all.length - 1]) picked.push(all[all.length - 1]);

  const values: Array<[number, number]> = [];
  let broken: number | undefined;
  for (const sample of picked) {
    const value = evaluate(sample.y, sample.t);
    if (!Number.isFinite(value)) {
      if (broken === undefined) broken = sample.t;
      continue;
    }
    values.push([sample.t, value]);
  }

  if (broken !== undefined) {
    issues.push(
      `Niezmiennik „${name}" przestał być liczbą (NaN) w chwili t ≈ ${broken.toPrecision(3)}`
      + ' — dalszy pomiar dotyczy tylko tej części przebiegu, w której dało się go policzyć.',
    );
  }

  if (!values.length) {
    return {
      name, initial: Number.NaN, maxDeviation: Number.NaN, relative: Number.NaN,
      trend: 'stable', ratePerUnitTime: 0, values: [], issues: [...issues, `Nie udało się policzyć „${name}" ani razu.`],
    };
  }

  const initial = values[0][1];
  const maxDeviation = values.reduce((biggest, [, v]) => Math.max(biggest, Math.abs(v - initial)), 0);

  // Skala z całego przebiegu, nie z samej wartości początkowej: niezmiennik
  // startujący z zera (pęd układu w spoczynku) miałby inaczej nieskończony
  // błąd względny przy pierwszym drgnięciu.
  const scale = values.reduce((biggest, [, v]) => Math.max(biggest, Math.abs(v)), Math.abs(initial));
  const relative = scale > 0 ? maxDeviation / scale : 0;

  const span = values[values.length - 1][0] - values[0][0];
  const slope = slopeOf(values);
  const ratePerUnitTime = scale > 0 ? slope / scale : 0;

  // Rozstrzygnięcie dryf/oscylacja: ile z zaobserwowanego odchylenia tłumaczy
  // sam trend. Gdy prosta wyjaśnia większość — błąd ucieka; gdy prawie nic —
  // niezmiennik krąży wokół swojej wartości i wróci.
  const explained = Math.abs(slope * span);
  const trend: InvariantTrend = relative <= tolerance
    ? 'stable'
    : (explained >= 0.5 * maxDeviation ? 'drift' : 'oscillation');

  return { name, initial, maxDeviation, relative, trend, ratePerUnitTime, values, issues };
}

/** Zdanie do panelu — jedno miejsce, żeby wszystkie widoki mówiły tak samo. */
export function describeInvariant(report: InvariantReport): string {
  const procent = (report.relative * 100).toPrecision(2);
  switch (report.trend) {
    case 'stable':
      return `${report.name}: zachowany (zmiana poniżej ${procent} %).`;
    case 'oscillation':
      return `${report.name}: waha się o ${procent} %, ale nie ucieka — błąd jest ograniczony.`;
    default: {
      const naCzas = (report.ratePerUnitTime * 100).toPrecision(2);
      return `${report.name}: ${report.ratePerUnitTime > 0 ? 'narasta' : 'maleje'} o ${naCzas} % na jednostkę czasu`
        + ' — w długiej symulacji wynik przestanie znaczyć to, co miał znaczyć.';
    }
  }
}
