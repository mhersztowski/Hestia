import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { CadRenderer } from '../renderer/CadRenderer';

const NICE = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const TARGET_PX = 80; // aim for ~80px wide bar

function niceScale(zoom: number) {
  // zoom = world units per pixel
  const worldForTarget = zoom * TARGET_PX;
  // pick the NICE value closest to worldForTarget
  let best = NICE[0];
  for (const n of NICE) {
    if (Math.abs(n - worldForTarget) < Math.abs(best - worldForTarget)) best = n;
  }
  const px = best / zoom;
  return { worldLen: best, px };
}

interface Props {
  renderer: CadRenderer;
}

export function ScaleBar({ renderer }: Props) {
  const [scale, setScale] = useState(() => niceScale(renderer.getPixelToWorld()));

  useEffect(() => {
    const prev = renderer.onViewChange;
    renderer.onViewChange = () => {
      prev?.();
      setScale(niceScale(renderer.getPixelToWorld()));
    };
    return () => { renderer.onViewChange = prev; };
  }, [renderer]);

  const label = scale.worldLen >= 1
    ? `${scale.worldLen}`
    : `${scale.worldLen}`;

  return (
    <Box sx={{
      position: 'absolute', bottom: 32, left: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      pointerEvents: 'none', userSelect: 'none',
    }}>
      {/* bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <Box sx={{ width: 1, height: 6, bgcolor: '#aaa' }} />
        <Box sx={{ width: scale.px, height: 2, bgcolor: '#aaa' }} />
        <Box sx={{ width: 1, height: 6, bgcolor: '#aaa' }} />
      </Box>
      {/* label */}
      <Typography variant="caption" sx={{
        color: '#aaa', fontSize: 10, fontFamily: 'monospace',
        lineHeight: 1.2, mt: '1px',
      }}>
        {label} u
      </Typography>
    </Box>
  );
}
