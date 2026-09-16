/**
 * An open menu, and the pieces every menu-ish component needs to draw one.
 *
 * Both the toolbar and the menu bar open menus, and a menu is a menu: the same
 * popup, the same hover rules, the same recursion. It lives here so that neither
 * component owns it and the other copies it.
 *
 * What it draws are `Action`s from `@hestia/core` — the behaviour (whether a
 * click opens or acts, which entries are visible) is answered by the objects.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import {
  Box,
  Divider,
  MenuItem as MuiMenuItem,
  MenuList,
  Paper,
  Popper,
  Typography,
} from '@mui/material';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import {
  Action,
  CustomItem,
  Separator,
  type Menu,
  type MenuCustomNode,
  type MenuItem,
} from '@hestia/core';
import { useToolbarRevision } from './useToolbar';

export const isElement = (x: unknown): x is ReactNode =>
  typeof x === 'object' && x !== null && '$$typeof' in (x as Record<string, unknown>);

/** The icon of an item, drawn by the host or used as it is. */
export function useIconRenderer(renderIcon?: (icon: unknown, item: MenuItem) => ReactNode) {
  return useCallback(
    (item: MenuItem): ReactNode => {
      const icon = item instanceof Action ? item.icon.value : undefined;
      if (icon === undefined) return null;
      if (renderIcon) return renderIcon(icon, item);
      return isElement(icon) ? icon : null;
    },
    [renderIcon]
  );
}

/** The custom payload of an item, in the plain form the prop has always taken. */
export function drawCustom(
  item: CustomItem,
  renderCustom?: (node: MenuCustomNode) => ReactNode
): ReactNode {
  if (renderCustom) return renderCustom(item.toModel());
  return isElement(item.render.value) ? item.render.value : null;
}

export interface SubmenuProps {
  /** The list to draw. Whether it is showing is the list's own business. */
  menu: Menu;
  anchor: HTMLElement | null;
  placement: 'bottom-start' | 'right-start';
  renderCustom?: (node: MenuCustomNode) => ReactNode;
  renderIcon?: (icon: unknown, item: MenuItem) => ReactNode;
  /**
   * Called after an entry has been performed — the menu triggers it itself.
   *
   * It used to be the host's job, and every host did it except the panel,
   * whose ⋮ therefore had a "Close" that closed nothing. Doing it here means a
   * menu entry works by being in a menu, not by the component around it
   * remembering to make it work.
   */
  onChosen: (action: Action) => void;
  onClose: () => void;
}

/**
 * It draws itself recursively rather than flattening the tree: a submenu is a
 * menu, and the depth it goes to is the tree's business, not this component's.
 *
 * It keeps no state at all. Which entry has its own list showing is
 * `entry.menu.open`, in the object — this used to be a `useState` here, one per
 * level, and the rules for closing them drifted apart level by level.
 */
export function Submenu({
  menu,
  anchor,
  placement,
  renderCustom,
  renderIcon,
  onChosen,
  onClose,
}: SubmenuProps) {
  const anchors = useRef(new Map<string, HTMLElement>());
  const icon = useIconRenderer(renderIcon);
  useToolbarRevision(menu);

  if (!anchor) return null;

  return (
    <Popper open={menu.isOpen} anchorEl={anchor} placement={placement} style={{ zIndex: 1400 }}>
      <Paper data-toolbar-menu elevation={8} sx={{ minWidth: 180, py: 0.5 }}>
        <MenuList dense disablePadding>
          {menu.visibleItems.map((entry) => {
            if (entry instanceof Separator) return <Divider key={entry.id} sx={{ my: 0.5 }} />;
            if (entry instanceof CustomItem) {
              return (
                <Box key={entry.id} sx={{ px: 1.5, py: 0.5 }}>
                  {drawCustom(entry, renderCustom)}
                </Box>
              );
            }
            if (!(entry instanceof Action)) return null;

            const opens = entry.hasMenu;
            const isOpen = opens && entry.menu.isOpen;
            const checked = entry.checkable.value && entry.checked.value;

            return (
              <Box key={entry.id}>
                <MuiMenuItem
                  ref={(el: HTMLElement | null) => {
                    if (el) anchors.current.set(entry.id, el);
                    else anchors.current.delete(entry.id);
                  }}
                  disabled={!entry.enabled.value}
                  selected={isOpen}
                  // Hovering opens a submenu and shuts the one
                  // that was open beside it — two open menus
                  // side by side is a state nothing recovers from.
                  onPointerEnter={() => {
                    menu.closeChildMenus();
                    if (opens) entry.menu.show({ byHover: true });
                  }}
                  onClick={() => {
                    if (entry.checkable.value) {
                      entry.trigger();
                      onChosen(entry);
                      return;
                    }
                    // Opening only, never toggling on the way
                    // in: hovering has already opened it.
                    if (entry.opensOnClick) {
                      entry.menu.show();
                      return;
                    }
                    entry.trigger();
                    onChosen(entry);
                  }}
                  sx={{ gap: 1, pr: 1.5 }}
                >
                  <Box sx={{ width: 20, display: 'flex', alignItems: 'center', fontSize: 18 }}>
                    {checked ? <CheckIcon fontSize="small" /> : icon(entry)}
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {entry.text.value}
                  </Typography>
                  {entry.shortcut.value && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                      {entry.shortcut.value}
                    </Typography>
                  )}
                  {opens && <ArrowRightIcon fontSize="small" sx={{ ml: 0.5, opacity: 0.7 }} />}
                </MuiMenuItem>
                {opens && (
                  <Submenu
                    menu={entry.menu}
                    anchor={anchors.current.get(entry.id) ?? null}
                    // Deeper menus always go sideways: below
                    // would land on the item beneath.
                    placement="right-start"
                    renderCustom={renderCustom}
                    renderIcon={renderIcon}
                    onChosen={onChosen}
                    onClose={onClose}
                  />
                )}
              </Box>
            );
          })}
        </MenuList>
      </Paper>
    </Popper>
  );
}
