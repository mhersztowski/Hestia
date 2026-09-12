/**
 * The editor's dialogs: picking files and directories through the store,
 * previewing a file, committing, the history, the visual diff, opening a
 * codemap, and adding an output file.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import {
  Alert, Box, Breadcrumbs, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Link, List, ListItem, ListItemButton, ListItemIcon, ListItemText, MenuItem,
  Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CloseIcon from '@mui/icons-material/Close';
import CommitIcon from '@mui/icons-material/Commit';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import RestoreIcon from '@mui/icons-material/Restore';
import SchemaIcon from '@mui/icons-material/Schema';
import { branchLog, type CodemapHistory, type UmlDiagram } from '@hestia/node-devtools/format';
import { DIFF_EDGE_TYPES, DIFF_NODE_TYPES, UmlMarkerDefs } from './canvas';
import { DIFF_COLOR, buildDiff, type DiffNodeData } from './diff';
import { outputKind } from './generate';
import { KIND_META } from './model';
import { codemapDisplayName, pathIn, sortEntries, type CodemapStore, type StoreEntry, type StoreRoot } from './store';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── File / directory picker ──────────────────────────────────────────────────

const DEFAULT_ROOTS: StoreRoot[] = [{ label: 'Files', path: '' }];

/** `path` relative to `root` (both store paths). */
function relativeTo(root: string, path: string): string {
  const r = root.replace(/^\/+|\/+$/g, '');
  const p = path.replace(/^\/+|\/+$/g, '');
  if (!r) return p;
  return p === r ? '' : p.startsWith(`${r}/`) ? p.slice(r.length + 1) : p;
}

/**
 * Picks a directory — or, in `dir` mode, a set of files in one directory — or a
 * single file, through the store. The store's `roots` become tabs.
 *
 * In `dir` mode an empty selection means "the whole directory", so the usual
 * way of working needs no extra clicks, and ticking files narrows the diagram
 * down to the chosen classes. The chosen files go out relative to the
 * directory; the host's sync checks they do not leave it.
 */
export function FilePickerDialog({ open, store, mode, title, onPick, onClose }: {
  open: boolean; store: CodemapStore; mode: 'dir' | 'file'; title: string;
  onPick: (path: string, files?: string[]) => void; onClose: () => void;
}) {
  const roots = store.roots?.length ? store.roots : DEFAULT_ROOTS;
  const [rootIdx, setRootIdx] = useState(0);
  const root = roots[Math.min(rootIdx, roots.length - 1)];
  const [cwd, setCwd] = useState(root.path);
  const [entries, setEntries] = useState<StoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ticked files, as store paths. */
  const [checked, setChecked] = useState<string[]>([]);
  const toggleFile = (path: string) => setChecked((prev) => (prev.includes(path) ? prev.filter((f) => f !== path) : [...prev, path]));

  const load = useCallback(async (dir: string) => {
    setLoading(true); setError(null); setCwd(dir);
    try { setEntries(sortEntries(await store.list(dir))); }
    catch (e) { setEntries([]); setError(message(e)); }
    finally { setLoading(false); }
  }, [store]);
  const firstRoot = roots[0].path;
  useEffect(() => { if (open) { setRootIdx(0); setChecked([]); void load(firstRoot); } }, [open, load, firstRoot]);

  // Files ticked in one tree mean nothing in another — switching clears them.
  const switchRoot = (i: number) => { setRootIdx(i); setChecked([]); void load(roots[i].path); };

  const rel = relativeTo(root.path, cwd);
  const parts = rel ? rel.split('/') : [];
  const partPath = (i: number) => pathIn(root.path, parts.slice(0, i + 1).join('/'));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 320 }}>
        {roots.length > 1 && (
          <Tabs value={Math.min(rootIdx, roots.length - 1)} onChange={(_, v: number) => switchRoot(v)}
            sx={{ mb: 1, minHeight: 34, '& .MuiTab-root': { minHeight: 34, textTransform: 'none' } }}>
            {roots.map((r, i) => <Tab key={r.path || i} value={i} label={r.label} />)}
          </Tabs>
        )}
        <Breadcrumbs sx={{ mb: 1 }}>
          <Link component="button" underline="hover" onClick={() => void load(root.path)}>{root.label}</Link>
          {parts.map((p, i) => <Link key={i} component="button" underline="hover" onClick={() => void load(partPath(i))}>{p}</Link>)}
        </Breadcrumbs>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box> : (
          <List dense>
            {entries.length === 0 && !error && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>Empty directory.</Typography>}
            {entries.map((e) => {
              const child = pathIn(cwd, e.name);
              return (
                <ListItem
                  key={e.name}
                  disablePadding
                  // In directory mode files get a checkbox: pick the directory
                  // as a whole, or narrow it down to particular files.
                  secondaryAction={!e.directory && mode === 'dir' ? (
                    <Checkbox edge="end" size="small" checked={checked.includes(child)} onChange={() => toggleFile(child)} />
                  ) : undefined}
                >
                  <ListItemButton
                    onClick={() => {
                      if (e.directory) void load(child);
                      else if (mode === 'file') { onPick(child); onClose(); }
                      else toggleFile(child);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>{e.directory ? <FolderIcon fontSize="small" color="primary" /> : <InsertDriveFileIcon fontSize="small" />}</ListItemIcon>
                    <ListItemText primary={e.name} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'dir' && checked.length > 0 && (
          <>
            <Typography variant="caption" sx={{ mr: 'auto', ml: 1, color: 'text.secondary' }}>{checked.length} selected</Typography>
            <Button onClick={() => setChecked([])}>Clear</Button>
            <Button
              variant="contained"
              onClick={() => {
                const base = cwd ? `${cwd}/` : '';
                onPick(cwd, checked.map((f) => (f.startsWith(base) ? f.slice(base.length) : f)));
                onClose();
              }}
            >
              Use selected ({checked.length})
            </Button>
          </>
        )}
        {mode === 'dir' && checked.length === 0 && (
          <Button variant="contained" onClick={() => { onPick(cwd); onClose(); }}>
            Choose: {root.label}{rel ? `/${rel}` : ''}
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

export function FilePreviewDialog({ open, store, path, onClose }: { open: boolean; store: CodemapStore; path: string | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !path) return;
    let live = true;
    setLoading(true); setText(null); setError(null);
    store.read(path)
      .then((t) => { if (live) setText(t); })
      .catch((e: unknown) => { if (live) setError(message(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, path, store]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontFamily: 'monospace', fontSize: 14 }}>{path}</DialogTitle>
      <DialogContent dividers>
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          : error !== null ? <Typography color="error">Could not read the file: {error}</Typography>
          : <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Box>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ── Commit and history ───────────────────────────────────────────────────────

export function CommitDialog({ open, canCommit, onCommit, onClose }: { open: boolean; canCommit: boolean; onCommit: (msg: string) => void; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) setMsg(''); }, [open]);
  const submit = () => { if (msg.trim() && canCommit) { onCommit(msg.trim()); onClose(); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New commit</DialogTitle>
      <DialogContent>
        {!canCommit && <Alert severity="info" sx={{ mb: 1 }}>Nothing has changed since the last commit.</Alert>}
        <TextField autoFocus fullWidth size="small" sx={{ mt: 1 }} label="What changed" value={msg}
          onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<CommitIcon />} disabled={!msg.trim() || !canCommit} onClick={submit}>Commit</Button>
      </DialogActions>
    </Dialog>
  );
}

export function HistoryDialog({ open, history, uncommitted, onClose, onCheckoutBranch, onNewBranch, onRestore }: {
  open: boolean; history: CodemapHistory | null; uncommitted: boolean;
  onClose: () => void; onCheckoutBranch: (b: string) => void; onNewBranch: () => void; onRestore: (id: string) => void;
}) {
  if (!history) return null;
  const branchNames = Object.keys(history.branches).sort();
  const tagsByCommit: Record<string, string[]> = {};
  for (const [b, id] of Object.entries(history.branches)) (tagsByCommit[id] ??= []).push(b);
  const log = branchLog(history, history.head);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>History — branch <b>{history.head}</b>{uncommitted && <Chip size="small" color="warning" label="uncommitted changes" sx={{ ml: 1 }} />}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle2">Branches:</Typography>
          {branchNames.map((b) => (
            <Chip key={b} icon={<CallSplitIcon />} label={b} size="small"
              color={b === history.head ? 'primary' : 'default'} variant={b === history.head ? 'filled' : 'outlined'}
              onClick={() => onCheckoutBranch(b)} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={onNewBranch}>New branch</Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Commits (newest first)</Typography>
        <List dense>
          {log.map((c) => (
            <ListItem key={c.id} alignItems="flex-start"
              secondaryAction={<Tooltip title="Bring this state back as the working state"><IconButton edge="end" size="small" onClick={() => onRestore(c.id)}><RestoreIcon fontSize="small" /></IconButton></Tooltip>}>
              <ListItemIcon sx={{ minWidth: 30, mt: 0.5 }}><CommitIcon fontSize="small" color="action" /></ListItemIcon>
              <ListItemText
                primary={<Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <span>{c.message}</span>
                  {(tagsByCommit[c.id] ?? []).map((t) => <Chip key={t} size="small" label={t} color={t === history.head ? 'primary' : 'default'} sx={{ height: 18 }} />)}
                </Box>}
                secondary={`${c.id.slice(-6)} · ${new Date(c.at).toLocaleString()}${c.parents.length > 1 ? ' · merge' : ''}`}
                secondaryTypographyProps={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ── Diff ─────────────────────────────────────────────────────────────────────

const WORKING = '__working__';

export function CodemapDiffDialog({ open, history, workingDiagrams, defaultDiagramId, onClose }: {
  open: boolean; history: CodemapHistory | null; workingDiagrams: UmlDiagram[]; defaultDiagramId: string | null; onClose: () => void;
}) {
  const headTip = history?.branches[history.head];
  const commitOptions = useMemo(() => {
    if (!history) return [] as { id: string; label: string }[];
    const list = Object.values(history.commits).sort((a, b) => b.at - a.at)
      .map((c) => ({ id: c.id, label: `${c.message} · ${c.id.slice(-6)}` }));
    return [{ id: WORKING, label: 'Working (unsaved)' }, ...list];
  }, [history]);

  const [targetId, setTargetId] = useState<string>(WORKING);
  const [baseId, setBaseId] = useState<string>(headTip ?? WORKING);
  const [diagramKey, setDiagramKey] = useState<string>(defaultDiagramId ?? '');

  useEffect(() => { if (open) { setTargetId(WORKING); setBaseId(headTip ?? WORKING); setDiagramKey(defaultDiagramId ?? ''); } }, [open, headTip, defaultDiagramId]);

  const snapOf = useCallback((id: string): UmlDiagram[] => (id === WORKING ? workingDiagrams : history?.commits[id]?.snapshot.diagrams ?? []), [history, workingDiagrams]);

  const diagramOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of [...snapOf(baseId), ...snapOf(targetId)]) if (!map.has(d.id)) map.set(d.id, d.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [snapOf, baseId, targetId]);

  const effDiagramKey = diagramOptions.some((d) => d.id === diagramKey) ? diagramKey : (diagramOptions[0]?.id ?? '');
  const { nodes, edges, counts } = useMemo(
    () => buildDiff(snapOf(baseId).find((d) => d.id === effDiagramKey), snapOf(targetId).find((d) => d.id === effDiagramKey)),
    [snapOf, baseId, targetId, effDiagramKey],
  );

  const fmt = (label: string, [a, r, m]: [number, number, number] | [number, number], hasMod: boolean) =>
    `${label}: ` + [`+${a}`, `-${r}`, hasMod ? `~${(m as number) ?? 0}` : ''].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        Diff
        <TextField select size="small" label="From (base)" value={baseId} onChange={(e) => setBaseId(e.target.value)} sx={{ minWidth: 220 }}>
          {commitOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>)}
        </TextField>
        <CompareArrowsIcon color="action" />
        <TextField select size="small" label="To (target)" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 220 }}>
          {commitOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>)}
        </TextField>
        {diagramOptions.length > 1 && (
          <TextField select size="small" label="Diagram" value={effDiagramKey} onChange={(e) => setDiagramKey(e.target.value)} sx={{ minWidth: 160 }}>
            {diagramOptions.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <Box sx={{ px: 3, pb: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip size="small" label="added" sx={{ bgcolor: `${DIFF_COLOR.added}22`, color: DIFF_COLOR.added }} />
        <Chip size="small" label="removed" sx={{ bgcolor: `${DIFF_COLOR.removed}22`, color: DIFF_COLOR.removed }} />
        <Chip size="small" label="modified" sx={{ bgcolor: `${DIFF_COLOR.modified}22`, color: DIFF_COLOR.modified }} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Typography variant="caption" color="text.secondary">{fmt('Classes', counts.cls, true)} · {fmt('Members', counts.mem, true)} · {fmt('Relations', counts.rel, false)}</Typography>
      </Box>
      <DialogContent sx={{ p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
        <UmlMarkerDefs />
        <Box sx={{ width: '100%', height: '100%' }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={DIFF_NODE_TYPES} edgeTypes={DIFF_EDGE_TYPES} fitView minZoom={0.15} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap zoomable pannable nodeColor={(n) => { const d = n.data as DiffNodeData; return d?.status && d.status !== 'unchanged' ? DIFF_COLOR[d.status] : (KIND_META[d?.kind ?? 'class']?.color ?? '#999'); }} />
          </ReactFlow>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ── Opening a codemap, adding an output file ─────────────────────────────────

export function OpenCodemapDialog({ open, files, current, codemapDir, onOpen, onRemove, onRefresh, onClose }: {
  open: boolean; files: string[]; current: string | null; codemapDir: string;
  onOpen: (file: string) => void; onRemove?: (file: string) => void; onRefresh: () => void; onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Open codemap</DialogTitle>
      <DialogContent dividers>
        {files.length === 0
          ? <Typography variant="body2" color="text.secondary">No codemaps in {codemapDir}/ yet. Create one with "New codemap" and save it, or build one "From code".</Typography>
          : (
            <List dense>
              {files.map((f) => (
                <ListItem key={f} disablePadding
                  secondaryAction={onRemove && <Tooltip title="Delete codemap"><IconButton edge="end" size="small" onClick={() => onRemove(f)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}>
                  <ListItemButton selected={f === current} onClick={() => { onClose(); onOpen(f); }}>
                    <ListItemIcon sx={{ minWidth: 30 }}><SchemaIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary={codemapDisplayName(f)} secondary={f === current ? 'open' : undefined} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onRefresh}>Refresh</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function OutputFileDialog({ open, initialPath, placeholder, onAdd, onBrowse, onClose }: {
  open: boolean; initialPath: string; placeholder: string;
  onAdd: (path: string) => void;
  /** Opens a directory picker; the callback receives the chosen directory. */
  onBrowse: (then: (dir: string) => void) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(initialPath);
  useEffect(() => { if (open) setPath(initialPath); }, [open, initialPath]);
  const valid = outputKind(path.trim()) !== null;
  const add = () => { if (valid) { onAdd(path.trim()); onClose(); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add output file</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
          <TextField
            autoFocus fullWidth size="small"
            label="Path"
            placeholder={placeholder}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            helperText="The extension picks the generator: *.schema.json → JSON Schema (a folder with one file per type), *.d.ts → TypeScript types."
          />
          <Button size="small" sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
            onClick={() => onBrowse((dir) => setPath(pathIn(dir, path.split('/').pop() || 'Model.d.ts')))}>
            Folder…
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid} onClick={add}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
