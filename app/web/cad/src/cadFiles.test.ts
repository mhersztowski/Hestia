import { describe, expect, it } from 'vitest';
import { displayName, fileNameFor, dirFor, extensionFor } from './cadFiles';

describe('naming a CAD file', () => {
    it('adds the extension once, whatever was typed', () => {
        expect(fileNameFor('drawing', 'bracket')).toBe('bracket.cad.json');
        expect(fileNameFor('drawing', 'bracket.cad.json')).toBe('bracket.cad.json');
        expect(fileNameFor('drawing', 'bracket.json')).toBe('bracket.cad.json');
        expect(fileNameFor('model', 'bracket')).toBe('bracket.model.json');
        expect(fileNameFor('model', 'bracket.model.json')).toBe('bracket.model.json');
    });

    it('keeps a name inside its directory', () => {
        // A name is typed into a dialog, and `../` in one would otherwise write
        // wherever the user's permissions reach.
        expect(fileNameFor('drawing', '../secret')).toBe('..-secret.cad.json');
        expect(fileNameFor('drawing', 'a/b\\c')).toBe('a-b-c.cad.json');
    });

    it('falls back to the kind when the name is empty', () => {
        expect(fileNameFor('drawing', '   ')).toBe('drawing.cad.json');
        expect(fileNameFor('model', '')).toBe('model.model.json');
    });

    it('shows a name without its extension, and leaves other files alone', () => {
        expect(displayName('drawing', 'bracket.cad.json')).toBe('bracket');
        expect(displayName('model', 'bracket.model.json')).toBe('bracket');
        expect(displayName('drawing', 'notes.txt')).toBe('notes.txt');
    });

    it('keeps the two kinds apart', () => {
        expect(dirFor('drawing')).not.toBe(dirFor('model'));
        expect(extensionFor('drawing')).not.toBe(extensionFor('model'));
    });
});
