/**
 * selectBlockBefore.ts — Backspace na początku akapitu tuż pod blokiem.
 *
 * Domyślnie ProseMirror wciąga wtedy kursor do środka poprzedniego bloku. Przy
 * bloku z własnym widokiem (kod, diagram) wygląda to tak, jakby klawisz nie
 * działał: kursor znika, a blok zostaje i nie ma jak go usunąć klawiaturą.
 *
 * Wprowadzamy zachowanie znane z Notion: pierwszy Backspace **zaznacza** blok,
 * dopiero drugi go kasuje. Kasowanie za pierwszym razem byłoby zbyt łatwe do
 * przypadkowego wywołania — blok potrafi mieścić kilkadziesiąt linii kodu.
 */
import type { EditorState } from '@tiptap/pm/state';

export interface BlockBeforeTarget {
  /** Pozycja węzła do zaznaczenia. */
  pos: number;
  typeName: string;
}

/**
 * Zwraca blok leżący bezpośrednio przed kursorem, jeśli Backspace ma go
 * zaznaczyć; `null`, gdy klawisz ma zachować się zwyczajnie.
 *
 * @param typeNames typy bloków objęte tym zachowaniem
 */
export function blockBeforeCursor(state: EditorState, typeNames: string[]): BlockBeforeTarget | null {
  const { selection, doc } = state;
  if (!selection.empty) return null;

  const $pos = selection.$anchor;
  // Tylko kursor na samym początku akapitu leżącego wprost w dokumencie —
  // wewnątrz listy czy cytatu Backspace ma swoje własne, sensowne działanie.
  if ($pos.parentOffset !== 0 || $pos.depth !== 1) return null;
  // Akapit musi być pusty albo kursor stoi przed jego treścią; w obu wypadkach
  // użytkownik celuje w to, co jest wyżej.
  const index = $pos.index(0);
  if (index === 0) return null;

  const previous = doc.child(index - 1);
  if (!typeNames.includes(previous.type.name)) return null;

  return { pos: $pos.before(1) - previous.nodeSize, typeName: previous.type.name };
}
