/**
 * editorOverlay — współdzielony, lekki sygnał „otwarta jest nakładka edytora bloku".
 *
 * Bloki skryptowe (Automate / Plugin Script) otwierają swój edytor Monaco w
 * pełnoekranowym MUI Dialog (portal poza drzewem ProseMirror). Bubble menu
 * MdEditora żyje we własnym portalu z wyższym z-index i nie chowa się samo, bo
 * atomowy NodeView bloku pozostaje „zaznaczony". Gdy choć jedna taka nakładka
 * jest otwarta, MdEditor ukrywa bubble menu.
 *
 * Reference-counted (kilka bloków może teoretycznie nakładać się w czasie).
 */
let count = 0;
const listeners = new Set<(active: boolean) => void>();

function emit() {
  const active = count > 0;
  for (const l of listeners) l(active);
}

export const editorOverlay = {
  /** Zgłoś otwarcie nakładki. */
  enter(): void { count += 1; if (count === 1) emit(); },
  /** Zgłoś zamknięcie nakładki. */
  exit(): void { count = Math.max(0, count - 1); if (count === 0) emit(); },
  /** Czy jakakolwiek nakładka jest otwarta. */
  get active(): boolean { return count > 0; },
  /** Subskrypcja zmian stanu. Zwraca funkcję odsubskrybowania. */
  subscribe(fn: (active: boolean) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
