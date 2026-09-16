import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import AddIcon from '@mui/icons-material/Add';
import type { Project } from '../core';
import type { Layer } from '../core';

interface Props {
  project: Project;
  version: number;
}

const LAYER_COLORS = [
  '#ffffff',
  '#ff4444',
  '#44ff44',
  '#4444ff',
  '#ffff44',
  '#ff44ff',
  '#44ffff',
  '#ff8800',
];

export function LayerPanel({ project }: Props) {
  const [newName, setNewName] = useState('');
  const layers = project.layerSystem.getAll();
  const activeId = project.layerSystem.getActiveId();

  const addLayer = () => {
    const name = newName.trim() || `Layer ${layers.length + 1}`;
    const color = LAYER_COLORS[layers.length % LAYER_COLORS.length];
    project.layerSystem.add({
      name,
      color,
      lineType: 'solid',
      lineWidth: 1,
      visible: true,
      locked: false,
    });
    project.eventBus.emit('layer:added', null);
    setNewName('');
  };

  const toggleVisible = (layer: Layer) => {
    project.layerSystem.update(layer.id, { visible: !layer.visible });
    project.eventBus.emit('layer:updated', null);
  };

  const toggleLock = (layer: Layer) => {
    project.layerSystem.update(layer.id, { locked: !layer.locked });
    project.eventBus.emit('layer:updated', null);
  };

  return (
    <Box
      sx={{
        width: 200,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Layers
        </Typography>
        <Tooltip title="New layer">
          <IconButton size="small" onClick={addLayer} onMouseDown={(e) => e.preventDefault()}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
        {layers.map((layer) => (
          <ListItem
            key={layer.id}
            disablePadding
            secondaryAction={
              <Box sx={{ display: 'flex' }}>
                <IconButton size="small" onClick={() => toggleVisible(layer)}>
                  {layer.visible ? (
                    <VisibilityIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <VisibilityOffIcon sx={{ fontSize: 14, opacity: 0.4 }} />
                  )}
                </IconButton>
                <IconButton size="small" onClick={() => toggleLock(layer)}>
                  {layer.locked ? (
                    <LockIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <LockOpenIcon sx={{ fontSize: 14, opacity: 0.4 }} />
                  )}
                </IconButton>
              </Box>
            }
          >
            <ListItemButton
              selected={layer.id === activeId}
              onClick={() => {
                project.layerSystem.setActive(layer.id);
                project.eventBus.emit('layer:updated', null);
              }}
              sx={{ py: 0.25, pl: 1 }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: layer.color,
                  mr: 1,
                  flexShrink: 0,
                }}
              />
              <ListItemText
                primary={layer.name}
                primaryTypographyProps={{
                  variant: 'caption',
                  noWrap: true,
                  sx: { opacity: layer.visible ? 1 : 0.4 },
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Box
        sx={{
          px: 1,
          py: 0.75,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          gap: 0.5,
        }}
      >
        <TextField
          size="small"
          placeholder="New layer name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLayer();
            }
          }}
          inputProps={{ style: { fontSize: 12, padding: '2px 6px' }, autoFocus: false }}
          sx={{ flex: 1 }}
        />
      </Box>
    </Box>
  );
}
