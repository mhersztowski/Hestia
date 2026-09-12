import { describe, expect, it } from 'vitest';
import {
    baseName, breadcrumbs, extensionOf, formatSize, kindOf, parentDir, pathIn, safeName, sortEntries,
} from './store';

describe('paths', () => {
    it('joins without double or leading slashes', () => {
        expect(pathIn('a/b', 'c')).toBe('a/b/c');
        expect(pathIn('a/b/', 'c')).toBe('a/b/c');
        expect(pathIn('/a/', 'c')).toBe('a/c');
        expect(pathIn('', 'c')).toBe('c');
    });

    it('finds the parent and the name', () => {
        expect(parentDir('a/b/c.txt')).toBe('a/b');
        expect(parentDir('c.txt')).toBe('');
        expect(baseName('a/b/c.txt')).toBe('c.txt');
        expect(baseName('c.txt')).toBe('c.txt');
    });

    it('lays a path out as steps, root first', () => {
        expect(breadcrumbs('a/b')).toEqual([
            { label: 'Drive', path: '' },
            { label: 'a', path: 'a' },
            { label: 'b', path: 'a/b' },
        ]);
        expect(breadcrumbs('')).toEqual([{ label: 'Drive', path: '' }]);
    });

    it('keeps a typed name inside its directory', () => {
        // A name is otherwise a path, and a path can leave the directory that
        // is on screen.
        expect(safeName('../secret')).toBe('..-secret');
        expect(safeName('a/b')).toBe('a-b');
        expect(safeName('..')).toBe('untitled');
        expect(safeName('   ')).toBe('untitled');
        expect(safeName('notes.md')).toBe('notes.md');
    });
});

describe('the listing', () => {
    it('puts directories first, then sorts by name', () => {
        const entries = [
            { name: 'b.txt', directory: false },
            { name: 'z', directory: true },
            { name: 'a.txt', directory: false },
            { name: 'a', directory: true },
        ];
        expect(sortEntries(entries).map((e) => e.name)).toEqual(['a', 'z', 'a.txt', 'b.txt']);
    });
});

describe('what a file is', () => {
    it('reads the extension', () => {
        expect(extensionOf('a/b/notes.MD')).toBe('md');
        expect(extensionOf('Makefile')).toBe('');
        expect(extensionOf('.gitignore')).toBe('');   // a dotfile is not an extension
    });

    it('sorts files into what the drive can show', () => {
        expect(kindOf('notes.md')).toBe('text');
        expect(kindOf('drawing.svg')).toBe('text');   // markup, and seeing it is why one opens it
        expect(kindOf('photo.JPG')).toBe('image');
        expect(kindOf('manual.pdf')).toBe('pdf');
        expect(kindOf('model.glb')).toBe('other');
        expect(kindOf('README')).toBe('text');
        expect(kindOf('archive')).toBe('other');
    });
});

describe('sizes', () => {
    it('reads at a glance', () => {
        expect(formatSize(0)).toBe('0 B');
        expect(formatSize(512)).toBe('512 B');
        expect(formatSize(1536)).toBe('1.5 kB');
        expect(formatSize(9.4 * 1024 * 1024)).toBe('9.4 MB');
        expect(formatSize(250 * 1024 * 1024)).toBe('250 MB');
    });

    it('says nothing when the store said nothing', () => {
        expect(formatSize(undefined)).toBe('');
    });
});
