import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, Box, Button, CircularProgress, Snackbar, Typography } from '@mui/material';
import type { FileSystemProvider } from '@hestia/core';
import { decodeText, encodeText, FileType } from '@hestia/core';
import { GlobalJsonEditor, type ImportedType } from './GlobalJsonEditor';
import { generateJsonSchema, generateDts } from './mySchemaCodegen';

// GlobalJsonLoader — VFS host for *.global.json, the graphical schema/.d.ts
// editor surface. STARTING POINT: copied from MjdVfsLoader (the .data.json
// host) and simplified — a *.global.json is a standalone JSON document with no
// linked .mjd schema and no {$mjd,$data} envelope. Edits buffer locally and are
// written only on Save (same UX as the data editor).

export interface GlobalJsonLoaderProps {
  provider: FileSystemProvider;
  /** Full backend path to the *.global.json file. */
  path: string;
  height?: string | number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Record<string, unknown> };

export function GlobalJsonLoader({ provider, path, height }: GlobalJsonLoaderProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const pendingRef = useRef<unknown>(undefined);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      try {
        let data: Record<string, unknown> = {};
        try {
          const bytes = await provider.readFile(path);
          const txt = decodeText(bytes).trim();
          const json = txt ? JSON.parse(txt) : {};
          data =
            json && typeof json === 'object' && !Array.isArray(json)
              ? (json as Record<string, unknown>)
              : {};
        } catch {
          data = {}; // new / empty file — start blank
        }
        if (!cancelled) setState({ status: 'ready', data });
      } catch (err) {
        if (!cancelled)
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load file',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, path]);

  const handleChange = useCallback((data: Record<string, unknown>) => {
    setState((prev) => (prev.status === 'ready' ? { ...prev, data } : prev));
    pendingRef.current = data;
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!provider.writeFile || pendingRef.current === undefined) return;
    setSaving(true);
    try {
      await provider.writeFile(path, encodeText(JSON.stringify(pendingRef.current, null, 2)), {
        create: true,
        overwrite: true,
      });
      setDirty(false);
      setToast({ severity: 'success', message: 'Saved' });
    } catch (e) {
      setToast({ severity: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }, [provider, path]);

  // Generate JSON Schema + .d.ts from the current definitions into sibling
  // subfolders (json-schema/<Name>.schema.json and d.ts/<Name>.d.ts).
  const handleGenerate = useCallback(
    async (name: string, value: Record<string, unknown>) => {
      if (!provider.writeFile) {
        setToast({ severity: 'error', message: 'Filesystem is read-only' });
        return;
      }
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const schemaPath = `${dir}/json-schema/${name}.schema.json`;
      const dtsPath = `${dir}/d.ts/${name}.d.ts`;
      try {
        await provider.writeFile(schemaPath, encodeText(generateJsonSchema(value, name)), {
          create: true,
          overwrite: true,
        });
        await provider.writeFile(dtsPath, encodeText(generateDts(value)), {
          create: true,
          overwrite: true,
        });
        setToast({
          severity: 'success',
          message: `Generated json-schema/${name}.schema.json + d.ts/${name}.d.ts`,
        });
      } catch (e) {
        setToast({
          severity: 'error',
          message: e instanceof Error ? e.message : 'Generate failed',
        });
      }
    },
    [provider, path]
  );

  const defaultName = (path.split('/').pop() || '').replace(/\.myschema\.json$/i, '') || 'schema';

  // Drive root (…/drive) for the "Add using" file picker.
  const driveRoot = useMemo(() => {
    const i = path.indexOf('/drive/');
    if (i >= 0) return path.slice(0, i + '/drive'.length);
    return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  }, [path]);

  // Recursively list *.myschema.json files in the user's Drive (for the picker).
  const listMySchemaFiles = useCallback(async (): Promise<string[]> => {
    const out: string[] = [];
    let budget = 800;
    const walk = async (dir: string, depth: number) => {
      if (depth > 8 || budget <= 0) return;
      budget--;
      let entries;
      try {
        entries = await provider.readDirectory(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        const full = `${dir}/${e.name}`;
        if (e.type === FileType.Directory) {
          if (e.name.startsWith('.')) continue; // skip .logs/.git/etc
          await walk(full, depth + 1);
        } else if (/\.myschema\.json$/i.test(e.name) && full !== path) {
          out.push(full);
        }
      }
    };
    if (driveRoot) await walk(driveRoot, 0);
    return out.sort();
  }, [provider, path, driveRoot]);

  // Class/enum names exported by the currently-used (imported) schema files.
  const usingList: string[] = useMemo(() => {
    const u = state.status === 'ready' ? (state.data as { using?: unknown }).using : undefined;
    return Array.isArray(u) ? (u.filter((x) => typeof x === 'string') as string[]) : [];
  }, [state]);
  const usingKey = usingList.join('\n');
  const [imported, setImported] = useState<ImportedType[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const acc: ImportedType[] = [];
      for (const f of usingKey ? usingKey.split('\n') : []) {
        try {
          const doc = JSON.parse(decodeText(await provider.readFile(f))) as {
            classes?: object;
            enums?: object;
          };
          const base = f.split('/').pop() || f;
          for (const n of Object.keys(doc?.classes ?? {}))
            acc.push({ name: n, file: base, kind: 'class' });
          for (const n of Object.keys(doc?.enums ?? {}))
            acc.push({ name: n, file: base, kind: 'enum' });
        } catch {
          /* missing / invalid import — skip */
        }
      }
      if (!cancelled) setImported(acc);
    })();
    return () => {
      cancelled = true;
    };
  }, [usingKey, provider]);

  if (state.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (state.status === 'error') {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{state.message}</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        ...(height ? { height } : { flex: 1, minHeight: 0 }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography
          variant="caption"
          sx={{ flexGrow: 1, color: dirty ? 'warning.main' : 'text.secondary' }}
        >
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </Typography>
        <Button
          size="small"
          variant="contained"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Save
        </Button>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <GlobalJsonEditor
          value={state.data}
          onChange={handleChange}
          defaultName={defaultName}
          onGenerate={handleGenerate}
          importedTypes={imported}
          listMySchemaFiles={listMySchemaFiles}
          driveRoot={driveRoot}
        />
      </Box>
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default GlobalJsonLoader;
