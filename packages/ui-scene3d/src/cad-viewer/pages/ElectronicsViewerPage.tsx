/**
 * Read-only Electronics viewer — renders an .elec.json schematic (pan/zoom only).
 * URL: /viewer/electronics/{vfsPath}
 */
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { ELEC_EXT, readFileAt } from '../vfs';
import { SchematicView } from '../electronics/SchematicView';
import type { ElectronicsSchema } from '../electronics/types';

interface Props { vfsPath: string }

export function ElectronicsViewerPage({ vfsPath }: Props) {
  const [schema, setSchema] = useState<ElectronicsSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const name = parts.pop()!;
    const dir = '/' + parts.join('/');
    let cancelled = false;
    (async () => {
      try {
        const json = await readFileAt(dir, name, ELEC_EXT);
        if (cancelled) return;
        setSchema(JSON.parse(json) as ElectronicsSchema);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [vfsPath]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {error ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        ) : !schema ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <SchematicView schema={schema} />
        )}
      </Box>
    </Box>
  );
}
