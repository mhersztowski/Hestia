/**
 * MdFileTreePickerDialog — internal-link picker with tabs (Obsidian-style):
 *   • Plik      — pick a .md file                         → [[plik]]
 *   • Nagłówek  — TOC of the CURRENT document, pick one    → [[#Nagłówek]]
 *   • Blok      — type a block id for the CURRENT document → [[#^blok]]
 *
 * Files (Plik tab) come from the drive subtree (MQTT `listDirectory('/')` → the
 * `drive` folder), shown as a collapsible tree with a search filter. The heading
 * and block tabs operate on the current document only — headings arrive via the
 * `headings` prop. The chosen target is handed back via `onSelect`.
 */

import React, { useEffect, useMemo, useState } from 'react';
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
  Collapse,
  Tabs,
  Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TagIcon from '@mui/icons-material/Tag';
import { useEditorFiles } from '../capabilities';
import type { DirectoryTree } from '@hestia/core';

export interface InternalLinkTarget {
  path?: string; // workspace path; omitted → anchor in the current doc
  anchor?: string; // heading text or block id
  anchorType?: 'heading' | 'block';
}

export interface MdFileTreePickerDialogProps {
  open: boolean;
  /** Headings of the CURRENT document — the "Nagłówek" tab shows them as a TOC. */
  headings: { level: number; text: string }[];
  /** Dialog heading — defaults to the internal-link title; embeds override it. */
  title?: string;
  onClose: () => void;
  onSelect: (target: InternalLinkTarget) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

function pruneMd(tree: DirectoryTree): TreeNode | null {
  if (tree.type === 'file') {
    return tree.name.endsWith('.md') && !tree.name.startsWith('.')
      ? { name: tree.name, path: tree.path, type: 'file' }
      : null;
  }
  const children = (tree.children ?? [])
    .map(pruneMd)
    .filter((n): n is TreeNode => n !== null)
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  if (children.length === 0) return null;
  return {
    name: tree.name || tree.path.split('/').pop() || '/',
    path: tree.path,
    type: 'dir',
    children,
  };
}

function filterTree(node: TreeNode, q: string): TreeNode | null {
  if (node.type === 'file') {
    return node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q) ? node : null;
  }
  const kids = (node.children ?? [])
    .map((c) => filterTree(c, q))
    .filter((n): n is TreeNode => n !== null);
  return kids.length ? { ...node, children: kids } : null;
}

const TreeRows: React.FC<{
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  forceOpen: boolean;
  onPick: (path: string) => void;
}> = ({ nodes, depth, expanded, toggle, forceOpen, onPick }) => (
  <>
    {nodes.map((node) => {
      const isOpen = forceOpen || expanded.has(node.path);
      if (node.type === 'dir') {
        return (
          <React.Fragment key={node.path}>
            <ListItemButton onClick={() => toggle(node.path)} sx={{ pl: 1 + depth * 2 }} dense>
              <ListItemIcon sx={{ minWidth: 26 }}>
                {isOpen ? (
                  <ExpandMoreIcon fontSize="small" />
                ) : (
                  <ChevronRightIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 30 }}>
                {isOpen ? (
                  <FolderOpenIcon fontSize="small" color="action" />
                ) : (
                  <FolderIcon fontSize="small" color="action" />
                )}
              </ListItemIcon>
              <ListItemText primary={node.name} />
            </ListItemButton>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <TreeRows
                nodes={node.children ?? []}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                forceOpen={forceOpen}
                onPick={onPick}
              />
            </Collapse>
          </React.Fragment>
        );
      }
      return (
        <ListItemButton
          key={node.path}
          onClick={() => onPick(node.path)}
          sx={{ pl: 1 + depth * 2 }}
          dense
        >
          <ListItemIcon sx={{ minWidth: 26 }} />
          <ListItemIcon sx={{ minWidth: 30 }}>
            <DescriptionIcon fontSize="small" color="action" />
          </ListItemIcon>
          <ListItemText
            primary={node.name.replace(/\.md$/i, '')}
            secondary={node.path.replace(/^drive\//, '')}
          />
        </ListItemButton>
      );
    })}
  </>
);

type TabKey = 'file' | 'heading' | 'block';

const MdFileTreePickerDialog: React.FC<MdFileTreePickerDialogProps> = ({
  open,
  headings,
  title,
  onClose,
  onSelect,
}) => {
  const { listDirectory } = useEditorFiles() ?? {};
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>('file');
  const [blockId, setBlockId] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFilter('');
    setExpanded(new Set());
    setTab('file');
    setBlockId('');
    if (!listDirectory) return;
    listDirectory('/')
      .then((tree) => {
        const pruned = pruneMd(tree);
        // Show only the drive subtree (this picker links drive notes).
        const drive = pruned?.children?.find((c) => c.type === 'dir' && c.name === 'drive');
        setRoot(drive ?? pruned);
      })
      .catch(() => setRoot(null))
      .finally(() => setLoading(false));
  }, [open, listDirectory]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!root) return [] as TreeNode[];
    if (!q) return root.children ?? [];
    const f = filterTree(root, q);
    return f?.children ?? [];
  }, [root, q]);

  const treePane = (onPick: (p: string) => void) => (
    <>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          autoFocus
          placeholder="Filtruj pliki .md…"
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
      ) : visible.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          {root ? 'Brak dopasowań do filtru.' : 'Brak plików .md w drive.'}
        </Box>
      ) : (
        <List sx={{ maxHeight: 380, overflow: 'auto' }} dense disablePadding>
          <TreeRows
            nodes={visible}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            forceOpen={!!q}
            onPick={onPick}
          />
        </List>
      )}
    </>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DescriptionIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          {title ?? 'Link wewnętrzny'}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} variant="fullWidth">
        <Tab value="file" label="Plik" />
        <Tab value="heading" label="Nagłówek" />
        <Tab value="block" label="Blok" />
      </Tabs>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* PLIK — pick a .md file → [[plik]] */}
        {tab === 'file' &&
          treePane((p) => {
            onSelect({ path: p });
            onClose();
          })}

        {/* NAGŁÓWEK — table of contents of the CURRENT document → [[#Nagłówek]] */}
        {tab === 'heading' &&
          (headings.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              Bieżący dokument nie ma nagłówków.
            </Box>
          ) : (
            <List sx={{ maxHeight: 420, overflow: 'auto' }} dense>
              {headings.map((h, i) => (
                <ListItemButton
                  key={`${i}-${h.text}`}
                  sx={{ pl: 1 + (h.level - 1) * 1.5 }}
                  onClick={() => {
                    onSelect({ anchor: h.text, anchorType: 'heading' });
                    onClose();
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <TagIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText primary={h.text} secondary={'#'.repeat(h.level)} />
                </ListItemButton>
              ))}
            </List>
          ))}

        {/* BLOK — type a block id → [[#^blok]] (anchor in the current document) */}
        {tab === 'block' && (
          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              size="small"
              autoFocus
              label="Id bloku (po ^)"
              placeholder="np. abc123"
              value={blockId}
              onChange={(e) => setBlockId(e.target.value.replace(/[^\w-]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && blockId.trim()) {
                  onSelect({ anchor: blockId.trim(), anchorType: 'block' });
                  onClose();
                }
              }}
              helperText={`Zapisze się jako [[#^${blockId.trim() || 'id'}]]`}
            />
            <Button
              sx={{ mt: 1.5 }}
              variant="contained"
              disabled={!blockId.trim()}
              onClick={() => {
                if (blockId.trim()) {
                  onSelect({ anchor: blockId.trim(), anchorType: 'block' });
                  onClose();
                }
              }}
            >
              Wstaw link do bloku
            </Button>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MdFileTreePickerDialog;
