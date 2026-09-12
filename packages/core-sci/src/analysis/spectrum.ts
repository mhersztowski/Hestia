/**
 * spectrum.ts — z czego składa się przebieg.
 *
 * Symulacja odpowiada na pytanie „jak to wygląda w czasie". Dla drgań
 * ważniejsze bywa jednak pytanie „z czego to się składa": rezonans, dudnienia
 * i składanie ruchów harmonicznych są zdaniami o **częstościach**, a wykres
 * w czasie pokazuje je najwyżej pośrednio — dwa drgania o bliskich częstościach
 * dają przebieg, z którego gołym okiem nie da się odczytać żadnej z nich.
 *
 * Trzy decyzje, które przesądzają o kształcie tego modułu:
 *
 *  • **Przepróbkowanie jest obowiązkowe, nie opcjonalne.** Solver adaptacyjny
 *    zostawia próbki gęsto tam, gdzie rozwiązanie zakręca — a transformata
 *    wymaga równych odstępów. Sygnał z symulacji prawie nigdy nie jest gotowy
 *    do analizy w postaci, w jakiej wyszedł z solvera.
 *  • **Średnia odchodzi domyślnie.** Prążek przy zerze mówi o położeniu układu
 *    odniesienia, a nie o drganiu; zostawiony, przykrywa na wykresie wszystko,
 *    co ciekawe.
 *  • **Okno Hanninga domyślnie.** Bez niego sygnał, którego okres nie mieści się
 *    całkowitą liczbę razy w oknie, rozlewa prążek na pół widma (przeciek),
 *    a taki sygnał to reguła, nie wyjątek.
 */

/** Widmo amplitudowe: częstotliwości i odpowiadające im amplitudy. */
export interface Spectrum {
  /** Częstotliwości od 0 do częstości Nyquista, w 1/jednostkę czasu. */
  freq: number[];
  /** Amplitudy w jednostkach sygnału — sinus o amplitudzie A daje A. */
  amplitude: number[];
  /** Krok przepróbkowania użyty do analizy. */
  dt: number;
  issues: string[];
}

export interface SpectrumOptions {
  /** Czy odjąć wartość średnią; domyślnie tak. */
  removeMean?: boolean;
  /** Czy nałożyć okno Hanninga; domyślnie tak. */
  window?: boolean;
  /** Wymuszona liczba punktów analizy (zaokrąglana w górę do potęgi dwójki). */
  points?: number;
}

/**
 * Transformata Fouriera, radix-2, w miejscu.
 *
 * Napisana wprost, bo to czterdzieści linii i jedyna zależność, jakiej wymaga:
 * przestawienie próbek w kolejności odwróconych bitów i log₂N przebiegów
 * motylkowych. Wersja rekurencyjna czyta się ładniej, ale alokuje tablice na
 * każdym poziomie — a widmo liczy się przy każdej zmianie suwaka.
 */
export function fftInPlace(re: number[], im: number[]): void {
  const n = re.length;
  if (n <= 1) return;

  // Permutacja odwróconych bitów — po niej motylki chodzą po sąsiadach.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;

        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;

        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Największa potęga dwójki nie większa niż `n` — tyle punktów użyjemy. */
function powerOfTwoBelow(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * Przepróbkowanie na równą siatkę.
 *
 * Interpolacja liniowa wystarcza, bo siatka jest gęstsza niż zjawisko: liczba
 * punktów bierze się z liczby próbek, a te solver zostawił tam, gdzie coś się
 * działo. Wyższy rząd interpolacji nie doda informacji, której w próbkach nie ma.
 */
function resample(samples: Array<[number, number]>, count: number): { values: number[]; dt: number } {
  const t0 = samples[0][0];
  const t1 = samples[samples.length - 1][0];
  const dt = (t1 - t0) / (count - 1);
  const values = new Array<number>(count);

  let index = 0;
  for (let i = 0; i < count; i += 1) {
    const t = t0 + i * dt;
    while (index < samples.length - 2 && samples[index + 1][0] < t) index += 1;
    const [ta, ya] = samples[index];
    const [tb, yb] = samples[Math.min(index + 1, samples.length - 1)];
    const span = tb - ta;
    values[i] = span === 0 ? ya : ya + ((yb - ya) * (t - ta)) / span;
  }

  return { values, dt };
}

/** Widmo amplitudowe przebiegu podanego jako pary [czas, wartość]. */
export function spectrum(
  samples: Array<[number, number]>,
  options: SpectrumOptions = {},
): Spectrum {
  const { removeMean = true, window = true } = options;
  const issues: string[] = [];

  if (samples.length < 8) {
    return {
      freq: [], amplitude: [], dt: 0,
      issues: ['Za mało próbek na widmo — potrzeba co najmniej ośmiu, a najlepiej kilkuset.'],
    };
  }

  const count = powerOfTwoBelow(options.points ?? samples.length);
  const { values, dt } = resample(samples, count);

  if (!(dt > 0)) {
    return { freq: [], amplitude: [], dt: 0, issues: ['Przebieg ma zerową długość — nie ma czego analizować.'] };
  }

  const re = [...values];
  const im = new Array<number>(count).fill(0);

  if (removeMean) {
    const mean = re.reduce((sum, v) => sum + v, 0) / count;
    for (let i = 0; i < count; i += 1) re[i] -= mean;
  }

  // Suma wag okna wchodzi do normowania amplitudy: okno tłumi sygnał i bez tej
  // poprawki wysokość prążka zależałaby od wyboru okna, a nie od drgania.
  let windowSum = count;
  if (window) {
    windowSum = 0;
    for (let i = 0; i < count; i += 1) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (count - 1)));
      re[i] *= w;
      windowSum += w;
    }
  }

  fftInPlace(re, im);

  const half = count / 2;
  const freq = new Array<number>(half);
  const amplitude = new Array<number>(half);
  for (let i = 0; i < half; i += 1) {
    freq[i] = i / (count * dt);
    // Dwójka, bo widmo jednostronne — energia składowej siedzi w dwóch
    // symetrycznych prążkach, a czytelnika interesuje amplituda drgania.
    const skala = i === 0 ? 1 / windowSum : 2 / windowSum;
    amplitude[i] = Math.hypot(re[i], im[i]) * skala;
  }

  return { freq, amplitude, dt, issues };
}

/** Częstotliwość najsilniejszej składowej; pomija prążek zerowy. */
export function dominantFrequency(s: Spectrum): number | undefined {
  let best = -1;
  let bestAmp = 0;
  for (let i = 1; i < s.amplitude.length; i += 1) {
    if (s.amplitude[i] > bestAmp) {
      bestAmp = s.amplitude[i];
      best = i;
    }
  }
  if (best < 0) return undefined;

  /**
   * Interpolacja paraboliczna po trzech prążkach.
   *
   * Bez niej dokładność częstości jest ograniczona rozdzielczością widma
   * (1/T okna) — a to bywa grubo: przy oknie czterech sekund sąsiednie prążki
   * dzieli 0,25 Hz. Wierzchołek paraboli przez trzy punkty daje ułamek prążka
   * praktycznie za darmo.
   */
  const a = s.amplitude[best - 1] ?? 0;
  const b = s.amplitude[best];
  const c = s.amplitude[best + 1] ?? 0;
  const mianownik = a - 2 * b + c;
  const delta = mianownik === 0 ? 0 : (0.5 * (a - c)) / mianownik;

  const krok = s.freq[1] - s.freq[0];
  return s.freq[best] + delta * krok;
}
