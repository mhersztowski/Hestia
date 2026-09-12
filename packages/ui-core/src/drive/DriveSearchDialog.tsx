/**
 * DriveSearchDialog — full-text search across the user's drive.
 *
 * Two scopes:
 *   - "Bieżący katalog" — recursive scan from the currently-open folder
 *     (DrivePage's `cwd`); the typical "find that thing I saw nearby" case.
 *   - "Cały drive" — scan from drive root. Slower, hard-capped at
 *     SEARCH_MAX_FILES to keep the browser from melting.
 *
 * Options:
 *   - case-sensitive on/off
 *   - regex on/off (when off, the query is escape-quoted to a literal)
 *
 * Results are grouped per file (collapsible accordion). Each line shows the
 * matched span highlighted in <mark>; click on a line jumps to the file
 * via the host-provided `onOpenFile` callback (Drive opens .md in MdEditor
 * by default, other types in the preview pane).
 *
 * Search is cancellable via AbortController so a user can refine the query
 * without waiting for the previous scan to finish.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, TextField, Typography, Box, Stack,
  FormControlLabel, Checkbox, ToggleButton, ToggleButtonGroup,
  LinearProgress, Accordion, AccordionSummary, AccordionDetails,
  List, ListItemButton, ListItemText, Chip, Alert, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import StopIcon from '@mui/icons-material/Stop';

import type { SearchFileResult, SearchProgress } from './driveSearchTypes';

export interface DriveSearchDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current drive working directory (empty string = drive root). */
  cwd: string;
  /** Caller runs the actual scan — the dialog is presentation-only.
   *  Reject with `AbortError` honours the dialog's Cancel button. */
  runSearch: (params: {
    baseRel: string;
    query: string;
    caseSensitive: boolean;
    isRegex: boolean;
    signal: AbortSignal;
    onProgress: (p: SearchProgress) => void;
  }) => Promise<SearchFileResult[]>;
  /** Open the file (host wires this to "view" or "open in MdEditor"). */
  onOpenFile: (rel: string) => void;
}

type Scope = 'current' | 'drive';

const DriveSearchDialog: React.FC<DriveSearchDialogProps> = ({
  open, onClose, cwd, runSearch, onOpenFile,
}) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [scope, setScope] = useState<Scope>('current');

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Track which file accordions are expanded — start with all collapsed so
  // a 100-file result doesn't drown the dialog.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // AbortController for the in-flight search; replaced on each Run, used
  // by Cancel button and by close-while-running.
  const abortRef = useRef<AbortController | null>(null);

  // Reset on close so re-opening starts fresh — keeps the dialog from
  // showing stale results when user revisits later.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setRunning(false);
      setProgress(null);
      setResults([]);
      setError(null);
      setExpanded(new Set());
    }
  }, [open]);

  const baseRel = scope === 'current' ? cwd : '';
  const scopeLabel = scope === 'current'
    ? (cwd || '(katalog główny drive)')
    : '(cały drive)';

  const handleRun = useCallback(async () => {
    if (!query.trim()) return;
    // Abort any previous run so a Run-Run sequence doesn't double-count
    // progress events.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setResults([]);
    setProgress(null);
    setError(null);
    setExpanded(new Set());
    try {
      const out = await runSearch({
        baseRel,
        query,
        caseSensitive,
        isRegex,
        signal: ctrl.signal,
        onProgress: setProgress,
      });
      // Guard against stale completion of a cancelled run.
      if (ctrl.signal.aborted) return;
      setResults(out);
      // Auto-expand the first 3 files for instant context — common case
      // is "I want to see what matches look like".
      setExpanded(new Set(out.slice(0, 3).map(r => r.path)));
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      setError((err as Error).message || 'Błąd wyszukiwania');
    } finally {
      setRunning(false);
    }
  }, [query, caseSensitive, isRegex, baseRel, runSearch]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !running && query.trim()) {
      e.preventDefault();
      void handleRun();
    }
  }, [handleRun, running, query]);

  const totalMatches = useMemo(
    () => results.reduce((s, r) => s + r.matches.length, 0),
    [results],
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SearchIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>Wyszukaj w plikach</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Query + options row. TextField gets autofocus so dialog opens
            ready to type. */}
        <Stack spacing={1.5}>
          <TextField
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRegex ? 'np. ^TODO:|FIXME' : 'np. global-calendar'}
            label="Szukana fraza"
            size="small"
            fullWidth
            disabled={running}
          />

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup
              value={scope}
              exclusive
              size="small"
              onChange={(_, v) => v && setScope(v)}
              disabled={running}
            >
              <ToggleButton value="current">
                <FolderOpenIcon fontSize="small" sx={{ mr: 0.5 }} />
                Bieżący katalog
              </ToggleButton>
              <ToggleButton value="drive">
                Cały drive
              </ToggleButton>
            </ToggleButtonGroup>

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={caseSensitive}
                  onChange={e => setCaseSensitive(e.target.checked)}
                  disabled={running}
                />
              }
              label="Rozróżniaj wielkość liter"
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={isRegex}
                  onChange={e => setIsRegex(e.target.checked)}
                  disabled={running}
                />
              }
              label="Regex"
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Zakres: <code>{scopeLabel}</code> · skanuje pliki tekstowe (.md, .json, .ts, .yml, …),
            pomija ukryte (zaczynające się od kropki) i pliki &gt;2 MB.
          </Typography>

          {/* Action row: Run / Cancel. Run is disabled while a scan is in
              progress; Cancel takes its slot. */}
          <Stack direction="row" spacing={1}>
            {!running ? (
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={handleRun}
                disabled={!query.trim()}
              >
                Szukaj
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<StopIcon />}
                onClick={handleCancel}
              >
                Przerwij
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            {!running && results.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {results.length} {results.length === 1 ? 'plik' : 'plików'} · {totalMatches} dopasowań
              </Typography>
            )}
          </Stack>

          {running && progress && (
            <Box>
              <LinearProgress
                variant={progress.total > 0 ? 'determinate' : 'indeterminate'}
                value={progress.total > 0 ? (progress.scanned / progress.total) * 100 : 0}
                sx={{ height: 6, borderRadius: 3 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {progress.total > 0
                  ? `Skanuję ${progress.scanned}/${progress.total}…`
                  : 'Zbieram listę plików…'}
                {progress.current && <> · <code>{progress.current}</code></>}
              </Typography>
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {/* Empty state — different copy for "no run yet" vs "ran but
              nothing found". */}
          {!running && !error && results.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {progress
                ? 'Brak dopasowań w przeskanowanych plikach.'
                : 'Wpisz szukaną frazę i naciśnij Szukaj (lub Enter).'}
            </Typography>
          )}

          {/* Results — accordion per file. Match lines rendered with the
              matched span wrapped in <mark>. Line number on the left to
              match `grep -n` output convention. */}
          {results.map(r => (
            <Accordion
              key={r.path}
              expanded={expanded.has(r.path)}
              onChange={(_, isExp) => {
                setExpanded(prev => {
                  const next = new Set(prev);
                  if (isExp) next.add(r.path); else next.delete(r.path);
                  return next;
                });
              }}
              disableGutters
              sx={{ '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.path.split('/').pop()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.path}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Chip size="small" label={`${r.matches.length}${r.truncated ? '+' : ''}`} />
                  <Tooltip title="Otwórz plik">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); onOpenFile(r.path); }}
                    >
                      <FolderOpenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, bgcolor: 'action.hover' }}>
                <List dense disablePadding>
                  {r.matches.map((m, idx) => (
                    <ListItemButton
                      key={`${m.lineNumber}-${idx}`}
                      onClick={() => onOpenFile(r.path)}
                      sx={{ py: 0.25, fontFamily: 'monospace', fontSize: '0.78rem' }}
                    >
                      <ListItemText
                        primary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                            <Box component="span" sx={{ color: 'text.secondary', minWidth: 36, textAlign: 'right' }}>
                              {m.lineNumber}
                            </Box>
                            <Box component="span" sx={{
                              flex: 1,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              '& mark': {
                                bgcolor: 'warning.light',
                                color: 'warning.contrastText',
                                px: 0.25,
                                borderRadius: 0.25,
                              },
                            }}>
                              {/* Render match span wrapped in <mark>;
                                  surrounding text in plain spans so React
                                  doesn't fight the highlight styling. */}
                              {m.lineText.slice(0, m.matchStart)}
                              <Box component="mark">{m.lineText.slice(m.matchStart, m.matchEnd)}</Box>
                              {m.lineText.slice(m.matchEnd)}
                            </Box>
                          </Box>
                        }
                        disableTypography
                      />
                    </ListItemButton>
                  ))}
                  {r.truncated && (
                    <Typography variant="caption" color="warning.main" sx={{ p: 1, display: 'block' }}>
                      Pokazano pierwsze {r.matches.length} dopasowań w tym pliku — limit reached, otwórz plik aby zobaczyć resztę.
                    </Typography>
                  )}
                </List>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DriveSearchDialog;
