/**
 * The file dialog for the note store.
 *
 * It comes from `ServerFileBrowser` in `cad-app`, but talks to a `NoteStore`
 * rather than to the cad-backend REST VFS. The difference shows in the
 * interface: buttons for operations the store does not have (`remove`/`rename`/
 * `createDir`) **are not drawn at all**. A greyed-out button would suggest
 * there is a switch somewhere nearby that turns it on; here there simply is no
 * such possibility, and it is better for it not to be visible.
 *
 * File names are shown **without the extension** — the user names a note, and
 * `.notes.json` is a detail of saving that the store appends.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import StorageIcon from '@mui/icons-material/Storage';
import FolderOffOutlinedIcon from '@mui/icons-material/FolderOffOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import HomeIcon from '@mui/icons-material/Home';
import { parentDir, pathIn, type NoteStore } from './store';

export interface FileBrowserProps {
  open: boolean;
  /** `open` = pick a file to load; `save` = pick a directory and a name. */
  mode: 'open' | 'save';
  title: string;
  store: NoteStore;
  /** Extension of the files shown in the list, with the dot. */
  extension: string;
  /** The name suggested in save mode. */
  defaultName?: string;
  /** `localStorage` key remembering the last browsed directory. */
  storageKey?: string;
  onClose: () => void;
  /** `open` mode: load the chosen file. Throwing shows the error in the dialog. */
  onOpen?: (dir: string, name: string) => Promise<void>;
  /** `save` mode: save the file under the chosen name. */
  onSave?: (dir: string, name: string) => Promise<void>;
  /** After a successful open or save. */
  onDone?: (name: string) => void;
  /** Extra buttons in a file's row (e.g. a link to the viewer). */
  rowActions?: (dir: string, name: string) => React.ReactNode;
}

interface Listing {
  dirs: string[];
  files: { name: string; modified: number; size: number }[];
}

const EMPTY: Listing = { dirs: [], files: [] };

const DEFAULT_STORAGE_KEY = 'hestia.cad.fileBrowser.dir';

function dateText(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sizeText(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function FileBrowser({
  open,
  mode,
  title,
  store,
  extension,
  defaultName = '',
  storageKey = DEFAULT_STORAGE_KEY,
  onClose,
  onOpen,
  onSave,
  onDone,
  rowActions,
}: FileBrowserProps) {
  const root = (store.rootDir ?? '').replace(/^\/+|\/+$/g, '');
  const start = store.startDir.replace(/^\/+|\/+$/g, '');

  // The current directory — restored from `localStorage`, never above the root.
  const [dir, setDir] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null && (root === '' || saved === root || saved.startsWith(root + '/'))) {
        return saved;
      }
    } catch {
      // `localStorage` unavailable (private window) — start at the default.
    }
    return start;
  });

  const [listing, setListing] = useState<Listing>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const canRemove = typeof store.remove === 'function';
  const canRename = typeof store.rename === 'function';
  const canCreateDir = typeof store.createDir === 'function';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await store.list(dir);
      const dirs = entries
        .filter((e) => e.directory)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      const files = entries
        .filter((e) => !e.directory && e.name.endsWith(extension))
        .map((e) => ({
          name: e.name.slice(0, -extension.length),
          modified: e.modified ?? 0,
          size: e.size ?? 0,
        }))
        // Newest on top, and when the store gives no time (all zeros) —
        // alphabetically, because the order a backend returns can be
        // arbitrary.
        .sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
      setListing({ dirs, files });
    } catch (e) {
      setError((e as Error).message);
      setListing(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [store, dir, extension]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Transient state is cleared every time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(null);
      setSaveName(defaultName);
      setRenaming(null);
      setNewFolder(false);
      setFolderName('');
      setError(null);
    }
  }, [open, defaultName]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, dir);
    } catch {
      /* so be it */
    }
  }, [dir, storageKey]);

  useEffect(() => {
    if (renaming) setTimeout(() => nameRef.current?.select(), 50);
  }, [renaming]);

  useEffect(() => {
    if (newFolder) setTimeout(() => folderRef.current?.focus(), 50);
  }, [newFolder]);

  // ── navigation ─────────────────────────────────────────────────────────────

  function goTo(target: string) {
    setDir(target);
    setSelected(null);
    setRenaming(null);
    setNewFolder(false);
  }

  /** Path segments below the root — for the breadcrumbs. */
  const segments = useMemo(() => {
    if (dir === root) return [] as string[];
    const rest = root ? dir.slice(root.length + 1) : dir;
    return rest ? rest.split('/') : [];
  }, [dir, root]);

  // ── actions ────────────────────────────────────────────────────────────────

  async function createFolder() {
    const name = folderName.trim();
    if (!name || !store.createDir) return;
    if (/[/\\]/.test(name)) {
      setError('A folder name cannot contain slashes.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.createDir(pathIn(dir, name));
      setNewFolder(false);
      setFolderName('');
      await refresh();
    } catch (e) {
      setError(`Could not create the folder: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(name: string) {
    if (!onOpen) return;
    setBusy(true);
    setError(null);
    try {
      await onOpen(dir, name);
      onDone?.(name);
      onClose();
    } catch (e) {
      setError(`Could not open "${name}": ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const name = saveName.trim();
    if (!name || !onSave) return;

    if (listing.files.some((f) => f.name === name)) {
      if (!window.confirm(`Overwrite the existing file "${name}"?`)) return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave(dir, name);
      onDone?.(name);
      onClose();
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!store.remove) return;
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    try {
      await store.remove(pathIn(dir, name + extension));
      if (selected === name) setSelected(null);
      await refresh();
    } catch (err) {
      setError(`Deleting failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function startRename(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenaming(name);
    setNewName(name);
  }

  async function commitRename(from: string) {
    const to = newName.trim();
    setRenaming(null);
    if (!to || to === from || !store.rename) return;
    setBusy(true);
    try {
      await store.rename(pathIn(dir, from + extension), pathIn(dir, to + extension));
      if (selected === from) setSelected(to);
      if (mode === 'save' && saveName === from) setSaveName(to);
      await refresh();
    } catch (err) {
      setError(`Renaming failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // ── derived state ──────────────────────────────────────────────────────────

  const canConfirm =
    mode === 'open' ? Boolean(selected) && !busy : saveName.trim().length > 0 && !busy;

  const empty = listing.dirs.length === 0 && listing.files.length === 0;
  const canGoUp = parentDir(dir, root) !== null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <StorageIcon fontSize="small" sx={{ color: 'primary.main' }} />
        {title}
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Breadcrumbs
            maxItems={4}
            separator="›"
            sx={{ flex: 1, overflow: 'hidden', '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}
          >
            <Link
              component="button"
              type="button"
              underline="hover"
              color={dir === root ? 'text.primary' : 'inherit'}
              onClick={() => goTo(root)}
              sx={{ display: 'flex', alignItems: 'center', fontSize: 13 }}
            >
              <HomeIcon sx={{ fontSize: 15, mr: 0.5 }} />
              {root || 'notes'}
            </Link>
            {segments.map((segment, i) => {
              const target = pathIn(root, segments.slice(0, i + 1).join('/'));
              const last = i === segments.length - 1;
              return (
                <Link
                  key={target}
                  component="button"
                  type="button"
                  underline="hover"
                  color={last ? 'text.primary' : 'inherit'}
                  onClick={() => goTo(target)}
                  sx={{ fontSize: 13, fontFamily: 'monospace' }}
                >
                  {segment}
                </Link>
              );
            })}
          </Breadcrumbs>
          {canCreateDir && (
            <Button
              size="small"
              startIcon={<CreateNewFolderOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={() => setNewFolder((v) => !v)}
              sx={{ flexShrink: 0, textTransform: 'none' }}
            >
              New folder
            </Button>
          )}
        </Box>

        {newFolder && canCreateDir && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          >
            <FolderIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            <TextField
              inputRef={folderRef}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder();
                if (e.key === 'Escape') {
                  setNewFolder(false);
                  setFolderName('');
                }
              }}
              placeholder="New folder name"
              size="small"
              variant="standard"
              fullWidth
              slotProps={{ input: { sx: { fontSize: 13 } } }}
            />
            <Button
              size="small"
              onClick={() => {
                void createFolder();
              }}
              disabled={!folderName.trim() || busy}
            >
              Create
            </Button>
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                setNewFolder(false);
                setFolderName('');
              }}
            >
              Cancel
            </Button>
          </Box>
        )}

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box
              sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : empty ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 180,
                color: 'text.disabled',
                gap: 1,
              }}
            >
              <FolderOffOutlinedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
              <Typography variant="body2">This folder is empty</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {canGoUp && (
                <ListItemButton
                  onClick={() => goTo(parentDir(dir, root)!)}
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FolderIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        ..
                      </Typography>
                    }
                  />
                </ListItemButton>
              )}

              {listing.dirs.map((name) => (
                <ListItemButton
                  key={`d:${name}`}
                  onClick={() => goTo(pathIn(dir, name))}
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FolderIcon sx={{ fontSize: 18, color: '#ffca28' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {name}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}

              {listing.files.map((p) => (
                <ListItemButton
                  key={`f:${p.name}`}
                  selected={selected === p.name}
                  onDoubleClick={() => mode === 'open' && void openFile(p.name)}
                  onClick={() => {
                    setSelected(p.name);
                    if (mode === 'save') setSaveName(p.name);
                  }}
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <ListItemText
                    primary={
                      renaming === p.name ? (
                        <TextField
                          inputRef={nameRef}
                          value={newName}
                          size="small"
                          variant="standard"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setNewName(e.target.value)}
                          onBlur={() => {
                            void commitRename(p.name);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(p.name);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          sx={{ width: '100%' }}
                          slotProps={{ input: { sx: { fontSize: 13 } } }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {p.name}
                        </Typography>
                      )
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {dateText(p.modified)}
                        {p.size ? `  ·  ${sizeText(p.size)}` : ''}
                      </Typography>
                    }
                  />

                  <Box sx={{ display: 'flex', gap: 0.25, ml: 1, flexShrink: 0 }}>
                    {rowActions?.(dir, p.name)}
                    {canRename && (
                      <Tooltip title="Rename">
                        <IconButton
                          size="small"
                          onClick={(e) => startRename(p.name, e)}
                          disabled={busy}
                        >
                          <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canRemove && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            void remove(p.name, e);
                          }}
                          disabled={busy}
                          color="error"
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        {mode === 'save' && (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <TextField
              label="File name"
              helperText={`Saves into ${dir || '(root)'}`}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) void save();
              }}
              size="small"
              fullWidth
              autoFocus
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography
                        sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}
                      >
                        {extension}
                      </Typography>
                    </InputAdornment>
                  ),
                  sx: { fontFamily: 'monospace', fontSize: 13 },
                },
                formHelperText: { sx: { fontFamily: 'monospace', fontSize: 11 } },
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} size="small" color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canConfirm}
          onClick={
            mode === 'open'
              ? () => {
                  void openFile(selected!);
                }
              : () => {
                  void save();
                }
          }
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          {mode === 'open' ? 'Open' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
