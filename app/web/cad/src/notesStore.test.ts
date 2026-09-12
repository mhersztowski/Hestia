/**
 * The store adapter — we check what makes it more than a straight rewiring of
 * calls: the shape of the platform's responses, and telling "the directory does
 * not exist yet" apart from "you no longer have access".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { platformStore } from './notesStore';
import { PlatformError } from './platform';

vi.mock('./platform', async () => {
    const actual = await vi.importActual<typeof import('./platform')>('./platform');
    return {
        ...actual,
        platform: {
            dir: vi.fn(),
            read: vi.fn(),
            write: vi.fn(),
            remove: vi.fn(),
        },
    };
});

const { platform } = await import('./platform');
const stub = platform as unknown as {
    dir: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe('platformStore', () => {
    it('maps the platform tree onto directory entries', async () => {
        stub.dir.mockResolvedValue([
            { name: 'meetings', path: 'cad/notes/meetings', type: 'directory' },
            { name: 'tuesday.notes.json', path: 'cad/notes/tuesday.notes.json', type: 'file' },
        ]);

        const entries = await platformStore().list('cad/notes');

        expect(entries).toEqual([
            { name: 'meetings', directory: true },
            { name: 'tuesday.notes.json', directory: false },
        ]);
    });

    // Before the first save the directory simply is not there — the file dialog
    // should show an empty folder, not a red error message.
    it('a missing directory is an empty list', async () => {
        stub.dir.mockRejectedValue(new PlatformError('Directory not accessible', 500));
        await expect(platformStore().list('cad/notes')).resolves.toEqual([]);
    });

    // An expired token shown as "an empty folder" would look like losing the notes.
    it('a lack of permission travels on as an error', async () => {
        stub.dir.mockRejectedValue(new PlatformError('No valid token', 401));
        await expect(platformStore().list('cad/notes')).rejects.toThrow('No valid token');
    });

    it('reads and writes at the path the page gives', async () => {
        stub.read.mockResolvedValue('{"version":1}');
        const store = platformStore();

        await expect(store.read('cad/notes/a.notes.json')).resolves.toBe('{"version":1}');
        await store.write('cad/notes/a.notes.json', '{}');

        expect(stub.write).toHaveBeenCalledWith('cad/notes/a.notes.json', '{}');
    });

    /*
     * The platform has neither a move nor a way to create empty directories, so
     * the store does not declare them — and the file dialog reads their absence
     * as a reason not to draw the corresponding buttons.
     */
    it('does not fake operations the platform lacks', () => {
        const store = platformStore();
        expect(store.rename).toBeUndefined();
        expect(store.createDir).toBeUndefined();
        expect(typeof store.remove).toBe('function');
    });
});
