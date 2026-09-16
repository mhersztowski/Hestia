import React, { useCallback, useEffect } from 'react';
import {
  Autocomplete,
  Box,
  Typography,
  TextField,
  Divider,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
} from '@mui/material';
import type { Entity, FreehandEntity, Project } from '../core';
import { freehandTool } from '../tools/FreehandTool';
import { textTool } from '../tools/TextTool';

// Inline shapes for text/image until core-cad dist is rebuilt
type TextEntity = {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
  fontFamily: string;
  angle: number;
};
type ImageEntity = {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
};

// Lite mirror of DimAnchor (avoids depending on a freshly-rebuilt core-cad dist).
type DimAnchorLite = {
  entityId: string;
  kind: 'endpoint' | 'midpoint' | 'center' | 'point-on';
  index?: number;
  t?: number;
  angle?: number;
  disabled?: boolean;
};

/** Toggle row for a dimension endpoint's "follow shape" anchor. */
function AnchorRow({
  label,
  anchor,
  onToggle,
}: {
  label: string;
  anchor?: DimAnchorLite;
  onToggle: (enabled: boolean) => void;
}) {
  const linked = !!anchor;
  const active = linked && !anchor!.disabled;
  return (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={active}
          disabled={!linked}
          onChange={(e) => onToggle(e.target.checked)}
          sx={{ p: 0.25 }}
        />
      }
      label={
        <Typography variant="caption" sx={{ color: linked ? 'text.primary' : 'text.disabled' }}>
          {label}
          {linked ? ` → follows ${anchor!.kind}` : ' · not linked'}
        </Typography>
      }
      sx={{ m: 0 }}
    />
  );
}

interface Props {
  project: Project;
  version: number;
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <TextField
      label={label}
      size="small"
      variant="outlined"
      type="number"
      disabled={disabled}
      value={value.toFixed(2)}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 11, py: 0.5 } }}
      InputLabelProps={{ sx: { fontSize: 11 } }}
    />
  );
}

const FONT_FAMILIES = [
  'Arial',
  'Arial Black',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Palatino',
  'Garamond',
  'Courier New',
  'Lucida Console',
  'monospace',
  'Comic Sans MS',
  'Impact',
  'sans-serif',
  'serif',
  'cursive',
  'fantasy',
];

function EntityFields({ entity, project }: { entity: Entity; project: Project }) {
  const update = useCallback(
    (changes: Partial<Entity>) => project.updateEntity(entity.id, changes),
    [entity.id, project]
  );

  // Sync selected entity's settings into the tool singleton so next stroke/text
  // inherits the same parameters as the one currently being inspected.
  useEffect(() => {
    if (entity.type === 'freehand') {
      const fe = entity as FreehandEntity;
      freehandTool.strokeWidth = fe.strokeWidth;
      freehandTool.smooth = fe.smooth;
    } else {
      const eType = (entity as { type: string }).type;
      if (eType === 'text') {
        const te = entity as unknown as TextEntity;
        textTool.fontSize = te.fontSize;
        textTool.fontFamily = te.fontFamily;
        textTool.content = te.content;
      }
    }
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields: React.ReactNode[] = [];

  // Common: color
  fields.push(
    <Box key="color" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', width: 50 }}>
        Color
      </Typography>
      {entity.color === 'bylayer' ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          bylayer
        </Typography>
      ) : (
        <Box
          component="input"
          type="color"
          value={entity.color as string}
          onChange={(e) => update({ color: e.target.value } as Partial<Entity>)}
          sx={{
            width: 28,
            height: 20,
            border: 'none',
            p: 0,
            cursor: 'pointer',
            bgcolor: 'transparent',
          }}
        />
      )}
    </Box>
  );

  // Type-specific fields
  switch (entity.type) {
    case 'line':
      fields.push(
        <NumField
          key="x1"
          label="X1"
          value={entity.x1}
          onChange={(v) => update({ x1: v } as Partial<Entity>)}
        />,
        <NumField
          key="y1"
          label="Y1"
          value={entity.y1}
          onChange={(v) => update({ y1: v } as Partial<Entity>)}
        />,
        <NumField
          key="x2"
          label="X2"
          value={entity.x2}
          onChange={(v) => update({ x2: v } as Partial<Entity>)}
        />,
        <NumField
          key="y2"
          label="Y2"
          value={entity.y2}
          onChange={(v) => update({ y2: v } as Partial<Entity>)}
        />
      );
      break;

    case 'circle':
      fields.push(
        <NumField
          key="cx"
          label="Center X"
          value={entity.cx}
          onChange={(v) => update({ cx: v } as Partial<Entity>)}
        />,
        <NumField
          key="cy"
          label="Center Y"
          value={entity.cy}
          onChange={(v) => update({ cy: v } as Partial<Entity>)}
        />,
        <NumField
          key="r"
          label="Radius"
          value={entity.radius}
          onChange={(v) => update({ radius: v } as Partial<Entity>)}
        />
      );
      break;

    case 'rect':
      fields.push(
        <NumField
          key="x"
          label="X"
          value={entity.x}
          onChange={(v) => update({ x: v } as Partial<Entity>)}
        />,
        <NumField
          key="y"
          label="Y"
          value={entity.y}
          onChange={(v) => update({ y: v } as Partial<Entity>)}
        />,
        <NumField
          key="w"
          label="Width"
          value={entity.width}
          onChange={(v) => update({ width: v } as Partial<Entity>)}
        />,
        <NumField
          key="h"
          label="Height"
          value={entity.height}
          onChange={(v) => update({ height: v } as Partial<Entity>)}
        />
      );
      break;

    case 'polyline':
      fields.push(
        <Typography key="pts" variant="caption" sx={{ color: 'text.secondary' }}>
          Points: {entity.points.length}
        </Typography>,
        <FormControlLabel
          key="closed"
          control={
            <Checkbox
              size="small"
              checked={entity.closed}
              onChange={(e) => update({ closed: e.target.checked } as Partial<Entity>)}
            />
          }
          label={<Typography variant="caption">Closed</Typography>}
          sx={{ mx: 0 }}
        />
      );
      break;

    case 'freehand': {
      const fe = entity as FreehandEntity;
      fields.push(
        <Typography key="pts" variant="caption" sx={{ color: 'text.secondary' }}>
          Points: {fe.points.length}
        </Typography>,
        <NumField
          key="sw"
          label="Stroke width"
          value={fe.strokeWidth}
          onChange={(v) => {
            update({ strokeWidth: Math.max(0.1, v) } as Partial<Entity>);
            freehandTool.strokeWidth = Math.max(0.1, v);
          }}
        />,
        <FormControlLabel
          key="smooth"
          control={
            <Checkbox
              size="small"
              checked={fe.smooth}
              onChange={(e) => update({ smooth: e.target.checked } as Partial<Entity>)}
            />
          }
          label={<Typography variant="caption">Smooth (Catmull-Rom)</Typography>}
          sx={{ mx: 0 }}
        />
      );
      break;
    }

    case 'text': {
      const te = entity as TextEntity;
      fields.push(
        <TextField
          key="content"
          label="Content"
          size="small"
          value={te.content}
          onChange={(e) => {
            update({ content: e.target.value } as Partial<Entity>);
            textTool.content = e.target.value;
          }}
          sx={{ width: '100%', '& .MuiInputBase-input': { fontSize: 11, py: 0.5 } }}
          InputLabelProps={{ sx: { fontSize: 11 } }}
        />,
        <NumField
          key="x"
          label="X"
          value={te.x}
          onChange={(v) => update({ x: v } as Partial<Entity>)}
        />,
        <NumField
          key="y"
          label="Y"
          value={te.y}
          onChange={(v) => update({ y: v } as Partial<Entity>)}
        />,
        <NumField
          key="fs"
          label="Font size"
          value={te.fontSize}
          onChange={(v) => {
            update({ fontSize: Math.max(1, v) } as Partial<Entity>);
            textTool.fontSize = Math.max(1, v);
          }}
        />,
        <Autocomplete
          key="ff"
          freeSolo
          size="small"
          options={FONT_FAMILIES}
          value={te.fontFamily}
          onChange={(_, v) => {
            const val = v ?? te.fontFamily;
            update({ fontFamily: val } as Partial<Entity>);
            textTool.fontFamily = val;
          }}
          onInputChange={(_, v, reason) => {
            if (reason === 'input') {
              update({ fontFamily: v } as Partial<Entity>);
              textTool.fontFamily = v;
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Font family"
              sx={{ '& .MuiInputBase-input': { fontSize: 11, py: 0.5 } }}
              InputLabelProps={{ sx: { fontSize: 11 } }}
            />
          )}
          sx={{ width: '100%' }}
        />,
        <NumField
          key="angle"
          label="Angle°"
          value={(te.angle * 180) / Math.PI}
          onChange={(v) => update({ angle: (v * Math.PI) / 180 } as Partial<Entity>)}
        />
      );
      break;
    }

    case 'image': {
      const ie = entity as ImageEntity;
      fields.push(
        <NumField
          key="x"
          label="X"
          value={ie.x}
          onChange={(v) => update({ x: v } as Partial<Entity>)}
        />,
        <NumField
          key="y"
          label="Y"
          value={ie.y}
          onChange={(v) => update({ y: v } as Partial<Entity>)}
        />,
        <NumField
          key="w"
          label="Width"
          value={ie.width}
          onChange={(v) => update({ width: v } as Partial<Entity>)}
        />,
        <NumField
          key="h"
          label="Height"
          value={ie.height}
          onChange={(v) => update({ height: v } as Partial<Entity>)}
        />,
        <Typography
          key="src"
          variant="caption"
          sx={{ color: 'text.disabled', wordBreak: 'break-all', fontSize: 9 }}
        >
          {ie.src.startsWith('data:') ? `data:[${ie.src.slice(5, 25)}…]` : ie.src}
        </Typography>
      );
      break;
    }

    case 'arc':
      fields.push(
        <NumField
          key="cx"
          label="Center X"
          value={entity.cx}
          onChange={(v) => update({ cx: v } as Partial<Entity>)}
        />,
        <NumField
          key="cy"
          label="Center Y"
          value={entity.cy}
          onChange={(v) => update({ cy: v } as Partial<Entity>)}
        />,
        <NumField
          key="r"
          label="Radius"
          value={entity.radius}
          onChange={(v) => update({ radius: v } as Partial<Entity>)}
        />,
        <NumField
          key="sa"
          label="Start°"
          value={(entity.startAngle * 180) / Math.PI}
          onChange={(v) => update({ startAngle: (v * Math.PI) / 180 } as Partial<Entity>)}
        />,
        <NumField
          key="ea"
          label="End°"
          value={(entity.endAngle * 180) / Math.PI}
          onChange={(v) => update({ endAngle: (v * Math.PI) / 180 } as Partial<Entity>)}
        />
      );
      break;

    case 'dimension': {
      const len = Math.sqrt((entity.x2 - entity.x1) ** 2 + (entity.y2 - entity.y1) ** 2);
      const dim = entity as unknown as { anchor1?: DimAnchorLite; anchor2?: DimAnchorLite };
      const a1Active = !!dim.anchor1 && !dim.anchor1.disabled;
      const a2Active = !!dim.anchor2 && !dim.anchor2.disabled;
      const toggle = (
        which: 'anchor1' | 'anchor2',
        anchor: DimAnchorLite | undefined,
        enabled: boolean
      ) => {
        if (!anchor) return;
        update({ [which]: { ...anchor, disabled: !enabled } } as unknown as Partial<Entity>);
        // Re-enabling: immediately snap the endpoint back onto its shape.
        if (enabled)
          (project as { refreshAnchoredDimensions?: () => void }).refreshAnchoredDimensions?.();
      };
      fields.push(
        <Typography key="len" variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
          Length: {len.toFixed(3)}
        </Typography>,
        <AnchorRow
          key="a1"
          label="P1 follow shape"
          anchor={dim.anchor1}
          onToggle={(en) => toggle('anchor1', dim.anchor1, en)}
        />,
        <NumField
          key="x1"
          label="X1"
          value={entity.x1}
          disabled={a1Active}
          onChange={(v) => update({ x1: v } as Partial<Entity>)}
        />,
        <NumField
          key="y1"
          label="Y1"
          value={entity.y1}
          disabled={a1Active}
          onChange={(v) => update({ y1: v } as Partial<Entity>)}
        />,
        <AnchorRow
          key="a2"
          label="P2 follow shape"
          anchor={dim.anchor2}
          onToggle={(en) => toggle('anchor2', dim.anchor2, en)}
        />,
        <NumField
          key="x2"
          label="X2"
          value={entity.x2}
          disabled={a2Active}
          onChange={(v) => update({ x2: v } as Partial<Entity>)}
        />,
        <NumField
          key="y2"
          label="Y2"
          value={entity.y2}
          disabled={a2Active}
          onChange={(v) => update({ y2: v } as Partial<Entity>)}
        />,
        <NumField
          key="off"
          label="Offset"
          value={entity.offset}
          onChange={(v) => update({ offset: v } as Partial<Entity>)}
        />
      );
      break;
    }

    case 'box3d':
      fields.push(
        <NumField
          key="cx"
          label="Center X"
          value={entity.cx}
          onChange={(v) => update({ cx: v } as Partial<Entity>)}
        />,
        <NumField
          key="cy"
          label="Center Y"
          value={entity.cy}
          onChange={(v) => update({ cy: v } as Partial<Entity>)}
        />,
        <NumField
          key="w"
          label="Width"
          value={entity.width}
          onChange={(v) => update({ width: v } as Partial<Entity>)}
        />,
        <NumField
          key="d"
          label="Depth"
          value={entity.depth}
          onChange={(v) => update({ depth: v } as Partial<Entity>)}
        />,
        <NumField
          key="h"
          label="Height"
          value={entity.height}
          onChange={(v) => update({ height: v } as Partial<Entity>)}
        />
      );
      break;

    case 'cylinder3d':
      fields.push(
        <NumField
          key="cx"
          label="Center X"
          value={entity.cx}
          onChange={(v) => update({ cx: v } as Partial<Entity>)}
        />,
        <NumField
          key="cy"
          label="Center Y"
          value={entity.cy}
          onChange={(v) => update({ cy: v } as Partial<Entity>)}
        />,
        <NumField
          key="r"
          label="Radius"
          value={entity.radius}
          onChange={(v) => update({ radius: v } as Partial<Entity>)}
        />,
        <NumField
          key="h"
          label="Height"
          value={entity.height}
          onChange={(v) => update({ height: v } as Partial<Entity>)}
        />
      );
      break;

    case 'sphere3d':
      fields.push(
        <NumField
          key="cx"
          label="Center X"
          value={entity.cx}
          onChange={(v) => update({ cx: v } as Partial<Entity>)}
        />,
        <NumField
          key="cy"
          label="Center Y"
          value={entity.cy}
          onChange={(v) => update({ cy: v } as Partial<Entity>)}
        />,
        <NumField
          key="r"
          label="Radius"
          value={entity.radius}
          onChange={(v) => update({ radius: v } as Partial<Entity>)}
        />
      );
      break;
  }

  // Extrude height — only for 2D entities
  const is3dPrimitive =
    entity.type === 'box3d' ||
    entity.type === 'cylinder3d' ||
    entity.type === 'sphere3d' ||
    entity.type === 'freehand' ||
    entity.type === 'text' ||
    entity.type === 'image';
  if (!is3dPrimitive) {
    fields.push(
      <NumField
        key="extrude"
        label="Extrude H"
        value={entity.extrudeHeight}
        onChange={(v) => update({ extrudeHeight: v } as Partial<Entity>)}
      />
    );
  }

  return <>{fields}</>;
}

export function PropertiesPanel({ project, version }: Props) {
  void version; // triggers re-render on changes
  const selectedIds = project.selectionManager.getSelected();

  if (selectedIds.length === 0) {
    return (
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          No selection
        </Typography>
      </Box>
    );
  }

  if (selectedIds.length > 1) {
    // Multi-selection: show layer assignment and count
    const layers = project.layerSystem.getAll();
    return (
      <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {selectedIds.length} entities selected
        </Typography>
        <FormControl size="small" fullWidth>
          <InputLabel sx={{ fontSize: 11 }}>Move to layer</InputLabel>
          <Select
            label="Move to layer"
            value=""
            size="small"
            onChange={(e) => {
              const layerId = e.target.value as string;
              for (const id of selectedIds) {
                project.updateEntity(id, { layerId } as Partial<Entity>);
              }
            }}
            sx={{ fontSize: 11 }}
          >
            {layers.map((l) => (
              <MenuItem key={l.id} value={l.id} sx={{ fontSize: 11 }}>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: l.color,
                    mr: 1,
                  }}
                />
                {l.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    );
  }

  const entity = project.entityRegistry.get(selectedIds[0]);
  if (!entity) return null;
  const layers = project.layerSystem.getAll();

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75, overflowY: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          variant="caption"
          sx={{ color: 'primary.main', fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}
        >
          {entity.type}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
          {entity.id.slice(0, 8)}
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Layer */}
      <FormControl size="small" fullWidth>
        <InputLabel sx={{ fontSize: 11 }}>Layer</InputLabel>
        <Select
          label="Layer"
          value={entity.layerId}
          size="small"
          onChange={(e) =>
            project.updateEntity(entity.id, {
              layerId: e.target.value as string,
            } as Partial<Entity>)
          }
          sx={{ fontSize: 11 }}
        >
          {layers.map((l) => (
            <MenuItem key={l.id} value={l.id} sx={{ fontSize: 11 }}>
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: l.color,
                  mr: 1,
                }}
              />
              {l.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Visibility */}
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={entity.visible}
            onChange={(e) =>
              project.updateEntity(entity.id, { visible: e.target.checked } as Partial<Entity>)
            }
          />
        }
        label={<Typography variant="caption">Visible</Typography>}
        sx={{ mx: 0 }}
      />

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Type-specific fields */}
      <EntityFields entity={entity} project={project} />
    </Box>
  );
}
