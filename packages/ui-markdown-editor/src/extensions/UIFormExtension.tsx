/**
 * UI Form Extension - rozszerzenie Tiptap do osadzania formularzy UI w markdown
 * Format: @[uiform:form-id] lub @[uiform:{...inline json...}]
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

import { useEditorServices, type UIForm as UIFormModel } from '../capabilities';

// Dialog wyboru formularza
interface UIFormPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (formId: string) => void;
  selectedId?: string;
}

const UIFormPickerDialog: React.FC<UIFormPickerDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedId,
}) => {
  const { forms: uiFormService } = useEditorServices();
  const [filter, setFilter] = useState('');
  const [forms, setForms] = useState<{ id: string; name: string; description?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      if (!uiFormService) {
        setLoading(false);
        return;
      }
      setLoading(true);
      uiFormService.loadForms().then((loadedForms) => {
        setForms(
          loadedForms.map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
          }))
        );
        setLoading(false);
      });
    }
  }, [open]);

  const filteredForms = useMemo(() => {
    if (!filter.trim()) return forms;
    const lowerFilter = filter.toLowerCase();
    return forms.filter(
      (f) =>
        f.name.toLowerCase().includes(lowerFilter) ||
        f.description?.toLowerCase().includes(lowerFilter)
    );
  }, [forms, filter]);

  const handleSelect = (formId: string) => {
    onSelect(formId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <DashboardIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Select UI form
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
            placeholder="Szukaj formularzy..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            autoFocus
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredForms.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            {forms.length === 0 ? 'Brak zdefiniowanych formularzy' : 'No forms found'}
          </Box>
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredForms.map((form) => (
              <ListItemButton
                key={form.id}
                selected={form.id === selectedId}
                onClick={() => handleSelect(form.id)}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <DashboardIcon color={form.id === selectedId ? 'primary' : 'action'} />
                </ListItemIcon>
                <ListItemText primary={form.name} secondary={form.description} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
};

// Node View Component
const UIFormNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const { forms: uiFormService } = useEditorServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [form, setForm] = useState<UIFormModel | null>(null);
  const [loading, setLoading] = useState(true);

  const formId = node.attrs.formId as string;
  const inlineData = node.attrs.inlineData as string | undefined;

  // Załaduj formularz
  useEffect(() => {
    const loadForm = async () => {
      setLoading(true);
      if (!uiFormService) {
        setForm(null);
        setLoading(false);
        return;
      }

      if (inlineData) {
        // Parsuj inline JSON
        const parsed = uiFormService.parseInlineForm(inlineData);
        setForm(parsed);
        setLoading(false);
        return;
      }

      if (formId) {
        // Załaduj z serwisu
        if (!uiFormService.loaded) {
          await uiFormService.loadForms();
        }
        setForm(uiFormService.getFormById(formId));
      } else {
        setForm(null);
      }

      setLoading(false);
    };

    loadForm();
  }, [formId, inlineData]);

  const handleSelectForm = (newFormId: string) => {
    updateAttributes({ formId: newFormId, inlineData: undefined });
    setDialogOpen(false);
  };

  // Placeholder gdy brak formularza
  if (!form && !loading) {
    return (
      <NodeViewWrapper>
        <Paper
          sx={{
            p: 3,
            border: selected ? '2px solid' : '1px dashed',
            borderColor: selected ? 'primary.main' : 'grey.400',
            cursor: 'pointer',
            textAlign: 'center',
            '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
          }}
          onClick={() => setDialogOpen(true)}
        >
          <DashboardIcon sx={{ fontSize: 40, color: 'action.active', mb: 1 }} />
          <Typography color="text.secondary">Kliknij aby wybrać formularz UI</Typography>
        </Paper>

        <UIFormPickerDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSelect={handleSelectForm}
          selectedId={formId}
        />
      </NodeViewWrapper>
    );
  }

  // Loading
  if (loading) {
    return (
      <NodeViewWrapper>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress size={24} />
        </Paper>
      </NodeViewWrapper>
    );
  }

  // Renderuj formularz
  return (
    <NodeViewWrapper>
      <Paper
        elevation={selected ? 4 : 1}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          border: selected ? '2px solid' : '1px solid',
          borderColor: selected ? 'primary.main' : 'grey.200',
          overflow: 'hidden',
        }}
      >
        {/* Toolbar - visible on hover */}
        {isHovered && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 10,
              display: 'flex',
              gap: 0.5,
              bgcolor: 'rgba(255,255,255,0.9)',
              borderRadius: 1,
              p: 0.25,
              boxShadow: 1,
            }}
          >
            <Tooltip title="Zmień formularz">
              <IconButton size="small" onClick={() => setDialogOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {!!form && !inlineData && (
              <Tooltip title="Edit in designer">
                <IconButton
                  size="small"
                  onClick={() => window.open(`/designer/ui/${formId}`, '_blank')}
                >
                  <OpenInFullIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Render form */}
        <Box sx={{ pointerEvents: 'none' }}>{!!form && uiFormService?.render(form, 'view')}</Box>
      </Paper>

      <UIFormPickerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelectForm}
        selectedId={formId}
      />
    </NodeViewWrapper>
  );
};

// Tiptap Extension
export const UIFormEmbed = Node.create({
  name: 'uiFormEmbed',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      formId: { default: '' },
      inlineData: { default: undefined }, // Dla inline JSON
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="ui-form-embed"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          return {
            formId: element.getAttribute('data-form-id') || '',
            inlineData: element.getAttribute('data-inline')
              ? decodeURIComponent(element.getAttribute('data-inline') || '')
              : undefined,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = {
      'data-type': 'ui-form-embed',
    };

    if (node.attrs.formId) {
      attrs['data-form-id'] = node.attrs.formId;
    }
    if (node.attrs.inlineData) {
      attrs['data-inline'] = encodeURIComponent(node.attrs.inlineData);
    }

    return ['div', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(UIFormNodeView);
  },

  addCommands() {
    return {
      insertUIForm:
        (formId: string = '', inlineData?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { formId, inlineData },
          });
        },
    };
  },
});

// Deklaracja typów dla komend
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    uiFormEmbed: {
      insertUIForm: (formId?: string, inlineData?: string) => ReturnType;
    };
  }
}

export default UIFormEmbed;
