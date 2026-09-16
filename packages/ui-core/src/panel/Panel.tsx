/**
 * One panel: a title bar and whatever the host put inside it.
 *
 * Every button on the bar is one of the panel's own `Action`s — `expand`,
 * `float`, `close` — and the ⋮ opens the panel's whole menu, the same object.
 * So a disabled entry is disabled everywhere at once, and nothing here decides
 * what a panel may do: it asks.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Action, type Panel as PanelObject } from '@hestia/core';
import { Submenu, isElement } from '../toolbar/Submenu';
import { useDismissOnOutside } from '../toolbar/usePopup';
import { useToolbarRevision } from '../toolbar/useToolbar';

export interface PanelProps {
  panel: PanelObject;
  /** Draws the inside. Without it, `panel.content` is used when it is a React element. */
  renderContent?: (panel: PanelObject) => ReactNode;
  /** Dragged to move a floating panel; the workspace supplies it. */
  onTitlePointerDown?: (e: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => void;
  /** Shown instead of the standard buttons — a panel's own toolbar, say. */
  titleExtra?: ReactNode;
}

const ICONS: Record<string, ReactNode> = {
  close: <CloseIcon fontSize="inherit" />,
  float: <OpenInNewIcon fontSize="inherit" />,
};

export function Panel({ panel, renderContent, onTitlePointerDown, titleExtra }: PanelProps) {
  useToolbarRevision(panel);
  // Whether the ⋮ is showing is the menu's own business, not this component's:
  // the same popup is opened from a title bar, from a keyboard shortcut and
  // from a test, and only one of those has a `useState`.
  const menuOpen = panel.menu.isOpen;
  const menuAnchor = useRef<HTMLElement | null>(null);
  const titleBar = useRef<HTMLElement | null>(null);
  const body = useRef<HTMLElement | null>(null);
  useDismissOnOutside(
    menuOpen,
    titleBar,
    useCallback(() => panel.menu.close(), [panel]),
    [body]
  );

  const content = renderContent
    ? renderContent(panel)
    : isElement(panel.content.value)
      ? panel.content.value
      : null;
  const showHeader = panel.headerVisible.value;

  const button = (action: Action) => {
    const expandIcon = panel.expanded.value ? (
      <CloseFullscreenIcon fontSize="inherit" />
    ) : (
      <OpenInFullIcon fontSize="inherit" />
    );
    return (
      <Tooltip key={action.id} title={action.text.value} placement="bottom">
        <span>
          <IconButton
            size="small"
            disabled={!action.enabled.value}
            onClick={() => action.trigger()}
            sx={{
              fontSize: 15,
              p: 0.35,
              color: action.checked.value ? 'primary.main' : 'text.secondary',
            }}
            aria-label={action.text.value}
            aria-pressed={action.checkable.value ? action.checked.value : undefined}
          >
            {action.id === 'expand' ? expandIcon : ICONS[action.id]}
          </IconButton>
        </span>
      </Tooltip>
    );
  };

  return (
    <Paper
      elevation={panel.floating.value ? 8 : 0}
      square={!panel.floating.value}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        border: panel.floating.value ? 'none' : '1px solid',
        borderColor: 'divider',
      }}
    >
      {showHeader && (
        <Box
          ref={titleBar}
          onPointerDown={onTitlePointerDown}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.75,
            py: 0.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
            flexShrink: 0,
            cursor: onTitlePointerDown ? 'move' : 'default',
            touchAction: 'none',
          }}
        >
          {isElement(panel.icon.value) && (
            <Box sx={{ display: 'flex', fontSize: 16 }}>{panel.icon.value}</Box>
          )}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {panel.title.value || panel.id}
          </Typography>
          {titleExtra}
          {panel.titleBarActions.map(button)}
          <IconButton
            size="small"
            ref={(el: HTMLElement | null) => {
              menuAnchor.current = el;
            }}
            onClick={() => panel.menu.toggle()}
            sx={{ fontSize: 15, p: 0.35, color: 'text.secondary' }}
            aria-label="Panel menu"
            aria-haspopup
            aria-expanded={menuOpen}
          >
            <MoreVertIcon fontSize="inherit" />
          </IconButton>
        </Box>
      )}

      {/* With no title bar there is no ⋮, so the way back to the menu is a
                right-click on the contents — otherwise hiding it is a one-way
                door and the panel can never be moved or closed again. */}
      <Box
        ref={body}
        onContextMenu={(e: { preventDefault: () => void; clientX: number; clientY: number }) => {
          e.preventDefault();
          panel.menu.toggle();
        }}
        sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}
      >
        {content}
      </Box>

      <Submenu
        menu={panel.menu}
        anchor={(showHeader ? menuAnchor.current : body.current) ?? null}
        placement="bottom-start"
        onChosen={() => panel.menu.close()}
        onClose={() => panel.menu.close()}
      />
    </Paper>
  );
}
