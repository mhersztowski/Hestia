import { useState, useRef } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import type { Project, ViewMode } from '../core';
import type { ToolName } from '../tools/types';

interface Props {
  project: Project;
  activeTool: ToolName;
  viewMode: ViewMode;
}

const TOOL_HINTS: Record<ToolName, string> = {
  select: 'Click · Shift+click multi · Drag box-select · Del removes',
  line: 'Click start · Click end · chains automatically · Esc to cancel',
  circle: 'Click center · Click edge · Esc to cancel',
  circle3p: 'Click 3 points on the circle · Esc to cancel',
  point: 'Click to place a point',
  polygon: 'Click center · Click vertex · type R / sides · Esc to cancel',
  rectCenter: 'Click center · Click corner · type W/H · Esc to cancel',
  arc3p: 'Click start · end · point on arc · Esc to cancel',
  slot: 'Click 2 centers · set radius · Esc to cancel',
  arcSlot: 'Click center · start · end · set width · Esc to cancel',
  bspline: 'Click points · Enter to finish · Esc to cancel',
  arc: 'Click center · Click start point · Click end point (CCW) · Esc to cancel',
  rect: 'Click corner A · Click corner B · Esc to cancel',
  polyline: 'Click points · Enter=finish · C=close · Esc to cancel',
  freehand: 'Press and drag to draw a stroke · release to commit · Esc to cancel',
  text: 'Click to place text at cursor position · Esc to cancel',
  image: 'Click to choose an image file and place it at cursor position',
  move: 'Select first · Click base point · Click destination · Esc to cancel',
  copy: 'Select first · Click base point · Click destination · Esc to cancel',
  rotate: 'Select first · Click center · Drag or type angle in cmdline · Enter/click to confirm',
  offset: 'Click entity · Move cursor to set distance & side · Click to commit · Esc to cancel',
  trim: 'Click boundary entity · Click part to remove · Enter=done · Esc to cancel',
  fillet: 'Click first line · Click second line · Type radius before clicking (0=sharp) · Esc to cancel',
  dimension: 'Click point 1 · Click point 2 · Click offset position · chains automatically',
  box3d: 'Click corner A · Click corner B to place box · Esc to cancel',
  cylinder3d: 'Click center · Click edge for radius · Esc to cancel',
  sphere3d: 'Click center · Click edge for radius · Esc to cancel',
};

function GridInput({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) {
      project.settings.gridSize = v;
      project.eventBus.emit('project:loaded', undefined as never);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          if (e.key === 'Escape') setEditing(false);
          e.stopPropagation();
        }}
        style={{
          width: 40, fontSize: 11, fontFamily: 'monospace',
          background: 'rgba(79,195,247,0.12)', border: '1px solid #4fc3f7',
          color: '#4fc3f7', outline: 'none', padding: '0 3px', borderRadius: 2,
        }}
        autoFocus
      />
    );
  }

  return (
    <Typography
      variant="caption"
      onClick={() => { setDraft(String(project.settings.gridSize)); setEditing(true); }}
      sx={{
        color: 'text.secondary', cursor: 'pointer',
        '&:hover span': { color: 'primary.main', textDecoration: 'underline' },
      }}
    >
      Grid: <span style={{ color: '#4fc3f7' }}>{project.settings.gridSize}</span>
    </Typography>
  );
}

export function StatusBar({ project, activeTool, viewMode }: Props) {
  const entityCount = project.entityRegistry.getAll().length;
  const selectedCount = project.selectionManager.count();
  const activeLayer = project.layerSystem.getActive();

  return (
    <Box sx={{
      height: 24, display: 'flex', alignItems: 'center', px: 1.5, gap: 2,
      bgcolor: '#2d2d30', borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
        {activeTool.toUpperCase()}
      </Typography>
      {viewMode === '3d' && (
        <Chip label="3D" size="small" sx={{ height: 16, fontSize: 9, bgcolor: 'rgba(79,195,247,0.2)', color: 'primary.main', '& .MuiChip-label': { px: 0.75 } }} />
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
        {TOOL_HINTS[activeTool]}
      </Typography>
      <GridInput project={project} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Layer: <span style={{ color: activeLayer.color }}>{activeLayer.name}</span>
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {entityCount} entities{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
      </Typography>
    </Box>
  );
}
