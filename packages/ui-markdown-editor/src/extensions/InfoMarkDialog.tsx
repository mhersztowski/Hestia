/**
 * InfoMarkDialog — modal form for inserting a new InfoMark or editing an
 * existing one. Dumb component: takes initial values + onSubmit callback,
 * owns no persistence. The host (MdEditor toolbar) decides whether to call
 * `insertInfoMark` or `updateInfoMark(pos, ...)`.
 *
 * Body field is a multi-line TextField; the popover renders it through
 * ReactMarkdown so the author can use **bold**, lists, code blocks, etc.
 * Live preview at the bottom of the dialog so authors see the rendering
 * before they commit.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Typography,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ClearIcon from '@mui/icons-material/Clear';
import DescriptionIcon from '@mui/icons-material/Description';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditorFiles } from '../capabilities';
import MdFilePickerDialog from './MdFilePickerDialog';

export interface InfoMarkDialogProps {
  open: boolean;
  onClose: () => void;
  /** Initial values — pre-fill for edit; empty for insert. The dialog
   *  resets internal draft state whenever this object's identity changes
   *  AND the dialog opens, so reopening with new initial values works. */
  initial?: { text: string; title: string; body: string; bodyPath: string };
  /** Caller commits the final values. The dialog closes after onSubmit. */
  onSubmit: (values: { text: string; title: string; body: string; bodyPath: string }) => void;
  /** Mode label in title — purely cosmetic. */
  mode?: 'insert' | 'edit';
}

const InfoMarkDialog: React.FC<InfoMarkDialogProps> = ({
  open,
  onClose,
  initial,
  onSubmit,
  mode = 'insert',
}) => {
  const [text, setText] = useState(initial?.text ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [bodyPath, setBodyPath] = useState(initial?.bodyPath ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Preview of file content — fetched whenever `bodyPath` changes (and is
  // non-empty). Plain state instead of useQuery to keep the dialog
  // dependency-free; mqttClient.readFile already deduplicates inflight
  // requests across the app.
  const { readFile } = useEditorFiles() ?? {};
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset draft state whenever dialog opens with a new `initial`. Without
  // this, editing a second info-mark would still show the first one's data
  // because useState's initial value is only used on first render.
  useEffect(() => {
    if (open) {
      setText(initial?.text ?? '');
      setTitle(initial?.title ?? '');
      setBody(initial?.body ?? '');
      setBodyPath(initial?.bodyPath ?? '');
      setFilePreview(null);
      setPreviewError(null);
    }
  }, [open, initial]);

  // Auto-refresh preview when path changes. Empty path → clear preview.
  useEffect(() => {
    if (!bodyPath) {
      setFilePreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    if (!readFile) return;
    readFile(bodyPath)
      .then((r) => {
        if (!cancelled) setFilePreview(r?.content ?? '');
      })
      .catch((err) => {
        if (!cancelled) setPreviewError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bodyPath, readFile]);

  const handlePickerSelect = useCallback((path: string) => {
    setBodyPath(path);
    // Setting a file path implicitly clears the inline body — bodyPath wins
    // at render time anyway, but dropping it here keeps the round-trip
    // markdown clean (no stale `body` segment left over).
    setBody('');
  }, []);

  const handleClearFile = useCallback(() => {
    setBodyPath('');
    setFilePreview(null);
    setPreviewError(null);
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return; // text is required — no submit on empty
    onSubmit({ text: trimmed, title: title.trim(), body, bodyPath });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} />
        {mode === 'edit' ? 'Edytuj wyróżnienie' : 'Wstaw wyróżnienie z opisem'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            autoFocus
            label="Widoczny tekst"
            value={text}
            onChange={(e) => setText(e.target.value)}
            helperText="Tekst wyświetlany w dokumencie jako klikalne wyróżnienie."
            fullWidth
            size="small"
          />
          <TextField
            label="Tytuł popupu (opcjonalny)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            helperText="Pojawia się jako nagłówek okienka po kliknięciu."
            fullWidth
            size="small"
          />
          {/* File-backed body — main path. Read-only TextField shows the
              selected path; the folder icon opens MdFilePickerDialog, the
              clear icon drops the path. */}
          <Box>
            <TextField
              label="Plik z treścią (.md z drive)"
              value={bodyPath}
              placeholder="Kliknij ikonę folderu po prawej, aby wybrać…"
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                startAdornment: bodyPath ? (
                  <InputAdornment position="start">
                    <DescriptionIcon fontSize="small" color="primary" />
                  </InputAdornment>
                ) : undefined,
                endAdornment: (
                  <InputAdornment position="end">
                    {bodyPath && (
                      <Tooltip title="Usuń wybrany plik">
                        <IconButton size="small" onClick={handleClearFile}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Wybierz plik MD z drive">
                      <IconButton size="small" onClick={() => setPickerOpen(true)}>
                        <FolderOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              helperText={
                bodyPath
                  ? 'Popup wczyta treść z tego pliku przy każdym kliknięciu.'
                  : 'Wybierz plik .md w drive, którego treść posłuży za opis popupu.'
              }
            />
          </Box>

          {/* Live preview — file content (fetched async) or legacy inline
              body (kept for back-compat with infomarks created before
              bodyPath was added). */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Podgląd treści:
            </Typography>
            <Box
              sx={{
                p: 1.5,
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'action.hover',
                minHeight: 80,
                maxHeight: 320,
                overflow: 'auto',
                fontSize: '0.875rem',
                '& p:first-of-type': { mt: 0 },
                '& p:last-of-type': { mb: 0 },
                '& code': { backgroundColor: 'background.paper', px: 0.5, borderRadius: 0.5 },
              }}
            >
              {bodyPath ? (
                previewLoading ? (
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}
                  >
                    <CircularProgress size={14} />
                    <Typography variant="body2">Wczytuję plik…</Typography>
                  </Box>
                ) : previewError ? (
                  <Typography variant="body2" color="error">
                    Błąd wczytania pliku: {previewError}
                  </Typography>
                ) : filePreview !== null ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{filePreview}</ReactMarkdown>
                ) : null
              ) : body ? (
                // Legacy fallback — previous-version infomarks stored body
                // inline. Surface it read-only so the author isn't surprised
                // by missing content; switching to bodyPath will drop it.
                <>
                  <Typography
                    variant="caption"
                    color="warning.main"
                    sx={{ display: 'block', mb: 0.5 }}
                  >
                    Treść inline (legacy) — wybierz plik powyżej, aby ją zastąpić.
                  </Typography>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                </>
              ) : (
                <Typography variant="body2" color="text.disabled" fontStyle="italic">
                  (brak treści — wybierz plik .md powyżej)
                </Typography>
              )}
            </Box>
          </Box>

          <Divider />

          {/* Inline preview of how the marker will look in the document. */}
          <Typography variant="caption" color="text.secondary">
            Podgląd w tekście:&nbsp;
            <Box
              component="span"
              sx={{
                color: 'primary.main',
                textDecoration: 'underline dotted',
                textUnderlineOffset: '3px',
                cursor: 'help',
              }}
            >
              {text || <em style={{ opacity: 0.6 }}>tekst</em>}
            </Box>
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!text.trim()}>
          {mode === 'edit' ? 'Zapisz' : 'Wstaw'}
        </Button>
      </DialogActions>

      {/* Nested file picker — stacked on top of this dialog. The
          MdFilePickerDialog handles its own open/close, we just need to
          drive the open flag. */}
      <MdFilePickerDialog
        open={pickerOpen}
        selectedPath={bodyPath}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />
    </Dialog>
  );
};

export default InfoMarkDialog;
