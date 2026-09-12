/**
 * Zdarzenia jako rozwiązywanie równania — Etap 2 planu silnika.
 *
 * Do tej pory zdarzenie było pytaniem „czy po tym kroku warunek już zachodzi",
 * więc chwila odbicia była znana z dokładnością kroku. Przy stałym, drobnym
 * kroku dawało się z tym żyć; przy adaptacyjnym przestało — metoda piątego rzędu
 * liczy spadek swobodny bezbłędnie i rozciąga krok na kilka sekund, po których
 * piłka jest już dawno pod ziemią.
 *
 * Właściwe postawienie sprawy: zdarzenie to **miejsce zerowe funkcji** g(t, y),
 * a chwila zdarzenia to pierwiastek równania g = 0. Solver z dense output umie
 * podać stan w dowolnym punkcie kroku, więc pierwiastka szuka się bez jednego
 * dodatkowego kroku całkowania.
 */
import { describe, it, expect } from 'vitest';
import { findEventTime, crossesZero } from './events';

describe('szukanie chwili zdarzenia', () => {
  it('znajduje pierwiastek z dokładnością dużo lepszą niż długość kroku', () => {
    // cos przechodzi przez zero w π/2; „krok" ma tu długość 3.
    const t = findEventTime((x) => Math.cos(x), 0, 3, 1e-12);
    expect(t).toBeCloseTo(Math.PI / 2, 10);
  });

  it('radzi sobie z funkcją silnie niesymetryczną w przedziale', () => {
    // Pierwiastek tuż przy lewym końcu i do tego potrójny, więc funkcja jest
    // koło niego niemal płaska: czysta bisekcja zbiega wolno, a sama regula
    // falsi zacina się po jednej stronie i przestaje skracać przedział.
    const t = findEventTime((x) => (x - 0.001) ** 3, 0, 5, 1e-14);

    // Siedem cyfr, nie dwanaście: pierwiastek **wielokrotny** jest źle
    // uwarunkowany z samej swojej natury — przy odległości 2e-8 od miejsca
    // zerowego funkcja ma wartość rzędu 1e-23, więc żadna metoda oparta na
    // znaku nie odróżni już tych punktów. W zdarzeniach fizycznych to przypadek
    // graniczny (ciało dotyka progu z zerową prędkością i przyspieszeniem);
    // zwykłe przecięcie progu jest pierwiastkiem pojedynczym i wychodzi
    // z dokładnością do ostatniej cyfry — patrz test z cosinusem wyżej.
    expect(t).toBeCloseTo(0.001, 7);
  });

  it('nie zgaduje, gdy znak się nie zmienia', () => {
    expect(findEventTime((x) => x * x + 1, 0, 5, 1e-12)).toBeUndefined();
  });

  it('przyjmuje zero dokładnie na końcu przedziału', () => {
    expect(findEventTime((x) => x - 2, 0, 2, 1e-12)).toBeCloseTo(2, 12);
  });

  it('zatrzymuje się na zadanej dokładności, nie kręci się w kółko', () => {
    let wywołania = 0;
    findEventTime((x) => { wywołania += 1; return Math.sin(x) - 0.5; }, 0, 3, 1e-10);
    // Sama bisekcja potrzebowałaby ~35 kroków; z interpolacją ma być wyraźnie mniej.
    expect(wywołania).toBeLessThan(25);
  });
});

describe('kierunek przejścia', () => {
  it('odróżnia przejście w dół od przejścia w górę', () => {
    expect(crossesZero(1, -1, 'down')).toBe(true);
    expect(crossesZero(1, -1, 'up')).toBe(false);
    expect(crossesZero(-1, 1, 'up')).toBe(true);
    expect(crossesZero(-1, 1, 'any')).toBe(true);
  });

  it('nie widzi zdarzenia tam, gdzie znak się nie zmienił', () => {
    expect(crossesZero(2, 1, 'any')).toBe(false);
    expect(crossesZero(-2, -1, 'any')).toBe(false);
  });

  /**
   * Wartość dokładnie zerowa na **początku** kroku nie jest zdarzeniem.
   *
   * Inaczej odbicie wpadłoby w pętlę: krok kończy się na y = 0, zdarzenie
   * odwraca prędkość, następny krok zaczyna się od y = 0 i natychmiast melduje
   * to samo zdarzenie jeszcze raz.
   */
  it('nie melduje zdarzenia po raz drugi na tej samej wartości', () => {
    expect(crossesZero(0, 1, 'any')).toBe(false);
    expect(crossesZero(0, -1, 'any')).toBe(false);
    // Za to dojście do zera na końcu kroku jest już zdarzeniem.
    expect(crossesZero(1, 0, 'down')).toBe(true);
  });
});
