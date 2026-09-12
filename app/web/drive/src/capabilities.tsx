/**
 * What this application can do with a file, expressed as the drive's own
 * capabilities.
 *
 * Three slots, three packages: an **editor** (`@hestia/ui-markdown-editor` for
 * Markdown, `@hestia/ui-texteditor` for everything else), an **assistant**
 * (`@hestia/ui-ai`) and **viewers** for what neither can draw
 * (`@hestia/viewers` — PDF, DjVu).
 *
 * The shapes are `DriveCapabilities` from `@hestia/ui-core` rather than
 * something of this application's own, and that is deliberate: `DrivePage` in
 * that package takes exactly these, and when it lands this file is wired in
 * unchanged instead of rewritten.
 *
 * Every slot is optional and every absence is silent. A host with no assistant
 * shows no assistant button — not a button that opens an empty drawer.
 */

import { useMemo } from 'react';
import type { DriveEditor, DriveFileRef, DriveStore } from '@hestia/ui-core';
import { driveAssistant } from '@hestia/ui-ai';
import { driveViewers } from '@hestia/viewers';
import {
    MdEditor,
    EditorFilesProvider,
    EditorSessionProvider,
    type EditorFiles,
} from '@hestia/ui-markdown-editor';
import { TextEditorWorkspace } from '@hestia/ui-texteditor';
import type { FileSystemProvider } from '@hestia/core';
import { platform, type User } from './platform';

/** Markdown opens in the Markdown editor; everything else in the code editor. */
const MARKDOWN = new Set(['md', 'markdown', 'mdx']);

/**
 * What the code editor will not open.
 *
 * A list of what to refuse rather than a list of what to accept: source files
 * have hundreds of extensions and a new one appears every year, while the
 * things that are certainly not text are few and do not change. Getting it
 * wrong the other way round would mean a `.rs` file the editor claims it cannot
 * open.
 */
const BINARY = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'avif',
    'pdf', 'djvu', 'epub', 'mobi',
    'zip', 'gz', 'tar', 'bz2', 'xz', '7z', 'rar',
    'mp3', 'wav', 'ogg', 'flac', 'mp4', 'webm', 'mkv', 'mov', 'avi',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'wasm', 'so', 'dll', 'dylib', 'exe', 'bin', 'o', 'a',
    'sqlite', 'db',
]);

const extensionOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

/**
 * `EditorFiles` over a `DriveStore`.
 *
 * The Markdown editor asks for three operations — read, write, list — and the
 * drive's store has all three. What it does **not** have is `lastModified`, so
 * that comes back empty: the editor does not read it, and inventing a timestamp
 * would be worse than an honest blank.
 */
function editorFiles(store: DriveStore): EditorFiles {
    return {
        async readFile(path) {
            return { path, content: await store.read(path), lastModified: '' };
        },
        async writeFile(path, content) {
            await store.write?.(path, content);
            return { path, content, lastModified: '' };
        },
        async listDirectory(path = '') {
            const entries = await store.list(path);
            return {
                name: path.split('/').pop() ?? '',
                path,
                type: 'directory' as const,
                children: entries.map((e) => ({
                    name: e.name,
                    path: path ? `${path}/${e.name}` : e.name,
                    type: (e.directory ? 'directory' : 'file') as 'directory' | 'file',
                })),
            };
        },
    };
}

export interface DriveCapabilityOptions {
    provider: FileSystemProvider;
    user: User | null;
    token: string | null;
    /** Opening a file the assistant or the editor mentions. */
    onOpenFile: (path: string) => void;
    /** Something was written — the listing is stale until it refreshes. */
    onFilesChanged: (paths: string[]) => void;
}

/**
 * The editor slot.
 *
 * `canEdit` decides before the drive draws the "Edit" entry, so a file the
 * editor would refuse never offers it — and refusing afterwards is the thing to
 * avoid, because by then the user has already been promised something. Monaco
 * opens a PNG as a wall of replacement characters rather than failing, which is
 * worse than no "Edit" entry at all.
 */
export function buildEditor(opts: DriveCapabilityOptions): DriveEditor {
    const { provider, user, token } = opts;

    return {
        canEdit: (file) => !BINARY.has(extensionOf(file.name)),

        render(file: DriveFileRef, { onSaved }: { onClose: () => void; onSaved: () => void }) {
            if (MARKDOWN.has(extensionOf(file.name))) {
                // The Markdown editor takes its file store and its session as
                // capabilities of its own — the same idea one layer down.
                return (
                    <EditorFilesProvider files={editorFiles(file.store)}>
                        <EditorSessionProvider
                            session={{ userName: user?.userName ?? null, token, isAdmin: user?.isAdmin ?? false }}
                        >
                            <MdEditor filePath={file.path} onSave={onSaved} />
                        </EditorSessionProvider>
                    </EditorFilesProvider>
                );
            }

            return (
                <TextEditorWorkspace
                    provider={provider}
                    initialPath={file.path}
                    authToken={token ?? undefined}
                    height="100%"
                    // No `agentPanel` here on purpose: there is one assistant on
                    // this page and the drive owns it. Two panels over the same
                    // files would each have a conversation the other cannot see.
                />
            );
        },
    };
}

/** All three, ready for the drive. */
export function useDriveCapabilities(opts: DriveCapabilityOptions) {
    const { provider, token, onOpenFile, onFilesChanged } = opts;
    return useMemo(() => ({
        editor: buildEditor(opts),
        assistant: driveAssistant({
            provider,
            authToken: token ?? undefined,
            webFetchUrl: '/api/web-fetch',
            onFileOpen: onOpenFile,
            onFileWritten: onFilesChanged,
        }),
        // The day `readBytes` exists this is one line rather than a redesign —
        // and it does now, so PDFs and DjVu open in the drive.
        viewers: driveViewers({ readBytes: (path) => platform.readBytes(path) }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [provider, token, onOpenFile, onFilesChanged]);
}
