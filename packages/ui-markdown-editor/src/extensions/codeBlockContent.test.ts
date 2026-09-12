/**
 * Pobieranie treści bloku kodu z dokumentu TipTap.
 *
 * Blok diagramu przekazuje swoją treść do Mermaida i do parsera, więc każdy
 * zgubiony znak nowej linii kończy się błędem składni („Expecting NEWLINE…").
 * `Node.textContent` w ProseMirror skleja zawartość **bez separatora bloków**,
 * dlatego sprawdzamy tu, czy dla bloku kodu daje dokładnie to, co wpisano —
 * i czy odporniejsze `textBetween` daje to samo.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const MERMAID = [
  '---',
  'title: Algorytm',
  '---',
  'flowchart TD',
  '  A[Start] --> B[Koniec]',
].join('\n');

function editorWith(text: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit],
    content: { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text }] }] },
  });
  return editor;
}

/** Tak treść pobiera blok w edytorze. */
const viaTextContent = (editor: Editor) => editor.state.doc.firstChild!.textContent;
/** Wariant odporny: jawny separator bloków. */
const viaTextBetween = (editor: Editor) => {
  const node = editor.state.doc.firstChild!;
  return node.textBetween(0, node.content.size, '\n');
};

describe('treść bloku kodu', () => {
  it('zachowuje znaki nowej linii', () => {
    const editor = editorWith(MERMAID);
    expect(viaTextContent(editor)).toBe(MERMAID);
    editor.destroy();
  });

  it('front matter zostaje trzema osobnymi liniami', () => {
    const editor = editorWith(MERMAID);
    const lines = viaTextContent(editor).split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toBe('title: Algorytm');
    expect(lines[2]).toBe('---');
    editor.destroy();
  });

  it('puste linie w środku nie znikają', () => {
    const text = 'flowchart TD\n\n  A --> B';
    const editor = editorWith(text);
    expect(viaTextContent(editor)).toBe(text);
    editor.destroy();
  });

  it('`textBetween` daje ten sam wynik — można go użyć bez zmiany zachowania', () => {
    const editor = editorWith(MERMAID);
    expect(viaTextBetween(editor)).toBe(viaTextContent(editor));
    editor.destroy();
  });

  it('treść wpisana przez wstawienie tekstu też ma podziały linii', () => {
    const editor = new Editor({ extensions: [StarterKit] });
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: MERMAID }] }],
    });
    expect(editor.state.doc.firstChild!.textContent).toBe(MERMAID);
    editor.destroy();
  });

  it('round-trip przez HTML (tak treść wraca z zapisanego dokumentu)', () => {
    const source = editorWith(MERMAID);
    const html = source.getHTML();
    source.destroy();

    const restored = new Editor({ extensions: [StarterKit], content: html });
    expect(restored.state.doc.firstChild!.textContent).toBe(MERMAID);
    restored.destroy();
  });
});

describe('wklejanie wielolinijkowego tekstu', () => {
  it('wstawienie do bloku kodu zachowuje podziały linii', () => {
    // Tak treść trafia do bloku przy wklejeniu ze schowka.
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: 'doc', content: [{ type: 'codeBlock', content: [] }] },
    });
    editor.commands.setTextSelection(1);
    editor.commands.insertContent(MERMAID);

    expect(editor.state.doc.firstChild!.textContent).toBe(MERMAID);
    editor.destroy();
  });

  it('wklejenie do akapitu (poza blokiem) nie scala linii w jedną', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p></p>' });
    editor.commands.insertContent(MERMAID);
    // Poza blokiem kodu markdown dzieli tekst na akapity — ale treść nie może
    // zlepić się w jeden ciąg bez separatorów.
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
    expect(text).toContain('---\ntitle: Algorytm');
    editor.destroy();
  });
});
