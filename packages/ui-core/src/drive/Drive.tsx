/**
 * The drive: a file list on the left, what the file is on the right.
 *
 * MyCastle's Drive page brought along everything the application could do to a
 * file — Monaco with its plugins, the AI agent, the Markdown editor, the JSON
 * form editor, the git panel, project builds. This is the part underneath all
 * of that: walking the tree, the ordinary file operations, and **seeing** what
 * a file holds. Editing belongs to whoever needs it and can arrive later as a
 * slot; carrying an editor for pages that only ever look at a file would cost
 * every one of them the whole of Monaco.
 *
 * Where the files are is the host's business — see `DriveStore`. The component
 * asks for a listing and draws it; it never learns what is underneath.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FolderIcon from '@mui/icons-material/Folder';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  baseName,
  breadcrumbs,
  dataUrl,
  formatSize,
  imageMimeType,
  kindOf,
  parentDir,
  pathIn,
  safeName,
  sortEntries,
  type DriveEntry,
  type DriveStore,
} from './store';

export interface DriveProps {
  store: DriveStore;
  /** Opening a file the drive cannot show itself — a host may take it elsewhere. */
  onOpenFile?: (path: string, entry: DriveEntry) => void;
  /** Rendered at the start of the toolbar. */
  toolbarStart?: ReactNode;
  /** How wide the file list is. The preview takes the rest. */
  listWidth?: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What the preview is showing, or why it is not. */
type Preview =
  | { state: 'empty' }
  | { state: 'loading'; path: string }
  | { state: 'text'; path: string; text: string }
  | { state: 'image'; path: string; src: string }
  | { state: 'pdf'; path: string; src: string }
  | { state: 'none'; path: string; reason: string }
  | { state: 'error'; path: string; reason: string };

export function Drive({ store, onOpenFile, toolbarStart, listWidth = 280 }: DriveProps) {
  const [dir, setDir] = useState(store.startDir ?? '');
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: 'empty' });
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entry: DriveEntry } | null>(null);
  const [renaming, setRenaming] = useState<{ entry: DriveEntry; value: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        setEntries(sortEntries(await store.list(target)));
      } catch (e) {
        // A directory that is not there yet is empty; anything else is worth
        // saying, because an empty list would read as "you have nothing here".
        setEntries([]);
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [store]
  );

  useEffect(() => {
    void refresh(dir);
  }, [dir, refresh]);
  // A new store is a different drive: go back to where it says it starts.
  useEffect(() => {
    setDir(store.startDir ?? '');
    setSelected(null);
    setPreview({ state: 'empty' });
  }, [store]);

  const show = useCallback(
    async (entry: DriveEntry) => {
      const path = pathIn(dir, entry.name);
      setSelected(path);
      const kind = kindOf(entry.name);
      if (kind === 'other') {
        setPreview({
          state: 'none',
          path,
          reason: 'The drive has no preview for this kind of file.',
        });
        return;
      }
      setPreview({ state: 'loading', path });
      try {
        if (kind === 'text') {
          setPreview({ state: 'text', path, text: await store.read(path) });
          return;
        }
        if (!store.readBytes) {
          setPreview({
            state: 'none',
            path,
            reason: 'This store does not hand out file bytes, so there is nothing to draw.',
          });
          return;
        }
        const bytes = await store.readBytes(path);
        const src = dataUrl(bytes, kind === 'pdf' ? 'application/pdf' : imageMimeType(entry.name));
        setPreview({ state: kind, path, src });
      } catch (e) {
        setPreview({ state: 'error', path, reason: message(e) });
      }
    },
    [dir, store]
  );

  const openEntry = (entry: DriveEntry) => {
    if (entry.directory) {
      setDir(pathIn(dir, entry.name));
      setSelected(null);
      setPreview({ state: 'empty' });
      return;
    }
    void show(entry);
    onOpenFile?.(pathIn(dir, entry.name), entry);
  };

  const newFolder = async () => {
    if (!store.createDir) return;
    const name = window.prompt('Folder name');
    if (!name) return;
    try {
      await store.createDir(pathIn(dir, safeName(name)));
      await refresh(dir);
    } catch (e) {
      setToast(`Could not create the folder: ${message(e)}`);
    }
  };

  const newFile = async () => {
    if (!store.write) return;
    const name = window.prompt('File name', 'notes.md');
    if (!name) return;
    try {
      await store.write(pathIn(dir, safeName(name)), '');
      await refresh(dir);
    } catch (e) {
      setToast(`Could not create the file: ${message(e)}`);
    }
  };

  const remove = async (entry: DriveEntry) => {
    if (!store.remove) return;
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    const path = pathIn(dir, entry.name);
    try {
      await store.remove(path);
      if (selected === path) {
        setSelected(null);
        setPreview({ state: 'empty' });
      }
      await refresh(dir);
    } catch (e) {
      setToast(`Could not delete: ${message(e)}`);
    }
  };

  const commitRename = async () => {
    if (!renaming || !store.rename) return;
    const { entry, value } = renaming;
    setRenaming(null);
    const to = safeName(value);
    if (!to || to === entry.name) return;
    try {
      await store.rename(pathIn(dir, entry.name), pathIn(dir, to));
      await refresh(dir);
    } catch (e) {
      setToast(`Could not rename: ${message(e)}`);
    }
  };

  const trail = useMemo(() => breadcrumbs(dir), [dir]);
  const iconFor = (entry: DriveEntry) => {
    if (entry.directory) return <FolderIcon fontSize="small" color="primary" />;
    const kind = kindOf(entry.name);
    if (kind === 'image') return <ImageIcon fontSize="small" color="action" />;
    if (kind === 'pdf') return <PictureAsPdfIcon fontSize="small" color="action" />;
    return <InsertDriveFileIcon fontSize="small" color="action" />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          flexShrink: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {toolbarStart}
        <Tooltip title="Up one level">
          <span>
            <IconButton size="small" disabled={!dir} onClick={() => setDir(parentDir(dir))}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => void refresh(dir)}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* A store that cannot create gets no button for it: one that always
                    ends in an error promises something that will not happen. */}
        {store.createDir && (
          <Tooltip title="New folder">
            <IconButton size="small" onClick={() => void newFolder()}>
              <CreateNewFolderIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {store.write && (
          <Tooltip title="New file">
            <IconButton size="small" onClick={() => void newFile()}>
              <NoteAddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Breadcrumbs sx={{ ml: 1, fontSize: 13, minWidth: 0, '& ol': { flexWrap: 'nowrap' } }}>
          {trail.map((step, i) =>
            i === trail.length - 1 ? (
              <Typography key={step.path} variant="body2" color="text.primary" noWrap>
                {step.label}
              </Typography>
            ) : (
              <Link
                key={step.path}
                component="button"
                underline="hover"
                variant="body2"
                onClick={() => setDir(step.path)}
              >
                {step.label}
              </Link>
            )
          )}
        </Breadcrumbs>
        {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* The listing */}
        <Box
          sx={{
            width: listWidth,
            flexShrink: 0,
            overflow: 'auto',
            borderRight: '1px solid',
            borderColor: 'divider',
          }}
        >
          {error && (
            <Alert severity="error" sx={{ m: 1 }}>
              {error}
            </Alert>
          )}
          {!loading && !error && entries.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
              This folder is empty.
            </Typography>
          )}
          <List dense disablePadding>
            {entries.map((entry) => {
              const path = pathIn(dir, entry.name);
              const isRenaming = renaming?.entry.name === entry.name;
              return (
                <ListItemButton
                  key={entry.name}
                  selected={selected === path}
                  onClick={() => openEntry(entry)}
                  sx={{ pr: 5 }}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>{iconFor(entry)}</ListItemIcon>
                  {isRenaming ? (
                    <TextField
                      size="small"
                      autoFocus
                      fullWidth
                      variant="standard"
                      value={renaming.value}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenaming({ entry, value: e.target.value })}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <ListItemText
                      primary={entry.name}
                      secondary={entry.directory ? undefined : formatSize(entry.size)}
                      primaryTypographyProps={{ noWrap: true, fontSize: 13 }}
                      secondaryTypographyProps={{ fontSize: 11 }}
                    />
                  )}
                  {(store.rename || store.remove) && !isRenaming && (
                    <IconButton
                      size="small"
                      sx={{ position: 'absolute', right: 4 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu({ anchor: e.currentTarget, entry });
                      }}
                    >
                      <MoreVertIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </ListItemButton>
              );
            })}
          </List>
        </Box>

        {/* What the file holds */}
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }}>
          <PreviewPane preview={preview} store={store} />
        </Box>
      </Box>

      <Menu anchorEl={menu?.anchor ?? null} open={!!menu} onClose={() => setMenu(null)}>
        {store.urlFor && menu && !menu.entry.directory && (
          <MenuItem
            component="a"
            href={store.urlFor(pathIn(dir, menu.entry.name)) ?? undefined}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenu(null)}
          >
            <ListItemIcon>
              <OpenInNewIcon fontSize="small" />
            </ListItemIcon>
            Open in a tab
          </MenuItem>
        )}
        {store.rename && menu && (
          <MenuItem
            onClick={() => {
              setRenaming({ entry: menu.entry, value: menu.entry.name });
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <DriveFileRenameOutlineIcon fontSize="small" />
            </ListItemIcon>
            Rename
          </MenuItem>
        )}
        {store.remove &&
          menu && [
            <Divider key="sep" />,
            <MenuItem
              key="delete"
              onClick={() => {
                const entry = menu.entry;
                setMenu(null);
                void remove(entry);
              }}
            >
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" color="error" />
              </ListItemIcon>
              Delete
            </MenuItem>,
          ]}
      </Menu>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity="error" variant="filled" onClose={() => setToast(null)}>
            {toast}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

function PreviewPane({ preview, store }: { preview: Preview; store: DriveStore }) {
  if (preview.state === 'empty') {
    return <Centre>Pick a file to see what is in it.</Centre>;
  }
  if (preview.state === 'loading') {
    return (
      <Centre>
        <CircularProgress size={22} />
      </Centre>
    );
  }
  if (preview.state === 'error') {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Could not read {baseName(preview.path)}: {preview.reason}
      </Alert>
    );
  }
  if (preview.state === 'none') {
    const url = store.urlFor?.(preview.path);
    return (
      <Centre>
        <Typography variant="body2" color="text.secondary" align="center">
          {preview.reason}
        </Typography>
        {url && (
          <Link href={url} target="_blank" rel="noreferrer" variant="body2" sx={{ mt: 1 }}>
            Open it in a tab
          </Link>
        )}
      </Centre>
    );
  }
  if (preview.state === 'image') {
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <Box
          component="img"
          src={preview.src}
          alt={baseName(preview.path)}
          sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </Box>
    );
  }
  if (preview.state === 'pdf') {
    // An `<object>` rather than an `<iframe>`: a browser with no PDF viewer
    // falls through to the children instead of showing a blank frame.
    return (
      <Box
        component="object"
        data={preview.src}
        type="application/pdf"
        sx={{ width: '100%', height: '100%', minHeight: 320, border: 0 }}
      >
        <Centre>This browser will not show a PDF here.</Centre>
      </Box>
    );
  }
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {preview.text}
    </Box>
  );
}

function Centre({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        p: 2,
        color: 'text.secondary',
        fontSize: 13,
      }}
    >
      {children}
    </Box>
  );
}
