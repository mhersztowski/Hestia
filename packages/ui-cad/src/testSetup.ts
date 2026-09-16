/**
 * The jsdom gaps the notes page needs just to come up.
 *
 * These are browser stubs, not stubs of the code under test: `ResizeObserver`
 * and `matchMedia` exist in every real browser and jsdom has neither. The
 * drawing is checked by eye in a running application — the point here is to be
 * able to reach the buttons at all.
 */

class StubResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
