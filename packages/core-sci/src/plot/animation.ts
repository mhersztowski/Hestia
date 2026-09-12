/**
 * animation.ts — ruch suwaka w czasie.
 *
 * Osobno od interfejsu, bo to jedyna część animacji, która ma treść: reszta
 * jest pętlą klatek. Tutaj da się sprawdzić rzecz, której na oko nie widać —
 * że wartość zależy od **czasu**, a nie od liczby klatek.
 *
 * Kod „dodaj krok przy każdej klatce" działa na maszynie, na której powstał,
 * biegnie dwa razy szybciej na ekranie 120 Hz i zwalnia razem z obciążoną
 * przeglądarką. Dlatego krok liczymy z upływu czasu.
 */

export type SliderMode =
  /** Dojdź do krańca i wróć — jak wahadło. */
  | 'bounce'
  /** Dojdź do krańca i zacznij od początku. */
  | 'loop'
  /** Dojdź do krańca i stań. */
  | 'once';

export interface SliderSpecLike {
  min: number;
  max: number;
  step: number;
}

export interface SliderPlayback {
  mode: SliderMode;
  /** Jednostki na sekundę. */
  speed: number;
}

export interface SliderAnimation {
  value: number;
  /** Kierunek ruchu; zmienia się przy odbiciu. */
  direction: 1 | -1;
  /** Ustawiane przy trybie jednorazowym po dojściu do krańca. */
  finished?: boolean;
}

/**
 * Najdłuższy krok czasu, jaki bierzemy pod uwagę.
 *
 * Karta w tle nie dostaje klatek; po powrocie przeglądarka melduje jedno
 * zdarzenie z przerwą liczoną w sekundach. Bez ograniczenia suwak przeskoczyłby
 * zakres kilkanaście razy i wylądował w miejscu, którego nikt nie wybierał —
 * lepiej, żeby po prostu ruszył dalej stamtąd, gdzie stał.
 */
const MAX_DT = 0.1;

export function stepSlider(
  state: SliderAnimation,
  spec: SliderSpecLike,
  playback: SliderPlayback,
  dtSeconds: number,
): SliderAnimation {
  const min = Math.min(spec.min, spec.max);
  const max = Math.max(spec.min, spec.max);
  const span = max - min;

  // Zakres bez szerokości nie ma gdzie animować; zwracamy jedyną możliwą wartość.
  if (span <= 0) return { ...state, value: min };

  // Zakres bywa zmieniany w trakcie animacji — wartość spoza niego wciągamy
  // do środka, zamiast pozwolić jej zostać na zewnątrz.
  const start = Math.min(max, Math.max(min, state.value));

  const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT);
  const delta = playback.speed * dt * state.direction;
  if (delta === 0) return { ...state, value: start };

  let value = start + delta;
  let direction = state.direction;

  if (value > max || value < min) {
    switch (playback.mode) {
      case 'bounce': {
        /*
         * Odbicie zachowuje nadmiar: suwak przechodzi przez kraniec tyle,
         * ile mu zostało z kroku, i wraca. Ucięcie do krańca zatrzymywałoby
         * animację na jedną klatkę przy każdym odbiciu — widać to jako
         * drgnięcie.
         */
        const overflow = value > max ? value - max : min - value;
        direction = (direction === 1 ? -1 : 1) as 1 | -1;
        value = value > max ? max - overflow : min + overflow;
        break;
      }
      case 'loop': {
        // Reszta z dzielenia, nie przypisanie krańca — inaczej przy dużym
        // kroku suwak siadałby zawsze w tym samym miejscu.
        const offset = (((value - min) % span) + span) % span;
        value = min + offset;
        break;
      }
      case 'once':
        return { value: direction === 1 ? max : min, direction, finished: true };
    }
  }

  return { value: Math.min(max, Math.max(min, value)), direction };
}
