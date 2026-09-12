/**
 * porownanie.ts — kilka przebiegów tego samego modelu na jednym wykresie.
 *
 * „Co się zmieni, gdy zmienię ten parametr" jest najczęstszym pytaniem
 * zadawanym symulacji w dokumencie dydaktycznym — i jedynym, na które nie dało
 * się odpowiedzieć wprost. Dwa bloki `sim` obok siebie mają osobne osie i
 * osobne skale, więc porównanie odbywało się na oko.
 *
 * Rdzeń liczy przebiegi i skleja je w **jeden komplet serii**; wykres jest już
 * zwykłym wykresem wielu serii, który mamy. Cała wartość jest w tym, że osie są
 * wspólne.
 */
import type { PhenomenonModel, PhenomenonResult } from './compileGraph';
import { applyOverrides } from './compileGraph';

/** Jeden przebieg: co odróżnia go od pozostałych. */
export interface ComparisonRun {
  /** Etykieta na legendzie — trafia do nazwy serii. */
  label: string;
  /** Wartości parametrów; brakujące biorą się z modelu. */
  values: Record<string, string | number>;
}

export interface ComparisonOptions {
  /** Długość symulacji w sekundach. */
  duration: number;
  /** Krok próbkowania; brak = dobrany z długości. */
  dt?: number;
  /**
   * Wielkości do pokazania.
   *
   * Bez zawężenia model o pięciu wielkościach razy trzy przebiegi daje
   * piętnaście krzywych — wykres przestaje wtedy cokolwiek pokazywać.
   */
  only?: string[];
}

export interface ComparisonResult {
  runs: Array<{ label: string; values: Record<string, number>; result: PhenomenonResult }>;
  /** Serie ze wszystkich przebiegów, nazwane `wielkość (etykieta)`. */
  series: Record<string, Array<[number, number]>>;
  issues: string[];
}

/**
 * Liczy przebiegi i składa je w jeden komplet serii.
 *
 * Uwagi z każdego przebiegu dostają jego etykietę: przy trzech przebiegach
 * „Parametr X nie występuje" bez wskazania, którego dotyczy, zmusza do
 * zgadywania.
 */
export function compareRuns(
  model: PhenomenonModel,
  runs: ComparisonRun[],
  options: ComparisonOptions,
): ComparisonResult {
  const issues: string[] = [];
  const policzone: ComparisonResult['runs'] = [];

  const dt = options.dt ?? Math.max(options.duration / 2000, 1e-4);

  for (const run of runs) {
    const applied = applyOverrides(model, run.values);
    issues.push(...applied.issues.map((issue) => `${run.label}: ${issue}`));

    const result = model.run(applied.values, [0, options.duration], dt);
    policzone.push({ label: run.label, values: applied.values, result });
  }

  if (options.only?.length) {
    const dostepne = new Set(policzone.flatMap((r) => Object.keys(r.result.series)));
    for (const name of options.only) {
      if (!dostepne.has(name)) {
        issues.push(`Wielkość „${name}" nie występuje w wynikach tego modelu.`);
      }
    }
  }

  const series: ComparisonResult['series'] = {};
  for (const run of policzone) {
    for (const [name, dane] of Object.entries(run.result.series)) {
      if (options.only?.length && !options.only.includes(name)) continue;
      series[`${name} (${run.label})`] = dane;
    }
  }

  return { runs: policzone, series, issues };
}
