/**
 * The file menu for the 2D drawing and the 3D model.
 *
 * Neither package brings a file menu, on purpose — where the files live is the
 * host's business. So the menu lives here, and the same one serves both pages:
 * what differs between a drawing and a model is the text it reads and writes,
 * and that is what `read` and `apply` are for.
 *
 * It goes into the editor's own bar through `toolbarStart`, not above it: two
 * bars stacked on a tablet cost a fifth of the drawing, and there is nothing in
 * a file menu that needs a row to itself.
 *
 * It is a `Toolbar` from `@hestia/ui-core` built from a tree of nodes, like
 * every other menu in this application — including the list of saved files,
 * which is a submenu rebuilt whenever the directory changes rather than a
 * dropdown of its own.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Snackbar, Typography } from '@mui/material';
import { Toolbar, item, separator, submenu, type ToolbarNode } from '@hestia/ui-core';
import {
    displayName, fileNameFor, listFiles, readFile, removeFile, writeFile, type CadKind,
} from './cadFiles';

export interface CadFileBarProps {
    kind: CadKind;
    /** The current contents, as the page would save them now. */
    read: () => string;
    /** Loads contents into the page — opening a file, or emptying it for a new one. */
    apply: (content: string | null) => void;
    /** The page's own entries, added after the file menu. */
    extra?: ToolbarNode[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CadFileBar({ kind, read, apply, extra = [] }: CadFileBarProps) {
    const [files, setFiles] = useState<string[]>([]);
    const [file, setFile] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);

    const refresh = useCallback(async () => {
        try {
            setFiles(await listFiles(kind));
        } catch (e) {
            setToast({ msg: `Could not list the files: ${message(e)}`, sev: 'error' });
        }
    }, [kind]);

    useEffect(() => { void refresh(); }, [refresh]);

    const open = useCallback(async (target: string) => {
        setBusy(true);
        try {
            apply(await readFile(kind, target));
            setFile(target);
            setToast({ msg: `Opened ${displayName(kind, target)}`, sev: 'info' });
        } catch (e) {
            setToast({ msg: `Could not open ${target}: ${message(e)}`, sev: 'error' });
        } finally {
            setBusy(false);
        }
    }, [kind, apply]);

    const save = useCallback(async (target: string) => {
        setBusy(true);
        try {
            await writeFile(kind, target, read());
            setFile(target);
            await refresh();
            setToast({ msg: `Saved ${displayName(kind, target)}`, sev: 'success' });
        } catch (e) {
            setToast({ msg: `Could not save: ${message(e)}`, sev: 'error' });
        } finally {
            setBusy(false);
        }
    }, [kind, read, refresh]);

    const saveAs = useCallback(() => {
        const name = window.prompt('Name', file ? displayName(kind, file) : kind);
        if (name) void save(fileNameFor(kind, name));
    }, [file, kind, save]);

    const remove = useCallback(async () => {
        if (!file || !window.confirm(`Delete ${displayName(kind, file)}?`)) return;
        setBusy(true);
        try {
            await removeFile(kind, file);
            setFile('');
            await refresh();
            // What was deleted stays on screen: throwing the work away as well
            // would turn one confirmed deletion into two losses.
            setToast({ msg: 'Deleted — what is on screen is unsaved now', sev: 'info' });
        } catch (e) {
            setToast({ msg: `Could not delete: ${message(e)}`, sev: 'error' });
        } finally {
            setBusy(false);
        }
    }, [file, kind, refresh]);

    const startNew = useCallback(() => {
        if (!window.confirm('Start a new one? Anything unsaved will be lost.')) return;
        apply(null);
        setFile('');
    }, [apply]);

    const nodes: ToolbarNode[] = useMemo(() => [
        submenu('file', 'File', [
            item('new', 'New', { onSelect: startNew, disabled: busy }),
            submenu('open', 'Open', files.length
                ? files.map((f) => item(`open:${f}`, displayName(kind, f), { onSelect: () => void open(f) }))
                // An empty submenu would not open at all, and a menu entry that
                // does nothing when clicked is worse than one that says why.
                : [item('none', 'Nothing saved yet', { disabled: true })],
                { disabled: busy }),
            separator('s1'),
            item('save', 'Save', {
                shortcut: 'Ctrl+S',
                disabled: busy,
                onSelect: () => (file ? void save(file) : saveAs()),
            }),
            item('saveAs', 'Save as…', { onSelect: saveAs, disabled: busy }),
            separator('s2'),
            item('delete', 'Delete', {
                // Nothing open is not an error worth a dialog — the entry simply
                // has nothing to act on.
                disabled: busy || !file,
                title: file ? undefined : 'Nothing open to delete',
                onSelect: () => void remove(),
            }),
            item('refresh', 'Refresh the list', { onSelect: () => void refresh(), disabled: busy }),
        ]),
        ...extra,
    ], [busy, extra, file, files, kind, open, refresh, remove, save, saveAs, startNew]);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 0 }}>
            {/* Nested inside the editor's bar, so this one brings no border and
                no scrolling of its own — the bar around it does both. */}
            <Toolbar nodes={nodes} scrollable={false} aria-label={`${kind} file menu`} sx={{ borderBottom: 'none', p: 0 }} />
            {busy && <CircularProgress size={16} sx={{ mx: 1 }} />}
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, whiteSpace: 'nowrap' }}>
                {file ? displayName(kind, file) : 'unsaved'}
            </Typography>

            <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                {toast ? <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
            </Snackbar>
        </Box>
    );
}
