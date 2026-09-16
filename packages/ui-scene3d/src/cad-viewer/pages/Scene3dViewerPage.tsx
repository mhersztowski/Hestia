/**
 * Read-only Scene3D viewer.
 * URL: /viewer/scene3d/users/{user}/scene3d/{project}/{file}
 */
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { SimpleViewer, SceneDeserializer } from '../../scene3d';
import type { SceneGraph } from '../../scene3d';
import { readScene3dFile } from '../vfs';

interface Props {
  vfsPath: string;
}

export function Scene3dViewerPage({ vfsPath }: Props) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const file = parts.pop()!;
    const projectName = parts.pop()!;
    let cancelled = false;
    (async () => {
      try {
        const json = await readScene3dFile(projectName, file);
        if (cancelled) return;
        setSceneGraph(SceneDeserializer.deserialize(json));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vfsPath]);

  const parts = vfsPath.split('/');
  const file = parts[parts.length - 1];
  const projectName = parts[parts.length - 2] ?? '';
  const label = projectName ? `${projectName} / ${file}` : file;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: '#1a1a1a',
        color: '#fff',
      }}
    >
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {!sceneGraph && !error && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 2,
            }}
          >
            <CircularProgress size={32} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Loading "{label}"…
            </Typography>
          </Box>
        )}
        {error && (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>
              Failed to load: {error}
            </Typography>
          </Box>
        )}
        {sceneGraph && (
          <SimpleViewer
            sceneGraph={sceneGraph}
            showGrid
            cameraPreset="cad"
            autoFit
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </Box>
    </Box>
  );
}
