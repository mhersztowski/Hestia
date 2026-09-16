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
 * It is a `MenuBar` from `@hestia/ui-core`, built once as objects and then kept.
 * What changes at run time is written to the `Action`s: `busy` greys the entries
 * out, and the list of saved files refills one submenu. Nothing else is touched
 * — the menu the user has open does not get rebuilt underneath them because a
 * save finished.
 *
 * Being a menu bar rather than a toolbar buys two things: the bar itself holds
 * which menu is open (so moving along it moves the opening, and the page can
 * shut it), and `Ctrl+S` beside "Save" is bound rather than merely printed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Typography,
} from '@mui/material';
import {
  ActionCollection,
  MenuBar,
  MenuBarObject,
  addModel,
  useShortcuts,
  type ToolbarNode,
  type WorkspaceObject,
} from '@hestia/ui-core';
import {
  displayName,
  fileNameFor,
  listFiles,
  readFile,
  removeFile,
  writeFile,
  type CadKind,
} from './cadFiles';

export interface CadFileBarProps {
  kind: CadKind;
  /** The current contents, as the page would save them now. */
  read: () => string;
  /** Loads contents into the page — opening a file, or emptying it for a new one. */
  apply: (content: string | null) => void;
  /** The page's own entries, added after the file menu. */
  extra?: ToolbarNode[];
  /**
   * The shell's workspace. Given one, the page puts its saved files in a panel
   * of their own as well — the same list the "Open" submenu holds, from the
   * same state, for somebody who would rather keep it open than go through a
   * menu each time.
   */
  workspace?: WorkspaceObject;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One array, so an empty `extra` does not look like a new one on every render. */
const NO_EXTRA: ToolbarNode[] = [];

export function CadFileBar({ kind, read, apply, extra = NO_EXTRA, workspace }: CadFileBarProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [file, setFile] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(
    null
  );

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles(kind));
    } catch (e) {
      setToast({ msg: `Could not list the files: ${message(e)}`, sev: 'error' });
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (target: string) => {
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
    },
    [kind, apply]
  );

  const save = useCallback(
    async (target: string) => {
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
    },
    [kind, read, refresh]
  );

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

  /**
   * The menu's shape never changes, so it is built once. Only the file list
   * inside "Open" is filled later, and only the enabled states move.
   *
   * Every entry is also a member of one collection: these are the file
   * commands, the kind that cannot be used while one of them is in flight.
   * Saying that once is what lets `busy` be a single line below instead of a
   * list of ids that has to be kept in step with the menu.
   */
  const { bar, io } = useMemo(() => {
    const toolbar = new MenuBarObject({ objectName: 'file bar', scrollable: false });
    const file = toolbar.addMenu({ id: 'file', text: 'File' });
    const collection = new ActionCollection('io', toolbar, { title: 'File' });

    collection.addAll([
      file.addAction({ id: 'new', text: 'New' }),
      file.addMenu({ id: 'open', text: 'Open' }),
    ]);
    file.addSeparator('s1');
    collection.addAll([
      file.addAction({ id: 'save', text: 'Save', shortcut: 'Ctrl+S' }),
      file.addAction({ id: 'saveAs', text: 'Save as…' }),
    ]);
    file.addSeparator('s2');
    collection.addAll([
      file.addAction({ id: 'delete', text: 'Delete' }),
      file.addAction({ id: 'refresh', text: 'Refresh the list' }),
    ]);

    // Choosing anything shuts the menu, as a menu bar does everywhere.
    toolbar.closeOnTrigger();
    return { bar: toolbar, io: collection };
  }, []);
  useEffect(() => () => bar.destroy(), [bar]);

  // The shortcuts the menu prints now do something: the bar knows which action
  // each one belongs to, so one listener binds them all.
  useShortcuts(bar);

  useEffect(() => {
    const conn = bar.actionTriggered.connect((action) => {
      if (action.id.startsWith('open:')) {
        void open(action.id.slice('open:'.length));
        return;
      }
      switch (action.id) {
        case 'new':
          startNew();
          break;
        case 'save':
          if (file) void save(file);
          else saveAs();
          break;
        case 'saveAs':
          saveAs();
          break;
        case 'delete':
          void remove();
          break;
        case 'refresh':
          void refresh();
          break;
        default:
          break;
      }
    });
    return () => conn.disconnect();
  }, [bar, file, open, refresh, remove, save, saveAs, startNew]);

  // While something is in flight the menu is greyed rather than hidden: an
  // entry that vanishes mid-click is worse than one that waits.
  //
  // The collection speaks for the kind and knows nothing about the exceptions,
  // so the one rule that is about a single command comes after it — the other
  // way round and the collection would undo it.
  useEffect(() => {
    io.setEnabled(!busy);
    const del = io.byId('delete')!;
    // Nothing open is not an error worth a dialog — the entry simply has
    // nothing to act on, and says so on hover.
    del.enabled.value = !busy && file !== '';
    del.tooltip.value = file ? undefined : 'Nothing open to delete';
  }, [io, busy, file]);

  // The directory listing is the one branch built from data, so it is the one
  // branch rebuilt when the data changes.
  useEffect(() => {
    const openMenu = bar.actionById('open')!;
    openMenu.clearItems();
    if (files.length === 0) {
      // An empty submenu would not open at all, and a menu entry that does
      // nothing when clicked is worse than one that says why.
      openMenu.addAction({ id: 'none', text: 'Nothing saved yet', enabled: false });
      return;
    }
    for (const f of files) openMenu.addAction({ id: `open:${f}`, text: displayName(kind, f) });
  }, [bar, files, kind]);

  // The page's own entries, in plain form as they always were.
  useEffect(() => {
    for (const entry of bar.items) if (entry.id !== 'file') entry.destroy();
    addModel(bar, extra);
  }, [bar, extra]);

  // The same list as a panel. It is added on mount and destroyed on unmount,
  // and the workspace's View menu follows it both ways.
  const panelId = `${kind}-files`;
  useEffect(() => {
    if (!workspace) return;
    const panel = workspace.addPanel({
      id: panelId,
      title: kind === 'drawing' ? 'Drawings' : 'Models',
      area: 'left',
      size: 220,
      visible: false,
    });
    return () => panel.destroy();
  }, [workspace, panelId, kind]);

  useEffect(() => {
    const panel = workspace?.panelById(panelId);
    if (!panel) return;
    panel.content.value = (
      <List dense disablePadding>
        {files.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1.5 }}>
            Nothing saved yet.
          </Typography>
        )}
        {files.map((f) => (
          <ListItemButton
            key={f}
            dense
            selected={f === file}
            disabled={busy}
            onClick={() => {
              void open(f);
            }}
          >
            <ListItemText
              primary={displayName(kind, f)}
              primaryTypographyProps={{ variant: 'body2', noWrap: true }}
            />
          </ListItemButton>
        ))}
      </List>
    );
  }, [workspace, panelId, kind, files, file, busy, open]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 0 }}>
      {/* Nested inside the editor's bar, so this one brings no border and
                no scrolling of its own — the bar around it does both. */}
      <MenuBar menubar={bar} aria-label={`${kind} file menu`} sx={{ px: 0 }} />
      {busy && <CircularProgress size={16} sx={{ mx: 1 }} />}
      <Typography variant="caption" color="text.secondary" sx={{ px: 1, whiteSpace: 'nowrap' }}>
        {file ? displayName(kind, file) : 'unsaved'}
      </Typography>

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.sev} variant="filled" onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
