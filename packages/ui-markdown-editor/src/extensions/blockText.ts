/**
 * blockText.ts — podmiana treści bloku kodu z poziomu jego widoku.
 *
 * Wydzielone z `CodeBlockWithLang`, bo o poprawności tej operacji decyduje
 * jeden warunek, którego w komponencie nie dało się sprawdzić testem:
 * **zapis identycznej treści nie może stać się transakcją**.
 *
 * Widoki bloków emitują zapis po każdej operacji użytkownika, a nie po każdej
 * zmianie tekstu — te dwie rzeczy nie są tym samym. Przesunięcie węzła w
 * edytorze diagramu nie ma odpowiednika w składni Mermaida, więc serializacja
 * daje bajt w bajt to samo źródło. Bezwarunkowe `replaceWith` zamieniało to w
 * pustą zmianę dokumentu: plik szedł do zapisu, a historia dostawała krok,
 * który po cofnięciu nie robi nic widocznego.
 */
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * Wstawia `next` jako całą treść bloku stojącego na pozycji `pos`.
 *
 * Zwraca `true`, gdy dokument faktycznie się zmienił.
 */
export function replaceBlockText(
  editor: Editor,
  pos: number | null | undefined,
  node: ProseMirrorNode,
  next: string,
): boolean {
  if (pos == null) return false;
  if (next === node.textContent) return false;

  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  const tr = editor.state.tr;
  tr.replaceWith(from, to, next ? editor.schema.text(next) : []);
  editor.view.dispatch(tr);
  return true;
}
