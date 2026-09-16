/**
 * FormEngine Extension — embeds a @react-form-builder form inside a markdown document.
 * The form JSON is stored as a .form.json file in VFS.
 * The block stores only the VFS path; the NodeView loads the actual JSON at render time.
 */

import { useCallback, useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DynamicFormIcon from '@mui/icons-material/DynamicForm';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { FormViewer } from '@react-form-builder/core';
import { view } from '@react-form-builder/components-material-ui';
import { useEditorFiles } from '../capabilities';
import type { DirectoryTree } from '@hestia/core';

// ── File picker dialog ────────────────────────────────────────────────────────

interface FormFilePickerProps {
  open: boolean;
  selectedPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

function collectFormFiles(tree: DirectoryTree): string[] {
  if (tree.type === 'file' && tree.name.endsWith('.form.json')) return [tree.path];
  return (tree.children ?? []).flatMap(collectFormFiles);
}

const FormFilePicker: React.FC<FormFilePickerProps> = ({
  open,
  selectedPath,
  onClose,
  onSelect,
}) => {
  const { listDirectory } = useEditorFiles() ?? {};
  const [files, setFiles] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    if (!listDirectory) return;
    listDirectory('/')
      .then((tree) => setFiles(collectFormFiles(tree)))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open, listDirectory]);

  const filtered = filter.trim()
    ? files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()))
    : files;

  const handleCreate = () => {
    const p = newPath.trim().replace(/\.form\.json$/, '') + '.form.json';
    if (p && p !== '.form.json') {
      onSelect(p);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DynamicFormIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Select form
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder="Search..."
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
            {files.length === 0 ? 'No .form.json files found' : 'No match'}
          </Box>
        ) : (
          <List sx={{ maxHeight: 260, overflow: 'auto' }}>
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
                  <DynamicFormIcon
                    fontSize="small"
                    color={f === selectedPath ? 'primary' : 'action'}
                  />
                </ListItemIcon>
                <ListItemText primary={f.split('/').pop()} secondary={f} />
              </ListItemButton>
            ))}
          </List>
        )}

        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Or type new path, e.g. forms/my-form"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button variant="outlined" size="small" onClick={handleCreate} disabled={!newPath.trim()}>
            Create
          </Button>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Node View ─────────────────────────────────────────────────────────────────

const FormEngineNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const { readFile } = useEditorFiles() ?? {};
  const formPath = node.attrs.formPath as string;

  const [dialogOpen, setDialogOpen] = useState(!formPath);
  const [hovered, setHovered] = useState(false);
  const [formJson, setFormJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFormJson = useCallback(() => formJson ?? '', [formJson]);

  const loadForm = useCallback(async () => {
    if (!formPath) return;
    setLoading(true);
    setError(null);
    try {
      if (!readFile) return;
      const file = await readFile(formPath);
      setFormJson(file.content);
    } catch {
      setError('Could not load form file');
      setFormJson(null);
    } finally {
      setLoading(false);
    }
  }, [formPath, readFile]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleSelect = (path: string) => {
    updateAttributes({ formPath: path });
    setDialogOpen(false);
  };

  if (!formPath) {
    return (
      <NodeViewWrapper>
        <Paper
          sx={{
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            border: selected ? '2px solid' : '1px dashed',
            borderColor: selected ? 'primary.main' : 'grey.400',
            '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
          }}
          onClick={() => setDialogOpen(true)}
        >
          <DynamicFormIcon sx={{ fontSize: 40, color: 'action.active', mb: 1 }} />
          <Typography color="text.secondary">Click to select a form</Typography>
        </Paper>
        <FormFilePicker
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSelect={handleSelect}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <Paper
        elevation={selected ? 4 : 1}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: 'relative',
          border: selected ? '2px solid' : '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          overflow: 'hidden',
        }}
      >
        {hovered && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 10,
              display: 'flex',
              gap: 0.5,
              bgcolor: 'background.paper',
              borderRadius: 1,
              p: 0.25,
              boxShadow: 1,
            }}
          >
            <Tooltip title="Change form">
              <IconButton size="small" onClick={() => setDialogOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Open in designer">
              <IconButton
                size="small"
                onClick={() =>
                  window.open(`/designer/form/${formPath.replace(/\.form\.json$/, '')}`, '_blank')
                }
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            bgcolor: 'action.hover',
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <DynamicFormIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {formPath}
          </Typography>
        </Box>

        <Box sx={{ p: 1 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {error && (
            <Typography color="error" variant="body2" sx={{ p: 1 }}>
              {error}
            </Typography>
          )}
          {formJson && !loading && <FormViewer view={view} getForm={getFormJson} />}
        </Box>
      </Paper>

      <FormFilePicker
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelect}
        selectedPath={formPath}
      />
    </NodeViewWrapper>
  );
};

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const FormEngineEmbed = Node.create({
  name: 'formEngineEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      formPath: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="form-engine-embed"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return { formPath: (node as HTMLElement).getAttribute('data-form-path') || '' };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { 'data-type': 'form-engine-embed', 'data-form-path': node.attrs.formPath }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormEngineNodeView);
  },

  addCommands() {
    return {
      insertFormEngine:
        (formPath: string = '') =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs: { formPath } });
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formEngineEmbed: {
      insertFormEngine: (formPath?: string) => ReturnType;
    };
  }
}

export default FormEngineEmbed;
