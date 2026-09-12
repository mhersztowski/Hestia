/**
 * useSliderAnimation — pętla klatek dla animowanych suwaków.
 *
 * Jedna pętla na cały kalkulator, nie jedna na suwak. Każdy `requestAnimationFrame`
 * to osobny wpis w harmonogramie przeglądarki; przy trzech animowanych
 * parametrach dostalibyśmy trzy pętle liczące ten sam upływ czasu, a przy
 * przerysowaniu wykresu — trzy niezależne żądania renderu zamiast jednego.
 *
 * Cała arytmetyka ruchu siedzi w `sci-core/plot/animation`. Tutaj zostaje to,
 * czego bez przeglądarki nie ma: zegar i sprzątanie po odmontowaniu.
 */

import { useEffect, useRef } from 'react';
import { stepSlider, type SliderAnimation, type SliderPlayback, type SliderSpecLike } from '@hestia/core-sci';

export interface AnimatedSlider {
  name: string;
  spec: SliderSpecLike;
  playback: SliderPlayback;
  value: number;
}

/**
 * Uruchamia pętlę, dopóki lista nie jest pusta.
 *
 * `onTick` dostaje komplet nowych wartości — jedno wywołanie na klatkę, nawet
 * gdy animowanych parametrów jest kilka. Dzięki temu React przerysowuje wykres
 * raz, a nie tyle razy, ile suwaków akurat biegnie.
 */
export function useSliderAnimation(
  sliders: AnimatedSlider[],
  onTick: (values: Record<string, number>, finished: string[]) => void,
): void {
  /*
   * Lista i wywołanie zwrotne w ref, nie w zależnościach efektu.
   *
   * Wartości zmieniają się przy każdej klatce; gdyby efekt zależał od nich,
   * pętla byłaby zrywana i zakładana sześćdziesiąt razy na sekundę — a każde
   * zerwanie gubi ułamek czasu i animacja szarpie.
   */
  const slidersRef = useRef(sliders);
  const onTickRef = useRef(onTick);
  slidersRef.current = sliders;
  onTickRef.current = onTick;

  const running = sliders.length > 0;

  useEffect(() => {
    if (!running) return;

    let frame = 0;
    /*
     * Punkt odniesienia bierzemy z **pierwszej klatki**, a nie z zegara przed
     * pętlą. Czas podawany przez `requestAnimationFrame` nie musi być w tej
     * samej skali co `performance.now()`; przy rozbieżności pierwszy krok
     * wychodziłby ujemny albo ogromny — a to jest właśnie ten moment, w którym
     * animacja albo nie rusza, albo przeskakuje pół zakresu.
     */
    let previous: number | undefined;
    // Kierunek trzymamy między klatkami — bez tego suwak w trybie odbicia
    // zawracałby przy każdej klatce zamiast raz na krańcu.
    const states = new Map<string, SliderAnimation>();

    const tick = (now: number) => {
      const dt = previous === undefined ? 0 : (now - previous) / 1000;
      previous = now;

      const values: Record<string, number> = {};
      const finished: string[] = [];

      for (const slider of slidersRef.current) {
        const previousState = states.get(slider.name) ?? { value: slider.value, direction: 1 as const };
        const next = stepSlider(previousState, slider.spec, slider.playback, dt);
        states.set(slider.name, next);
        values[slider.name] = next.value;
        if (next.finished) finished.push(slider.name);
      }

      onTickRef.current(values, finished);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
}
