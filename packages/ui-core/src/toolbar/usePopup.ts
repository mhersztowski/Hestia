import { useEffect, type RefObject } from 'react';

/**
 * Shut an open popup when the click lands somewhere else, or on Escape.
 *
 * The two things only a browser knows, in one place. Every popup needs them and
 * every component had its own copy — the menu bar's, the toolbar's, and the
 * panel's, which did not have one at all: its ⋮ menu stayed open until you
 * clicked the ⋮ again, and hung there over the page in the meantime.
 *
 * An open menu is drawn in a portal, outside the container it belongs to, so a
 * click inside it would look like a click outside. Popups mark themselves with
 * `data-toolbar-menu` and clicks landing in one are left to the menu itself.
 */
export function useDismissOnOutside(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  close: () => void,
  /** Extra elements that count as inside — the button that opened the popup. */
  alsoInside: RefObject<HTMLElement | null>[] = []
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null;
      if (container.current?.contains(target ?? null)) return;
      for (const extra of alsoInside) {
        if (extra.current?.contains(target ?? null)) return;
      }
      if (target instanceof Element && target.closest('[data-toolbar-menu]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close, container, ...alsoInside]);
}
