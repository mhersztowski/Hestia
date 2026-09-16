import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Collapse,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderIcon from '@mui/icons-material/Folder';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import {
  CadViewerPage,
  Cad3dViewerPage,
  Scene3dViewerPage,
  ElectronicsViewerPage,
  MapViewerPage,
  NotesViewerPage,
  LegoViewerPage,
  PcbViewerPage,
  setViewerApiBase,
  setViewerUserId,
} from '@hestia/ui-scene3d/cad-viewer';
import MapIcon from '@mui/icons-material/Map';
import GestureIcon from '@mui/icons-material/Gesture';
import WidgetsIcon from '@mui/icons-material/Widgets';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import { useMdViewSettings } from '../mdViewSettings';

// ── Types ────────────────────────────────────────────────────────────────────

export type CadViewMode =
  'cad' | 'cad3d' | 'scene3d' | 'electronics' | 'pcb' | 'map' | 'notes' | 'lego';

const MODE_LABELS: Record<CadViewMode, string> = {
  cad: 'CAD 2D',
  cad3d: 'CAD 3D',
  scene3d: 'Scene 3D',
  electronics: 'Electronics',
  pcb: 'PCB',
  map: 'Map',
  notes: 'Notes',
  lego: 'Lego',
};

const MODE_ICONS: Record<CadViewMode, React.ReactNode> = {
  cad: <PentagonOutlinedIcon sx={{ fontSize: 16 }} />,
  cad3d: <ViewInArOutlinedIcon sx={{ fontSize: 16 }} />,
  scene3d: <ViewInArIcon sx={{ fontSize: 16 }} />,
  electronics: <ElectricalServicesIcon sx={{ fontSize: 16 }} />,
  pcb: <DeveloperBoardIcon sx={{ fontSize: 16 }} />,
  map: <MapIcon sx={{ fontSize: 16 }} />,
  notes: <GestureIcon sx={{ fontSize: 16 }} />,
  lego: <WidgetsIcon sx={{ fontSize: 16 }} />,
};

// ── Global CAD base URL (configured once, persisted in localStorage) ─────────

const CAD_URL_KEY = 'cad_base_url';
const DEFAULT_CAD_URL = 'http://localhost:1898';

function getCadBaseUrl(): string {
  const stored = localStorage.getItem(CAD_URL_KEY);
  if (stored) return stored;
  // On a real deployment `localhost:1898` is unreachable (esp. on mobile), so
  // default to the app's own origin — at least reachable, and works if the CAD
  // API is proxied there. Local dev keeps the explicit cad-app dev port.
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return DEFAULT_CAD_URL;
  return window.location.origin;
}

function setCadBaseUrl(url: string) {
  localStorage.setItem(CAD_URL_KEY, url);
}

// ── Project fetcher ──────────────────────────────────────────────────────────

interface ProjectEntry {
  name: string; // display label
  path: string; // full VFS path (without extension) — stored in embed attrs
}

const ELEC_EXT = '.elec.json';
const CAD_EXT = '.cad.json';
const MAP_EXT = '.map.json';
const NOTES_EXT = '.notes.json';
const LEGO_EXT = '.lego.json';

// Non-scene3d modes read `/users/{user}/projects` filtered by this extension.
const EXT_BY_MODE: Partial<Record<CadViewMode, string>> = {
  cad: CAD_EXT,
  cad3d: CAD_EXT,
  electronics: ELEC_EXT,
  map: MAP_EXT,
  notes: NOTES_EXT,
  lego: LEGO_EXT,
};

async function fetchProjects(mode: CadViewMode): Promise<ProjectEntry[]> {
  const base = getCadBaseUrl().replace(/\/$/, '');
  const userId = 'default';
  try {
    if (mode === 'pcb') {
      // Projekty PCB to pliki VFS /users/{user}/projects/*.pcb.json (spójnie z innymi trybami).
      // Dla każdego rozwijamy pozycje: PCB (płytka), Sheets/*, Symbols/*, Footprints/*.
      // `path` = vfsPath dla PcbViewerPage: `{vfsFilePath}/{view}[/{id}]`.
      const ext = '.pcb.json';
      const root = `/users/${userId}/projects`;
      const rels: string[] = []; // ścieżki plików względem root, bez rozszerzenia
      const walk = async (dirPath: string, rel: string, depth: number): Promise<void> => {
        if (depth > 8) return;
        const res = await fetch(`${base}/api/vfs/readdir?path=${encodeURIComponent(dirPath)}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { entries?: { name: string; type: number }[] };
        const dirs = (data.entries ?? []).filter((e) => e.type === 2);
        for (const e of data.entries ?? []) {
          if (e.type !== 2 && e.name.endsWith(ext))
            rels.push(
              rel ? `${rel}/${e.name.slice(0, -ext.length)}` : e.name.slice(0, -ext.length)
            );
        }
        for (const d of dirs)
          await walk(`${dirPath}/${d.name}`, rel ? `${rel}/${d.name}` : d.name, depth + 1);
      };
      await walk(root, '', 0);
      const decode = (b64: string): string => {
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder().decode(bytes);
        } catch {
          return '';
        }
      };
      const entries: ProjectEntry[] = [];
      await Promise.all(
        rels.map(async (rel) => {
          const vfsFile = `users/${userId}/projects/${rel}`;
          // Zawsze pokaż projekt (zakładki Sheet/PCB/3D w viewerze), nawet gdy odczyt treści zawiedzie.
          entries.push({ name: `${rel}/Project (Sheet · PCB · 3D)`, path: `${vfsFile}/project` });
          try {
            const r = await fetch(
              `${base}/api/vfs/readFile?path=${encodeURIComponent(`/users/${userId}/projects/${rel}${ext}`)}`,
              { signal: AbortSignal.timeout(6000) }
            );
            if (!r.ok) return;
            const rd = (await r.json()) as { data?: string };
            const d = JSON.parse(decode(rd.data ?? '')) as {
              symbols?: { id: string; name?: string }[];
              footprints?: { id: string; name?: string }[];
            };
            // Konkretny symbol/footprint (viewer pokaże go + powiązany element).
            for (const s of d.symbols ?? [])
              entries.push({
                name: `${rel}/Symbols/${s.name || s.id}`,
                path: `${vfsFile}/symbol/${s.id}`,
              });
            for (const s of d.footprints ?? [])
              entries.push({
                name: `${rel}/Footprints/${s.name || s.id}`,
                path: `${vfsFile}/footprint/${s.id}`,
              });
          } catch {
            /* pokaż przynajmniej wpis projektu */
          }
        })
      );
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return entries;
    } else if (mode === 'scene3d') {
      // Flat list: project/file — each JSON file is a separate entry
      const projRes = await fetch(`${base}/api/scene3d/projects?user=${userId}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!projRes.ok) return [];
      const projData = (await projRes.json()) as { projects?: { name: string }[] };
      const projects = projData.projects ?? [];
      const entries: ProjectEntry[] = [];
      await Promise.all(
        projects.map(async (proj) => {
          try {
            const fileRes = await fetch(
              `${base}/api/scene3d/projects/${encodeURIComponent(proj.name)}?user=${userId}`,
              { signal: AbortSignal.timeout(4000) }
            );
            if (!fileRes.ok) return;
            const fileData = (await fileRes.json()) as { files?: { name: string }[] };
            for (const f of fileData.files ?? []) {
              entries.push({
                name: `${proj.name}/${f.name}`,
                path: `users/${userId}/scene3d/${proj.name}/${f.name}`,
              });
            }
          } catch {
            /* skip project on error */
          }
        })
      );
      return entries;
    } else {
      // Walk `/users/{user}/projects` recursively so files nested in subfolders
      // are found too (the flat readdir only saw the top level). `name` is the
      // path relative to the projects root — the picker splits it into a tree.
      const ext = EXT_BY_MODE[mode] ?? CAD_EXT;
      const root = `/users/${userId}/projects`;
      const out: ProjectEntry[] = [];
      const walk = async (dirPath: string, rel: string, depth: number): Promise<void> => {
        if (depth > 8) return;
        const res = await fetch(`${base}/api/vfs/readdir?path=${encodeURIComponent(dirPath)}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { entries: { name: string; type: number }[] };
        const dirs = (data.entries ?? []).filter((e) => e.type === 2);
        for (const e of data.entries ?? []) {
          if (e.type !== 2 && e.name.endsWith(ext)) {
            const bare = e.name.slice(0, -ext.length);
            const relName = rel ? `${rel}/${bare}` : bare;
            out.push({ name: relName, path: `users/${userId}/projects/${relName}` });
          }
        }
        // Recurse into subfolders (sequential keeps request count sane).
        for (const d of dirs) {
          await walk(`${dirPath}/${d.name}`, rel ? `${rel}/${d.name}` : d.name, depth + 1);
        }
      };
      await walk(root, '', 0);
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    }
  } catch {
    return [];
  }
}

// ── Viewer URL builder (used only by the picker on confirm) ─────────────────

function buildViewerUrl(mode: CadViewMode, vfsPath: string): string {
  const base = getCadBaseUrl().replace(/\/$/, '');
  return `${base}/viewer/${mode}/${vfsPath}`;
}

// ── Settings dialog ──────────────────────────────────────────────────────────

function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [url, setUrl] = useState(getCadBaseUrl);

  const handleSave = () => {
    setCadBaseUrl(url.trim() || DEFAULT_CAD_URL);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleSave} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography fontWeight={600}>CAD App Settings</Typography>
        <IconButton size="small" onClick={handleSave}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TextField
          label="CAD App base URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          size="small"
          fullWidth
          placeholder={DEFAULT_CAD_URL}
          helperText="Deployed URL of the CAD app — used by all CAD embeds in this browser."
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Project picker dialog ────────────────────────────────────────────────────

// ── Project tree (folders → files) ────────────────────────────────────────────

interface TreeNode {
  name: string;
  entry?: ProjectEntry;
  children: TreeNode[];
}

/** Build a folder tree from entries whose `name` is a `/`-separated path. */
function buildProjectTree(entries: ProjectEntry[]): TreeNode {
  const root: TreeNode = { name: '', children: [] };
  for (const entry of entries) {
    const segs = entry.name.split('/');
    let cur = root;
    segs.forEach((seg, i) => {
      const leaf = i === segs.length - 1;
      let child = cur.children.find((c) => c.name === seg && !!c.entry === leaf);
      if (!child) {
        child = { name: seg, children: [] };
        cur.children.push(child);
      }
      if (leaf) child.entry = entry;
      cur = child;
    });
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort(
      (a, b) => (a.entry ? 1 : 0) - (b.entry ? 1 : 0) || a.name.localeCompare(b.name)
    );
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

function TreeRow({
  node,
  depth,
  icon,
  selectedPath,
  onPick,
}: {
  node: TreeNode;
  depth: number;
  icon: React.ReactNode;
  selectedPath: string;
  onPick: (e: ProjectEntry) => void;
}) {
  const [open, setOpen] = useState(true);
  if (node.entry) {
    return (
      <ListItemButton
        dense
        selected={node.entry.path === selectedPath}
        onClick={() => onPick(node.entry!)}
        sx={{ pl: 1 + depth * 1.5, py: 0.25 }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>{icon}</ListItemIcon>
        <ListItemText primary={node.name} primaryTypographyProps={{ fontSize: 12 }} />
      </ListItemButton>
    );
  }
  return (
    <>
      <ListItemButton
        dense
        onClick={() => setOpen((o) => !o)}
        sx={{ pl: 1 + depth * 1.5, py: 0.25 }}
      >
        <ListItemIcon sx={{ minWidth: 22 }}>
          {open ? (
            <ExpandMoreIcon sx={{ fontSize: 18 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          )}
        </ListItemIcon>
        <FolderIcon sx={{ fontSize: 16, mr: 0.75, color: 'warning.light', flexShrink: 0 }} />
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }}
        />
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        {node.children.map((c, i) => (
          <TreeRow
            key={`${c.name}-${i}`}
            node={c}
            depth={depth + 1}
            icon={icon}
            selectedPath={selectedPath}
            onPick={onPick}
          />
        ))}
      </Collapse>
    </>
  );
}

interface PickerProps {
  open: boolean;
  initialMode: CadViewMode;
  initialPath: string;
  onClose(): void;
  /** vfsPath (without extension) of the selected project */
  onConfirm(mode: CadViewMode, vfsPath: string): void;
}

function ProjectPickerDialog({ open, initialMode, initialPath, onClose, onConfirm }: PickerProps) {
  const [mode, setMode] = useState<CadViewMode>(initialMode);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const projectTree = useMemo(() => buildProjectTree(projects), [projects]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchProjects(mode)
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [open, mode]);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
        >
          <Typography fontWeight={600}>Select CAD Project</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="CAD app URL settings">
              <IconButton size="small" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Fetching from: <strong>{getCadBaseUrl()}</strong>
          </Typography>
          <Tabs
            value={mode}
            onChange={(_, v: CadViewMode) => setMode(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              mb: 1.5,
              '& .MuiTab-root': { minHeight: 32, fontSize: 11, px: 0.75, minWidth: 'auto' },
            }}
          >
            {(Object.keys(MODE_LABELS) as CadViewMode[]).map((m) => (
              <Tab
                key={m}
                value={m}
                label={MODE_LABELS[m]}
                icon={MODE_ICONS[m] as React.ReactElement}
                iconPosition="start"
              />
            ))}
          </Tabs>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List
              dense
              sx={{
                maxHeight: 260,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              {projects.length === 0 ? (
                <ListItemButton disabled>
                  <ListItemText
                    primary="No projects found"
                    secondary="Check the CAD app URL in settings"
                  />
                </ListItemButton>
              ) : (
                projectTree.children.map((c, i) => (
                  <TreeRow
                    key={`${c.name}-${i}`}
                    node={c}
                    depth={0}
                    icon={MODE_ICONS[mode]}
                    selectedPath={initialPath}
                    onPick={(e) => {
                      onConfirm(mode, e.path);
                      onClose();
                    }}
                  />
                ))
              )}
            </List>
          )}
        </DialogContent>
      </Dialog>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

// ── Native viewer (core-cad-viewer) ───────────────────────────────────────────

// Recover the vfs path from a legacy `{base}/viewer/{mode}/{vfsPath}` url so old
// embeds keep working after the switch from iframe to native rendering.
function vfsPathFromUrl(url: string): string {
  const m = url.match(/\/viewer\/[^/]+\/(.+)$/);
  return m ? m[1] : '';
}

// The CAD backend origin baked into the embed's url (`{base}/viewer/…`). Using
// it (rather than the per-browser localStorage default) makes the embed
// self-contained, so it works on other devices — e.g. mobile, where the
// `http://localhost:1898` default is unreachable ("failed to fetch").
function baseFromUrl(url: string): string {
  const i = url.indexOf('/viewer/');
  return i > 0 ? url.slice(0, i) : '';
}

// „Change project" wyzwalane z menu bloczka (⋮): NodeView nasłuchuje i otwiera picker.
export const CADVIEW_EDIT_EVENT = 'md-cadview-edit';
export interface CadViewEditEventDetail {
  pos: number;
}

/** Zewnętrzny URL „Open in CAD app" wyliczony z atrybutów bloczka cadView. */
export function getCadExternalUrl(attrs: { mode?: string; path?: string; url?: string }): string {
  const url = attrs.url || '';
  const vfsPath = attrs.path || vfsPathFromUrl(url);
  if (!vfsPath) return '';
  const apiBase = baseFromUrl(url) || getCadBaseUrl();
  const mode = (attrs.mode as string) || 'scene3d';
  return `${apiBase.replace(/\/$/, '')}/viewer/${mode}/${vfsPath}`;
}

// The viewer pages use hardcoded dark panels but pull TEXT colours from the MUI
// theme (`text.secondary`, `divider`, …). Embedded in the light-themed editor
// those tokens turn dark → dark-on-dark, "colours blend". Forcing a dark theme
// around the embed makes the tokens resolve light again (fixes every mode).
const viewerDarkTheme = createTheme({ palette: { mode: 'dark' } });

/** Renders the appropriate core-cad-viewer page for `mode`, reading scenes from
 *  the CAD backend origin (cross-origin — needs CORS on the backend). */
function NativeCadViewer({
  mode,
  vfsPath,
  apiBase,
}: {
  mode: CadViewMode;
  vfsPath: string;
  apiBase: string;
}) {
  // Point the viewer's VFS client at the CAD backend before it fetches.
  setViewerApiBase(apiBase);
  setViewerUserId('default');
  const common = { vfsPath };
  switch (mode) {
    case 'cad':
      return <CadViewerPage {...common} />;
    case 'cad3d':
      return <Cad3dViewerPage {...common} />;
    case 'electronics':
      return <ElectronicsViewerPage {...common} />;
    case 'pcb':
      return <PcbViewerPage {...common} />;
    case 'map':
      return <MapViewerPage {...common} />;
    case 'notes':
      return <NotesViewerPage {...common} />;
    case 'lego':
      return <LegoViewerPage {...common} />;
    case 'scene3d':
    default:
      return <Scene3dViewerPage {...common} />;
  }
}

// ── Node view ────────────────────────────────────────────────────────────────

function CadViewNodeView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const mode = (node.attrs.mode as CadViewMode) || 'scene3d';
  const url: string = node.attrs.url || '';
  const vfsPath: string = (node.attrs.path as string) || vfsPathFromUrl(url);
  const [pickerOpen, setPickerOpen] = useState(!vfsPath);
  const { minimalView } = useMdViewSettings();

  // „Change project" z menu bloczka (⋮): otwórz picker, gdy zdarzenie dotyczy TEGO węzła.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent<CadViewEditEventDetail>).detail;
      if (detail && typeof getPos === 'function' && detail.pos === getPos()) setPickerOpen(true);
    };
    window.addEventListener(CADVIEW_EDIT_EVENT, onEdit);
    return () => window.removeEventListener(CADVIEW_EDIT_EVENT, onEdit);
  }, [getPos]);

  // Display name: last path segment of the vfs path.
  const label = vfsPath ? decodeURIComponent(vfsPath.split('/').pop() ?? vfsPath) : '';
  // API base: prefer the origin baked into the embed's url (works cross-device),
  // fall back to the per-browser configured base.
  const apiBase = baseFromUrl(url) || getCadBaseUrl();
  // External "open in CAD app" link — use the embed's own base when present.
  const externalUrl = vfsPath ? `${apiBase.replace(/\/$/, '')}/viewer/${mode}/${vfsPath}` : '';

  const handleConfirm = useCallback(
    (m: CadViewMode, path: string) => {
      updateAttributes({ mode: m, path, url: buildViewerUrl(m, path) });
    },
    [updateAttributes]
  );

  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper>
      <Box
        className="md-cadview-embed"
        contentEditable={false}
        // Widok minimalny: bez ramki i bez marginesów (bloczek „na styk").
        sx={
          minimalView
            ? { overflow: 'hidden', my: 0, bgcolor: 'background.paper' }
            : {
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
                my: 1,
                bgcolor: 'background.paper',
              }
        }
      >
        {/* Header — ukryty w widoku minimalnym (akcje dostępne z menu kontekstowego). */}
        {!minimalView && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              bgcolor: 'background.default',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {MODE_ICONS[mode]}
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              {label || <em style={{ opacity: 0.5 }}>No project selected</em>}
            </Typography>
            <Chip label={MODE_LABELS[mode]} size="small" sx={{ fontSize: 10, height: 18 }} />
            {isEditable && (
              <Tooltip title="Change project">
                <IconButton size="small" onClick={() => setPickerOpen(true)}>
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
            {externalUrl && (
              <Tooltip title="Open in CAD app">
                <IconButton
                  size="small"
                  component="a"
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <OpenInNewIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Content — native core-cad-viewer render (no iframe). */}
        {vfsPath ? (
          <Box sx={{ position: 'relative', width: '100%', height: 360 }}>
            <ThemeProvider theme={viewerDarkTheme}>
              <NativeCadViewer
                key={`${apiBase}:${mode}:${vfsPath}`}
                mode={mode}
                vfsPath={vfsPath}
                apiBase={apiBase}
              />
            </ThemeProvider>
          </Box>
        ) : (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Click the edit icon to select a project.
            </Typography>
          </Box>
        )}
      </Box>

      <ProjectPickerDialog
        open={pickerOpen}
        initialMode={mode}
        initialPath={vfsPath}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleConfirm}
      />
    </NodeViewWrapper>
  );
}

// ── TipTap node ──────────────────────────────────────────────────────────────

export const CadViewEmbed = Node.create({
  name: 'cadViewEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      mode: { default: 'scene3d' },
      // `path` is the vfs path (native render). `url` kept for the external
      // "open in CAD app" link + backward-compat with pre-native embeds.
      path: { default: '' },
      url: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="cad-view-embed"]',
        getAttrs(node) {
          if (typeof node === 'string') return false;
          const el = node as HTMLElement;
          return {
            mode: el.getAttribute('data-mode') || 'scene3d',
            path: el.getAttribute('data-path') || '',
            url: el.getAttribute('data-url') || '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        'data-type': 'cad-view-embed',
        'data-mode': node.attrs.mode,
        'data-path': node.attrs.path,
        'data-url': node.attrs.url,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CadViewNodeView);
  },

  addCommands() {
    return {
      insertCadView:
        (mode: CadViewMode = 'scene3d', path = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { mode, path, url: path ? buildViewerUrl(mode, path) : '' },
          }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cadViewEmbed: {
      insertCadView: (mode?: CadViewMode, url?: string) => ReturnType;
    };
  }
}

export default CadViewEmbed;
