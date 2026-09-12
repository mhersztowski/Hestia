/**
 * CodeFilePickerDialog — wybór PLIKU ŹRÓDŁOWEGO z drzewa drive (podkatalogi),
 * filtrowany do rozszerzeń kodu (.js/.ts/.cpp/.ino/.py/.h/…). Zwraca ścieżkę pliku.
 * Używany przez blok kodu w edytorze Markdown do osadzenia zewnętrznego przykładu.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Typography, Box, List, ListItemButton,
  ListItemIcon, ListItemText, TextField, InputAdornment, CircularProgress, Collapse,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import CodeIcon from '@mui/icons-material/Code';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useEditorFiles } from '../capabilities';
import type { DirectoryTree } from '@hestia/core';

/** Rozszerzenia plików źródłowych pokazywanych w pickerze. */
const CODE_EXTS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'ino', 'pde',
  'py', 'rs', 'go', 'java', 'kt', 'swift',
  'sh', 'bash', 'zsh', 'ps1',
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'env',
  'sql', 'css', 'scss', 'html', 'htm', 'xml', 'svg',
  'md', 'markdown', 'txt', 'cmake', 'make', 'mk',
]);

/** Mapa rozszerzenie → język (wartość dla highlight.js / selektora bloku). */
const EXT_TO_LANG: Record<string, string> = {
  ino: 'cpp', pde: 'cpp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp',
  c: 'c',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', env: 'ini',
  sql: 'sql', css: 'css', scss: 'css',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  md: 'markdown', markdown: 'markdown',
  cmake: 'cmake', make: 'makefile', mk: 'makefile',
};

/** Zwraca język na podstawie ścieżki pliku (dla auto-ustawienia typu bloku). */
export function langFromPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return EXT_TO_LANG[ext] || '';
}

interface TreeNode { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[]; }

function pruneByExt(tree: DirectoryTree, allowed: Set<string>): TreeNode | null {
  if (tree.type === 'file') {
    const ext = (tree.name.split('.').pop() || '').toLowerCase();
    return allowed.has(ext) && !tree.name.startsWith('.')
      ? { name: tree.name, path: tree.path, type: 'file' }
      : null;
  }
  const children = (tree.children ?? [])
    .map(child => pruneByExt(child, allowed))
    .filter((n): n is TreeNode => n !== null)
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  if (children.length === 0) return null;
  return { name: tree.name || tree.path.split('/').pop() || '/', path: tree.path, type: 'dir', children };
}

function filterTree(node: TreeNode, q: string): TreeNode | null {
  if (node.type === 'file') {
    return (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) ? node : null;
  }
  const kids = (node.children ?? []).map((c) => filterTree(c, q)).filter((n): n is TreeNode => n !== null);
  return kids.length ? { ...node, children: kids } : null;
}

const TreeRows: React.FC<{
  nodes: TreeNode[]; depth: number; expanded: Set<string>;
  toggle: (path: string) => void; forceOpen: boolean; onPick: (path: string) => void;
}> = ({ nodes, depth, expanded, toggle, forceOpen, onPick }) => (
  <>
    {nodes.map((node) => {
      const isOpen = forceOpen || expanded.has(node.path);
      if (node.type === 'dir') {
        return (
          <React.Fragment key={node.path}>
            <ListItemButton onClick={() => toggle(node.path)} sx={{ pl: 1 + depth * 2 }} dense>
              <ListItemIcon sx={{ minWidth: 26 }}>
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 30 }}>
                {isOpen ? <FolderOpenIcon fontSize="small" color="action" /> : <FolderIcon fontSize="small" color="action" />}
              </ListItemIcon>
              <ListItemText primary={node.name} />
            </ListItemButton>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <TreeRows nodes={node.children ?? []} depth={depth + 1} expanded={expanded} toggle={toggle} forceOpen={forceOpen} onPick={onPick} />
            </Collapse>
          </React.Fragment>
        );
      }
      return (
        <ListItemButton key={node.path} onClick={() => onPick(node.path)} sx={{ pl: 1 + depth * 2 }} dense>
          <ListItemIcon sx={{ minWidth: 26 }} />
          <ListItemIcon sx={{ minWidth: 30 }}><CodeIcon fontSize="small" color="action" /></ListItemIcon>
          <ListItemText primary={node.name} secondary={node.path.replace(/^drive\//, '')} />
        </ListItemButton>
      );
    })}
  </>
);

export interface CodeFilePickerDialogProps {
  open: boolean;
  selectedPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
  /** Rozszerzenia (bez kropki) pokazywane w drzewie. Domyślnie pliki źródłowe. */
  extensions?: string[];
  /** Nagłówek okna — domyślnie „Wybierz plik źródłowy". */
  title?: string;
  /** Podpowiedź w polu filtra. */
  filterHint?: string;
  /** Komunikat, gdy drzewo nie ma żadnego pasującego pliku. */
  emptyHint?: string;
}

const CodeFilePickerDialog: React.FC<CodeFilePickerDialogProps> = ({
  open, onClose, onSelect, extensions, title, filterHint, emptyHint,
}) => {
  const { listDirectory } = useEditorFiles() ?? {};
  const allowed = useMemo(
    () => (extensions ? new Set(extensions.map(e => e.replace(/^\./, '').toLowerCase())) : CODE_EXTS),
    [extensions],
  );
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true); setFilter(''); setExpanded(new Set());
    if (!listDirectory) return;
    listDirectory('/')
      .then((tree) => {
        const pruned = pruneByExt(tree, allowed);
        const drive = pruned?.children?.find((c) => c.type === 'dir' && c.name === 'drive');
        setRoot(drive ?? pruned);
      })
      .catch(() => setRoot(null))
      .finally(() => setLoading(false));
  }, [open, listDirectory, allowed]);

  const toggle = (path: string) =>
    setExpanded((prev) => { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next; });

  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!root) return [] as TreeNode[];
    if (!q) return root.children ?? [];
    return filterTree(root, q)?.children ?? [];
  }, [root, q]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CodeIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>{title ?? 'Wybierz plik źródłowy'}</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth size="small" autoFocus
            placeholder={filterHint ?? 'Filtruj pliki (.js, .cpp, .ino, .py…)'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }}
          />
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} /></Box>
        ) : visible.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            {root ? 'Brak dopasowań do filtru.' : (emptyHint ?? 'Brak plików źródłowych w drive.')}
          </Box>
        ) : (
          <List sx={{ maxHeight: 420, overflow: 'auto' }} dense disablePadding>
            <TreeRows nodes={visible} depth={0} expanded={expanded} toggle={toggle} forceOpen={!!q} onPick={(p) => { onSelect(p); onClose(); }} />
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CodeFilePickerDialog;
