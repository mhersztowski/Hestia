/**
 * Blok z własnym widokiem w drzewie edytora.
 *
 * Bloki bazy wiedzy (wzór, symulacja, pole, algebra) pokazują w trybie widoku
 * wykres albo złożony wzór. Mieszkają przy tym w drzewie ProseMirror, więc
 * dwie rzeczy muszą być spełnione naraz:
 *
 *  • widok **nie może przyjmować kursora** — inaczej kliknięcie w wykres
 *    pozwala pisać po środku symulacji, a wpisany znak psuje składnię bloku,
 *  • treść węzła **musi zostać w drzewie**, choćby ukryta — bez niej edytor
 *    traci miejsce, w którym trzyma tekst bloku.
 *
 * Testy patrzą na to od strony dokumentu: czy treść przetrwa cykl życia węzła.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const TRESC = [
  'T = 2\\pi\\sqrt{\\frac{L}{g}}',
  '@vars T: s, L: m, g: m/s^2',
].join('\n');

/** Zawartość bloku kodu odczytana tak, jak robi to renderer. */
function trescBloku(editor: Editor): string {
  let wynik = '';
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'codeBlock') {
      wynik = editor.state.doc.textBetween(
        node.nodeSize > 2 ? 1 : 0,
        editor.state.doc.content.size,
        '\n',
        '\n',
      ).trim();
      return false;
    }
    return true;
  });
  return wynik;
}

describe('blok z widokiem w dokumencie', () => {
  it('treść bloku przetrwa w dokumencie mimo własnego widoku', () => {
    // Sedno: nawet gdy blok pokazuje wykres zamiast tekstu, tekst dalej jest
    // treścią węzła i musi wrócić przy zapisie dokumentu.
    const editor = new Editor({
      extensions: [StarterKit],
      content: {
        type: 'doc',
        content: [{
          type: 'codeBlock',
          attrs: { language: 'formula:okres' },
          content: [{ type: 'text', text: TRESC }],
        }],
      },
    });

    expect(trescBloku(editor)).toBe(TRESC);
    editor.destroy();
  });

  it('podmiana treści bloku nie gubi jego języka', () => {
    // Zapis rysunku i edycja wzoru podmieniają treść węzła; atrybut języka
    // decyduje o tym, który renderer go obsłuży, więc musi zostać.
    const editor = new Editor({
      extensions: [StarterKit],
      content: {
        type: 'doc',
        content: [{
          type: 'codeBlock',
          attrs: { language: 'formula:okres' },
          content: [{ type: 'text', text: TRESC }],
        }],
      },
    });

    let pozycja = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') { pozycja = pos; return false; }
      return true;
    });

    const wezel = editor.state.doc.nodeAt(pozycja)!;
    editor.view.dispatch(
      editor.state.tr.replaceWith(pozycja + 1, pozycja + wezel.nodeSize - 1, editor.schema.text('E = m \\cdot c^2')),
    );

    const po = editor.state.doc.nodeAt(pozycja)!;
    expect(po.attrs.language).toBe('formula:okres');
    expect(po.textContent).toBe('E = m \\cdot c^2');
    editor.destroy();
  });
});
