/**
 * The action bar across the top: transforms, edits, undo and redo, delete.
 *
 * A `Toolbar` from `@hestia/ui-core`, like the tool palette beside it. The
 * tools are toggles in the same group the palette uses — "move" and "select"
 * are one tool between them, and only one can be on. Undo, redo and delete are
 * items: they happen and are over.
 *
 * Dimension is a split button when the host offers kinds of it: the button
 * turns on the universal dimension tool, the arrow offers FreeCAD's particular
 * ones.
 */
import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import RoundedCornerIcon from '@mui/icons-material/RoundedCorner';
import StraightenIcon from '@mui/icons-material/Straighten';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Toolbar as CoreToolbar,
  custom,
  item,
  separator,
  splitToggle,
  toggle,
  type ToolbarNode,
} from '@hestia/ui-core';
import { freecadIconUrl } from '../assets/freecadIcons';
import type { Project } from '../core';
import type { ToolName } from '../tools/types';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  project: Project;
  /**
   * The host's own controls, at the START of the row — its file menu belongs
   * here, so that the drawing gets one bar rather than two stacked ones.
   */
  start?: React.ReactNode;
  /** More controls at the end of the same row (the sketch's constraint toolbar, say). */
  children?: React.ReactNode;
  /** Entries in the Dimension button's dropdown (FreeCAD-style). Given these, Dimension becomes a split button. */
  dimensionOptions?: Array<{ key: string; label: string; sc: string; icon: string }>;
  onDimensionOption?: (key: string) => void;
}

const TRANSFORM_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'move', label: 'Move (M) — select first', icon: <OpenWithIcon fontSize="small" /> },
  { name: 'copy', label: 'Copy (CO) — select first', icon: <ContentCopyIcon fontSize="small" /> },
  {
    name: 'rotate',
    label: 'Rotate (RO) — select first',
    icon: <RotateRightIcon fontSize="small" />,
  },
];

const EDIT_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'offset', label: 'Offset (O)', icon: <LinearScaleIcon fontSize="small" /> },
  { name: 'trim', label: 'Trim (TR)', icon: <ContentCutIcon fontSize="small" /> },
  { name: 'fillet', label: 'Fillet (F)', icon: <RoundedCornerIcon fontSize="small" /> },
];

/** A FreeCAD icon by name, with a MUI icon to fall back on when the files are not served. */
function fcIcon(name: string, fallback: React.ReactNode, size = 18): React.ReactNode {
  const url = freecadIconUrl(name);
  return url ? (
    <img src={url} width={size} height={size} alt="" style={{ display: 'block' }} />
  ) : (
    fallback
  );
}

export function ActionBar({
  activeTool,
  onToolChange,
  project,
  start,
  children,
  dimensionOptions,
  onDimensionOption,
}: Props) {
  const desc = project.historyManager.getDescription();
  const canUndo = project.historyManager.canUndo();
  const canRedo = project.historyManager.canRedo();
  const selectionCount = project.selectionManager.count();

  const nodes: ToolbarNode[] = useMemo(() => {
    const tool = (t: { name: ToolName; label: string; icon: React.ReactNode }) =>
      toggle(t.name, t.label, activeTool === t.name, {
        group: 'tool',
        icon: t.icon,
        title: t.label,
        onChange: () => onToolChange(t.name),
      });

    const dimensionIcon = fcIcon('c_dimension', <StraightenIcon fontSize="small" />);
    const dimension = dimensionOptions?.length
      ? splitToggle(
          'dimension',
          'Dimension',
          activeTool === 'dimension',
          dimensionOptions.map((o) =>
            item(`dim:${o.key}`, o.label, {
              icon: fcIcon(o.icon, null),
              shortcut: o.sc,
              onSelect: () => onDimensionOption?.(o.key),
            })
          ),
          {
            group: 'tool',
            icon: dimensionIcon,
            title: 'Dimension (D) — universal',
            onChange: () => onToolChange('dimension'),
          }
        )
      : tool({
          name: 'dimension',
          label: 'Dimension (DI)',
          icon: <StraightenIcon fontSize="small" />,
        });

    return [
      ...(start ? [custom('hostStart', start), separator('s0')] : []),
      ...TRANSFORM_TOOLS.map(tool),
      separator('s1'),
      ...EDIT_TOOLS.map(tool),
      dimension,
      separator('s2'),
      item('undo', 'Undo', {
        icon: <UndoIcon fontSize="small" />,
        // The title names what would be undone, which is the only way to tell
        // before pressing it.
        title: desc.undoLabel ? `Undo: ${desc.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)',
        disabled: !canUndo,
        onSelect: () => project.undo(),
      }),
      item('redo', 'Redo', {
        icon: <RedoIcon fontSize="small" />,
        title: desc.redoLabel ? `Redo: ${desc.redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)',
        disabled: !canRedo,
        onSelect: () => project.redo(),
      }),
      item('delete', 'Delete', {
        icon: <DeleteIcon fontSize="small" />,
        title: 'Delete selected (Del)',
        disabled: selectionCount === 0,
        onSelect: () => project.removeSelected(),
      }),
      // The host's own controls, still inside the bar so they scroll with it.
      ...(children ? [separator('s3'), custom('host', children)] : []),
    ];
  }, [
    activeTool,
    canRedo,
    canUndo,
    children,
    desc.redoLabel,
    desc.undoLabel,
    dimensionOptions,
    onDimensionOption,
    onToolChange,
    project,
    selectionCount,
    start,
  ]);

  return (
    <CoreToolbar
      nodes={nodes}
      display="icon"
      aria-label="actions"
      sx={{
        px: 1,
        minHeight: 38,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
      renderCustom={(node) => (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>{node.render as React.ReactNode}</Box>
      )}
    />
  );
}
