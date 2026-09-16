/**
 * The menu bar: "File", "Edit", "View" across the top, each opening onto what it
 * holds.
 *
 * It draws a `MenuBar` from `@hestia/core` and asks it everything: which menu is
 * open, what a click on an open menu means, whether moving along the bar should
 * move the opening. This file contributes a row of buttons, a popup anchored
 * under each, and the two things that only a browser knows — a click landing
 * outside, and the Escape key.
 *
 * A menu bar is a toolbar with one extra rule, so the entries, the popups and
 * the recursion are the toolbar's (`../toolbar/Submenu`). What is not shared is
 * exactly what the rule is about.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import {
  Action,
  CustomItem,
  Separator,
  MenuBar as MenuBarObject,
  type MenuCustomNode,
  type MenuItem,
  type ToolbarNode,
} from '@hestia/core';
import { Submenu, drawCustom, useIconRenderer } from '../toolbar/Submenu';
import { useDismissOnOutside } from '../toolbar/usePopup';
import { useToolbarRevision } from '../toolbar/useToolbar';

export interface MenuBarProps {
  /** The menu bar to draw. Build it with `new MenuBar()` and `addMenu`, or from a model. */
  menubar?: MenuBarObject;
  /** The plain tree instead — a menu bar is built from it and rebuilt whenever it changes. */
  nodes?: readonly ToolbarNode[];
  /** Draws a `custom` entry; it arrives in the plain form, as in the toolbar. */
  renderCustom?: (node: MenuCustomNode) => ReactNode;
  /** Draws an icon. Menus rarely carry one in the bar itself; their entries often do. */
  renderIcon?: (icon: unknown, item: MenuItem) => ReactNode;
  /** Called after any entry is chosen — for closing a dialog the bar sits in, say. */
  onAction?: (action: Action) => void;
  /** Extra styles for the container (`sx` from MUI). */
  sx?: Record<string, unknown>;
  'aria-label'?: string;
}

export function MenuBar({
  menubar,
  nodes,
  renderCustom,
  renderIcon,
  onAction,
  sx,
  ...rest
}: MenuBarProps) {
  const owned = useMemo(
    () => (menubar ? null : MenuBarObject.fromModel(nodes ?? [])),
    [menubar, nodes]
  );
  useEffect(
    () => () => {
      owned?.destroy();
    },
    [owned]
  );
  const bar = menubar ?? owned!;

  useToolbarRevision(bar);

  const anchors = useRef(new Map<string, HTMLElement>());
  const container = useRef<HTMLDivElement | null>(null);
  const icon = useIconRenderer(renderIcon);
  const open = bar.openMenu;

  // A click anywhere else shuts the bar, and so does Escape.
  useDismissOnOutside(
    bar.isOpen,
    container,
    useCallback(() => bar.close(), [bar])
  );

  /** A top-level entry that is a command rather than a menu. */
  const choose = (action: Action) => {
    action.trigger();
    chosen(action);
  };

  /** Something in an open menu was performed — the menu did the performing. */
  const chosen = (action: Action) => {
    onAction?.(action);
    bar.close();
  };

  return (
    <Box
      ref={container}
      role="menubar"
      aria-orientation="horizontal"
      aria-label={rest['aria-label']}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.25, minWidth: 0, ...sx }}
    >
      {bar.visibleItems.map((entry) => {
        if (entry instanceof Separator) {
          return <Box key={entry.id} sx={{ width: 1, height: 18, mx: 0.5, bgcolor: 'divider' }} />;
        }
        if (entry instanceof CustomItem) {
          return (
            <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center' }}>
              {drawCustom(entry, renderCustom)}
            </Box>
          );
        }
        if (!(entry instanceof Action)) return null;

        const isOpen = open === entry;
        const label = entry.text.value;
        const button = (
          <Box
            key={entry.id}
            component="button"
            type="button"
            role="menuitem"
            ref={(el: HTMLElement | null) => {
              if (el) anchors.current.set(entry.id, el);
              else anchors.current.delete(entry.id);
            }}
            aria-haspopup={entry.hasMenu || undefined}
            aria-expanded={entry.hasMenu ? isOpen : undefined}
            disabled={!entry.enabled.value}
            onClick={() => {
              // A menu opens; a bare command in the bar is performed
              // — the action answers which it is.
              if (entry.opensOnClick) {
                bar.toggle(entry);
                return;
              }
              choose(entry);
            }}
            onPointerEnter={() => bar.hover(entry)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.5,
              minWidth: 0,
              border: 'none',
              borderRadius: 1,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
              lineHeight: 1.4,
              color: entry.enabled.value ? 'text.primary' : 'text.disabled',
              bgcolor: isOpen ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: entry.enabled.value ? 'action.hover' : 'transparent' },
            }}
          >
            {icon(entry) && <Box sx={{ display: 'flex', fontSize: 18 }}>{icon(entry)}</Box>}
            {label && <span>{label}</span>}
          </Box>
        );

        return (
          <Box key={entry.id} sx={{ display: 'flex' }}>
            {entry.title && !label ? (
              <Tooltip title={entry.title} placement="bottom">
                {button}
              </Tooltip>
            ) : (
              button
            )}
            {entry.hasMenu && (
              <Submenu
                menu={entry.menu}
                anchor={anchors.current.get(entry.id) ?? null}
                placement="bottom-start"
                renderCustom={renderCustom}
                renderIcon={renderIcon}
                onChosen={chosen}
                onClose={() => bar.close()}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
