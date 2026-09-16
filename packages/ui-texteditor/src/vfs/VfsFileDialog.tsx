import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import type { FileSystemProvider, DirectoryEntry } from '@hestia/core';
import { FileType } from '@hestia/core';
import { getFileIcon } from './icons';

export type VfsFileDialogMode = 'load' | 'save';

export interface VfsFileDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  provider: FileSystemProvider;
  mode: VfsFileDialogMode;
  /** File extensions to show (e.g. ['.mjd']). Directories always shown. */
  extensions?: string[];
  /** Dialog title override */
  title?: string;
  /** Initial directory to browse */
  initialPath?: string;
}

export function VfsFileDialog({
  open,
  onClose,
  onSelect,
  provider,
  mode,
  extensions,
  title,
  initialPath = '/',
}: VfsFileDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Load directory contents
  const loadDirectory = useCallback(
    async (dirPath: string) => {
      setLoading(true);
      setError(null);
      setSelectedFile(null);
      try {
        const raw = await provider.readDirectory(dirPath);
        // Sort: directories first, then files, alphabetically
        const sorted = [...raw].sort((a, b) => {
          if (a.type !== b.type) return a.type === FileType.Directory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        // Filter files by extension if specified
        const filtered = extensions
          ? sorted.filter((e) => {
              if (e.type === FileType.Directory) return true;
              return extensions.some((ext) => e.name.toLowerCase().endsWith(ext.toLowerCase()));
            })
          : sorted;
        setEntries(filtered);
        setCurrentPath(dirPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read directory');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [provider, extensions]
  );

  // Load initial directory when dialog opens
  useEffect(() => {
    if (open) {
      loadDirectory(initialPath);
      setFileName('');
      setSelectedFile(null);
    }
  }, [open, initialPath, loadDirectory]);

  const handleEntryClick = (entry: DirectoryEntry) => {
    const entryPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    if (entry.type === FileType.Directory) {
      loadDirectory(entryPath);
    } else {
      setSelectedFile(entryPath);
      // Set filename from selected file (strip extension for save mode)
      const name = mode === 'save' ? entry.name.replace(/\.[^.]+$/, '') : entry.name;
      setFileName(name);
    }
  };

  const handleNavigateUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parent);
  };

  const handleBreadcrumbClick = (path: string) => {
    loadDirectory(path);
  };

  const handleConfirm = () => {
    if (mode === 'load') {
      if (selectedFile) onSelect(selectedFile);
    } else {
      // Save mode — build full path from current directory + filename
      const name = fileName.trim();
      if (!name) return;
      const ext = extensions?.[0] ?? '';
      const nameWithExt = name.endsWith(ext) ? name : `${name}${ext}`;
      const fullPath = currentPath === '/' ? `/${nameWithExt}` : `${currentPath}/${nameWithExt}`;
      onSelect(fullPath);
    }
  };

  // Build breadcrumb segments
  const pathSegments =
    currentPath === '/'
      ? [{ name: '/', path: '/' }]
      : [
          { name: '/', path: '/' },
          ...currentPath
            .split('/')
            .filter(Boolean)
            .map((seg, i, arr) => ({
              name: seg,
              path: '/' + arr.slice(0, i + 1).join('/'),
            })),
        ];

  const defaultTitle = mode === 'load' ? 'Open File' : 'Save File';
  const confirmLabel = mode === 'load' ? 'Open' : 'Save';
  const canConfirm = mode === 'load' ? !!selectedFile : !!fileName.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title ?? defaultTitle}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 350 }}>
        {/* Breadcrumbs */}
        <Breadcrumbs sx={{ py: 0.5 }}>
          {pathSegments.map((seg, i) =>
            i === pathSegments.length - 1 ? (
              <Typography key={seg.path} variant="body2" color="text.primary">
                {seg.name}
              </Typography>
            ) : (
              <Link
                key={seg.path}
                component="button"
                variant="body2"
                underline="hover"
                onClick={() => handleBreadcrumbClick(seg.path)}
              >
                {seg.name}
              </Link>
            )
          )}
        </Breadcrumbs>

        {/* File list */}
        <Box sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Typography color="error" sx={{ p: 2 }}>
              {error}
            </Typography>
          ) : (
            <List dense disablePadding>
              {currentPath !== '/' && (
                <ListItemButton onClick={handleNavigateUp}>
                  <ListItemIcon sx={{ minWidth: 28 }}>{getFileIcon('..', true)}</ListItemIcon>
                  <ListItemText primary=".." />
                </ListItemButton>
              )}
              {entries.map((entry) => {
                const entryPath =
                  currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
                const isDir = entry.type === FileType.Directory;
                return (
                  <ListItemButton
                    key={entry.name}
                    selected={entryPath === selectedFile}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => {
                      if (isDir) return; // single click already navigates dirs
                      if (mode === 'load') {
                        onSelect(entryPath);
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {getFileIcon(entry.name, isDir)}
                    </ListItemIcon>
                    <ListItemText primary={entry.name} />
                  </ListItemButton>
                );
              })}
              {entries.length === 0 && !loading && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Empty directory
                </Typography>
              )}
            </List>
          )}
        </Box>

        {/* Filename input for save mode */}
        {mode === 'save' && (
          <TextField
            label="File name"
            size="small"
            fullWidth
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm) handleConfirm();
            }}
            helperText={extensions ? `Extension: ${extensions.join(', ')}` : undefined}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
