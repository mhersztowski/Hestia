import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItemButton, ListItemText, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExtensionIcon from '@mui/icons-material/Extension';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import { MjdVisualEditor } from './MjdVisualEditor';

// A class/enum exported by an imported (using) *.myschema.json file.
export interface ImportedType {
  name: string;
  file: string;
  kind: 'class' | 'enum';
}

interface GlobalJsonEditorProps {
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  defaultName?: string;
  onGenerate?: (name: string, value: Record<string, unknown>) => void | Promise<void>;
  /** Types exported by the files listed in `using` (resolved by the host). */
  importedTypes?: ImportedType[];
  /** Find *.myschema.json files in the user's Drive (for the Add dialog). */
  listMySchemaFiles?: () => Promise<string[]>;
  /** …/drive prefix, used only to show used files by a short relative path. */
  driveRoot?: string;
}

export function GlobalJsonEditor({
  value, onChange, defaultName = '', onGenerate, importedTypes = [], listMySchemaFiles, driveRoot = '',
}: GlobalJsonEditorProps) {
  const [mode, setMode] = useState<'visual' | 'blockly'>('blockly');
  const [name, setName] = useState(defaultName);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { if (defaultName) setName(defaultName); }, [defaultName]);

  const using: string[] = Array.isArray((value as { using?: unknown }).using)
    ? ((value as { using: unknown[] }).using.filter((x) => typeof x === 'string') as string[])
    : [];
  const setUsing = (next: string[]) => onChange({ ...value, using: next });

  const localTypes = [
    ...Object.keys((value.classes as object) ?? {}),
    ...Object.keys((value.enums as object) ?? {}),
  ];

  const rel = (full: string) => (driveRoot && full.startsWith(driveRoot + '/') ? full.slice(driveRoot.length + 1) : full);
  const baseName = (full: string) => full.split('/').pop() || full;

  const handleGenerate = async () => {
    if (!onGenerate || !name.trim()) return;
    setGenerating(true);
    try { await onGenerate(name.trim(), value); }
    finally { setGenerating(false); }
  };

  // ── Add-using dialog ───────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [files, setFiles] = useState<string[] | null>(null);
  const [filter, setFilter] = useState('');

  const openPicker = async () => {
    setPickerOpen(true);
    setFiles(null);
    try { setFiles(listMySchemaFiles ? await listMySchemaFiles() : []); }
    catch { setFiles([]); }
  };
  const toggleUsing = (full: string) => {
    if (using.includes(full)) setUsing(using.filter((p) => p !== full));
    else setUsing([...using, full]);
  };
  const filteredFiles = (files ?? []).filter((f) => !filter || rel(f).toLowerCase().includes(filter.toLowerCase()));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar: Name + Generate (blockly), mode toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, pb: 0.5, flexShrink: 0 }}>
        {mode === 'blockly' && onGenerate && (
          <>
            <TextField
              size="small" label="Name" value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ width: 200, '& .MuiInputBase-input': { fontSize: 13, py: 0.5 } }}
            />
            <Button
              size="small" variant="contained" onClick={() => void handleGenerate()}
              disabled={generating || !name.trim()}
              startIcon={generating ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              Generate
            </Button>
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="visual" sx={{ gap: 0.5, px: 1.5 }}>
            <AccountTreeIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11 }}>Visual</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Using panel (blockly mode): imported schema files + available types */}
      {mode === 'blockly' && (
        <Box sx={{ px: 1.5, py: 0.5, borderTop: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>Using:</Typography>
            {using.length === 0 && <Typography variant="caption" sx={{ color: 'text.disabled' }}>none</Typography>}
            {using.map((f) => (
              <Tooltip key={f} title={rel(f)}>
                <Chip size="small" label={baseName(f)} onDelete={() => setUsing(using.filter((p) => p !== f))} />
              </Tooltip>
            ))}
            <Tooltip title="Add a *.myschema.json to use its classes/enums">
              <IconButton size="small" onClick={() => void openPicker()} disabled={!listMySchemaFiles}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          {(localTypes.length > 0 || importedTypes.length > 0) && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              Available types (use in a <b>ref</b>): {[
                ...localTypes,
                ...importedTypes.map((t) => `${t.name} (${t.file})`),
              ].join(', ')}
            </Typography>
          )}
        </Box>
      )}

      {/* The Blockly view is gone with Blockly; the visual editor is the one mode. */}
      <MjdVisualEditor value={value} onChange={onChange} height="100%" />

      {/* File picker */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add schema to use</DialogTitle>
        <DialogContent dividers>
          <TextField
            size="small" fullWidth autoFocus placeholder="Filter *.myschema.json…"
            value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mb: 1 }}
          />
          {files === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
          ) : filteredFiles.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No matching *.myschema.json files.
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
              {filteredFiles.map((f) => {
                const added = using.includes(f);
                return (
                  <ListItemButton key={f} onClick={() => toggleUsing(f)} selected={added}>
                    {added && <CheckIcon fontSize="small" sx={{ mr: 1, color: 'success.main' }} />}
                    <ListItemText primary={baseName(f)} secondary={rel(f)} primaryTypographyProps={{ fontSize: 13 }} secondaryTypographyProps={{ fontSize: 11 }} />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GlobalJsonEditor;
