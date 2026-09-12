/**
 * Read-only Lego viewer — renders a saved `.lego.json` set (a core-scene3d
 * SceneGraph) with the same look as the Lego designer (edges, flat lighting,
 * no floor grid, CAD orbit camera). URL: /viewer/lego/{vfsPath}
 */
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { SimpleViewer, SceneDeserializer } from '../../scene3d';
import type { SceneGraph } from '../../scene3d';
import { LEGO_EXT, readFileAt } from '../vfs';

interface Props { vfsPath: string }

export function LegoViewerPage({ vfsPath }: Props) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const name = parts.pop()!;
    const dir = '/' + parts.join('/');
    let cancelled = false;
    (async () => {
      try {
        const json = await readFileAt(dir, name, LEGO_EXT);
        if (cancelled) return;
        setSceneGraph(SceneDeserializer.deserialize(json));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [vfsPath]);

  const label = vfsPath.split('/').pop() ?? vfsPath;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {!sceneGraph && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={32} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Loading "{label}"…</Typography>
          </Box>
        )}
        {error && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        )}
        {sceneGraph && (
          <SimpleViewer
            sceneGraph={sceneGraph}
            showGrid={false}
            edges
            flatLighting
            viewCube
            showAxesGizmo={false}
            cameraPreset="cad"
            autoFit
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </Box>
    </Box>
  );
}
