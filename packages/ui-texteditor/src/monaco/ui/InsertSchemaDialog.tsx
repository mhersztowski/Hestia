import { useEffect, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import type { FileSystemProvider } from '@hestia/core';
import { FileType } from '@hestia/core';

export interface InsertSchemaDialogProps {
  open: boolean;
  provider: FileSystemProvider;
  /** Absolute VFS path of the JSON file being edited (the active tab). */
  currentFilePath: string;
  onClose: () => void;
  /** Called with the picked schema path RELATIVE to the current file. */
  onInsert: (relativePath: string) => void;
}

/** Path to `toFile` relative to the directory of `fromFile` (e.g. `../a/b.json`). */
export function relativeFromFile(fromFile: string, toFile: string): string {
  const fromDir = fromFile.slice(0, fromFile.lastIndexOf('/')).split('/').filter(Boolean);
  const to = toFile.split('/').filter(Boolean);
  let i = 0;
  while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i++;
  const up = fromDir.slice(i).map(() => '..');
  const down = to.slice(i);
  const rel = [...up, ...down].join('/');
  if (!rel) return `./${to[to.length - 1] ?? ''}`;
  // Prefix `./` only when staying within the current directory (no `..` ups).
  return up.length ? rel : `./${rel}`;
}

// Scan root: the `…/drive` mount the file lives under, else its directory.
function scanRoot(filePath: string): string {
  const i = filePath.indexOf('/drive/');
  if (i >= 0) return filePath.slice(0, i + '/drive'.length);
  const dir = filePath.slice(0, filePath.lastIndexOf('/'));
  return dir || '/';
}

// Collect every *.schema.json under `root` (depth/budget limited so a huge tree
// can't hang the picker).
async function listSchemaFiles(provider: FileSystemProvider, root: string): Promise<string[]> {
  const out: string[] = [];
  let budget = 1500;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 10 || budget <= 0) return;
    budget--;
    let entries: Awaited<ReturnType<typeof provider.readDirectory>>;
    try { entries = await provider.readDirectory(dir); } catch { return; }
    for (const e of entries) {
      const full = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`;
      if (e.type === FileType.Directory) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        await walk(full, depth + 1);
      } else if (/\.schema\.json$/i.test(e.name)) {
        out.push(full);
      }
    }
  };
  await walk(root, 0);
  return out.sort();
}

// ── Directory tree built from the flat list of file paths ───────────────────
interface TreeNode { name: string; path: string; isFile: boolean; children: Map<string, TreeNode> }

function buildTree(files: string[], root: string): TreeNode {
  const rootNode: TreeNode = { name: '', path: root, isFile: false, children: new Map() };
  for (const full of files) {
    const relParts = (full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full).split('/').filter(Boolean);
    let node = rootNode;
    let acc = root;
    relParts.forEach((seg, i) => {
      acc = `${acc}/${seg}`;
      let child = node.children.get(seg);
      if (!child) { child = { name: seg, path: acc, isFile: i === relParts.length - 1, children: new Map() }; node.children.set(seg, child); }
      node = child;
    });
  }
  return rootNode;
}

interface Row { node: TreeNode; depth: number }
function flattenTree(node: TreeNode, depth: number, collapsed: Set<string>, out: Row[]): void {
  const children = [...node.children.values()].sort((a, b) =>
    (a.isFile !== b.isFile ? (a.isFile ? 1 : -1) : a.name.localeCompare(b.name)));
  for (const c of children) {
    out.push({ node: c, depth });
    if (!c.isFile && !collapsed.has(c.path)) flattenTree(c, depth + 1, collapsed, out);
  }
}

/**
 * Pick a `*.schema.json` from a directory tree of the VFS and insert a `$schema`
 * reference to it, relative to the JSON file being edited.
 */
export function InsertSchemaDialog({ open, provider, currentFilePath, onClose, onInsert }: InsertSchemaDialogProps) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const root = useMemo(() => scanRoot(currentFilePath), [currentFilePath]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFiles(null);
    setFilter('');
    setCollapsed(new Set());
    listSchemaFiles(provider, root)
      .then((f) => { if (!cancelled) setFiles(f); })
      .catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [open, provider, root]);

  const rel = (full: string) => (full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full);
  const filtered = (files ?? []).filter((f) => !filter || rel(f).toLowerCase().includes(filter.toLowerCase()));
  const tree = useMemo(() => buildTree(filtered, root), [filtered, root]);
  // While filtering, expand everything so matches are visible regardless of state.
  const rows = useMemo(() => {
    const out: Row[] = [];
    flattenTree(tree, 0, filter ? new Set<string>() : collapsed, out);
    return out;
  }, [tree, collapsed, filter]);

  const toggle = (p: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const pick = (full: string) => { onInsert(relativeFromFile(currentFilePath, full)); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Insert $schema reference</DialogTitle>
      <DialogContent dividers>
        <TextField
          size="small" fullWidth autoFocus placeholder="Filter *.schema.json…"
          value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mb: 1 }}
        />
        {files === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No matching *.schema.json files.</Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 400, overflow: 'auto' }}>
            {rows.map((r) => (
              <ListItemButton
                key={r.node.path}
                sx={{ pl: 1 + r.depth * 2, py: 0.25 }}
                onClick={() => (r.node.isFile ? pick(r.node.path) : toggle(r.node.path))}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  {r.node.isFile
                    ? <InsertDriveFileIcon sx={{ fontSize: 17 }} color="action" />
                    : (!filter && collapsed.has(r.node.path)
                      ? <FolderIcon sx={{ fontSize: 17 }} color="primary" />
                      : <FolderOpenIcon sx={{ fontSize: 17 }} color="primary" />)}
                </ListItemIcon>
                <ListItemText
                  primary={r.node.name}
                  primaryTypographyProps={{ fontSize: 13, noWrap: true, fontFamily: r.node.isFile ? 'monospace' : undefined }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

export default InsertSchemaDialog;
