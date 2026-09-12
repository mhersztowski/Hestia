/**
 * Detekcja klawiatury ekranowej działa inaczej w przeglądarce i w WebView.
 *
 * Chrome na Androidzie nakłada klawiaturę na okno: `window.innerHeight` zostaje
 * bez zmian, a kurczy się tylko `visualViewport`. WebView aplikacji
 * (`app/mycastle-mobile`, Expo → `windowSoftInputMode=adjustResize`) zmniejsza
 * CAŁE okno — oba pomiary maleją równocześnie, więc różnica wychodzi zero i
 * pasek kursora nigdy się nie pokazywał.
 */
import { describe, it, expect } from 'vitest';
import { keyboardState, KEYBOARD_MIN_PX, type ViewportMetrics } from './keyboardInset';

const m = (innerHeight: number, viewportHeight: number, offsetTop = 0): ViewportMetrics =>
  ({ innerHeight, viewportHeight, offsetTop });

describe('keyboardState — klawiatura nałożona na okno (Chrome mobile)', () => {
  it('rozpoznaje klawiaturę po skurczonym visualViewport i zwraca jej wysokość', () => {
    const st = keyboardState(m(800, 450), 800);
    expect(st).toEqual({ visible: true, inset: 350 });
  });

  it('uwzględnia przewinięty visualViewport (offsetTop)', () => {
    expect(keyboardState(m(800, 450, 50), 800)).toEqual({ visible: true, inset: 300 });
  });

  it('schowana klawiatura to brak paska', () => {
    expect(keyboardState(m(800, 800), 800)).toEqual({ visible: false, inset: 0 });
  });

  it('drobna różnica (pasek adresu, safe area) nie jest klawiaturą', () => {
    expect(keyboardState(m(800, 800 - (KEYBOARD_MIN_PX - 10)), 800).visible).toBe(false);
  });
});

describe('keyboardState — okno zmniejszane przez system (WebView, adjustResize)', () => {
  it('rozpoznaje klawiaturę po spadku względem największej widzianej wysokości', () => {
    // innerHeight i viewportHeight maleją razem — różnica między nimi = 0.
    const st = keyboardState(m(430, 430), 800);
    expect(st.visible).toBe(true);
    // Dół okna JEST już górną krawędzią klawiatury, więc pasek siedzi na 0.
    expect(st.inset).toBe(0);
  });

  it('bez spadku względem baseline nie ma klawiatury', () => {
    expect(keyboardState(m(800, 800), 800)).toEqual({ visible: false, inset: 0 });
  });

  it('pierwsze pomiary (baseline == aktualna wysokość) nie dają fałszywego alarmu', () => {
    expect(keyboardState(m(430, 430), 430)).toEqual({ visible: false, inset: 0 });
  });
});

describe('keyboardState — przypadki mieszane', () => {
  it('gdy oba sygnały mówią „klawiatura", wygrywa dokładniejszy pomiar nakładki', () => {
    // Okno skurczone o 100 px (pasek systemowy), klawiatura nałożona na 300 px.
    const st = keyboardState(m(700, 400), 800);
    expect(st).toEqual({ visible: true, inset: 300 });
  });

  it('brak visualViewport (stare WebView) — decyduje samo innerHeight', () => {
    expect(keyboardState({ innerHeight: 430, viewportHeight: null, offsetTop: 0 }, 800))
      .toEqual({ visible: true, inset: 0 });
    expect(keyboardState({ innerHeight: 800, viewportHeight: null, offsetTop: 0 }, 800))
      .toEqual({ visible: false, inset: 0 });
  });

  it('inset nigdy nie jest ujemny — visualViewport bywa wyższy niż okno', () => {
    expect(keyboardState(m(800, 900), 900).inset).toBe(0);
  });
});
