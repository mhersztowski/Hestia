/**
 * keyboardInset.ts — gdzie kończy się widoczne okno, a zaczyna klawiatura.
 *
 * Systemy pokazują klawiaturę na dwa sposoby i tylko jeden z nich widać w
 * `visualViewport`:
 *
 *  • **nakładka** (Chrome na Androidzie, Safari iOS) — okno zostaje w miejscu,
 *    kurczy się `visualViewport`. Różnica `innerHeight − viewportHeight` to
 *    dokładna wysokość klawiatury, a pasek trzeba podnieść o tę wartość.
 *  • **zmniejszenie okna** (WebView w `app/mycastle-mobile`; Expo ustawia
 *    `windowSoftInputMode=adjustResize`) — całe okno się skraca, więc oba
 *    pomiary maleją równocześnie i ich różnica jest zerowa. Tu klawiaturę
 *    poznaje się po spadku wysokości względem stanu bez klawiatury, a pasek
 *    ma po prostu siedzieć na dole okna.
 *
 * Liczenie tylko pierwszym sposobem sprawiało, że w aplikacji mobilnej pasek
 * kursora nie pojawiał się nigdy.
 */

/** Poniżej tylu pikseli „zjedzonych" z widoku uznajemy, że klawiatury nie ma. */
export const KEYBOARD_MIN_PX = 120;

export interface ViewportMetrics {
  /** `window.innerHeight`. */
  innerHeight: number;
  /** `visualViewport.height` albo `null`, gdy API nie istnieje. */
  viewportHeight: number | null;
  /** `visualViewport.offsetTop` (przewinięcie widoku). */
  offsetTop: number;
}

export interface KeyboardState {
  visible: boolean;
  /** Ile pikseli od dołu okna zasłania klawiatura (0 = okno kończy się nad nią). */
  inset: number;
}

/**
 * @param metrics bieżące pomiary widoku
 * @param baselineHeight największa wysokość widoku zaobserwowana bez klawiatury
 *   (w tej orientacji) — punkt odniesienia dla trybu „zmniejszanie okna"
 */
export function keyboardState(metrics: ViewportMetrics, baselineHeight: number): KeyboardState {
  const { innerHeight, viewportHeight, offsetTop } = metrics;

  // 1. Nakładka: pomiar dokładny, więc ma pierwszeństwo.
  if (viewportHeight !== null) {
    const overlay = innerHeight - viewportHeight - offsetTop;
    if (overlay > KEYBOARD_MIN_PX) return { visible: true, inset: overlay };
  }

  // 2. Zmniejszone okno: klawiatura zabrała miejsce z layoutu, nie z nakładki.
  const current = viewportHeight ?? innerHeight;
  if (baselineHeight - current > KEYBOARD_MIN_PX) return { visible: true, inset: 0 };

  return { visible: false, inset: 0 };
}
