/**
 * period.ts — ile trwa jeden cykl.
 *
 * Okres jest tą liczbą, którą podręcznik podaje wzorem, a symulacja powinna
 * umieć **zmierzyć** — inaczej porównanie „wzór kontra rzeczywistość" (wahadło
 * przy dużym wychyleniu, oscylator tłumiony) trzeba robić na oko.
 *
 * Dwie metody, bo mają różne mocne strony:
 *
 *  • **Przejścia przez średnią** dają dokładność ograniczoną tylko krokiem
 *    próbkowania — interpolacja liniowa między sąsiednimi próbkami trafia
 *    w chwilę przejścia z dokładnością rzędu dt². Dla czystego drgania to jest
 *    najlepsze, co da się zrobić.
 *  • **Widmo** działa tam, gdzie przejścia przez średnią kłamią: przebieg
 *    złożony z kilku składowych przecina średnią nierówno, a pytanie dotyczy
 *    składowej **najsilniejszej**.
 *
 * Wybór między nimi nie jest kwestią gustu i dlatego robi go `periodOf`, a nie
 * wołający: liczy się rozrzut odstępów między przejściami. Równe odstępy znaczą
 * jedno drganie i wtedy wygrywa dokładność; nierówne znaczą przebieg złożony
 * i wtedy wygrywa odporność.
 */
import { dominantFrequency, spectrum } from './spectrum';

/** Chwile, w których przebieg przecina swoją średnią, idąc w górę. */
function upwardCrossings(samples: Array<[number, number]>): number[] {
  const mean = samples.reduce((sum, [, y]) => sum + y, 0) / samples.length;
  const czasy: number[] = [];

  for (let i = 1; i < samples.length; i += 1) {
    const [t0, y0] = samples[i - 1];
    const [t1, y1] = samples[i];
    const a = y0 - mean;
    const b = y1 - mean;
    if (a < 0 && b >= 0) {
      // Chwila przejścia z interpolacji liniowej — samo `t1` dawałoby błąd
      // rzędu kroku próbkowania, czyli dokładnie to, czego chcemy uniknąć.
      const span = b - a;
      czasy.push(span === 0 ? t1 : t0 + ((t1 - t0) * -a) / span);
    }
  }

  return czasy;
}

/**
 * Okres z przejść przez średnią; `undefined`, gdy przebieg nie drga.
 *
 * Bierzemy odstęp między **pierwszym a ostatnim** przejściem podzielony przez
 * ich liczbę, a nie średnią z odstępów: przy sygnale tłumionym pojedyncze
 * odstępy szarpią, a suma i tak jest dokładna.
 */
export function periodFromCrossings(samples: Array<[number, number]>): number | undefined {
  if (samples.length < 4) return undefined;
  const czasy = upwardCrossings(samples);
  if (czasy.length < 2) return undefined;

  return (czasy[czasy.length - 1] - czasy[0]) / (czasy.length - 1);
}

export interface PeriodResult {
  period: number;
  /** Skąd wzięta — bo dokładność obu dróg jest inna i warto to wiedzieć. */
  source: 'crossings' | 'spectrum';
  /**
   * Rozrzut odstępów między przejściami, względny.
   *
   * Blisko zera znaczy jedno czyste drganie; wartości rzędu dziesiątych części
   * znaczą przebieg złożony i to właśnie wtedy sięgamy po widmo.
   */
  scatter: number;
}

/** Poniżej tego rozrzutu uznajemy przebieg za jedno drganie. */
const RÓWNY = 0.05;

/**
 * Okres przebiegu — metodą dobraną do jego kształtu.
 *
 * Zwraca `undefined`, gdy przebieg nie ma okresu. To jest ważniejsze, niż się
 * wydaje: zwrócenie „jakiejś" liczby dla przebiegu zanikającego wykładniczo
 * dałoby wykres z podpisem, w który czytelnik uwierzy.
 */
export function periodOf(samples: Array<[number, number]>): PeriodResult | undefined {
  if (samples.length < 8) return undefined;

  const czasy = upwardCrossings(samples);
  if (czasy.length >= 3) {
    const odstępy = czasy.slice(1).map((t, i) => t - czasy[i]);
    const średnia = odstępy.reduce((sum, d) => sum + d, 0) / odstępy.length;
    const rozrzut = średnia > 0
      ? Math.sqrt(odstępy.reduce((sum, d) => sum + (d - średnia) ** 2, 0) / odstępy.length) / średnia
      : Number.POSITIVE_INFINITY;

    if (rozrzut < RÓWNY) {
      return {
        period: (czasy[czasy.length - 1] - czasy[0]) / (czasy.length - 1),
        source: 'crossings',
        scatter: rozrzut,
      };
    }

    const f = dominantFrequency(spectrum(samples));
    if (f && f > 0) return { period: 1 / f, source: 'spectrum', scatter: rozrzut };
  }

  return undefined;
}
