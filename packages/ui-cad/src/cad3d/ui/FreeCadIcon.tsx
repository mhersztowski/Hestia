import { Box } from '@mui/material';
import { freecadIconUrl } from '../../cad2d/barrel';

/**
 * FreeCAD-style icons for the ops toolbar. The SVGs are resolved through
 * `cad2d/` (see `configureFreecadIcons` there).
 * 'sketch' is drawn inline instead: Sketcher_NewSketch.svg lives in FreeCAD's
 * Sketcher module and does not always download cleanly.
 */
export type FreeCadIconName =
  | 'extrude'
  | 'pocket'
  | 'mirror'
  | 'revolve'
  | 'groove'
  | 'hole'
  | 'loft'
  | 'sweep'
  | 'helix'
  | 'shell'
  | 'loft_cut'
  | 'sweep_cut'
  | 'fillet'
  | 'chamfer'
  | 'draft'
  | 'linear_pattern'
  | 'polar_pattern'
  | 'datum_point'
  | 'datum_line'
  | 'datum_plane'
  | 'datum_cs'
  | 'sketch';

/** An inline SVG for 'sketch' — a blue grid with a green origin point, in FreeCAD's style. */
function SketchInlineIcon({ size }: { size: number }) {
  return (
    <Box sx={{ width: size, height: size, display: 'inline-block', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        {/* The grid background — pale blue */}
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          fill="#e3f2fd"
          stroke="#1976d2"
          strokeWidth="1.5"
          rx="1"
        />
        {/* The inner grid lines */}
        <line x1="2" y1="8" x2="22" y2="8" stroke="#90caf9" strokeWidth="0.5" />
        <line x1="2" y1="14" x2="22" y2="14" stroke="#90caf9" strokeWidth="0.5" />
        <line x1="8" y1="2" x2="8" y2="22" stroke="#90caf9" strokeWidth="0.5" />
        <line x1="14" y1="2" x2="14" y2="22" stroke="#90caf9" strokeWidth="0.5" />
        {/* Osie */}
        <line x1="2" y1="18" x2="22" y2="18" stroke="#c62828" strokeWidth="1.2" />
        <line x1="6" y1="2" x2="6" y2="22" stroke="#2e7d32" strokeWidth="1.2" />
        {/* Origin — kropka */}
        <circle cx="6" cy="18" r="1.6" fill="#2e7d32" />
      </svg>
    </Box>
  );
}

export function FreeCadIcon({ name, size = 20 }: { name: FreeCadIconName; size?: number }) {
  // Sketch — inline SVG (nie polegamy na pobranym pliku)
  if (name === 'sketch') return <SketchInlineIcon size={size} />;
  const url = freecadIconUrl(name);
  if (!url) return <Box sx={{ width: size, height: size }} />;
  return (
    <Box
      component="img"
      src={url}
      alt={name}
      sx={{
        width: size,
        height: size,
        display: 'block',
        objectFit: 'contain',
      }}
    />
  );
}
