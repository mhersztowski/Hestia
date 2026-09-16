/**
 * MdFilePickerDialog — modal that lists every `.md` file in the user's
 * drive and lets the caller pick one. Used by InfoMarkDialog to source
 * popup-body content from a file rather than typing it inline.
 *
 * Implementation is intentionally close to `FormEngineExtension`'s
 * FormFilePicker (different file filter, same MQTT listDirectory walk +
 * search filter UI). Kept as a standalone component because other extensions
 * (and possibly future plugins) will want to pick markdown files too.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import { useEditorFiles } from '../capabilities';
import type { DirectoryTree } from '@hestia/core';

export interface MdFilePickerDialogProps {
  open: boolean;
  /** Currently-selected path so the right row highlights when reopening
   *  the picker for an existing infomark. */
  selectedPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

/** Recursive walker that flattens the directory tree into a path list,
 *  keeping only files whose name ends in `.md`. We skip hidden files
 *  (those starting with `.`) — those are sidecars (`.fileproperties.json`,
 *  `.favorites.json`) that don't make sense as content sources. */
function collectMdFiles(tree: DirectoryTree): string[] {
  if (tree.type === 'file') {
    return tree.name.endsWith('.md') && !tree.name.startsWith('.') ? [tree.path] : [];
  }
  return (tree.children ?? []).flatMap(collectMdFiles);
}

const MdFilePickerDialog: React.FC<MdFilePickerDialogProps> = ({
  open,
  selectedPath,
  onClose,
  onSelect,
}) => {
  const { listDirectory } = useEditorFiles() ?? {};
  const [files, setFiles] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Reload on every open — drive contents change frequently enough that
  // caching across opens would surprise users. Walk from root so the
  // picker shows every .md the user has, not just files in a sub-tree.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFilter('');
    if (!listDirectory) return;
    listDirectory('/')
      .then((tree) => setFiles(collectMdFiles(tree).sort()))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open, listDirectory]);

  // Memoise filter so typing in the search box doesn't re-sort the whole
  // file list on every keystroke.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, filter]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DescriptionIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Wybierz plik MD
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Search field — full width, autofocus so user can start typing
            immediately after the picker opens. Bare contains-search is
            enough at this scale; if drive grows to thousands of .md files
            we'd add fuzzy / path-segment match. */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder="Szukaj (po nazwie lub ścieżce)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            {files.length === 0 ? 'Brak plików .md w drive.' : 'Brak dopasowań do filtru.'}
          </Box>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }} dense>
            {filtered.map((f) => (
              <ListItemButton
                key={f}
                selected={f === selectedPath}
                onClick={() => {
                  onSelect(f);
                  onClose();
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <DescriptionIcon
                    fontSize="small"
                    color={f === selectedPath ? 'primary' : 'action'}
                  />
                </ListItemIcon>
                {/* Primary = filename (visual scan target). Secondary =
                    full path so two files with the same name in different
                    folders are distinguishable. */}
                <ListItemText primary={f.split('/').pop()} secondary={f} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MdFilePickerDialog;
