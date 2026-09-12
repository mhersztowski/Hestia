/**
 * Testy animacji suwaka.
 *
 * Cała rzecz sprowadza się do jednego: wartość ma zależeć od **czasu**, a nie
 * od liczby klatek. Kod „dodaj krok przy każdej klatce" działa na maszynie,
 * na której powstał, i biegnie dwa razy szybciej na ekranie 120 Hz — a przy
 * zwolnieniu przeglądarki zwalnia razem z nią.
 */

import { describe, it, expect } from 'vitest';
import { stepSlider, type SliderAnimation } from './animation';

const SPEC = { min: 0, max: 10, step: 0.1 };

/** Stan startowy dla czytelności testów. */
function stan(value: number, direction: 1 | -1 = 1): SliderAnimation {
  return { value, direction };
}

describe('tempo', () => {
  it('wartość rośnie zgodnie z prędkością i czasem', () => {
    // Dwadzieścia jednostek na sekundę, klatka 50 ms — jedna jednostka.
    const po = stepSlider(stan(0), SPEC, { mode: 'loop', speed: 20 }, 0.05);
    expect(po.value).toBeCloseTo(1);
  });

  it('dwa pół-kroki dają to samo, co jeden pełny', () => {
    /*
     * To jest test na niezależność od liczby klatek: dwie klatki po 25 ms
     * muszą przesunąć suwak dokładnie tyle, co jedna klatka 50 ms. Inaczej
     * animacja biegnie inaczej na każdym ekranie.
     */
    const jeden = stepSlider(stan(0), SPEC, { mode: 'loop', speed: 20 }, 0.05);
    const dwa = stepSlider(
      stepSlider(stan(0), SPEC, { mode: 'loop', speed: 20 }, 0.025),
      SPEC, { mode: 'loop', speed: 20 }, 0.025,
    );
    expect(dwa.value).toBeCloseTo(jeden.value, 9);
  });

  it('bardzo długa przerwa między klatkami nie przeskakuje całego zakresu', () => {
    // Karta w tle dostaje jedno zdarzenie po kilku sekundach; bez ograniczenia
    // suwak przeskoczyłby zakres kilka razy i wylądował w przypadkowym miejscu.
    const po = stepSlider(stan(0), SPEC, { mode: 'loop', speed: 20 }, 30);
    expect(po.value).toBeGreaterThanOrEqual(SPEC.min);
    expect(po.value).toBeLessThanOrEqual(SPEC.max);
  });
});

describe('tryby', () => {
  it('odbicie zawraca na krańcu, zachowując nadmiar', () => {
    // Suwak ma dojść do krańca i wrócić — bez zatrzymania i bez przeskoku.
    const po = stepSlider(stan(9.5), SPEC, { mode: 'bounce', speed: 20 }, 0.05);
    expect(po.direction).toBe(-1);
    expect(po.value).toBeCloseTo(9.5);
  });

  it('odbicie działa też przy dolnym krańcu', () => {
    const po = stepSlider(stan(0.5, -1), SPEC, { mode: 'bounce', speed: 20 }, 0.05);
    expect(po.direction).toBe(1);
    expect(po.value).toBeCloseTo(0.5);
  });

  it('pętla wraca na początek zakresu', () => {
    const po = stepSlider(stan(9.5), SPEC, { mode: 'loop', speed: 20 }, 0.05);
    expect(po.value).toBeCloseTo(0.5);
    expect(po.direction).toBe(1);
  });

  it('jednorazowy przebieg zatrzymuje się na krańcu', () => {
    const po = stepSlider(stan(9.5), SPEC, { mode: 'once', speed: 20 }, 0.05);
    expect(po.value).toBe(SPEC.max);
    expect(po.finished).toBe(true);
  });

  it('przebieg w toku nie melduje zakończenia', () => {
    expect(stepSlider(stan(1), SPEC, { mode: 'once', speed: 20 }, 0.05).finished).toBeFalsy();
  });
});

describe('przypadki graniczne', () => {
  it('zerowa prędkość zostawia wartość bez zmian', () => {
    expect(stepSlider(stan(3), SPEC, { mode: 'loop', speed: 0 }, 1).value).toBe(3);
  });

  it('wartość spoza zakresu jest wciągana do środka', () => {
    // Zakres można zmienić w trakcie animacji; suwak nie może zostać na zewnątrz.
    expect(stepSlider(stan(50), SPEC, { mode: 'loop', speed: 1 }, 0.1).value).toBeLessThanOrEqual(SPEC.max);
    expect(stepSlider(stan(-50), SPEC, { mode: 'loop', speed: 1 }, 0.1).value).toBeGreaterThanOrEqual(SPEC.min);
  });

  it('zakres o zerowej szerokości nie zapętla programu', () => {
    const po = stepSlider(stan(5), { min: 5, max: 5, step: 1 }, { mode: 'bounce', speed: 20 }, 0.05);
    expect(po.value).toBe(5);
  });

  it('odwrócony zakres jest czytany jak zwykły', () => {
    const po = stepSlider(stan(2), { min: 10, max: 0, step: 1 }, { mode: 'loop', speed: 20 }, 0.05);
    expect(po.value).toBeGreaterThanOrEqual(0);
    expect(po.value).toBeLessThanOrEqual(10);
  });
});
