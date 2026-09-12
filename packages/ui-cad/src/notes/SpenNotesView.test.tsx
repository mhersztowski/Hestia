/**
 * A smoke test for the notes page — it checks what was easiest to break while
 * moving the page over from `cad-app`: whether the page comes up at all without
 * the host it no longer has (the file-operations context, the cad-backend VFS
 * client), and whether saving really goes through the injected store rather than
 * over the network.
 */

import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpenNotesView } from './SpenNotesView';
import { NOTE_EXTENSION, type NoteStore } from './store';

/**
 * jsdom has no 2D canvas — `getContext` returns `null`, and the page draws on
 * every render. The stub agrees to everything and we assert nothing in pixels:
 * the subject of the test is the file round trip, not how a stroke looks.
 */
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
        return new Proxy({}, {
            // `canvas` has to point at the element — the drawing code reads its
            // width and height in order to fill the background.
            get: (_target, key) => {
                if (key === 'canvas') return this;
                if (key === 'measureText') return () => ({ width: 0 });
                if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
                if (key === 'createLinearGradient' || key === 'createPattern') {
                    return () => ({ addColorStop: () => {} });
                }
                return () => {};
            },
            set: () => true,
        });
    }) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,');
});

/** An in-memory store — it plays the part of the backend the package knows nothing about. */
function memoryStore(files: Record<string, string> = {}) {
    const saved = { ...files };
    const store: NoteStore = {
        startDir: 'notes',
        rootDir: 'notes',
        list: async (dir) => Object.keys(saved)
            .filter((p) => p.startsWith(dir + '/'))
            .map((p) => ({ name: p.slice(dir.length + 1), directory: false })),
        read: async (path) => {
            if (!(path in saved)) throw new Error(`no such file: ${path}`);
            return saved[path];
        },
        write: async (path, content) => { saved[path] = content; },
    };
    return { store, saved };
}

describe('SpenNotesView', () => {
    it('comes up without a store — as a scratchpad', () => {
        // No store must mean "no files", not "no page": that is what embedding
        // it in an application without a backend looks like.
        render(<SpenNotesView />);
        expect(screen.getByRole('button', { name: /pen|pencil/i })).toBeTruthy();
    });

    it('without a store it promises neither opening nor saving', async () => {
        const user = userEvent.setup();
        render(<SpenNotesView />);
        await user.click(screen.getByRole('button', { name: 'File' }));
        expect(screen.queryByText('Save note…')).toBeNull();
        expect(screen.getByText('Export PNG')).toBeTruthy();
    });

    it('with a store it offers opening and saving', async () => {
        const user = userEvent.setup();
        const { store } = memoryStore();
        render(<SpenNotesView store={store} />);
        await user.click(screen.getByRole('button', { name: 'File' }));
        expect(screen.getByText('Open note…')).toBeTruthy();
        expect(screen.getByText('Save note…')).toBeTruthy();
    });

    it('saves a note through the store, not over the network', async () => {
        const user = userEvent.setup();
        const { store, saved } = memoryStore();
        render(<SpenNotesView store={store} />);

        await user.click(screen.getByRole('button', { name: 'File' }));
        await user.click(screen.getByText('Save note…'));

        const field = await screen.findByLabelText('File name');
        await user.clear(field);
        await user.type(field, 'tuesday');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(Object.keys(saved)).toEqual([`notes/tuesday${NOTE_EXTENSION}`]);
        });
        const written = JSON.parse(saved[`notes/tuesday${NOTE_EXTENSION}`]);
        expect(written.version).toBe(1);
        expect(Array.isArray(written.pages)).toBe(true);
    });

    it('a host taking over the "File" menu gets the operations and sees no second menu', async () => {
        const { store } = memoryStore();
        const onFileOps = vi.fn();
        render(<SpenNotesView store={store} onFileOps={onFileOps} />);

        await waitFor(() => expect(onFileOps).toHaveBeenCalled());
        const ops = onFileOps.mock.calls.at(-1)![0];
        expect(ops.store.map((item: { label: string }) => item.label))
            .toEqual(['Open note…', 'Save note…']);
        expect(ops.exportItems).toHaveLength(3);

        // Two ways into the same operations would be a mistake — the host already draws them.
        expect(screen.queryByRole('button', { name: 'File' })).toBeNull();
    });

    it('opens a saved note and loads its pages', async () => {
        const user = userEvent.setup();
        const content = JSON.stringify({
            version: 1,
            currentId: 'p1',
            pages: [{ id: 'p1', elements: [], bgColor: '#ffffff' }],
        });
        const { store } = memoryStore({ [`notes/tuesday${NOTE_EXTENSION}`]: content });
        render(<SpenNotesView store={store} />);

        await user.click(screen.getByRole('button', { name: 'File' }));
        await user.click(screen.getByText('Open note…'));

        await user.click(await screen.findByText('tuesday'));
        await user.click(screen.getByRole('button', { name: 'Open' }));

        expect(await screen.findByText(/Opened "tuesday"/)).toBeTruthy();
    });
});
