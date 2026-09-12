/**
 * Kasowanie bloku kodu klawiszem Backspace.
 *
 * Zgłoszenie: kursor w pustym akapicie pod blokiem, Backspace — i nic się nie
 * dzieje. Blok zostaje w dokumencie, więc jedyną drogą jest zaznaczenie go
 * myszą, czego przy bloku z własnym widokiem nie da się zrobić łatwo.
 *
 * Testy sprawdzają zachowanie samego edytora (bez naszych rozszerzeń), żeby
 * oddzielić błąd TipTapa od błędu naszego widoku bloku.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

function editorWithBlockAndParagraph(code = 'flowchart TD\n  A --> B') {
  return new Editor({
    extensions: [StarterKit],
    content: {
      type: 'doc',
      content: [
        { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: code }] },
        { type: 'paragraph' },
      ],
    },
  });
}

const types = (editor: Editor) => {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.type.name));
  return out;
};

describe('Backspace w akapicie pod blokiem kodu', () => {
  it('pierwszy Backspace nie kasuje treści bloku — najpierw go zaznacza', () => {
    const editor = editorWithBlockAndParagraph();
    // Kursor na początku pustego akapitu (tuż za blokiem).
    const paragraphStart = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(paragraphStart);

    editor.commands.joinBackward();

    // Treść bloku musi przetrwać — użytkownik nacisnął Backspace raz.
    expect(editor.state.doc.firstChild!.textContent).toContain('flowchart TD');
    editor.destroy();
  });

  it('blok da się usunąć poleceniem, gdy jest zaznaczony', () => {
    const editor = editorWithBlockAndParagraph();
    editor.commands.setNodeSelection(0);
    editor.commands.deleteSelection();

    expect(types(editor)).not.toContain('codeBlock');
    editor.destroy();
  });

  it('pusty blok kodu znika po Backspace w środku', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: 'doc', content: [{ type: 'codeBlock', content: [] }, { type: 'paragraph' }] },
    });
    editor.commands.setTextSelection(1);
    editor.commands.deleteNode('codeBlock');

    expect(types(editor)).not.toContain('codeBlock');
    editor.destroy();
  });
});
