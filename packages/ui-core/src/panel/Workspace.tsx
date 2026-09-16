/**
 * The workspace: the panels docked around the page, and the page in the middle.
 *
 * Everything it draws it asks the `Workspace` object for — which panels are in
 * which area, how much room the area takes, which one is floating, which one is
 * filling the screen. What this file owns is the part that only exists on a
 * screen: pixels dragged. A resizer writes a number back into `panel.size`, and
 * dragging a floating panel writes its `geometry`; both are plain properties, so
 * the layout can be saved with `toModel()` and put back later.
 *
 * Areas stack: the left and right hold their panels one above another, the top
 * and bottom side by side. Panels sharing an area share its size — one strip
 * cannot be two widths — which is why the resizer sets every panel in the area.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { Box } from '@mui/material';
import {
  type PanelArea,
  type Panel as PanelObject,
  type Workspace as WorkspaceObject,
} from '@hestia/core';
import { Panel } from './Panel';
import { useToolbarRevision } from '../toolbar/useToolbar';

export interface WorkspaceProps {
  workspace: WorkspaceObject;
  /** The page itself — what the panels are docked around. */
  children?: ReactNode;
  /** Draws a panel's inside. Without it, `panel.content` is used when it is a React element. */
  renderPanel?: (panel: PanelObject) => ReactNode;
  sx?: Record<string, unknown>;
}

const MIN_SIZE = 80;

export function Workspace({ workspace, children, renderPanel, sx }: WorkspaceProps) {
  useToolbarRevision(workspace);
  const frame = useRef<HTMLDivElement | null>(null);

  /** Drag a resizer: the pointer's distance from the edge is the area's new size. */
  const startResize = useCallback(
    (area: PanelArea) => (e: React.PointerEvent) => {
      e.preventDefault();
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const size =
          area === 'left'
            ? ev.clientX - box.left
            : area === 'right'
              ? box.right - ev.clientX
              : area === 'top'
                ? ev.clientY - box.top
                : box.bottom - ev.clientY;
        workspace.resize(area, Math.max(MIN_SIZE, Math.round(size)));
      };
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
    },
    [workspace]
  );

  /** Drag a floating panel by its title bar. */
  const startFloatDrag = useCallback(
    (panel: PanelObject) =>
      (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
        e.preventDefault();
        const from = panel.geometry.value;
        const startX = e.clientX;
        const startY = e.clientY;

        const move = (ev: PointerEvent) => {
          panel.geometry.value = {
            ...from,
            x: Math.max(0, from.x + ev.clientX - startX),
            y: Math.max(0, from.y + ev.clientY - startY),
          };
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      },
    []
  );

  const strip = (area: PanelArea) => {
    const panels = workspace.panelsIn(area);
    if (panels.length === 0) return null;
    const horizontal = workspace.isHorizontal(area);
    const size = workspace.sizeOf(area);

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: horizontal ? 'row' : 'column',
          ...(horizontal ? { height: size } : { width: size }),
          flexShrink: 0,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {panels.map((panel) => (
          <Box key={panel.id} sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <Panel panel={panel} renderContent={renderPanel} />
          </Box>
        ))}
      </Box>
    );
  };

  const resizer = (area: PanelArea) => {
    if (workspace.panelsIn(area).length === 0) return null;
    const horizontal = workspace.isHorizontal(area);
    return (
      <Box
        onPointerDown={startResize(area)}
        role="separator"
        aria-orientation={horizontal ? 'horizontal' : 'vertical'}
        sx={{
          flexShrink: 0,
          touchAction: 'none',
          ...(horizontal
            ? { height: 5, cursor: 'row-resize' }
            : { width: 5, cursor: 'col-resize' }),
          bgcolor: 'divider',
          opacity: 0.35,
          '&:hover': { opacity: 1 },
        }}
      />
    );
  };

  const expanded = workspace.expandedPanel;

  return (
    <Box
      ref={frame}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        ...sx,
      }}
    >
      {strip('top')}
      {resizer('top')}

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        {strip('left')}
        {resizer('left')}

        {/* The middle: the panels docked in the centre, then the page. */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {workspace.panelsIn('centre').map((panel) => (
            <Box key={panel.id} sx={{ height: panel.size.value, flexShrink: 0, minHeight: 0 }}>
              <Panel panel={panel} renderContent={renderPanel} />
            </Box>
          ))}
          <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{children}</Box>
        </Box>

        {resizer('right')}
        {strip('right')}
      </Box>

      {resizer('bottom')}
      {strip('bottom')}

      {/* Floating panels: over the page, dragged by their title bar. */}
      {workspace.floatingPanels.map((panel) => {
        const g = panel.geometry.value;
        return (
          <Box
            key={panel.id}
            sx={{
              position: 'absolute',
              left: g.x,
              top: g.y,
              width: g.width,
              height: g.height,
              zIndex: 20,
            }}
          >
            <Panel
              panel={panel}
              renderContent={renderPanel}
              onTitlePointerDown={startFloatDrag(panel)}
            />
          </Box>
        );
      })}

      {/* One panel filling the workspace, over everything — including the
                floating ones, which would otherwise hang in front of it. */}
      {expanded && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 30, bgcolor: 'background.paper' }}>
          <Panel panel={expanded} renderContent={renderPanel} />
        </Box>
      )}
    </Box>
  );
}
