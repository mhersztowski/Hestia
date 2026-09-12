/**
 * What the drive can be given, and what it does without.
 *
 * The heavy parts of MyCastle's Drive page — the text editor with its plugins,
 * the AI assistant, the PDF and DjVu viewers — each drag in a world of their
 * own: Monaco, a model provider, `pdfjs-dist`, `djvujs`. A drive that imports
 * all of them costs every page that shows a file list the whole of them, and a
 * page that only wants to look at a folder pays for an assistant it will never
 * open.
 *
 * So they arrive **through these interfaces**, from packages of their own. Each
 * is optional, and the rule is the same for all of them: **`null` or absent
 * means the drive does not offer that at all** — no button, no menu entry, no
 * empty panel that explains it is unavailable. A button that cannot work is
 * worse than no button, because it promises something.
 *
 * The interfaces describe **only what the drive needs**. The editor package
 * knows about tabs, IntelliSense and its plugins; the drive knows that a file
 * can be opened for editing and that the result can be saved. Nothing more of
 * either side crosses over.
 */

import type { ReactNode } from 'react';
import type { DriveStore } from './store';

/** A file the drive is handing over, with the store it came from. */
export interface DriveFileRef {
    /** Path in the store, `/` between segments, no leading slash. */
    path: string;
    name: string;
    /** The store the path belongs to — an editor or an assistant reads and writes through it. */
    store: DriveStore;
}

/**
 * The text editor (`@hestia/ui-texteditor` — Monaco, tabs, IntelliSense, plugins).
 *
 * The drive asks two things of it: whether it will take this file, and a panel
 * to put in the right-hand side when it does.
 */
export interface DriveEditor {
    /**
     * Whether this file opens in the editor. The drive asks before drawing the
     * "Edit" entry, so a file the editor would refuse never offers it.
     */
    canEdit(file: DriveFileRef): boolean;
    /**
     * The editor itself, for the panel. `onClose` returns the drive to its
     * preview; `onSaved` tells the listing the file changed, so the row's size
     * and date stop being the ones from before the edit.
     */
    render(file: DriveFileRef, opts: { onClose: () => void; onSaved: () => void }): ReactNode;
}

/**
 * The AI assistant (`@hestia/ui-ai` — the agent engine, its providers and tools).
 *
 * The drive gives it the folder it is looking at, so the assistant's file tools
 * work where the user is, and a file when one is open.
 */
export interface DriveAssistant {
    /**
     * The panel. The drive draws the button that opens it and nothing else.
     *
     * `onFileOpen` and `onFileWritten` are the drive's: a file the assistant
     * opens shows in the panel beside it, and a file it writes stops the
     * listing from showing what was there before.
     */
    render(
        context: {
            store: DriveStore;
            dir: string;
            file: DriveFileRef | null;
            onFileOpen?: (path: string) => void;
            onFileWritten?: (paths: string[]) => void;
        },
        opts: { onClose: () => void },
    ): ReactNode;
    /** What the button says; the drive has a default. */
    label?: string;
}

/**
 * Viewers for what the drive cannot draw itself — PDF and DjVu
 * (`pdfjs-dist`, `djvujs`, both several megabytes).
 *
 * `kinds` is asked first, so a viewer package that ships only PDF does not make
 * the drive promise DjVu.
 */
export interface DriveViewers {
    /** Which files this can show, by the drive's own kinds plus its own names. */
    canView(file: DriveFileRef): boolean;
    render(file: DriveFileRef): ReactNode;
}

/**
 * All three together, as the drive takes them.
 *
 * A host passes what it has. `null` is not a failure state — it is how a page
 * says "a file list is all I want here".
 */
export interface DriveCapabilities {
    editor?: DriveEditor | null;
    assistant?: DriveAssistant | null;
    viewers?: DriveViewers | null;
}

/** Whether a capability is there to be used — one place, so every check reads the same. */
export function has<T>(capability: T | null | undefined): capability is T {
    return capability !== null && capability !== undefined;
}
