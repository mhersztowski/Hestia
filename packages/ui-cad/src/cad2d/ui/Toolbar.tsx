/**
 * The tool palette down the left-hand side.
 *
 * A `Toolbar` from `@hestia/ui-core` built from a tree of nodes: every tool is a
 * toggle in one group, so exactly one is on and the palette says which. The
 * tools that come in kinds — a circle by centre or by three points, a polygon of
 * three to eight sides — are **split buttons**: the button turns on whichever
 * kind was used last, and the arrow beside it offers the rest, as FreeCAD does.
 *
 * Making the palette out of nodes rather than buttons is what lets it scroll
 * when the window is short (the package handles that) and lets a host read the
 * tree if it ever wants its own layout.
 */
import React, { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import GestureIcon from '@mui/icons-material/Gesture';
import TitleIcon from '@mui/icons-material/Title';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import {
  Toolbar as CoreToolbar,
  item,
  separator,
  splitToggle,
  toggle,
  type ToolbarNode,
} from '@hestia/ui-core';
import type { ViewMode } from '../core';
import type { ToolName } from '../tools/types';
import { polygonTool } from '../tools/PolygonTool';
import { bsplineTool } from '../tools/BSplineTool';
import { freecadIconUrl } from '../assets/freecadIcons';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  viewMode: ViewMode;
}

/**
 * A tool icon from FreeCAD (see `assets/freecadIcons.ts` for where the files
 * come from). Drawn on a light chip, because the icons have dark parts —
 * outlines and points — which would be invisible on a dark toolbar.
 */
function FcIcon({ name, size = 20 }: { name: string; size?: number }) {
  const url = freecadIconUrl(name);
  return (
    <Box
      sx={{
        width: size + 6,
        height: size + 6,
        borderRadius: 0.75,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // A light chip on a dark theme; on a light one no background at all, so
        // the icons sit with the rest of the interface — their dark outlines show
        // on a light toolbar anyway.
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(236,239,241,0.94)' : 'transparent',
      }}
    >
      {url && <img src={url} width={size} height={size} alt="" style={{ display: 'block' }} />}
    </Box>
  );
}

type Variant = {
  name: ToolName;
  label: string;
  icon: React.ReactNode;
  sides?: number;
  bspline?: { interpolating: boolean; periodic: boolean };
};
type Group = { key: string; variants: Variant[] };

const SIMPLE_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'select', label: 'Select (S)', icon: <NearMeIcon fontSize="small" /> },
  { name: 'point', label: 'Point (PT) — click to place', icon: <FcIcon name="point" /> },
  { name: 'line', label: 'Line (L)', icon: <FcIcon name="line" /> },
];

const CIRCLE_GROUP: Group = {
  key: 'circle',
  variants: [
    { name: 'circle', label: 'Circle (center + radius)', icon: <FcIcon name="circle" /> },
    { name: 'circle3p', label: 'Circle by 3 points', icon: <FcIcon name="circle_3p" /> },
  ],
};

const ARC_GROUP: Group = {
  key: 'arc',
  variants: [
    { name: 'arc', label: 'Arc (center, start, end)', icon: <FcIcon name="arc" /> },
    { name: 'arc3p', label: 'Arc by 3 points', icon: <FcIcon name="arc_3p" /> },
  ],
};

const RECT_GROUP: Group = {
  key: 'rect',
  variants: [
    { name: 'rect', label: 'Rectangle (2 corners)', icon: <FcIcon name="rect" /> },
    { name: 'rectCenter', label: 'Centered rectangle', icon: <FcIcon name="rect_center" /> },
  ],
};

const POLYGON_GROUP: Group = {
  key: 'polygon',
  variants: [
    { name: 'polygon', label: 'Triangle', sides: 3, icon: <FcIcon name="polygon_triangle" /> },
    { name: 'polygon', label: 'Square', sides: 4, icon: <FcIcon name="polygon_square" /> },
    { name: 'polygon', label: 'Pentagon', sides: 5, icon: <FcIcon name="polygon_pentagon" /> },
    { name: 'polygon', label: 'Hexagon', sides: 6, icon: <FcIcon name="polygon_hexagon" /> },
    { name: 'polygon', label: 'Heptagon', sides: 7, icon: <FcIcon name="polygon_heptagon" /> },
    { name: 'polygon', label: 'Octagon', sides: 8, icon: <FcIcon name="polygon_octagon" /> },
    { name: 'polygon', label: 'Regular polygon', icon: <FcIcon name="polygon_regular" /> },
  ],
};

const SLOT_GROUP: Group = {
  key: 'slot',
  variants: [
    { name: 'slot', label: 'Create slot', icon: <FcIcon name="slot" /> },
    { name: 'arcSlot', label: 'Create arc slot', icon: <FcIcon name="arc_slot" /> },
  ],
};

const BSPLINE_GROUP: Group = {
  key: 'bspline',
  variants: [
    {
      name: 'bspline',
      label: 'B-spline by control points',
      bspline: { interpolating: false, periodic: false },
      icon: <FcIcon name="bspline" />,
    },
    {
      name: 'bspline',
      label: 'Periodic B-spline by control points',
      bspline: { interpolating: false, periodic: true },
      icon: <FcIcon name="bspline_periodic" />,
    },
    {
      name: 'bspline',
      label: 'B-spline by knots',
      bspline: { interpolating: true, periodic: false },
      icon: <FcIcon name="bspline_knots" />,
    },
    {
      name: 'bspline',
      label: 'Periodic B-spline by knots',
      bspline: { interpolating: true, periodic: true },
      icon: <FcIcon name="bspline_knots_periodic" />,
    },
  ],
};

const LATE_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'polyline', label: 'Polyline (P)', icon: <FcIcon name="polyline" /> },
  { name: 'freehand', label: 'Freehand (FH)', icon: <GestureIcon fontSize="small" /> },
  { name: 'text', label: 'Text (TX) — click to place', icon: <TitleIcon fontSize="small" /> },
  {
    name: 'image',
    label: 'Image (IM) — click to insert',
    icon: <ImageOutlinedIcon fontSize="small" />,
  },
];

const SOLID_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  {
    name: 'box3d',
    label: 'Box (BX) — click two corners',
    icon: <CropSquareIcon fontSize="small" />,
  },
  {
    name: 'cylinder3d',
    label: 'Cylinder (CY) — center + edge',
    icon: <CircleOutlinedIcon fontSize="small" />,
  },
  {
    name: 'sphere3d',
    label: 'Sphere (SP) — center + edge',
    icon: <ViewInArIcon fontSize="small" />,
  },
];

export function Toolbar({ activeTool, onToolChange, viewMode }: Props) {
  // The variant last chosen in each group — the first one by default, except
  // polygon, which starts at Hexagon.
  const [sel, setSel] = useState<Record<string, number>>({
    circle: 0,
    arc: 0,
    rect: 0,
    polygon: 3,
    slot: 0,
    bspline: 0,
  });

  const nodes: ToolbarNode[] = useMemo(() => {
    const pick = (v: Variant) => {
      // The kinds of polygon and B-spline are not separate tools but settings on
      // one, so the tool is told which kind before it is turned on.
      if (v.sides != null) polygonTool.setSides(v.sides);
      if (v.bspline) bsplineTool.setMode(v.bspline);
      onToolChange(v.name);
    };

    const plain = (t: { name: ToolName; label: string; icon: React.ReactNode }) =>
      toggle(t.name, t.label, activeTool === t.name, {
        group: 'tool',
        icon: t.icon,
        title: t.label,
        // Clicking the tool that is already on leaves it on: a palette with
        // nothing chosen is a state with no meaning here.
        onChange: () => onToolChange(t.name),
      });

    const split = (g: Group) => {
      const at = sel[g.key] ?? 0;
      const cur = g.variants[at] ?? g.variants[0];
      const on = g.variants.some((v) => v.name === activeTool);
      return splitToggle(
        g.key,
        cur.label,
        on,
        g.variants.map((v, i) =>
          item(`${g.key}:${i}`, v.label, {
            icon: v.icon,
            onSelect: () => {
              setSel((s) => ({ ...s, [g.key]: i }));
              pick(v);
            },
          })
        ),
        { group: 'tool', icon: cur.icon, title: cur.label, onChange: () => pick(cur) }
      );
    };

    return [
      ...SIMPLE_TOOLS.map(plain),
      split(CIRCLE_GROUP),
      split(ARC_GROUP),
      split(RECT_GROUP),
      split(POLYGON_GROUP),
      split(SLOT_GROUP),
      split(BSPLINE_GROUP),
      ...LATE_TOOLS.map(plain),
      // The solid primitives only mean something in the 3D view; hidden rather
      // than disabled, and `visibleNodes` takes the separator with them.
      separator('solids'),
      ...SOLID_TOOLS.map((t) => ({ ...plain(t), hidden: viewMode !== '3d' })),
    ];
  }, [activeTool, onToolChange, sel, viewMode]);

  return (
    <CoreToolbar
      nodes={nodes}
      orientation="vertical"
      display="icon"
      aria-label="drawing tools"
      sx={{
        width: 44,
        py: 1,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    />
  );
}
