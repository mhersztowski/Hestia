/**
 * Testy wykrywania bloku nad kursorem dla Backspace.
 *
 * Chodzi o to, żeby klawisz działał tam, gdzie użytkownik celuje w blok, a nie
 * przejmował sterowania w środku listy czy w połowie zdania.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { blockBeforeCursor } from './selectBlockBefore';

const TYPES = ['codeBlock'];

function editorWith(content: object[]) {
  return new Editor({ extensions: [StarterKit], content: { type: 'doc', content } });
}

const codeBlock = { type: 'codeBlock', content: [{ type: 'text', text: 'flowchart TD\n  A --> B' }] };

describe('blockBeforeCursor', () => {
  it('wskazuje blok kodu, gdy kursor stoi na początku akapitu pod nim', () => {
    const editor = editorWith([codeBlock, { type: 'paragraph' }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    expect(blockBeforeCursor(editor.state, TYPES)).toMatchObject({ typeName: 'codeBlock' });
    editor.destroy();
  });

  it('milczy, gdy nad kursorem jest zwykły akapit', () => {
    const editor = editorWith([
      { type: 'paragraph', content: [{ type: 'text', text: 'tekst' }] },
      { type: 'paragraph' },
    ]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    expect(blockBeforeCursor(editor.state, TYPES)).toBeNull();
    editor.destroy();
  });

  it('milczy w środku akapitu — tam Backspace ma kasować znak', () => {
    const editor = editorWith([codeBlock, { type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);

    expect(blockBeforeCursor(editor.state, TYPES)).toBeNull();
    editor.destroy();
  });

  it('milczy przy zaznaczeniu — jest co kasować bez sięgania wyżej', () => {
    const editor = editorWith([codeBlock, { type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }]);
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from: end - 3, to: end });

    expect(blockBeforeCursor(editor.state, TYPES)).toBeNull();
    editor.destroy();
  });

  it('milczy na samym początku dokumentu', () => {
    const editor = editorWith([{ type: 'paragraph' }]);
    editor.commands.setTextSelection(1);

    expect(blockBeforeCursor(editor.state, TYPES)).toBeNull();
    editor.destroy();
  });

  it('wskazana pozycja faktycznie zaznacza blok', () => {
    const editor = editorWith([codeBlock, { type: 'paragraph' }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    const target = blockBeforeCursor(editor.state, TYPES)!;
    editor.commands.setNodeSelection(target.pos);
    expect(editor.state.selection.$anchor.nodeAfter?.type.name).toBe('codeBlock');

    // …a kolejny Backspace (czyli skasowanie zaznaczenia) usuwa blok.
    editor.commands.deleteSelection();
    const names: string[] = [];
    editor.state.doc.forEach((n) => names.push(n.type.name));
    expect(names).not.toContain('codeBlock');
    editor.destroy();
  });
});
