/**
 * Read-only CAD 2D viewer — renders project as inline SVG.
 * URL: /viewer/cad/{vfsPath}
 */
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Project } from '@hestia/ui-cad/cad2d';
import { CAD_EXT, readFileAt } from '../vfs';
import { loadProjectFromText, buildSVGString } from '../cad/buildSvg';
import { PanZoom } from '../components/PanZoom';

interface Props {
  vfsPath: string;
}

export function CadViewerPage({ vfsPath }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const name = parts.pop()!;
    const dir = '/' + parts.join('/');
    let cancelled = false;
    (async () => {
      try {
        const json = await readFileAt(dir, name, CAD_EXT);
        if (cancelled) return;
        const proj = new Project();
        loadProjectFromText(json, proj);
        setSvg(buildSVGString(proj));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vfsPath]);

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
        {!svg && !error && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={32} />
          </Box>
        )}
        {error && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>
              Failed to load: {error}
            </Typography>
          </Box>
        )}
        {svg && (
          <PanZoom>
            <Box
              dangerouslySetInnerHTML={{ __html: svg }}
              sx={{
                width: '100%',
                height: '100%',
                '& svg': { display: 'block', width: '100%', height: '100%' },
              }}
            />
          </PanZoom>
        )}
      </Box>
    </Box>
  );
}
