/**
 * The side panels and their parts: the codemap/diagram tree, the member
 * editor, the linked-files panel, and the resizable panel edges.
 */
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SchemaIcon from '@mui/icons-material/Schema';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { UmlDiagram, UmlKind, UmlMember } from '@hestia/node-devtools/format';
import { outputKind } from './generate';
import {
  VIS_COLOR,
  VIS_LABEL,
  VIS_ORDER,
  categoryColor,
  changeTextSigil,
  memberSigil,
} from './model';

// ── Resizable panels ─────────────────────────────────────────────────────────

/** A panel width that survives reloads (kept in `localStorage`). */
export function usePersistentWidth(key: string, initial: number): [number, (w: number) => void] {
  const [width, setWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (w: number) => {
      setWidth(w);
      try {
        localStorage.setItem(key, String(Math.round(w)));
      } catch {
        /* storage blocked — the width lives until a reload */
      }
    },
    [key]
  );
  return [width, set];
}

/**
 * A vertical drag handle that resizes the adjacent panel; `side` says which
 * side of the handle the panel is on. Desktop only — on a phone the panels
 * overlay the canvas, and dragging their edge makes no sense.
 */
export function ResizeHandle({
  side,
  width,
  setWidth,
  min = 160,
  max = 700,
}: {
  side: 'left' | 'right';
  width: number;
  setWidth: (w: number) => void;
  min?: number;
  max?: number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <Box
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const w = side === 'left' ? start.current.w + dx : start.current.w - dx;
        setWidth(Math.max(min, Math.min(max, w)));
      }}
      onPointerUp={(e) => {
        start.current = null;
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
      sx={{
        display: { xs: 'none', md: 'block' },
        flexShrink: 0,
        width: '6px',
        cursor: 'col-resize',
        bgcolor: 'transparent',
        '&:hover': { bgcolor: 'primary.main', opacity: 0.5 },
        transition: 'background-color .15s',
        zIndex: 7,
      }}
    />
  );
}

// ── The codemap / diagram tree ───────────────────────────────────────────────

export function CodemapTreeItem({
  label,
  sublabel,
  active,
  expanded,
  linkedPath,
  diagrams,
  activeDiagramId,
  onOpen,
  onSelectDiagram,
  onAddDiagram,
  onRenameDiagram,
  onDeleteDiagram,
  onLink,
  onUnlink,
  onRename,
  onDelete,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  expanded: boolean;
  linkedPath?: string;
  diagrams: UmlDiagram[];
  activeDiagramId: string | null;
  onOpen?: () => void;
  onSelectDiagram: (id: string) => void;
  onAddDiagram: () => void;
  onRenameDiagram: (id: string) => void;
  onDeleteDiagram: (id: string) => void;
  onLink: () => void;
  onUnlink: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <>
      <ListItem
        disablePadding
        secondaryAction={
          active ? (
            <Stack direction="row">
              <Tooltip
                title={
                  linkedPath
                    ? `Source directory: ${linkedPath} (click to unlink)`
                    : 'Link to a source directory'
                }
              >
                <IconButton size="small" edge="end" onClick={linkedPath ? onUnlink : onLink}>
                  {linkedPath ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              {onRename && (
                <Tooltip title="Rename / save">
                  <IconButton size="small" edge="end" onClick={onRename}>
                    <DriveFileRenameOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip title="Delete codemap">
                  <IconButton size="small" edge="end" onClick={onDelete}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : undefined
        }
      >
        <ListItemButton selected={active} onClick={onOpen} sx={{ pr: active ? 12 : 2 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText
            primary={label}
            secondary={sublabel ?? (linkedPath ? `→ ${linkedPath}` : undefined)}
            primaryTypographyProps={{ fontWeight: active ? 700 : 400, noWrap: true }}
            secondaryTypographyProps={{ noWrap: true, fontSize: 10 }}
          />
        </ListItemButton>
      </ListItem>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <List dense disablePadding>
          {diagrams.map((d) => (
            <ListItem
              key={d.id}
              disablePadding
              sx={{ pl: 2 }}
              secondaryAction={
                <Stack direction="row">
                  <Tooltip title="Rename">
                    <IconButton size="small" edge="end" onClick={() => onRenameDiagram(d.id)}>
                      <DriveFileRenameOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete diagram">
                    <IconButton size="small" edge="end" onClick={() => onDeleteDiagram(d.id)}>
                      <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
            >
              <ListItemButton
                selected={d.id === activeDiagramId}
                onClick={() => onSelectDiagram(d.id)}
                sx={{ pl: 3, pr: 9 }}
              >
                <ListItemIcon sx={{ minWidth: 26 }}>
                  <SchemaIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary={d.name}
                  primaryTypographyProps={{ noWrap: true, fontSize: 13 }}
                />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding sx={{ pl: 5 }}>
            <ListItemButton onClick={onAddDiagram}>
              <ListItemIcon sx={{ minWidth: 26 }}>
                <NoteAddIcon sx={{ fontSize: 16 }} />
              </ListItemIcon>
              <ListItemText
                primary="New diagram"
                primaryTypographyProps={{ fontSize: 12, color: 'text.secondary' }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Collapse>
    </>
  );
}

// ── Member editor ────────────────────────────────────────────────────────────

/** A compact dot that opens a small popover for choosing a member's category. */
function CategoryPicker({
  value,
  categories,
  listId,
  onChange,
}: {
  value: string;
  categories: string[];
  listId: string;
  onChange: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<Element | null>(null);
  const [local, setLocal] = useState('');
  const open = (e: MouseEvent) => {
    setLocal(value);
    setAnchor(e.currentTarget);
  };
  const close = () => setAnchor(null);
  const commit = (v: string) => {
    onChange(v);
    close();
  };
  return (
    <>
      <Tooltip title={value || 'Category'} placement="right">
        <Box
          onClick={open}
          sx={{
            width: 32,
            height: 19,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { borderColor: 'text.primary' },
          }}
        >
          {value ? (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: categoryColor(value) }} />
          ) : (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '1px dashed',
                borderColor: 'text.disabled',
              }}
            />
          )}
        </Box>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { p: 1, width: 200 } }}
      >
        <datalist id={listId + '-cat'}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Category…"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(local);
            if (e.key === 'Escape') close();
          }}
          inputProps={{ list: listId + '-cat' }}
          InputProps={{
            endAdornment: local ? (
              <IconButton size="small" onClick={() => commit('')}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            ) : undefined,
          }}
        />
        {categories.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
            {categories.map((c) => (
              <Chip
                key={c}
                label={c}
                size="small"
                onClick={() => commit(c)}
                sx={{
                  bgcolor: categoryColor(c),
                  color: '#fff',
                  fontSize: 10,
                  cursor: 'pointer',
                  height: 20,
                }}
              />
            ))}
          </Stack>
        )}
      </Popover>
    </>
  );
}

export function MemberSection({
  title,
  members,
  categories,
  onAdd,
  onChange,
  onCategory,
  onDelete,
  onReorder,
}: {
  title: string;
  members: UmlMember[];
  categories: string[];
  onAdd: () => void;
  onChange: (id: string, text: string) => void;
  onCategory: (id: string, category: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const listId = `codemap-cat-${title.replace(/\s+/g, '-')}`;
  const dragId = useRef<string | null>(null);
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ minWidth: 0 }}>
          Add
        </Button>
      </Stack>
      <Stack spacing={0.75}>
        {members.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            — none —
          </Typography>
        )}
        {members.map((m) => {
          const sig = memberSigil(m.text);
          return (
            <Stack
              key={m.id}
              direction="row"
              spacing={0.5}
              alignItems="flex-start"
              onDragOver={(e) => {
                if (dragId.current) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId.current;
                dragId.current = null;
                if (from && from !== m.id) onReorder(from, m.id);
              }}
            >
              {/* Drag handle — reorders within this section */}
              <Box
                draggable
                onDragStart={(e) => {
                  dragId.current = m.id;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragId.current = null;
                }}
                title="Drag to reorder"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  alignSelf: 'stretch',
                  cursor: 'grab',
                  color: 'text.disabled',
                  '&:hover': { color: 'text.secondary' },
                  '&:active': { cursor: 'grabbing' },
                }}
              >
                <DragIndicatorIcon sx={{ fontSize: 16 }} />
              </Box>
              {/* Visibility dot above the category dot — together as tall as the text field */}
              <Stack spacing="1px" sx={{ flexShrink: 0 }}>
                <TextField
                  select
                  size="small"
                  value={sig}
                  onChange={(e) => onChange(m.id, changeTextSigil(m.text, e.target.value))}
                  sx={{
                    width: 32,
                    '& .MuiInputBase-root': { height: 19 },
                    '& .MuiSelect-icon': { display: 'none' },
                    '& .MuiOutlinedInput-input': {
                      px: '4px !important',
                      py: '0px !important',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                  }}
                  SelectProps={{
                    renderValue: (v) => (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: VIS_COLOR[v as string] ?? '#888',
                          mx: 'auto',
                        }}
                      />
                    ),
                  }}
                >
                  {VIS_ORDER.map((s) => (
                    <MenuItem key={s} value={s} sx={{ fontSize: 12 }}>
                      <Box
                        component="span"
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: VIS_COLOR[s],
                          display: 'inline-block',
                          mr: 0.75,
                          flexShrink: 0,
                        }}
                      />
                      <Box
                        component="span"
                        sx={{ fontFamily: 'monospace', mr: 0.5, color: VIS_COLOR[s] }}
                      >
                        {s}
                      </Box>
                      {VIS_LABEL[s]}
                    </MenuItem>
                  ))}
                </TextField>
                <CategoryPicker
                  value={m.category ?? ''}
                  categories={categories}
                  listId={listId}
                  onChange={(v) => onCategory(m.id, v)}
                />
              </Stack>
              <TextField
                size="small"
                fullWidth
                value={m.text}
                onChange={(e) => onChange(m.id, e.target.value)}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <IconButton size="small" onClick={() => onDelete(m.id)}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

// ── Linked-files panel ───────────────────────────────────────────────────────

export interface Linker {
  className: string;
  diagramName: string;
  kind: UmlKind;
}
interface FileTreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: Record<string, FileTreeNode>;
  linkers: Linker[];
}
interface FlatRow {
  node: FileTreeNode;
  display: string;
  depth: number;
  isFile: boolean;
}

function buildFileTree(items: { file: string; linker: Linker }[]): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', isFile: false, children: {}, linkers: [] };
  for (const { file, linker } of items) {
    const parts = file.split('/').filter(Boolean);
    let cur = root;
    let acc = '';
    parts.forEach((p, i) => {
      acc = acc ? `${acc}/${p}` : p;
      const isFile = i === parts.length - 1;
      if (!cur.children[p])
        cur.children[p] = { name: p, path: acc, isFile, children: {}, linkers: [] };
      cur = cur.children[p];
      if (isFile) cur.linkers.push(linker);
    });
  }
  return root;
}

/** Flattens the tree for a list, folding single-child directory chains into one row (`src/a/b`). */
function flattenTree(
  node: FileTreeNode,
  depth: number,
  collapsed: Set<string>,
  out: FlatRow[]
): void {
  let eff = node;
  let display = node.name;
  let keys = Object.keys(eff.children);
  while (!eff.isFile && keys.length === 1 && !eff.children[keys[0]].isFile) {
    eff = eff.children[keys[0]];
    display = `${display}/${eff.name}`;
    keys = Object.keys(eff.children);
  }
  const children = Object.values(eff.children).sort((a, b) =>
    a.isFile !== b.isFile ? (a.isFile ? 1 : -1) : a.name.localeCompare(b.name)
  );
  out.push({ node: eff, display, depth, isFile: eff.isFile });
  if (!eff.isFile && !collapsed.has(eff.path))
    for (const c of children) flattenTree(c, depth + 1, collapsed, out);
}

const OUTPUT_LABEL = { 'json-schema': 'JSON Schema', dts: 'TS types' } as const;

export function LinkedFilesPanel({
  linkedPath,
  items,
  onPreview,
  onClose,
  width = 280,
  outputs = [],
  generating = null,
  onAddOutput,
  onRemoveOutput,
  onGenerate,
}: {
  linkedPath?: string;
  items: { file: string; linker: Linker }[];
  onPreview: (path: string) => void;
  onClose: () => void;
  width?: number;
  outputs?: string[];
  generating?: string | null;
  onAddOutput?: () => void;
  onRemoveOutput?: (file: string) => void;
  onGenerate?: (file: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildFileTree(items), [items]);
  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    const top = Object.values(tree.children).sort((a, b) =>
      a.isFile !== b.isFile ? (a.isFile ? 1 : -1) : a.name.localeCompare(b.name)
    );
    for (const c of top) flattenTree(c, 0, collapsed, out);
    return out;
  }, [tree, collapsed]);
  const toggle = (path: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  return (
    <Box
      sx={{
        width,
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <AccountTreeIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Linked files
        </Typography>
        <Tooltip title="Hide panel">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {linkedPath && (
        <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Source directory
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}
          >
            {linkedPath}
          </Typography>
        </Box>
      )}

      {/* Files generated from the diagrams */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Output files
          </Typography>
          {onAddOutput && (
            <Button size="small" onClick={onAddOutput} sx={{ minWidth: 0, px: 1 }}>
              + Add
            </Button>
          )}
        </Box>
        {outputs.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ px: 1.5, pb: 0.75, display: 'block' }}
          >
            Add a *.schema.json or *.d.ts to generate it from the diagrams.
          </Typography>
        ) : (
          <List dense disablePadding>
            {outputs.map((f) => {
              const base = f.split('/').pop() || f;
              const kind = outputKind(f);
              const label = kind ? OUTPUT_LABEL[kind] : '—';
              return (
                <ListItem
                  key={f}
                  disablePadding
                  sx={{ pr: 0.5 }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Tooltip title={`Generate (${label}) from the diagrams`}>
                        <span>
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => onGenerate?.(f)}
                            disabled={generating === f}
                          >
                            {generating === f ? (
                              <CircularProgress size={14} />
                            ) : (
                              <PlayArrowIcon sx={{ fontSize: 17 }} />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      {onRemoveOutput && (
                        <Tooltip title="Remove from the list">
                          <IconButton size="small" onClick={() => onRemoveOutput(f)}>
                            <CloseIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  }
                >
                  <ListItemButton sx={{ py: 0.25, pr: 9 }} onClick={() => onPreview(f)}>
                    <ListItemIcon sx={{ minWidth: 26 }}>
                      <InsertDriveFileIcon sx={{ fontSize: 16 }} color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={base}
                      secondary={label}
                      primaryTypographyProps={{
                        noWrap: true,
                        fontSize: 12,
                        fontFamily: 'monospace',
                      }}
                      secondaryTypographyProps={{ noWrap: true, fontSize: 10 }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
            No linked files. Select a class and use "Link to file".
          </Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((r) => (
              <ListItem key={(r.isFile ? 'f:' : 'd:') + r.node.path} disablePadding>
                <ListItemButton
                  sx={{ pl: 1 + r.depth * 1.5, py: 0.25 }}
                  onClick={() => (r.isFile ? onPreview(r.node.path) : toggle(r.node.path))}
                >
                  <ListItemIcon sx={{ minWidth: 26 }}>
                    {r.isFile ? (
                      <InsertDriveFileIcon sx={{ fontSize: 16 }} color="action" />
                    ) : collapsed.has(r.node.path) ? (
                      <FolderIcon sx={{ fontSize: 16 }} color="primary" />
                    ) : (
                      <FolderOpenIcon sx={{ fontSize: 16 }} color="primary" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={r.display}
                    primaryTypographyProps={{
                      noWrap: true,
                      fontSize: 12,
                      fontFamily: r.isFile ? 'monospace' : undefined,
                    }}
                    secondary={
                      r.isFile && r.node.linkers.length > 0
                        ? r.node.linkers.map((l) => `${l.className} · ${l.diagramName}`).join(', ')
                        : undefined
                    }
                    secondaryTypographyProps={{ noWrap: true, fontSize: 10 }}
                  />
                  {r.isFile && (
                    <VisibilityIcon sx={{ fontSize: 15, ml: 0.5, color: 'text.disabled' }} />
                  )}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
