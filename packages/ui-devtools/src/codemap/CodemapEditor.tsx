/**
 * The codemap editor — MyCastle's Programming → UML page as a component.
 *
 * A codemap (`*.codemap.json`) holds several UML class diagrams and a git-like
 * history: commits, branches, the current branch. Every class member is an
 * element with its own id, so editing and history work at member granularity.
 * Two kinds of links tie the diagrams to code: the codemap ↔ a source directory
 * (`linkedPath`), and a class ↔ a source file (`linkedFile`).
 *
 * The page knows nothing about the backend: files go through a `CodemapStore`,
 * parsing code through an optional `syncFromCode` (see `store.ts`), and the
 * host's own navigation goes into `toolbarStart`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type EdgeChange, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, List, MenuItem, Paper, Snackbar, Stack,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddBoxIcon from '@mui/icons-material/AddBox';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CloseIcon from '@mui/icons-material/Close';
import CommitIcon from '@mui/icons-material/Commit';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import HistoryIcon from '@mui/icons-material/History';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import TuneIcon from '@mui/icons-material/Tune';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  checkoutBranch, commitCodemap, createBranch, hasUncommittedChanges, restoreCommit,
  type Codemap, type RelType, type UmlDiagram, type UmlEdgeData, type UmlKind, type UmlMember, type UmlNodeData,
} from '@hestia/node-devtools/format';
import { CategoryFilterContext, EDGE_TYPES, NODE_TYPES, UmlMarkerDefs } from './canvas';
import {
  CodemapDiffDialog, CommitDialog, FilePickerDialog, FilePreviewDialog, HistoryDialog, OpenCodemapDialog, OutputFileDialog,
} from './dialogs';
import { planOutput } from './generate';
import {
  KIND_META, REL_META, REL_ORDER, categoryColor, cleanEdges, cleanNodes, emptyDiagram, fieldNameOptional, makeNode,
  member, newCodemap, nextId, normalizeCodemap, normalizeOptional, reorderWithinKind,
  type UmlFlowEdge, type UmlFlowNode,
} from './model';
import { CodemapTreeItem, LinkedFilesPanel, MemberSection, ResizeHandle, usePersistentWidth, type Linker } from './panels';
import {
  codemapDisplayName, codemapFileName, listCodemaps, pathIn, readCodemap, renameCodemapFile, writeCodemap,
  type CodemapStore, type SyncFromCode,
} from './store';

export interface CodemapEditorProps {
  /**
   * Where the files are. Build it once (`useMemo`): the editor lists and loads
   * codemaps again whenever the store object changes.
   */
  store: CodemapStore;
  /** Builds or updates the codemap from source code on the host's server. Absent = no "From code" button. */
  syncFromCode?: SyncFromCode;
  /** Rendered at the start of the toolbar — the host's menu and account buttons. */
  toolbarStart?: ReactNode;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function CodemapEditorInner({ store, syncFromCode, toolbarStart }: CodemapEditorProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [codemap, setCodemap] = useState<Codemap | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  const [nodes, setNodes] = useState<UmlFlowNode[]>([]);
  const [edges, setEdges] = useState<UmlFlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [relType, setRelType] = useState<RelType>('association');
  const [dirty, setDirty] = useState(false);

  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);
  const [picker, setPicker] = useState<{ mode: 'dir' | 'file'; title: string; onPick: (path: string, files?: string[]) => void } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [outputDialog, setOutputDialog] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = every category
  const [commitOpen, setCommitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const placeRef = useRef(0);
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  // Every panel can be toggled on every screen; by default they are shown on a
  // desktop and hidden on a phone, where the canvas needs the whole width.
  const [treeOpen, setTreeOpen] = useState(!isNarrow);
  const [propsOpen, setPropsOpen] = useState(!isNarrow);
  const [treeWidth, setTreeWidth] = usePersistentWidth('codemap.treeWidth', 250);
  const [propsWidth, setPropsWidth] = usePersistentWidth('codemap.propsWidth', 290);
  const [filesWidth, setFilesWidth] = usePersistentWidth('codemap.filesWidth', 280);

  const canRename = !!(store.rename || store.remove);

  const refreshFiles = useCallback(async () => {
    try { setFiles(await listCodemaps(store)); }
    catch (e) { setToast({ msg: `Could not list codemaps: ${message(e)}`, sev: 'error' }); }
  }, [store]);

  const clearSelection = () => { setSelectedNodeId(null); setSelectedEdgeId(null); };
  const showDiagram = (d: UmlDiagram | undefined) => { setActiveDiagramId(d?.id ?? null); setNodes(d?.nodes ?? []); setEdges(d?.edges ?? []); clearSelection(); };

  // First visit: the first codemap in the directory, or an example one.
  useEffect(() => {
    let live = true;
    (async () => {
      let list: string[] = [];
      try { list = await listCodemaps(store); } catch { list = []; }
      if (!live) return;
      setFiles(list);
      if (list.length > 0) {
        try {
          const c = await readCodemap(store, list[0]);
          if (!live) return;
          setCodemap(c); setFile(list[0]); setDirty(false); showDiagram(c.diagrams[0]);
          return;
        } catch { /* fall through to a fresh example */ }
      }
      if (!live) return;
      const seeded = newCodemap('Untitled', true);
      setCodemap(seeded); setFile(null); showDiagram(seeded.diagrams[0]); setDirty(true);
    })();
    return () => { live = false; };
  }, [store]);

  /** The codemap with the canvas — which React Flow owns — written back into the active diagram. */
  const withCanvas = useCallback((c: Codemap): Codemap => ({
    ...c,
    diagrams: c.diagrams.map((d) => (d.id === activeDiagramId ? { ...d, nodes: cleanNodes(nodes), edges: cleanEdges(edges) } : d)),
  }), [activeDiagramId, nodes, edges]);

  // ── Canvas ────────────────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as UmlFlowNode[]);
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds) as UmlFlowEdge[]);
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  }, []);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, id: nextId('e'), type: 'uml', data: { relType } }, eds) as UmlFlowEdge[]);
    setDirty(true);
  }, [relType]);

  const addNode = useCallback((kind: UmlKind) => {
    const k = placeRef.current++;
    const node = makeNode(kind, { x: 120 + (k % 5) * 40, y: 120 + (k % 5) * 40 });
    setNodes((nds) => [...nds, node]); setSelectedNodeId(node.id); setSelectedEdgeId(null); setDirty(true);
  }, []);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  const patchNodeData = useCallback((id: string, patch: Partial<UmlNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))); setDirty(true);
  }, []);
  const updateMembers = useCallback((id: string, fn: (m: UmlMember[]) => UmlMember[]) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, members: fn(n.data.members) } } : n))); setDirty(true);
  }, []);
  const patchEdgeData = useCallback((id: string, patch: Partial<UmlEdgeData>) => {
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...(e.data ?? { relType: 'association' }), ...patch } } : e))); setDirty(true);
  }, []);

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null); setDirty(true);
    } else if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId)); setSelectedEdgeId(null); setDirty(true);
    }
  }, [selectedNodeId, selectedEdgeId]);

  // ── Diagrams ──────────────────────────────────────────────────────────────
  const selectDiagram = useCallback((id: string) => {
    if (!codemap || id === activeDiagramId) return;
    const current = withCanvas(codemap); setCodemap(current); showDiagram(current.diagrams.find((d) => d.id === id));
  }, [codemap, activeDiagramId, withCanvas]);
  const addDiagram = useCallback(() => {
    if (!codemap) return;
    const name = window.prompt('Name of the new diagram', `Diagram ${codemap.diagrams.length + 1}`); if (!name) return;
    const current = withCanvas(codemap); const d = emptyDiagram(name.trim());
    setCodemap({ ...current, diagrams: [...current.diagrams, d] }); showDiagram(d); setDirty(true);
  }, [codemap, withCanvas]);
  const renameDiagram = useCallback((id: string) => {
    if (!codemap) return; const cur = codemap.diagrams.find((d) => d.id === id);
    const name = window.prompt('New name of the diagram', cur?.name ?? ''); if (!name) return;
    setCodemap((c) => c && ({ ...c, diagrams: c.diagrams.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)) })); setDirty(true);
  }, [codemap]);
  const deleteDiagram = useCallback((id: string) => {
    if (!codemap) return;
    if (codemap.diagrams.length <= 1) { setToast({ msg: 'A codemap needs at least one diagram', sev: 'info' }); return; }
    if (!window.confirm('Delete this diagram?')) return;
    const current = withCanvas(codemap); const remaining = current.diagrams.filter((d) => d.id !== id);
    setCodemap({ ...current, diagrams: remaining }); if (id === activeDiagramId) showDiagram(remaining[0]); setDirty(true);
  }, [codemap, activeDiagramId, withCanvas]);

  // ── Linked files and categories across the whole codemap ──────────────────
  const linkedItems = useMemo(() => {
    if (!codemap) return [] as { file: string; linker: Linker }[];
    const out: { file: string; linker: Linker }[] = [];
    for (const d of codemap.diagrams) {
      const dn = d.id === activeDiagramId ? nodes : d.nodes;
      for (const n of dn) { const lf = n.data.linkedFile; if (lf) out.push({ file: lf, linker: { className: n.data.name, diagramName: d.name, kind: n.data.kind } }); }
    }
    return out;
  }, [codemap, activeDiagramId, nodes]);

  // The active diagram contributes its live nodes, the others what is stored.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    if (codemap) for (const d of codemap.diagrams) {
      const dn = d.id === activeDiagramId ? nodes : d.nodes;
      for (const n of dn) for (const m of n.data.members) if (m.category) set.add(m.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [codemap, activeDiagramId, nodes]);

  // A filter stops making sense once its category is gone from the codemap.
  useEffect(() => { if (categoryFilter && !allCategories.includes(categoryFilter)) setCategoryFilter(null); }, [allCategories, categoryFilter]);

  // ── History (git-like) — the operations come from @hestia/node-devtools/format ─
  const uncommitted = useMemo(() => (codemap ? hasUncommittedChanges(withCanvas(codemap)) : false), [codemap, withCanvas]);

  const doCommit = useCallback((msg: string) => {
    if (!codemap) return;
    const next = commitCodemap(withCanvas(codemap), msg);
    setCodemap(next); setDirty(true);
    setToast({ msg: `Committed on "${next.history.head}": ${msg}`, sev: 'success' });
  }, [codemap, withCanvas]);

  /** Runs a history operation that replaces the working state, asking first when there is uncommitted work. */
  const replaceWorking = useCallback((op: (c: Codemap) => Codemap, question: string, done: string) => {
    if (!codemap) return;
    if (uncommitted && !window.confirm(question)) return;
    try {
      const next = op(codemap);
      setCodemap(next); showDiagram(next.diagrams[0]); setDirty(true); setHistoryOpen(false);
      setToast({ msg: done, sev: 'info' });
    } catch (e) { setToast({ msg: message(e), sev: 'error' }); }
  }, [codemap, uncommitted]);

  const onCheckoutBranch = useCallback((branch: string) => {
    if (!codemap || branch === codemap.history.head) { setHistoryOpen(false); return; }
    replaceWorking((c) => checkoutBranch(c, branch), 'Uncommitted changes will be lost. Switch branch?', `Switched to branch "${branch}"`);
  }, [codemap, replaceWorking]);

  const onRestore = useCallback((id: string) => {
    replaceWorking((c) => restoreCommit(c, id), 'Uncommitted changes will be lost. Restore this commit?',
      'Restored as the working state — commit it to record it in the history');
  }, [replaceWorking]);

  const onNewBranch = useCallback(() => {
    if (!codemap) return;
    const name = window.prompt('Name of the new branch (it starts at the current commit)'); if (!name) return;
    try {
      // The canvas stays as it is — uncommitted work moves to the new branch, as in git.
      const next = createBranch(withCanvas(codemap), name);
      setCodemap(next); setDirty(true);
      setToast({ msg: `Created branch "${next.history.head}" and switched to it`, sev: 'success' });
    } catch (e) { setToast({ msg: message(e), sev: 'error' }); }
  }, [codemap, withCanvas]);

  // ── Codemap files ─────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!codemap) return;
    let target = file;
    if (!target) {
      const name = window.prompt(`Codemap name (saved in ${store.codemapDir}/)`, codemap.name === 'Untitled' ? 'codemap' : codemap.name);
      if (!name) return;
      target = codemapFileName(name);
    }
    const next = { ...withCanvas(codemap), name: codemapDisplayName(target), updatedAt: Date.now() };
    try {
      await writeCodemap(store, target, next);
      setCodemap(next); setFile(target); setDirty(false); await refreshFiles();
      setToast({ msg: `Saved ${target}`, sev: 'success' });
    } catch (e) { setToast({ msg: `Could not save: ${message(e)}`, sev: 'error' }); }
  }, [codemap, file, withCanvas, store, refreshFiles]);

  /** Loads a codemap onto the canvas, no questions asked — `open` asks them. */
  const load = useCallback(async (target: string) => {
    try {
      const c = await readCodemap(store, target);
      setCodemap(c); setFile(target); setDirty(false); showDiagram(c.diagrams[0]);
      setToast({ msg: `Opened ${target}`, sev: 'info' });
    } catch (e) { setToast({ msg: `Could not open ${target}: ${message(e)}`, sev: 'error' }); }
  }, [store]);

  const open = useCallback(async (target: string) => {
    if (target === file) return;
    if (dirty && !window.confirm('Unsaved changes will be lost. Open another codemap?')) return;
    await load(target);
  }, [file, dirty, load]);

  const showOpenDialog = useCallback(async () => { await refreshFiles(); setOpenDialog(true); }, [refreshFiles]);

  const createNew = useCallback(() => {
    if (dirty && !window.confirm('Unsaved changes will be lost. Create a new codemap?')) return;
    const name = window.prompt('Name of the new codemap', 'codemap'); if (!name) return;
    const c = newCodemap(name.trim(), false); setCodemap(c); setFile(null); showDiagram(c.diagrams[0]); setDirty(true);
  }, [dirty]);

  const rename = useCallback(async (from: string) => {
    const name = window.prompt('New name of the codemap', codemapDisplayName(from)); if (!name) return;
    const to = codemapFileName(name); if (to === from) return;
    try {
      const source = from === file && codemap ? withCanvas(codemap) : await readCodemap(store, from);
      const renamed = { ...source, name: codemapDisplayName(to), updatedAt: Date.now() };
      await renameCodemapFile(store, from, to, renamed);
      if (from === file) { setCodemap(renamed); setFile(to); setDirty(false); }
      setToast({ msg: `Renamed → ${to}`, sev: 'success' });
    } catch (e) { setToast({ msg: `Could not rename: ${message(e)}`, sev: 'error' }); }
    await refreshFiles();
  }, [file, codemap, withCanvas, store, refreshFiles]);

  const remove = useCallback(async (target: string) => {
    if (!store.remove) return;
    if (!window.confirm(`Delete codemap ${codemapDisplayName(target)}?`)) return;
    try { await store.remove(pathIn(store.codemapDir, target)); }
    catch (e) { setToast({ msg: `Could not delete: ${message(e)}`, sev: 'error' }); return; }
    const list = await listCodemaps(store).catch(() => [] as string[]); setFiles(list);
    if (target === file) {
      // `load`, not `open` — `open` would ask about unsaved changes to a file
      // that no longer exists.
      if (list.length > 0) await load(list[0]);
      else { const c = newCodemap('Untitled', true); setCodemap(c); setFile(null); showDiagram(c.diagrams[0]); setDirty(true); }
    }
  }, [store, file, load]);

  // ── Output files (generated from the diagrams) ────────────────────────────
  const addOutput = useCallback((path: string) => {
    setCodemap((c) => (c && !(c.outputs ?? []).includes(path) ? { ...c, outputs: [...(c.outputs ?? []), path] } : c));
    setDirty(true);
  }, []);
  const removeOutput = useCallback((path: string) => {
    setCodemap((c) => c && ({ ...c, outputs: (c.outputs ?? []).filter((x) => x !== path) }));
    setDirty(true);
  }, []);
  const generateOutput = useCallback(async (path: string) => {
    if (!codemap) return;
    setGenerating(path);
    try {
      // From the canvas as it is now — unsaved edits included.
      const plan = planOutput(path, withCanvas(codemap).diagrams);
      for (const f of plan) await store.write(f.path, f.content);
      setToast({ msg: plan.length === 1 ? `Generated ${plan[0].path}` : `Generated ${plan.length} files in ${plan[0].path.slice(0, plan[0].path.lastIndexOf('/'))}/`, sev: 'success' });
    } catch (e) {
      setToast({ msg: `Could not generate: ${message(e)}`, sev: 'error' });
    } finally {
      setGenerating(null);
    }
  }, [codemap, withCanvas, store]);

  // ── Links to code ─────────────────────────────────────────────────────────
  const pickSourceDir = useCallback(() => setPicker({ mode: 'dir', title: 'Link the codemap to a source directory', onPick: (path) => { setCodemap((c) => c && ({ ...c, linkedPath: path })); setDirty(true); } }), []);
  const unlinkSourceDir = useCallback(() => { setCodemap((c) => c && ({ ...c, linkedPath: undefined })); setDirty(true); }, []);
  const pickNodeFile = useCallback((nodeId: string) => setPicker({ mode: 'file', title: 'Link the class to a source file', onPick: (path) => patchNodeData(nodeId, { linkedFile: path }) }), [patchNodeData]);

  // ── Build / update from source code ───────────────────────────────────────
  const runCodeSync = useCallback(async (dir: string, chosen?: string[]) => {
    if (!codemap || !syncFromCode) return;
    const scope = chosen?.length ? `${chosen.length} chosen file(s) in ${dir}` : `the code in ${dir}`;
    const hasContent = codemap.diagrams.some((d) => d.nodes.length > 0);
    if (hasContent && !window.confirm(`The source diagram will be rebuilt from ${scope} (node layout is kept). Continue?`)) return;
    setSyncing(true);
    try {
      const res = await syncFromCode({ dir, files: chosen?.length ? chosen : undefined, codemap: withCanvas(codemap) });
      // `name?: type` fields from the parser get the "optional" category.
      const next = normalizeOptional(normalizeCodemap({ ...res.codemap, linkedPath: res.codemap.linkedPath ?? dir }));
      setCodemap(next); showDiagram(next.diagrams[0]); setDirty(true);
      setToast({ msg: res.changes.length ? `From code: ${res.summary} (${res.changes.length} changes)` : 'From code: no structural changes', sev: 'success' });
    } catch (e) {
      setToast({ msg: `Could not build from code: ${message(e)}`, sev: 'error' });
    } finally {
      setSyncing(false);
    }
  }, [codemap, syncFromCode, withCanvas]);

  const fromCode = useCallback(() => {
    if (!codemap) return;
    if (codemap.linkedPath) void runCodeSync(codemap.linkedPath);
    else setPicker({ mode: 'dir', title: 'Choose a directory, or tick files in it', onPick: (path, chosen) => void runCodeSync(path, chosen) });
  }, [codemap, runCodeSync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const selFields = selectedNode ? selectedNode.data.members.filter((m) => m.kind === 'field') : [];
  const selMethods = selectedNode ? selectedNode.data.members.filter((m) => m.kind === 'method') : [];
  const treeItemProps = {
    activeDiagramId,
    onSelectDiagram: (id: string) => { selectDiagram(id); if (isNarrow) setTreeOpen(false); },
    onAddDiagram: addDiagram, onRenameDiagram: renameDiagram, onDeleteDiagram: deleteDiagram,
    onLink: pickSourceDir, onUnlink: unlinkSourceDir,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <UmlMarkerDefs />

      {/* Toolbar */}
      <Paper square elevation={1} sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', zIndex: 2 }}>
        {toolbarStart && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1.5, px: 0.25 }}>{toolbarStart}</Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          </>
        )}
        <Tooltip title="Panel: codemaps / diagrams"><IconButton size="small" color={treeOpen ? 'primary' : 'default'} onClick={() => setTreeOpen((v) => !v)}><ViewSidebarIcon /></IconButton></Tooltip>
        <Tooltip title="Open codemap"><IconButton size="small" onClick={() => void showOpenDialog()}><FolderOpenIcon /></IconButton></Tooltip>
        <Tooltip title="Save codemap (Ctrl+S)"><span><IconButton size="small" color={dirty ? 'warning' : 'default'} onClick={() => void save()}><SaveIcon /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Stack direction="row" spacing={0.5}>
          {(Object.keys(KIND_META) as UmlKind[]).map((k) => (
            <Button key={k} size="small" variant="outlined" startIcon={<AddBoxIcon />} onClick={() => addNode(k)} sx={{ borderColor: KIND_META[k].color, color: KIND_META[k].color, textTransform: 'none' }}>{KIND_META[k].label}</Button>
          ))}
        </Stack>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <TextField select size="small" label="Relation (for new connections)" value={relType} onChange={(e) => setRelType(e.target.value as RelType)} sx={{ minWidth: 210 }}>
          {REL_ORDER.map((r) => <MenuItem key={r} value={r}>{REL_META[r].label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Category (filter)" value={categoryFilter ?? ''} onChange={(e) => setCategoryFilter(e.target.value || null)} sx={{ minWidth: 170 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true, renderValue: (v) => (v ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: categoryColor(v as string) }} />{v as string}</Box> : <span style={{ color: '#888' }}>all</span>) }}>
          <MenuItem value="">all categories</MenuItem>
          {allCategories.map((c) => <MenuItem key={c} value={c}><Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: categoryColor(c), mr: 1 }} />{c}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {syncFromCode && (
          <>
            <Tooltip title={codemap?.linkedPath ? `Build / update from the code in ${codemap.linkedPath}` : 'Build from code — choose a directory'}>
              <span><Button size="small" variant="outlined" startIcon={syncing ? <CircularProgress size={14} /> : <AutoFixHighIcon />} disabled={syncing} onClick={fromCode} sx={{ textTransform: 'none' }}>From code</Button></span>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          </>
        )}
        {/* Version control */}
        <Tooltip title="Current branch"><Chip size="small" icon={<CallSplitIcon />} label={codemap?.history.head ?? '—'} color={uncommitted ? 'warning' : 'default'} variant="outlined" /></Tooltip>
        <Tooltip title="Commit (record a version in the history)"><span><IconButton size="small" disabled={!uncommitted} onClick={() => setCommitOpen(true)}><CommitIcon /></IconButton></span></Tooltip>
        <Tooltip title="History / branches"><IconButton size="small" onClick={() => setHistoryOpen(true)}><HistoryIcon /></IconButton></Tooltip>
        <Tooltip title="Diff — compare two versions"><IconButton size="small" onClick={() => setDiffOpen(true)}><CompareArrowsIcon /></IconButton></Tooltip>
        <Tooltip title="Panel: properties"><IconButton size="small" color={propsOpen ? 'primary' : 'default'} onClick={() => setPropsOpen((v) => !v)}><TuneIcon /></IconButton></Tooltip>
        <Tooltip title={`Panel: linked files${linkedItems.length ? ` (${linkedItems.length})` : ''}`}><IconButton size="small" color={showFilesPanel ? 'primary' : 'default'} onClick={() => setShowFilesPanel((v) => !v)}><AccountTreeIcon /></IconButton></Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>{codemap ? `${codemap.name}${file ? '' : ' (unsaved)'}` : '—'}{dirty ? ' •' : ''}</Typography>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left: codemaps + diagrams — an overlay on a phone, so the canvas keeps the full width */}
        <Box sx={{ width: treeWidth, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.paper', flexDirection: 'column',
          display: treeOpen ? 'flex' : 'none',
          position: { xs: 'absolute', md: 'relative' }, left: 0, top: 0, height: '100%', zIndex: 6, boxShadow: { xs: 6, md: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Codemaps / diagrams</Typography>
            <Tooltip title="Hide panel"><IconButton size="small" onClick={() => setTreeOpen(false)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          <Box sx={{ px: 1, pb: 1 }}><Button fullWidth size="small" variant="outlined" startIcon={<CreateNewFolderIcon />} onClick={createNew}>New codemap</Button></Box>
          <Divider />
          <List dense sx={{ flex: 1, overflowY: 'auto' }}>
            {!file && codemap && (
              <CodemapTreeItem expanded active label={codemap.name} sublabel="(unsaved)" linkedPath={codemap.linkedPath}
                diagrams={codemap.diagrams} {...treeItemProps} onRename={() => void save()} />
            )}
            {files.map((f) => {
              const isActive = f === file;
              return (
                <CodemapTreeItem key={f} expanded={isActive} active={isActive} label={codemapDisplayName(f)} linkedPath={isActive ? codemap?.linkedPath : undefined}
                  diagrams={isActive ? (codemap?.diagrams ?? []) : []} {...treeItemProps}
                  onOpen={() => { void open(f); if (isNarrow) setTreeOpen(false); }}
                  onRename={canRename ? () => void rename(f) : undefined}
                  onDelete={store.remove ? () => void remove(f) : undefined} />
              );
            })}
          </List>
        </Box>
        {treeOpen && <ResizeHandle side="left" width={treeWidth} setWidth={setTreeWidth} />}

        {/* Centre: the canvas — minWidth 0 so it never collapses; the key re-fits the view when the diagram changes */}
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <CategoryFilterContext.Provider value={categoryFilter}>
            <ReactFlow key={activeDiagramId ?? 'none'} nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} connectionMode={ConnectionMode.Loose}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }} onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }} onPaneClick={() => { clearSelection(); if (isNarrow) setTreeOpen(false); }}
              deleteKeyCode={['Delete', 'Backspace']} onNodesDelete={() => setDirty(true)} onEdgesDelete={() => setDirty(true)} fitView minZoom={0.2} maxZoom={2.5}>
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls />
              <MiniMap zoomable pannable nodeColor={(n) => KIND_META[(n.data as UmlNodeData)?.kind ?? 'class']?.color ?? '#999'} />
            </ReactFlow>
          </CategoryFilterContext.Provider>
        </Box>

        {propsOpen && <ResizeHandle side="right" width={propsWidth} setWidth={setPropsWidth} />}
        {/* Right: properties — an overlay on a phone */}
        <Box sx={{ width: propsWidth, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 1.5, bgcolor: 'background.paper',
          display: propsOpen ? 'block' : 'none',
          position: { xs: 'absolute', md: 'relative' }, right: 0, top: 0, height: '100%', zIndex: 6, boxShadow: { xs: 6, md: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Properties</Typography>
            <Tooltip title="Hide panel"><IconButton size="small" onClick={() => setPropsOpen(false)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          {!selectedNode && !selectedEdge && <Typography variant="body2" color="text.secondary">Select a class or a relation to edit it. Drag from a class's edge to connect it to another.</Typography>}

          {selectedNode && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Class properties</Typography>
              <TextField select size="small" label="Type" value={selectedNode.data.kind} onChange={(e) => patchNodeData(selectedNode.id, { kind: e.target.value as UmlKind })}>
                {(Object.keys(KIND_META) as UmlKind[]).map((k) => <MenuItem key={k} value={k}>{KIND_META[k].label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Name" value={selectedNode.data.name} onChange={(e) => patchNodeData(selectedNode.id, { name: e.target.value })} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Fields</Typography></Divider>
              <MemberSection title="Fields" members={selFields} categories={allCategories}
                onAdd={() => updateMembers(selectedNode.id, (ms) => [...ms, member('field', '- field: type')])}
                onChange={(mid, text) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, text, category: fieldNameOptional(text) ? 'optional' : m.category } : m)))}
                onCategory={(mid, category) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, category: category || undefined } : m)))}
                onDelete={(mid) => updateMembers(selectedNode.id, (ms) => ms.filter((m) => m.id !== mid))}
                onReorder={(from, to) => updateMembers(selectedNode.id, (ms) => reorderWithinKind(ms, from, to))} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Methods</Typography></Divider>
              <MemberSection title="Methods" members={selMethods} categories={allCategories}
                onAdd={() => updateMembers(selectedNode.id, (ms) => [...ms, member('method', '+ method(): void')])}
                onChange={(mid, text) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, text } : m)))}
                onCategory={(mid, category) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, category: category || undefined } : m)))}
                onDelete={(mid) => updateMembers(selectedNode.id, (ms) => ms.filter((m) => m.id !== mid))}
                onReorder={(from, to) => updateMembers(selectedNode.id, (ms) => reorderWithinKind(ms, from, to))} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Linked file</Typography></Divider>
              {selectedNode.data.linkedFile ? (
                <>
                  <Chip icon={<LinkIcon />} label={selectedNode.data.linkedFile} size="small" sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} onDelete={() => patchNodeData(selectedNode.id, { linkedFile: undefined })} />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setPreviewPath(selectedNode.data.linkedFile!)}>Preview</Button>
                    <Button size="small" startIcon={<LinkIcon />} onClick={() => pickNodeFile(selectedNode.id)}>Change</Button>
                  </Stack>
                </>
              ) : <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => pickNodeFile(selectedNode.id)}>Link to file</Button>}

              <Divider />
              <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={deleteSelection}>Delete class</Button>
            </Stack>
          )}

          {selectedEdge && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Relation properties</Typography>
              <TextField select size="small" label="Relation type" value={selectedEdge.data?.relType ?? 'association'} onChange={(e) => patchEdgeData(selectedEdge.id, { relType: e.target.value as RelType })}>
                {REL_ORDER.map((r) => <MenuItem key={r} value={r}>{REL_META[r].label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Label" value={selectedEdge.data?.label ?? ''} onChange={(e) => patchEdgeData(selectedEdge.id, { label: e.target.value })} />
              <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={deleteSelection}>Delete relation</Button>
            </Stack>
          )}
        </Box>

        {/* Far right: linked files (toggleable) — an overlay on a phone */}
        {showFilesPanel && <ResizeHandle side="right" width={filesWidth} setWidth={setFilesWidth} />}
        {showFilesPanel && (
          <Box sx={{ flexShrink: 0, position: { xs: 'absolute', md: 'relative' }, right: 0, top: 0, height: '100%', zIndex: 7, boxShadow: { xs: 6, md: 0 } }}>
            <LinkedFilesPanel width={filesWidth} linkedPath={codemap?.linkedPath} items={linkedItems}
              outputs={codemap?.outputs ?? []} generating={generating}
              onAddOutput={() => setOutputDialog(true)} onRemoveOutput={removeOutput} onGenerate={(f) => void generateOutput(f)}
              onPreview={(path) => setPreviewPath(path)} onClose={() => setShowFilesPanel(false)} />
          </Box>
        )}
      </Box>

      {picker && <FilePickerDialog open store={store} mode={picker.mode} title={picker.title} onPick={picker.onPick} onClose={() => setPicker(null)} />}
      <OutputFileDialog open={outputDialog} onClose={() => setOutputDialog(false)} onAdd={addOutput}
        initialPath={codemap?.linkedPath ? `${codemap.linkedPath}/` : `${store.codemapDir}/`}
        placeholder={pathIn(store.codemapDir, 'Model.d.ts')}
        onBrowse={(then) => setPicker({ mode: 'dir', title: 'Choose the target folder', onPick: (dir) => then(dir) })} />
      <FilePreviewDialog open={!!previewPath} store={store} path={previewPath} onClose={() => setPreviewPath(null)} />
      <CommitDialog open={commitOpen} canCommit={uncommitted} onCommit={doCommit} onClose={() => setCommitOpen(false)} />
      <HistoryDialog open={historyOpen} history={codemap?.history ?? null} uncommitted={uncommitted} onClose={() => setHistoryOpen(false)}
        onCheckoutBranch={onCheckoutBranch} onNewBranch={onNewBranch} onRestore={onRestore} />
      <CodemapDiffDialog open={diffOpen} history={codemap?.history ?? null} workingDiagrams={codemap ? withCanvas(codemap).diagrams : []} defaultDiagramId={activeDiagramId} onClose={() => setDiffOpen(false)} />
      <OpenCodemapDialog open={openDialog} files={files} current={file} codemapDir={store.codemapDir}
        onOpen={(f) => void open(f)} onRemove={store.remove ? (f) => void remove(f) : undefined}
        onRefresh={() => void refreshFiles()} onClose={() => setOpenDialog(false)} />

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)} variant="filled">{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

/**
 * The editor, with the React Flow provider it needs. Give it a parent with a
 * height — it fills the parent and scrolls nothing itself.
 */
export function CodemapEditor(props: CodemapEditorProps) {
  return (
    <ReactFlowProvider>
      <CodemapEditorInner {...props} />
    </ReactFlowProvider>
  );
}
