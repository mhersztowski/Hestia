/**
 * The notes subpage: the page from `@hestia/ui-cad` with its file menu in the same
 * bar as its tools.
 *
 * The menu is a `MenuBar` object: built once, refilled when the page reports new
 * file operations, and it holds which menu is open itself.
 *
 * The package draws a "File" button of its own when nobody takes it over — a
 * page that can be neither opened nor saved would be worse. Here the
 * application takes it over (`onFileOps`) and hands the entries back through
 * `toolbarStart`, so they sit in the page's own bar and there are not two ways
 * into the same thing, nor two bars.
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Link } from '@mui/material';
import { SpenNotesView, type FileOps, type NoteStore } from '@hestia/ui-cad';
import { ActionCollection, MenuBar, MenuBarObject, ToolbarCustomItem } from '@hestia/ui-core';

export function NotesPage({ store }: { store: NoteStore }) {
  const [ops, setOps] = useState<FileOps | null>(null);

  // Built once; what the page reports goes into it rather than through it.
  // Two kinds of command arrive from the page — the ones that read and write
  // the note, and the ones that export it — and they are kept apart as such,
  // so that "no file open yet" can grey one kind without touching the other.
  const { bar, io, exports } = useMemo(() => {
    const toolbar = new MenuBarObject({ objectName: 'notes file menu' });
    toolbar.addMenu({ id: 'file', text: 'File' });
    toolbar.addCustom('name', null);
    toolbar.closeOnTrigger();
    return {
      bar: toolbar,
      io: new ActionCollection('io', toolbar, { title: 'File' }),
      exports: new ActionCollection('export', toolbar, { title: 'Export' }),
    };
  }, []);
  useEffect(() => () => bar.destroy(), [bar]);

  // The entries come from the page as closures, so each `Action` is given its
  // own — no dispatching by id, and no list to keep in step with another one.
  useEffect(() => {
    const file = bar.actionById('file')!;
    file.clearItems();

    if (!ops) {
      // Until the page reports in, the menu holds a line saying so rather
      // than being empty — an empty menu that opens onto nothing reads as
      // broken.
      file.addAction({ id: 'waiting', text: 'Loading…', enabled: false });
      return;
    }

    ops.store.forEach((entry, i) => {
      io.add(file.addAction({ id: `store:${i}`, text: entry.label, onTriggered: entry.run }));
    });
    file.addSeparator('s1');

    const exportMenu = file.addMenu({ id: 'export', text: 'Export' });
    if (ops.exportItems.length === 0) {
      exportMenu.addAction({ id: 'none', text: 'Nothing to export yet', enabled: false });
    } else {
      ops.exportItems.forEach((entry, i) => {
        exports.add(
          exportMenu.addAction({ id: `export:${i}`, text: entry.label, onTriggered: entry.run })
        );
      });
    }

    if (ops.viewerUrl) {
      file.addSeparator('s2');
      file.addCustom(
        'viewer',
        <Link href={ops.viewerUrl} target="_blank" rel="noreferrer" variant="body2">
          Open in the viewer
        </Link>
      );
    }
  }, [bar, io, exports, ops]);

  // The name of the open file changes far more often than the menu's shape,
  // and now it costs one property write instead of a new tree.
  useEffect(() => {
    const name = bar.itemById('name');
    if (name instanceof ToolbarCustomItem) {
      name.render.value = (
        <Box
          component="span"
          sx={{ px: 0.5, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {ops?.currentName ?? 'unsaved'}
        </Box>
      );
    }
  }, [bar, ops?.currentName]);

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      {/* `onFileOps` is called on every change of file state, so the menu
                shows the file that is actually open. */}
      <SpenNotesView
        store={store}
        onFileOps={setOps}
        toolbarStart={<MenuBar menubar={bar} aria-label="notes file menu" sx={{ px: 0 }} />}
      />
    </Box>
  );
}
