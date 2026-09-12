import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { Point2D } from '../core';
import type { ToolName } from '../tools/types';

export interface CommandEntry {
  type: 'absolute';
  point: Point2D;
}

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  onCoordinate: (point: Point2D) => void;
  onAngle?: (degrees: number) => void;
  lastPoint?: Point2D | null;
}

type ParseResult =
  | { kind: 'tool'; name: ToolName }
  | { kind: 'absolute'; x: number; y: number }
  | { kind: 'relative'; dx: number; dy: number }
  | { kind: 'polar'; dist: number; angle: number }  // angle in degrees
  | { kind: 'number'; value: number }
  | { kind: 'unknown' };

const TOOL_SHORTCUTS: Record<string, ToolName> = {
  s: 'select',
  l: 'line',
  c: 'circle',
  a: 'arc',
  r: 'rect',
  p: 'polyline',
  m: 'move',
  co: 'copy',
  ro: 'rotate',
  o: 'offset',
  tr: 'trim',
  f: 'fillet',
  di: 'dimension',
  bx: 'box3d',
  cy: 'cylinder3d',
  sp: 'sphere3d',
  tx: 'text',
  im: 'image',
  fh: 'freehand',
};

function parseInput(raw: string): ParseResult {
  const input = raw.trim().toLowerCase();
  if (!input) return { kind: 'unknown' };

  // Tool shortcut
  if (TOOL_SHORTCUTS[input]) return { kind: 'tool', name: TOOL_SHORTCUTS[input] };

  // Relative: @dx,dy
  if (input.startsWith('@')) {
    const parts = input.slice(1).split(',');
    if (parts.length === 2) {
      const dx = parseFloat(parts[0]), dy = parseFloat(parts[1]);
      if (!isNaN(dx) && !isNaN(dy)) return { kind: 'relative', dx, dy };
    }
  }

  // Polar: dist<angle (angle in degrees)
  if (input.includes('<')) {
    const parts = input.split('<');
    if (parts.length === 2) {
      const dist = parseFloat(parts[0]), angleDeg = parseFloat(parts[1]);
      if (!isNaN(dist) && !isNaN(angleDeg)) return { kind: 'polar', dist, angle: angleDeg };
    }
  }

  // Absolute: x,y
  if (input.includes(',')) {
    const parts = input.split(',');
    if (parts.length === 2) {
      const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
      if (!isNaN(x) && !isNaN(y)) return { kind: 'absolute', x, y };
    }
  }

  // Single number (e.g. rotation angle)
  const num = parseFloat(input);
  if (!isNaN(num)) return { kind: 'number', value: num };

  return { kind: 'unknown' };
}

const TOOL_PROMPTS: Record<ToolName, string> = {
  select: 'Select (S) · M=move · CO=copy · RO=rotate · O=offset · TR=trim · F=fillet',
  line: 'Pick start · then end. Enter=done. Type x,y or @dx,dy or dist<angle',
  circle: 'Pick center · then edge. Type coords to input.',
  circle3p: 'Pick 3 points on the circle.',
  point: 'Click to place a point. Type coords to input.',
  polygon: 'Pick center · then vertex. Type radius / number of sides.',
  rectCenter: 'Pick center · then corner. Type W/H.',
  arc3p: 'Pick start · end · then a point on the arc.',
  slot: 'Pick 2 arc centers · then set the radius.',
  arcSlot: 'Pick center · start · end · then set the width.',
  bspline: 'Click control points · Enter to finish.',
  arc: 'Arc (A) · 1=center · 2=start point · 3=end point (CCW).',
  rect: 'Pick corner A · then corner B.',
  polyline: 'Pick points · Enter=open · C=close. Type coords.',
  freehand: 'Press and drag to draw · release to finish stroke.',
  text: 'Text (TX) · click to place text at position.',
  image: 'Image (IM) · click to open file picker and place image.',
  move: 'Select first · click base point · click destination.',
  copy: 'Select first · click base point · click destination.',
  rotate: 'Select first · click center · drag or type angle in degrees.',
  offset: 'Offset (O) · click entity · move cursor to distance/side · click to commit.',
  trim: 'Trim (TR) · click boundary · click part to remove. Enter=done.',
  fillet: 'Fillet (F) · click first line · click second line. Type radius (0=sharp corner).',
  dimension: 'Click point 1 · point 2 · offset position.',
  box3d: '3D Box (BX) · click corner A · click corner B.',
  cylinder3d: '3D Cylinder (CY) · click center · click edge.',
  sphere3d: '3D Sphere (SP) · click center · click edge.',
};

export function CommandLine({ activeTool, onToolChange, onCoordinate, onAngle, lastPoint }: Props) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const histIdxRef = useRef(-1);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus command line on Ctrl+Enter or ':' key (handled in parent)
  const focus = useCallback(() => inputRef.current?.focus(), []);

  // Expose focus externally
  useEffect(() => {
    const handler = () => focus();
    window.addEventListener('cad:focus-cmdline', handler);
    return () => window.removeEventListener('cad:focus-cmdline', handler);
  }, [focus]);

  const submit = useCallback(() => {
    const raw = value.trim();
    if (!raw) return;

    setHistory(h => [raw, ...h.slice(0, 49)]);
    histIdxRef.current = -1;
    setValue('');
    setError('');

    const result = parseInput(raw);

    switch (result.kind) {
      case 'tool':
        onToolChange(result.name);
        break;

      case 'absolute':
        onCoordinate({ x: result.x, y: result.y });
        break;

      case 'relative': {
        const base = lastPoint ?? { x: 0, y: 0 };
        onCoordinate({ x: base.x + result.dx, y: base.y + result.dy });
        break;
      }

      case 'polar': {
        const base = lastPoint ?? { x: 0, y: 0 };
        const rad = (result.angle * Math.PI) / 180;
        onCoordinate({ x: base.x + result.dist * Math.cos(rad), y: base.y + result.dist * Math.sin(rad) });
        break;
      }

      case 'number':
        // Pass to rotate tool (degrees) or other number-accepting tools
        onAngle?.(result.value);
        break;

      default:
        setError(`Unknown: "${raw}"`);
    }
  }, [value, lastPoint, onToolChange, onCoordinate, onAngle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setValue('');
      setError('');
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdxRef.current + 1, history.length - 1);
      histIdxRef.current = next;
      setValue(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdxRef.current - 1, -1);
      histIdxRef.current = next;
      setValue(next === -1 ? '' : (history[next] ?? ''));
    }
  }, [submit, history]);

  return (
    <Box sx={{
      height: 28,
      display: 'flex',
      alignItems: 'center',
      px: 1.5,
      gap: 1.5,
      bgcolor: '#1a1a1a',
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Prompt */}
      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0, fontSize: 11 }}>
        {TOOL_PROMPTS[activeTool]}
      </Typography>

      {/* Input */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', flexShrink: 0 }}>
        {error && (
          <Typography variant="caption" sx={{ color: 'error.main', fontSize: 11 }}>{error}</Typography>
        )}
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>▶</Typography>
        <Box
          component="input"
          ref={inputRef}
          value={value}
          onChange={e => { setValue(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="type command or coordinates…"
          sx={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e0e0e0',
            fontSize: 12,
            fontFamily: 'monospace',
            width: 260,
            '&::placeholder': { color: 'rgba(255,255,255,0.25)' },
          }}
        />
      </Box>
    </Box>
  );
}
