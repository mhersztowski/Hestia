/**
 * The notes subpage: the page from `@hestia/ui-cad` with its file menu in the same
 * bar as its tools.
 *
 * The package draws a "File" button of its own when nobody takes it over — a
 * page that can be neither opened nor saved would be worse. Here the
 * application takes it over (`onFileOps`) and hands the entries back through
 * `toolbarStart`, so they sit in the page's own bar and there are not two ways
 * into the same thing, nor two bars.
 */

import { useMemo, useState } from 'react';
import { Box, Link } from '@mui/material';
import { SpenNotesView, type FileOps, type NoteStore } from '@hestia/ui-cad';
import { Toolbar, item, separator, submenu, custom, type ToolbarNode } from '@hestia/ui-core';

export function NotesPage({ store }: { store: NoteStore }) {
    const [ops, setOps] = useState<FileOps | null>(null);

    const nodes: ToolbarNode[] = useMemo(() => {
        const entries = (list: { label: string; run: () => void }[], prefix: string) =>
            list.map((e, i) => item(`${prefix}:${i}`, e.label, { onSelect: e.run }));

        return [
            submenu('file', 'File', [
                // Until the page reports in, the menu holds a line saying so
                // rather than being empty — an empty menu that opens onto
                // nothing reads as broken.
                ...(ops ? entries(ops.store, 'store') : [item('waiting', 'Loading…', { disabled: true })]),
                separator('s1'),
                submenu('export', 'Export', ops && ops.exportItems.length
                    ? entries(ops.exportItems, 'export')
                    : [item('none', 'Nothing to export yet', { disabled: true })]),
                ...(ops?.viewerUrl
                    ? [separator('s2'), custom('viewer', (
                        <Link href={ops.viewerUrl} target="_blank" rel="noreferrer" variant="body2">
                            Open in the viewer
                        </Link>
                    ))]
                    : []),
            ]),
            custom('name', (
                <Box component="span" sx={{ px: 0.5, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {ops?.currentName ?? 'unsaved'}
                </Box>
            )),
        ];
    }, [ops]);

    return (
        <Box sx={{ height: '100%', minHeight: 0 }}>
            {/* `onFileOps` is called on every change of file state, so the menu
                shows the file that is actually open. */}
            <SpenNotesView
                store={store}
                onFileOps={setOps}
                toolbarStart={<Toolbar nodes={nodes} aria-label="notes file menu" sx={{ borderBottom: 'none', p: 0 }} />}
            />
        </Box>
    );
}
