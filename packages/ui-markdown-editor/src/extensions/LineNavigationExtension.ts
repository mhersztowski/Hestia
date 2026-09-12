import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Home/End → początek/koniec bieżącego WIERSZA/BLOKU tekstu (nie dokumentu).
 *
 * Na macOS klawisze Home/End w przeglądarce domyślnie PRZEWIJAJĄ do początku/końca
 * DOKUMENTU (systemowe „scroll to beginning/end of document") — na Macu do początku/końca
 * wiersza służy Cmd+←/→. Ten override przenosi kursor do granicy bieżącego bloku tekstowego
 * (akapit / nagłówek / element listy), a zwrócenie `true` (ProseMirror robi preventDefault)
 * blokuje systemowe przewijanie.
 *
 * Używamy komend ProseMirror (setSelection na $head.start()/end()) zamiast natywnego
 * Selection.modify — to deterministyczne, zintegrowane ze stanem edytora i nie zależy od
 * quirków `Selection.modify('lineboundary')` (które na macOS potrafiło skakać do granicy
 * DOKUMENTU). Dla krótkich akapitów granica bloku = granica wiersza; dla długich, zawiniętych
 * akapitów kursor idzie na początek/koniec całego bloku tekstu.
 *
 * Bindujemy tylko czyste Home/End (+Shift do zaznaczania). Cmd/Ctrl+Home/End zostają domyślne
 * (skok na początek/koniec DOKUMENTU).
 */
export const LineNavigation = Extension.create({
  name: 'lineNavigation',
  addKeyboardShortcuts() {
    const toBlockEdge = (which: 'start' | 'end', extend: boolean) => () => {
      const { state, view } = this.editor;
      const { selection } = state;
      const { $head, $anchor } = selection;
      // Granica bieżącego bloku tekstowego zawierającego głowicę selekcji.
      const target = which === 'start' ? $head.start() : $head.end();
      const anchorPos = extend ? $anchor.pos : target;
      const sel = TextSelection.create(state.doc, anchorPos, target);
      view.dispatch(state.tr.setSelection(sel).scrollIntoView());
      return true; // preventDefault → macOS nie przewija dokumentu
    };
    return {
      Home: toBlockEdge('start', false),
      End: toBlockEdge('end', false),
      'Shift-Home': toBlockEdge('start', true),
      'Shift-End': toBlockEdge('end', true),
    };
  },
});
