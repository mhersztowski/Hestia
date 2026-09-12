/**
 * Podmiana treści bloku kodu przez widok bloku (diagram, wzór, symulacja).
 *
 * Powód wydzielenia: edytor graficzny diagramu emituje zapis po **każdej**
 * operacji, także takiej, która nie zmienia tekstu — przesunięcie węzła nie ma
 * w składni Mermaida żadnego odpowiednika. Bezwarunkowe `replaceWith` robiło
 * z tego transakcję: dokument stawał się brudny, autosave zapisywał plik,
 * a undo dostawało krok, który niczego nie cofa.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { replaceBlockText } from './blockText';

const TRESC = 'flowchart TB\n  A[Start] --> B[Koniec]';

function editorWith(text: string): Editor {
  return new Editor({
    extensions: [StarterKit],
    content: { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text }] }] },
  });
}

/** Pozycja bloku kodu w dokumencie (pierwszy węzeł najwyższego poziomu). */
const POS = 0;

describe('replaceBlockText', () => {
  it('zapisuje zmienioną treść', () => {
    const editor = editorWith(TRESC);
    const node = editor.state.doc.child(0);

    const zapisano = replaceBlockText(editor, POS, node, 'flowchart TB\n  A --> C');

    expect(zapisano).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('flowchart TB\n  A --> C');
  });

  it('nie tworzy transakcji, gdy treść jest identyczna', () => {
    const editor = editorWith(TRESC);
    const node = editor.state.doc.child(0);
    let transakcje = 0;
    editor.on('transaction', () => { transakcje += 1; });

    const zapisano = replaceBlockText(editor, POS, node, TRESC);

    expect(zapisano).toBe(false);
    expect(transakcje).toBe(0);
  });

  it('czyści blok, gdy nowa treść jest pusta', () => {
    const editor = editorWith(TRESC);
    const node = editor.state.doc.child(0);

    expect(replaceBlockText(editor, POS, node, '')).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('');
  });

  it('pusty blok nie jest czyszczony po raz drugi', () => {
    const editor = editorWith('');
    const node = editor.state.doc.child(0);
    let transakcje = 0;
    editor.on('transaction', () => { transakcje += 1; });

    expect(replaceBlockText(editor, POS, node, '')).toBe(false);
    expect(transakcje).toBe(0);
  });

  it('brak pozycji znaczy brak zapisu, a nie wyjątek', () => {
    // `getPos()` bywa `undefined`, gdy widok jest odmontowywany w trakcie
    // operacji — komponent nie ma jak tego przewidzieć.
    const editor = editorWith(TRESC);
    const node = editor.state.doc.child(0);

    expect(replaceBlockText(editor, null, node, 'cokolwiek')).toBe(false);
    expect(editor.state.doc.child(0).textContent).toBe(TRESC);
  });
});
