import { Box, TextField, Typography, Checkbox } from '@mui/material';
import { useState } from 'react';
import type { SketchConstraint } from '../model/sketchConstraints';
import { constraintTypeLabel } from '../model/sketchConstraints';
import { freecadIconUrl } from '../../cad2d/barrel';

interface Props {
  constraints: SketchConstraint[];
  onToggleVisibility: (id: string, visible: boolean) => void;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

/** Panel Constraints — analog FreeCAD Constraints panel (Filter + lista z ikonami). */
export function ConstraintsPanel({ constraints, onToggleVisibility, onDelete, onSelect, selectedId }: Props) {
  const [filter, setFilter] = useState('');
  const filtered = constraints.filter(c => {
    if (!filter) return true;
    const label = constraintTypeLabel(c.type).toLowerCase();
    return label.includes(filter.toLowerCase()) ||
      (c.name?.toLowerCase().includes(filter.toLowerCase()) ?? false);
  });

  return (
    <Box sx={{ p: 1 }}>
      <TextField label="Filter" size="small" fullWidth value={filter}
        onChange={e => setFilter(e.target.value)} sx={{ mb: 1 }} />
      {filtered.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ p: 1, display: 'block' }}>
          {constraints.length === 0 ? 'No constraints' : 'Nothing matches the filter'}
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
          {filtered.map((c, idx) => (
            <Box key={c.id}
              onClick={() => onSelect?.(c.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 0.5, py: 0.25, mb: 0.25, borderRadius: 0.5,
                bgcolor: selectedId === c.id ? 'action.selected' : 'transparent',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Checkbox size="small" checked={c.visible !== false}
                onChange={e => { e.stopPropagation(); onToggleVisibility(c.id, e.target.checked); }}
                sx={{ p: 0 }} />
              <ConstraintGlyph type={c.type} />
              <Typography variant="caption" sx={{ flex: 1, color: 'text.primary' }}>
                {c.name || `Constraint${idx + 1}`}
                <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>
                  {constraintTypeLabel(c.type)}
                  {c.value !== undefined ? ` = ${c.value.toFixed(2)}` : ''}
                </span>
              </Typography>
              <Box
                onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                sx={{
                  cursor: 'pointer', color: 'error.main', fontSize: 14, px: 0.5,
                  '&:hover': { color: 'error.light' },
                }}>×</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** A small red glyph for a constraint type, as FreeCAD draws them. */
function ConstraintGlyph({ type }: { type: SketchConstraint['type'] }) {
  const url = freecadIconUrl(`c_${type}`);
  if (url) return <Box component="img" src={url} alt={type} sx={{ width: 14, height: 14, objectFit: 'contain', display: 'block' }} />;
  const color = '#c62828';
  const size = 14;
  const commonProps = { width: size, height: size, viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg' };
  switch (type) {
    case 'coincident':
      return <svg {...commonProps}><circle cx="8" cy="8" r="3" fill={color} /><line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="1.5" /></svg>;
    case 'horizontal':
      return <svg {...commonProps}><line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" /></svg>;
    case 'vertical':
      return <svg {...commonProps}><line x1="8" y1="1" x2="8" y2="15" stroke={color} strokeWidth="2.5" /></svg>;
    case 'parallel':
      return <svg {...commonProps}><line x1="3" y1="2" x2="10" y2="14" stroke={color} strokeWidth="1.5" /><line x1="7" y1="2" x2="14" y2="14" stroke={color} strokeWidth="1.5" /></svg>;
    case 'perpendicular':
      return <svg {...commonProps}><line x1="2" y1="2" x2="14" y2="14" stroke={color} strokeWidth="1.5" /><line x1="14" y1="2" x2="2" y2="14" stroke={color} strokeWidth="1.5" /></svg>;
    case 'tangent':
      return <svg {...commonProps}><path d="M 2 12 Q 8 2 14 12" stroke={color} strokeWidth="1.5" fill="none" /></svg>;
    case 'equal':
      return <svg {...commonProps}><line x1="2" y1="6" x2="14" y2="6" stroke={color} strokeWidth="1.5" /><line x1="2" y1="10" x2="14" y2="10" stroke={color} strokeWidth="1.5" /></svg>;
    case 'distance':
      return <svg {...commonProps}><line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1" markerEnd="url(#a)" markerStart="url(#a)" /><text x="4" y="6" fontSize="6" fill={color}>d</text></svg>;
    case 'angle':
      return <svg {...commonProps}><path d="M 2 14 L 14 14 M 2 14 L 14 4" stroke={color} strokeWidth="1.5" fill="none" /></svg>;
    case 'fixed':
      return <svg {...commonProps}><circle cx="8" cy="8" r="4" fill="none" stroke={color} strokeWidth="1.5" /><line x1="8" y1="4" x2="8" y2="12" stroke={color} strokeWidth="1" /><line x1="4" y1="8" x2="12" y2="8" stroke={color} strokeWidth="1" /></svg>;
    default:
      // Symmetric, the distance dimensions, radius and diameter have no drawn
      // glyph — a dot keeps the row's layout instead of leaving a hole where an
      // icon should be. They do have FreeCAD icons, so this shows only when
      // those are not served (see `configureFreecadIcons`).
      return <svg {...commonProps}><circle cx="8" cy="8" r="2.5" fill={color} /></svg>;
  }
}

interface ElementsProps {
  entities: Array<{ id: string; type: string; name?: string }>;
  onToggleVisibility?: (id: string, visible: boolean) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

/** Panel Elements — lista sketch entities. */
export function ElementsPanel({ entities, onSelect, selectedId }: ElementsProps) {
  const [filter, setFilter] = useState('');
  const filtered = entities.filter(e => {
    if (!filter) return true;
    return (e.name ?? e.type).toLowerCase().includes(filter.toLowerCase()) ||
      e.type.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <Box sx={{ p: 1 }}>
      <TextField label="Filter" size="small" fullWidth value={filter}
        onChange={e => setFilter(e.target.value)} sx={{ mb: 1 }} />
      {filtered.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ p: 1, display: 'block' }}>
          {entities.length === 0 ? 'The sketch is empty' : 'Nothing matches'}
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
          {filtered.map((e, idx) => (
            <Box key={e.id}
              onClick={() => onSelect?.(e.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 0.5, py: 0.25, mb: 0.25, borderRadius: 0.5,
                bgcolor: selectedId === e.id ? 'action.selected' : 'transparent',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Checkbox size="small" checked={true} disabled sx={{ p: 0 }} />
              <ElementGlyph type={e.type} />
              <Typography variant="caption" sx={{ flex: 1, color: 'text.primary' }}>
                {idx + 1}-{e.type}
                {e.name ? <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>{e.name}</span> : null}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ElementGlyph({ type }: { type: string }) {
  const color = '#333';
  const size = 14;
  const props = { width: size, height: size, viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg' };
  switch (type) {
    case 'line':
      return <svg {...props}><line x1="3" y1="13" x2="13" y2="3" stroke={color} strokeWidth="1.5" /><circle cx="3" cy="13" r="1.5" fill="#4caf50" /><circle cx="13" cy="3" r="1.5" fill="#f44336" /></svg>;
    case 'circle':
      return <svg {...props}><circle cx="8" cy="8" r="5" fill="none" stroke={color} strokeWidth="1.5" /><circle cx="8" cy="8" r="1" fill="#f44336" /></svg>;
    case 'rect':
      return <svg {...props}><rect x="2" y="4" width="12" height="8" fill="none" stroke={color} strokeWidth="1.5" /></svg>;
    case 'point':
      return <svg {...props}><circle cx="8" cy="8" r="2" fill="#f44336" /></svg>;
    case 'arc':
      return <svg {...props}><path d="M 3 13 Q 8 2 13 13" stroke={color} strokeWidth="1.5" fill="none" /></svg>;
    default:
      return <svg {...props}><rect x="2" y="2" width="12" height="12" fill="none" stroke={color} strokeWidth="1" /></svg>;
  }
}
