import { useState } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon as MenuItemIcon,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import type { Feature } from '../model/types';
import { FreeCadIcon, type FreeCadIconName } from './FreeCadIcon';

// Feature type → FreeCAD icon alias (te same ikony co Ops toolbar).
// FreeCadIcon resolves its SVGs through `cad2d/` (FreeCAD's icons, LGPL).
const ICON_MAP: Record<string, FreeCadIconName> = {
  sketch: 'sketch',
  extrude: 'extrude',
  pocket: 'pocket',
  hole: 'hole',
  groove: 'groove',
  loft_cut: 'loft_cut',
  mirror: 'mirror',
  revolve: 'revolve',
  shell: 'shell',
  loft: 'loft',
  sweep: 'sweep',
  sweep_cut: 'sweep_cut',
  helix: 'helix',
  fillet: 'fillet',
  chamfer: 'chamfer',
  linear_pattern: 'linear_pattern',
  polar_pattern: 'polar_pattern',
  datum_point: 'datum_point',
  datum_line: 'datum_line',
  datum_plane: 'datum_plane',
  datum_cs: 'datum_cs',
};

const ICONS: Record<string, React.ReactNode> = Object.fromEntries(
  Object.entries(ICON_MAP).map(([type, name]) => [
    type,
    <FreeCadIcon key={type} name={name} size={18} />,
  ])
);

interface Props {
  features: Feature[];
  selectedId: string | null;
  editingSketchId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onEditSketch: (id: string) => void;
}

interface CtxState {
  mouseX: number;
  mouseY: number;
  featureId: string;
  featureIndex: number;
}

export function FeatureTreePanel({
  features,
  selectedId,
  editingSketchId,
  onSelect,
  onToggle,
  onRemove,
  onMove,
  onEditSketch,
}: Props) {
  const [ctx, setCtx] = useState<CtxState | null>(null);

  const closeCtx = () => setCtx(null);
  const ctxFeature = ctx ? features.find((f) => f.id === ctx.featureId) : null;

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}
    >
      <Typography
        variant="caption"
        sx={{
          px: 1.5,
          py: 0.75,
          color: 'text.secondary',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Feature Tree
      </Typography>
      <Divider />
      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto' }}>
        {features.length === 0 && (
          <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.disabled' }}>
            No features yet
          </Typography>
        )}
        {features.map((f, idx) => {
          const isEditingSketch = f.id === editingSketchId;
          return (
            <ListItemButton
              key={f.id}
              selected={f.id === selectedId}
              onDoubleClick={() => {
                if (f.type === 'sketch') onEditSketch(f.id);
              }}
              onClick={() => onSelect(f.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(f.id);
                setCtx({
                  mouseX: e.clientX + 2,
                  mouseY: e.clientY - 6,
                  featureId: f.id,
                  featureIndex: idx,
                });
              }}
              sx={{
                opacity: f.enabled ? 1 : 0.45,
                borderLeft: isEditingSketch ? '3px solid' : '3px solid transparent',
                borderColor: isEditingSketch ? 'primary.main' : 'transparent',
                py: 0.25, // compact rows — no second line for the type
                minHeight: 28,
              }}
            >
              <ListItemIcon sx={{ minWidth: 24, color: 'text.primary' }}>
                {ICONS[f.type]}
              </ListItemIcon>
              <ListItemText
                primary={f.name}
                secondary={isEditingSketch ? 'editing…' : undefined}
                primaryTypographyProps={{ variant: 'body2', noWrap: true, sx: { lineHeight: 1.2 } }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  color: 'primary',
                  sx: { lineHeight: 1.1 },
                }}
                sx={{ my: 0 }}
              />
              {!f.enabled && (
                <VisibilityOffIcon fontSize="inherit" sx={{ color: 'text.disabled', ml: 0.5 }} />
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Menu
        open={ctx !== null}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctx ? { top: ctx.mouseY, left: ctx.mouseX } : undefined}
      >
        {ctxFeature?.type === 'sketch' && (
          <MenuItem
            onClick={() => {
              onEditSketch(ctxFeature.id);
              closeCtx();
            }}
          >
            <MenuItemIcon>
              <EditIcon fontSize="small" />
            </MenuItemIcon>
            Edit sketch
          </MenuItem>
        )}
        {ctxFeature && (
          <MenuItem
            onClick={() => {
              onToggle(ctxFeature.id);
              closeCtx();
            }}
          >
            <MenuItemIcon>
              {ctxFeature.enabled ? (
                <VisibilityOffIcon fontSize="small" />
              ) : (
                <VisibilityIcon fontSize="small" />
              )}
            </MenuItemIcon>
            {ctxFeature.enabled ? 'Hide' : 'Show'}
          </MenuItem>
        )}
        {ctx && (
          <MenuItem
            disabled={ctx.featureIndex === 0}
            onClick={() => {
              onMove(ctx.featureId, 'up');
              closeCtx();
            }}
          >
            <MenuItemIcon>
              <ArrowUpwardIcon fontSize="small" />
            </MenuItemIcon>
            Move up
          </MenuItem>
        )}
        {ctx && (
          <MenuItem
            disabled={ctx.featureIndex === features.length - 1}
            onClick={() => {
              onMove(ctx.featureId, 'down');
              closeCtx();
            }}
          >
            <MenuItemIcon>
              <ArrowDownwardIcon fontSize="small" />
            </MenuItemIcon>
            Move down
          </MenuItem>
        )}
        {ctx && <Divider />}
        {ctx && (
          <MenuItem
            onClick={() => {
              onRemove(ctx.featureId);
              closeCtx();
            }}
            sx={{ color: 'error.main' }}
          >
            <MenuItemIcon sx={{ color: 'error.main' }}>
              <DeleteIcon fontSize="small" />
            </MenuItemIcon>
            Remove
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
