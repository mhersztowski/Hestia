/**
 * Widmo i okres — Etap 6 planu silnika.
 *
 * Dotąd symulacja odpowiadała na pytanie „jak to wygląda w czasie". Widmo
 * odpowiada na pytanie „z czego to się składa" — i dla drgań to jest pytanie
 * **ważniejsze**: rezonans, dudnienia i składanie ruchów harmonicznych są
 * zdaniami o częstościach, a nie o kształcie przebiegu.
 *
 * Wzorce są tu wyjątkowo wygodne, bo sygnał budujemy sami: sinus o zadanej
 * amplitudzie ma dać jeden prążek o dokładnie tej amplitudzie i dokładnie tej
 * częstości.
 */
import { describe, it, expect } from 'vitest';
import { spectrum, dominantFrequency } from './spectrum';
import { periodFromCrossings, periodOf } from './period';

/** Równomierne próbki funkcji — najprostsze możliwe wejście. */
const sample = (f: (t: number) => number, tEnd: number, n: number): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => {
    const t = (i * tEnd) / n;
    return [t, f(t)] as [number, number];
  });

describe('widmo amplitudowe', () => {
  it('czysty sinus daje jeden prążek o właściwej częstości i amplitudzie', () => {
    // 3 Hz, amplituda 2, całkowita liczba okresów w oknie.
    const s = spectrum(sample((t) => 2 * Math.sin(2 * Math.PI * 3 * t), 4, 1024));

    const szczyt = s.amplitude.indexOf(Math.max(...s.amplitude));
    expect(s.freq[szczyt]).toBeCloseTo(3, 2);
    expect(s.amplitude[szczyt]).toBeCloseTo(2, 1);
  });

  it('suma dwóch drgań daje dwa prążki', () => {
    const s = spectrum(sample(
      (t) => Math.sin(2 * Math.PI * 2 * t) + 0.5 * Math.sin(2 * Math.PI * 7 * t),
      8, 2048,
    ));

    const prążki = s.freq
      .map((f, i) => ({ f, a: s.amplitude[i] }))
      .filter((p) => p.a > 0.2)
      .map((p) => Math.round(p.f));

    expect([...new Set(prążki)]).toEqual([2, 7]);
  });

  it('składowa stała siedzi przy zerze i nie udaje drgania', () => {
    const s = spectrum(sample((t) => 5 + Math.sin(2 * Math.PI * 4 * t), 4, 512));

    expect(s.freq[0]).toBe(0);
    // Domyślnie odejmujemy średnią — inaczej prążek zerowy przykryłby wszystko
    // na wykresie, a mówi tylko o położeniu układu odniesienia.
    expect(s.amplitude[0]).toBeLessThan(0.1);
  });

  it('zostawia składową stałą, gdy autor o nią prosi', () => {
    const s = spectrum(sample((t) => 5 + Math.sin(2 * Math.PI * 4 * t), 4, 512), { removeMean: false });
    expect(s.amplitude[0]).toBeGreaterThan(4);
  });

  /**
   * To jest powód, dla którego widmo nie może po prostu wziąć `samples`.
   *
   * Solver adaptacyjny zostawia próbki **nierównomiernie** — gęsto tam, gdzie
   * rozwiązanie zakręca. FFT wymaga równych odstępów, więc sygnał trzeba
   * najpierw przepróbkować; dense output z etapu 1 robi to bez utraty
   * dokładności.
   */
  it('radzi sobie z próbkami rozłożonymi nierównomiernie', () => {
    const nierówne: Array<[number, number]> = [];
    for (let i = 0; i < 400; i += 1) {
      // Odstępy rosną kwadratowo — skrajny przypadek adaptacji.
      const t = 4 * (i / 400) ** 2;
      nierówne.push([t, Math.sin(2 * Math.PI * 3 * t)]);
    }

    const s = spectrum(nierówne);
    expect(dominantFrequency(s)).toBeCloseTo(3, 1);
  });

  it('melduje sygnał za krótki do analizy, zamiast zwracać szum', () => {
    const s = spectrum(sample((t) => Math.sin(t), 1, 3));
    expect(s.issues.join(' ')).toMatch(/za mało|krótk/i);
  });
});

describe('okres z przejść przez zero', () => {
  it('trafia w okres sinusa dokładniej niż rozdzielczość widma', () => {
    // Okres 0,7 s; widmo o oknie 4 s ma rozdzielczość 0,25 Hz, czyli za grubo,
    // żeby odróżnić 1/0,7 = 1,4286 Hz od 1,5 Hz. Przejścia przez zero — nie.
    const T = 0.7;
    const próbki = sample((t) => Math.sin((2 * Math.PI * t) / T), 4, 800);

    expect(periodFromCrossings(próbki)!).toBeCloseTo(T, 4);
  });

  it('mierzy przejścia przez średnią, nie przez zero', () => {
    // Drganie wokół 10 — bez odjęcia średniej nie ma żadnych przejść przez zero
    // i metoda milczałaby o okresie, który widać gołym okiem.
    const T = 1.25;
    const próbki = sample((t) => 10 + 3 * Math.sin((2 * Math.PI * t) / T), 10, 2000);

    expect(periodFromCrossings(próbki)!).toBeCloseTo(T, 3);
  });

  it('nie zgaduje okresu sygnału, który nie drga', () => {
    expect(periodFromCrossings(sample((t) => t, 5, 100))).toBeUndefined();
  });
});

describe('okres — wybór metody', () => {
  it('dla przebiegu okresowego zgadza się z obiema metodami', () => {
    const T = 0.8;
    const próbki = sample((t) => Math.sin((2 * Math.PI * t) / T), 8, 2048);
    const wynik = periodOf(próbki)!;

    expect(wynik.period).toBeCloseTo(T, 3);
    expect(wynik.source).toBe('crossings');
  });

  /**
   * Przebieg złożony z kilku składowych ma przejścia przez zero rozłożone
   * nierówno — tam liczy się **najsilniejsza** składowa, a tę zna widmo.
   */
  it('dla przebiegu złożonego wraca do widma', () => {
    const próbki = sample(
      (t) => Math.sin(2 * Math.PI * 2 * t) + 0.9 * Math.sin(2 * Math.PI * 9 * t + 1),
      8, 4096,
    );
    const wynik = periodOf(próbki)!;

    expect(wynik.source).toBe('spectrum');
    expect(wynik.period).toBeCloseTo(0.5, 1);
  });

  it('dla przebiegu bez okresu nie wymyśla liczby', () => {
    expect(periodOf(sample((t) => Math.exp(-t), 5, 500))).toBeUndefined();
  });
});
