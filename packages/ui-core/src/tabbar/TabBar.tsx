/**
 * The tab bar: a row of tabs, one of them current.
 *
 * It draws a `TabBar` from `@hestia/core` and asks it everything — which tab is
 * current, which may be shut, what the overflow menu holds, where the current
 * tab goes when this one is shut. What this file owns is the strip that scrolls,
 * the × on each tab, and the two pointer gestures a tab bar has: a click chooses,
 * a right-click opens that tab's menu.
 *
 * Tabs that do not fit are not lost: the ▾ at the end lists every tab, including
 * the ones scrolled out of sight, and choosing one brings it into view.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { type Tab as TabObject, type TabBar as TabBarObject } from '@hestia/core';
import { Submenu, isElement } from '../toolbar/Submenu';
import { useDismissOnOutside } from '../toolbar/usePopup';
import { useToolbarRevision } from '../toolbar/useToolbar';

/**
 * The current tab, and a re-render whenever it changes.
 *
 * A host draws the current tab's contents, and the contents are not inside this
 * component — so watching the bar is the host's job and this is how it does it.
 * Reading `bar.current.value` without it gives the tab that was current when the
 * host last rendered for some other reason, which is to say: the wrong one, and
 * clicking a tab appears to do nothing.
 */
export function useCurrentTab(bar: TabBarObject): TabObject | null {
  useToolbarRevision(bar);
  return bar.current.value;
}

export interface TabBarProps {
  tabbar: TabBarObject;
  /** Draws a tab's icon. Without it, an icon that is already a React element is used as it is. */
  renderIcon?: (icon: unknown, tab: TabObject) => ReactNode;
  /** Called after a tab is chosen — for a host that wants to know without watching the object. */
  onCurrentChanged?: (tab: TabObject | null) => void;
  /** Whether the bar scrolls when it is too long. Overrides the object's own setting. */
  scrollable?: boolean;
  sx?: Record<string, unknown>;
  'aria-label'?: string;
}

export function TabBar({
  tabbar,
  renderIcon,
  onCurrentChanged,
  scrollable,
  sx,
  ...rest
}: TabBarProps) {
  useToolbarRevision(tabbar);

  const strip = useRef<HTMLDivElement | null>(null);
  const overflowButton = useRef<HTMLElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const tabNodes = useRef(new Map<string, HTMLElement>());
  const contextAnchor = useRef<HTMLElement | null>(null);
  /**
   * Where the pointer went down, and whether it has travelled since.
   *
   * A bar of tabs scrolls by dragging it, and a drag ends in a click — so
   * without this, pulling the strip sideways opens the menu of whichever tab
   * the finger happened to start on. Six pixels is the usual line between a
   * tap and a drag.
   */
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  const scrolls = scrollable ?? tabbar.scrollable.value;
  const current = tabbar.current.value;
  const openTabMenu = tabbar.tabs.find((t) => t.menu.isOpen) ?? null;

  useDismissOnOutside(
    tabbar.menu.isOpen,
    container,
    useCallback(() => tabbar.menu.close(), [tabbar])
  );
  useDismissOnOutside(
    openTabMenu !== null,
    container,
    useCallback(() => openTabMenu?.menu.close(), [openTabMenu])
  );

  // Choosing a tab that is scrolled out of sight should bring it into sight —
  // otherwise the overflow menu picks a tab and nothing appears to happen.
  useEffect(() => {
    if (!current) return;
    tabNodes.current.get(current.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  useEffect(() => {
    if (!onCurrentChanged) return;
    const conn = tabbar.currentChanged.connect((tab) => onCurrentChanged(tab));
    return () => conn.disconnect();
  }, [tabbar, onCurrentChanged]);

  return (
    <Box
      ref={container}
      role="tablist"
      aria-label={rest['aria-label']}
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        // The strip inside scrolls, so the bar itself must never be
        // wider than what it was given: without these a row of twenty
        // tabs pushes the whole view open and the page grows a scrollbar
        // of its own instead.
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        flexShrink: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...sx,
      }}
    >
      <Box
        ref={strip}
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          flex: '1 1 0%',
          minWidth: 0,
          ...(scrolls
            ? {
                // Nothing wraps: a second row of tabs moves everything
                // below it, and the layout shifts under the pointer that
                // was reaching for one.
                flexWrap: 'nowrap',
                overflowX: 'auto',
                overflowY: 'hidden',
                touchAction: 'pan-x',
                scrollbarWidth: 'thin',
                '&::-webkit-scrollbar': { height: 4 },
                '&::-webkit-scrollbar-thumb': { borderRadius: 2, bgcolor: 'action.disabled' },
                '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                '& > *': { flexShrink: 0 },
              }
            : { flexWrap: 'wrap' }),
        }}
      >
        {tabbar.visibleTabs.map((tab) => {
          const isCurrent = tab === current;
          const icon = tab.icon.value;
          const drawnIcon = renderIcon ? renderIcon(icon, tab) : isElement(icon) ? icon : null;

          const body = (
            <Box
              ref={(el: HTMLElement | null) => {
                if (el) tabNodes.current.set(tab.id, el);
                else tabNodes.current.delete(tab.id);
              }}
              component="div"
              role="tab"
              aria-selected={isCurrent}
              onPointerDown={(e: { clientX: number; clientY: number }) => {
                press.current = { x: e.clientX, y: e.clientY, dragged: false };
              }}
              onPointerMove={(e: { clientX: number; clientY: number }) => {
                const from = press.current;
                if (!from || from.dragged) return;
                if (Math.abs(e.clientX - from.x) > 6 || Math.abs(e.clientY - from.y) > 6) {
                  from.dragged = true;
                }
              }}
              onClick={() => {
                const dragged = press.current?.dragged === true;
                press.current = null;
                if (dragged) return; // the strip was being pulled, not the tab pressed
                tab.click();
              }}
              onContextMenu={(e: { preventDefault: () => void; currentTarget: HTMLElement }) => {
                e.preventDefault();
                contextAnchor.current = e.currentTarget;
                tabbar.closeTabMenus();
                tab.menu.toggle();
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.75,
                cursor: 'pointer',
                minWidth: 0,
                maxWidth: 220,
                fontSize: 13,
                whiteSpace: 'nowrap',
                color: isCurrent ? 'text.primary' : 'text.secondary',
                bgcolor: isCurrent ? 'action.selected' : 'transparent',
                // The current tab is marked underneath rather than
                // by a border all round: a border changes the tab's
                // size and nudges every tab after it.
                boxShadow: isCurrent
                  ? (t: { palette: { primary: { main: string } } }) =>
                      `inset 0 -2px 0 ${t.palette.primary.main}`
                  : 'none',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {drawnIcon && <Box sx={{ display: 'flex', fontSize: 16 }}>{drawnIcon}</Box>}
              <Typography
                variant="body2"
                sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {tab.label}
              </Typography>

              {/* Unsaved changes take the ×'s place until the pointer
                                is over the tab: a dot that moves things around when
                                it appears is worse than one that replaces something. */}
              {/* A tab with a list of its own says so, and the
                                arrow opens it outright.
                                
                                Clicking the tab itself opens the list too, once
                                the tab is current — but that click has to get
                                past the drag guard and past the ×, and a menu
                                that sometimes appears is worse than one with a
                                button of its own. Same bargain as the split
                                button on a toolbar. */}
              {tab.menu.visibleItems.length > 0 && (
                <Box
                  component="span"
                  role="button"
                  aria-label={`Menu ${tab.label}`}
                  aria-haspopup
                  aria-expanded={tab.menu.isOpen}
                  onPointerDown={(e: { stopPropagation: () => void }) => e.stopPropagation()}
                  onClick={(e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    const wasOpen = tab.menu.isOpen;
                    tabbar.closeTabMenus();
                    if (!wasOpen) tab.menu.show();
                  }}
                  sx={{
                    display: 'flex',
                    borderRadius: 1,
                    opacity: isCurrent || tab.menu.isOpen ? 0.7 : 0,
                    '& svg': { fontSize: 16 },
                    '.MuiBox-root:hover > &': { opacity: 0.7 },
                    '&:hover': { opacity: 1, bgcolor: 'action.hover' },
                  }}
                >
                  <ArrowDropDownIcon fontSize="small" />
                </Box>
              )}
              {tab.modified.value && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'warning.main',
                    flexShrink: 0,
                  }}
                />
              )}
              {tab.closable.value && !tab.modified.value && (
                <Box
                  component="span"
                  role="button"
                  aria-label={`Close ${tab.label}`}
                  onClick={(e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    tab.close();
                  }}
                  sx={{
                    display: 'flex',
                    borderRadius: 1,
                    opacity: isCurrent ? 0.6 : 0,
                    '& svg': { fontSize: 14 },
                    '.MuiBox-root:hover > &': { opacity: 0.6 },
                    '&:hover': { opacity: 1, bgcolor: 'action.hover' },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </Box>
              )}
            </Box>
          );

          const title = tab.tooltip.value;
          return (
            <Box key={tab.id} sx={{ display: 'flex' }}>
              {title ? (
                <Tooltip title={title} placement="bottom">
                  {body}
                </Tooltip>
              ) : (
                body
              )}
              <Submenu
                menu={tab.menu}
                anchor={tabNodes.current.get(tab.id) ?? null}
                placement="bottom-start"
                onChosen={() => tab.menu.close()}
                onClose={() => tab.menu.close()}
              />
            </Box>
          );
        })}
      </Box>

      {/* Every tab, including the ones scrolled out of sight. */}
      <Box
        component="button"
        type="button"
        ref={(el: HTMLElement | null) => {
          overflowButton.current = el;
        }}
        aria-label="All tabs"
        aria-haspopup
        aria-expanded={tabbar.menu.isOpen}
        onClick={() => tabbar.menu.toggle()}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 0.5,
          flexShrink: 0,
          border: 'none',
          bgcolor: 'transparent',
          cursor: 'pointer',
          color: 'text.secondary',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ArrowDropDownIcon fontSize="small" />
      </Box>
      <Submenu
        menu={tabbar.menu}
        anchor={overflowButton.current}
        placement="bottom-start"
        onChosen={() => tabbar.menu.close()}
        onClose={() => tabbar.menu.close()}
      />
    </Box>
  );
}
