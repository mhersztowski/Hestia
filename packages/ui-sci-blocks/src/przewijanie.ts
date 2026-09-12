/**
 * przewijanie.ts — który element naprawdę przewija treść.
 *
 * Odruchowo sięga się po `window.scrollY`, ale to prawda tylko wtedy, gdy
 * dokument przewija okno. W aplikacji z własnym układem — paskiem bocznym,
 * belką u góry, obszarem roboczym o stałej wysokości — przewija **kontener**,
 * a okno stoi w miejscu. Kod pytający okno dostaje wtedy zawsze zero i nie
 * robi nic, cicho: bez błędu, bez ostrzeżenia, po prostu bez skutku.
 *
 * Dlatego pytamy o to drzewo, zamiast zakładać.
 */

/** Najbliższy przodek, który przewija w pionie; `null` = przewija okno. */
export function kontenerPrzewijania(element: HTMLElement | null): HTMLElement | null {
  if (!element || typeof window === 'undefined') return null;

  for (let rodzic = element.parentElement; rodzic; rodzic = rodzic.parentElement) {
    const styl = window.getComputedStyle(rodzic);
    // `overlay` to wariant `auto` z niewidocznym paskiem — przewija tak samo.
    if (/(auto|scroll|overlay)/.test(styl.overflowY) && rodzic.scrollHeight > rodzic.clientHeight) {
      return rodzic;
    }
  }
  return null;
}

/** Ile treści jest już przewinięte — niezależnie od tego, kto przewija. */
export function pozycjaPrzewijania(kontener: HTMLElement | null): number {
  if (kontener) return kontener.scrollTop;
  return typeof window === 'undefined' ? 0 : window.scrollY;
}

/** Przewija do zadanego miejsca — bez animacji, bo to skok, a nie ruch. */
export function przewinDo(kontener: HTMLElement | null, top: number): void {
  if (kontener) {
    kontener.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    return;
  }
  if (typeof window !== 'undefined') window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}
