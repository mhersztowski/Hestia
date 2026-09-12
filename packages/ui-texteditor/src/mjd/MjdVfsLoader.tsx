import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Snackbar, TextField, Typography,
} from '@mui/material';
import type { FileSystemProvider } from '@hestia/core';
import { decodeText, encodeText, mjdDocumentSchema, createMjdDocument } from '@hestia/core';
import type { MjdDocument } from '@hestia/core';
import { MjdDefEditor } from './MjdDefEditor';
import { MjdDataEditor } from './MjdDataEditor';

// ─── Data-file wrapper format ────────────────────────────────────────────────
// A `.data.json` file MAY wrap the user's data with metadata so it can point
// at any `.mjd` schema (not just the sibling). The new format is:
//
//   { "$mjd": "/data/Minis/Users/u/drive/path/to/schema.mjd",
//     "$data": { "name": "...", "age": 30 } }
//
// Backward-compat: a bare object (no `$data` key) is treated as the data
// itself + the host's mjdPath prop is used as the schema. New files created
// via the "Utwórz plik danych" button always use the wrapper format.

interface MjdDataWrapper {
  $mjd: string;
  $data: Record<string, unknown>;
}

function isWrappedData(j: unknown): j is MjdDataWrapper {
  return j !== null
    && typeof j === 'object'
    && '$data' in j
    && typeof (j as Record<string, unknown>).$data === 'object'
    && (j as Record<string, unknown>).$data !== null;
}


export interface MjdVfsLoaderProps {
  provider: FileSystemProvider;
  mjdPath: string;
  dataPath?: string;
  height?: string | number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; definition: MjdDocument; data?: Record<string, unknown>;
      /** True iff the loaded `.data.json` used the `{$mjd, $data}` wrapper.
       *  Saves preserve the wrapper so the schema link doesn't get stripped
       *  on subsequent edits. */
      isWrapped?: boolean;
    };

export function MjdVfsLoader({ provider, mjdPath, dataPath, height }: MjdVfsLoaderProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Data editor uses an explicit Save button rather than save-on-every-keystroke:
  // edits buffer the next payload here and flip `dataDirty` until the user saves.
  const pendingDataRef = useRef<unknown>(undefined);
  const [dataDirty, setDataDirty] = useState(false);
  const [savingData, setSavingData] = useState(false);
  // Tracks whether the sibling .data.json already exists. Drives the
  // disabled state of the "Create data file" button + the toast after a
  // generation. Recomputed on every mount and refreshed after writeFile.
  const [dataExists, setDataExists] = useState(false);
  // Snackbar — surfaced for both success (created file) and failure
  // (existing file / read-only provider / write failure). Auto-dismisses
  // after 4s; user can also click X.
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);

  /** Derive the sibling data-file path from the current `.mjd` path.
   *  Convention: replace the `.mjd` suffix with `.data.json`. Lowered
   *  in regex so users naming files `Schema.MJD` are still handled. */
  const derivedDataPath = mjdPath.replace(/\.mjd$/i, '.data.json');

  // Load files from VFS
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        // Load .mjd definition
        const mjdBytes = await provider.readFile(mjdPath);
        const mjdJson = JSON.parse(decodeText(mjdBytes));
        const parsed = mjdDocumentSchema.safeParse(mjdJson);
        if (!parsed.success) {
          if (!cancelled) setState({ status: 'error', message: `Invalid .mjd file: ${parsed.error.message}` });
          return;
        }
        const definition = parsed.data as MjdDocument;

        // Probe the sibling .data.json — drives the toolbar button's
        // disabled state so the user sees up-front whether generation
        // would clobber an existing file.
        try {
          await provider.readFile(derivedDataPath);
          if (!cancelled) setDataExists(true);
        } catch {
          if (!cancelled) setDataExists(false);
        }

        // Load data file if path provided
        let data: Record<string, unknown> | undefined;
        let isWrapped = false;
        if (dataPath) {
          try {
            const dataBytes = await provider.readFile(dataPath);
            const rawJson = JSON.parse(decodeText(dataBytes));
            // Detect the {$mjd, $data} envelope. Bare objects fall back to
            // treating the whole thing as data — preserves files written
            // by older versions of this editor.
            if (isWrappedData(rawJson)) {
              data = rawJson.$data;
              isWrapped = true;
            } else {
              data = rawJson as Record<string, unknown>;
              isWrapped = false;
            }
          } catch {
            // Data file doesn't exist yet — start with defaults from definition
            data = buildDefaults(definition);
            // New files generated via the toolbar button will be wrapped,
            // but a missing-on-load file gets the bare format so we don't
            // surprise users who deleted the file expecting plain JSON.
            isWrapped = false;
          }
        }

        if (!cancelled) setState({ status: 'ready', definition, data, isWrapped });
      } catch (err) {
        if (!cancelled) {
          // .mjd file doesn't exist — create empty document for def editor
          if (!dataPath) {
            setState({ status: 'ready', definition: createMjdDocument() });
          } else {
            // The .mjd schema we tried wasn't there. Most common cause:
            // a legacy `.data.json` (without the `$mjd` envelope) sat next
            // to a deleted/renamed sibling schema. Help the user fix the
            // file instead of dropping a raw 404 message on them.
            const raw = err instanceof Error ? err.message : 'Failed to load files';
            setState({
              status: 'error',
              message:
                `Nie udało się otworzyć schematu MJD pod ścieżką:\n${mjdPath}\n\n` +
                `(${raw})\n\n` +
                `Najczęstsza przyczyna: ten plik .data.json został utworzony przed wprowadzeniem ` +
                `mechanizmu linkowania i nie zawiera pola $mjd. Otwórz plik w widoku tekstowym ` +
                `i zmień jego zawartość na format:\n\n` +
                `{\n` +
                `  "$mjd":  "/data/Minis/Users/<user>/drive/<ścieżka>/schemat.mjd",\n` +
                `  "$data": { ...obecne dane... }\n` +
                `}\n\n` +
                `Po zapisie ponowne otwarcie pliku odnajdzie schemat niezależnie od nazwy.`,
            });
          }
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [provider, mjdPath, dataPath]);

  // Debounced save to VFS
  const saveToVfs = useCallback((path: string, content: unknown) => {
    if (!provider.writeFile) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const json = JSON.stringify(content, null, 2);
      provider.writeFile!(path, encodeText(json), { create: true, overwrite: true });
    }, 500);
  }, [provider]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleDefinitionChange = useCallback((doc: MjdDocument) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      return { ...prev, definition: doc };
    });
    saveToVfs(mjdPath, doc);
  }, [mjdPath, saveToVfs]);

  const handleDataChange = useCallback((data: Record<string, unknown>) => {
    let payload: unknown = data;
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      // Preserve the {$mjd, $data} envelope across edits so the schema link
      // doesn't disappear after the first save.
      if (prev.isWrapped) {
        payload = { $mjd: mjdPath, $data: data };
      }
      return { ...prev, data };
    });
    // Buffer instead of auto-saving; the Save button flushes it.
    pendingDataRef.current = payload;
    setDataDirty(true);
  }, [mjdPath]);

  // Flush the buffered data document to the VFS (explicit Save).
  const handleSaveData = useCallback(async () => {
    if (!dataPath || !provider.writeFile || pendingDataRef.current === undefined) return;
    setSavingData(true);
    try {
      const json = JSON.stringify(pendingDataRef.current, null, 2);
      await provider.writeFile(dataPath, encodeText(json), { create: true, overwrite: true });
      setDataDirty(false);
      setToast({ severity: 'success', message: 'Saved' });
    } catch (e) {
      setToast({ severity: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingData(false);
    }
  }, [dataPath, provider]);

  // Dialog state for "Utwórz plik danych". null = dialog closed. The path
  // field is pre-filled with the sibling location but the user is free to
  // type any path — that's exactly the "associate any name" use case.
  const [genDialog, setGenDialog] = useState<{ path: string; busy: boolean } | null>(null);

  /** Open the generate-data dialog. Doesn't write anything by itself —
   *  the actual filesystem write happens in `confirmGenerateData` after
   *  the user OKs the chosen path.
   *
   *  Default-name strategy: start at the sibling (`schema.data.json`); if
   *  that file already exists, probe `schema-2.data.json`, `schema-3.data.json`,
   *  … until we find a free slot. Hard cap at 100 to avoid an infinite
   *  loop on a pathological provider that always returns success. This is
   *  the SAME shape Office/Finder use for duplicate names, so the
   *  expected mental model is preserved. */
  const generateDataFile = useCallback(async () => {
    if (state.status !== 'ready') return;
    let candidate = derivedDataPath;
    // Strip the `.data.json` suffix once so we can splice in `-N` before it.
    const stem = derivedDataPath.replace(/\.data\.json$/i, '');
    for (let n = 2; n < 100; n++) {
      try {
        await provider.readFile(candidate);
        // Exists → try the next numbered candidate.
        candidate = `${stem}-${n}.data.json`;
      } catch {
        // Doesn't exist → stop probing, use this name.
        break;
      }
    }
    setGenDialog({ path: candidate, busy: false });
  }, [state, derivedDataPath, provider]);

  /** Write the data file at `genDialog.path`. Same guards as before but
   *  applied to the user-chosen path (not the sibling). The wrapper format
   *  embeds the `.mjd` location so opening the data file later resolves to
   *  the right schema even when names differ. */
  const confirmGenerateData = useCallback(async () => {
    if (!genDialog || state.status !== 'ready') return;
    const targetPath = genDialog.path.trim();
    if (!targetPath) {
      setToast({ severity: 'error', message: 'Ścieżka nie może być pusta' });
      return;
    }
    if (!provider.writeFile) {
      setToast({ severity: 'error', message: 'Provider tylko do odczytu — nie można zapisać pliku' });
      return;
    }
    setGenDialog((g) => g ? { ...g, busy: true } : g);
    // Re-check existence — someone could have created the file between
    // dialog open and confirm.
    try {
      await provider.readFile(targetPath);
      setToast({ severity: 'info', message: `Plik ${targetPath} już istnieje — pomijam` });
      setGenDialog(null);
      // If the user happened to pick the sibling path, also flip the
      // disabled state on the button.
      if (targetPath === derivedDataPath) setDataExists(true);
      return;
    } catch { /* doesn't exist → proceed */ }
    try {
      const defaults = buildDefaults(state.definition);
      // Wrapper format: $mjd is the absolute schema path (what RemoteFS
      // sees), $data is the actual user data. DrivePage reads $mjd at
      // open-time to resolve the schema regardless of filename.
      const payload: MjdDataWrapper = { $mjd: mjdPath, $data: defaults };
      const content = JSON.stringify(payload, null, 2);
      await provider.writeFile(targetPath, encodeText(content), { create: true, overwrite: false });
      setToast({ severity: 'success', message: `Utworzono ${targetPath}` });
      if (targetPath === derivedDataPath) setDataExists(true);
      setGenDialog(null);
    } catch (err) {
      setToast({
        severity: 'error',
        message: `Nie udało się utworzyć pliku danych: ${err instanceof Error ? err.message : String(err)}`,
      });
      setGenDialog((g) => g ? { ...g, busy: false } : g);
    }
  }, [genDialog, state, provider, derivedDataPath, mjdPath]);

  if (state.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: height ?? 200 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box sx={{ p: 2 }}>
        {/* pre-wrap preserves the recovery instructions' newlines + indented
            JSON snippet; the old plain Typography squashed it into a wall
            of unreadable text. */}
        <Typography color="error" component="pre" sx={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          margin: 0,
          fontSize: '0.875rem',
          lineHeight: 1.5,
        }}>
          {state.message}
        </Typography>
      </Box>
    );
  }

  const containerSx = height ? { height, overflow: 'auto' } : {};

  if (dataPath) {
    // Fill the parent flex column so the visual editor canvas can expand fully.
    // When no explicit height is given we stretch to 100% of the parent.
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', ...(height ? { height } : { flex: 1, minHeight: 0 }) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="caption" sx={{ flexGrow: 1, color: dataDirty ? 'warning.main' : 'text.secondary' }}>
            {dataDirty ? 'Unsaved changes' : 'All changes saved'}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => void handleSaveData()}
            disabled={!dataDirty || savingData}
            startIcon={savingData ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Save
          </Button>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <MjdDataEditor
            definition={state.definition}
            value={state.data ?? {}}
            onChange={handleDataChange}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={containerSx}>
      <MjdDefEditor
        value={state.definition}
        onChange={handleDefinitionChange}
        onGenerateData={generateDataFile}
        dataFileExists={dataExists}
      />
      {/* Generate-data dialog — user-editable path. Default is the sibling
          (.mjd → .data.json next to it) but they can target any location.
          The created file embeds `$mjd` so the link survives the name swap. */}
      {genDialog && (
        <Dialog open onClose={() => !genDialog.busy && setGenDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Utwórz plik danych</DialogTitle>
          <DialogContent>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Plik zostanie utworzony z domyślnymi wartościami z definicji.
              W środku znajdzie się link <code>$mjd</code> do schematu, dzięki
              czemu plik o dowolnej nazwie zostanie poprawnie skojarzony przy
              ponownym otwarciu.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Pełna ścieżka pliku"
              value={genDialog.path}
              onChange={(e) => setGenDialog((g) => g ? { ...g, path: e.target.value } : g)}
              disabled={genDialog.busy}
              helperText="Zmień nazwę / katalog dowolnie — plik wskaże ten schemat przez $mjd."
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmGenerateData(); }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Powiązany schemat: <code>{mjdPath}</code>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setGenDialog(null)} disabled={genDialog.busy}>Anuluj</Button>
            <Button variant="contained" onClick={() => void confirmGenerateData()} disabled={genDialog.busy || !genDialog.path.trim()}>
              Utwórz
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Snackbar mounted at component level so it survives even after the
          editor remounts on mjdPath change. severity comes from the toast
          state (success/info/error). */}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert onClose={() => setToast(null)} severity={toast.severity} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

function buildDefaults(doc: MjdDocument): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of doc.fields) {
    if (field.defaultValue !== undefined) {
      data[field.name] = field.defaultValue;
    }
  }
  return data;
}
