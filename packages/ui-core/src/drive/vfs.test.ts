import { describe, expect, it } from 'vitest';
import { asText, freeName, fromText, readJson, readTextOrNull, sortVfsEntries, DIR_TYPE, FILE_TYPE, type DriveVfs } from './vfs';

/** A VFS of one directory, for the tests. */
function fakeVfs(files: Record<string, string>): DriveVfs {
    return {
        async list() { return []; },
        async readFile(path) {
            if (!(path in files)) throw new Error('no such file');
            return fromText(files[path]);
        },
        async writeFile() { /* not used here */ },
    };
}

describe('text and bytes', () => {
    it('round-trips, accents and all', () => {
        expect(asText(fromText('zażółć gęślą jaźń'))).toBe('zażółć gęślą jaźń');
    });
});

describe('reading the small JSON files the page keeps', () => {
    it('gives the fallback when the file is not there', async () => {
        const vfs = fakeVfs({});
        expect(await readTextOrNull(vfs, 'nothing.json')).toBeNull();
        expect(await readJson(vfs, 'nothing.json', { favorites: [] })).toEqual({ favorites: [] });
    });

    it('gives the fallback when somebody has edited it into nonsense', async () => {
        // A hand-edited file should not take the page down with it.
        const vfs = fakeVfs({ 'bad.json': '{ favorites: [' });
        expect(await readJson(vfs, 'bad.json', { favorites: ['kept'] })).toEqual({ favorites: ['kept'] });
    });

    it('reads what is there', async () => {
        const vfs = fakeVfs({ 'ok.json': '{"favorites":["a/b.md"]}' });
        expect(await readJson(vfs, 'ok.json', { favorites: [] })).toEqual({ favorites: ['a/b.md'] });
    });
});

describe('the listing order', () => {
    it('puts directories first, then sorts by name', () => {
        const entries = [
            { name: 'b.txt', type: FILE_TYPE as 1 },
            { name: 'z', type: DIR_TYPE as 2 },
            { name: 'a.txt', type: FILE_TYPE as 1 },
            { name: 'a', type: DIR_TYPE as 2 },
        ];
        expect(sortVfsEntries(entries).map((e) => e.name)).toEqual(['a', 'z', 'a.txt', 'b.txt']);
    });
});

describe('pasting into the folder something came from', () => {
    it('finds a free name instead of overwriting', () => {
        const taken = new Set(['notes.md']);
        expect(freeName('notes.md', taken)).toBe('notes (copy).md');
        taken.add('notes (copy).md');
        expect(freeName('notes.md', taken)).toBe('notes (copy 2).md');
    });

    it('leaves a name that is free alone', () => {
        expect(freeName('notes.md', new Set())).toBe('notes.md');
    });

    it('keeps the extension where it belongs, and copes without one', () => {
        expect(freeName('archive.tar.gz', new Set(['archive.tar.gz']))).toBe('archive.tar (copy).gz');
        expect(freeName('Makefile', new Set(['Makefile']))).toBe('Makefile (copy)');
    });
});
