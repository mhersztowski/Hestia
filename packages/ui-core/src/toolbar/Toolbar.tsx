/**
 * The toolbar: one tree of items, drawn as a menu bar or as a floating palette,
 * in either orientation.
 *
 * Both are the same component, because they are the same thing: a row (or a
 * column) of items, some of which open a menu below or beside themselves. The
 * differences that matter are three props — `orientation`, `variant` and
 * whether an item shows its label, its icon or both — and each of them changes
 * how an item is drawn, never what it does.
 *
 * What it draws is a `Toolbar` from `@hestia/core`: `Action`s, `Separator`s and
 * `CustomItem`s hanging off a `CoreObject` tree. Everything that is not drawing
 * lives there — whether a click opens a menu or performs the action, which
 * toggles turn each other off, which separators to drop, what a shortcut means.
 * This file decides where the pixels go and nothing else, which is why a change
 * of behaviour is a change in `@hestia/core` and can be tested without a DOM.
 *
 * Hand it a live `toolbar` and it follows it: a checkmark changes and only the
 * checkmark redraws, without React rebuilding anything. Hand it plain `nodes`
 * instead and one is built for you and rebuilt whenever the tree changes — the
 * older way, still supported, and how most callers arrived here.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Box, Divider, Tooltip } from '@mui/material';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import {
  Action,
  CustomItem,
  Separator,
  Toolbar as ToolbarObject,
  type MenuCustomNode,
  type ToolbarDisplay,
  type MenuItem,
  type ToolbarNode,
  type ToolbarOrientation,
  type ToolbarVariant,
} from '@hestia/core';
import { Submenu, drawCustom, useIconRenderer } from './Submenu';
import { useDismissOnOutside } from './usePopup';
import { useToolbarRevision } from './useToolbar';

export type { ToolbarOrientation, ToolbarVariant, ToolbarDisplay };

export interface ToolbarProps {
  /** The toolbar to draw. Build it with `Toolbar.fromModel(...)` or by hand with `addAction`. */
  toolbar?: ToolbarObject;
  /** The plain tree instead — a toolbar is built from it and rebuilt whenever it changes. */
  nodes?: readonly ToolbarNode[];
  /** Overrides the toolbar's own property, for a host that draws one toolbar two ways. */
  orientation?: ToolbarOrientation;
  variant?: ToolbarVariant;
  /** Defaults to `label` in a bar and `icon` in a floating palette. */
  display?: ToolbarDisplay;
  /**
   * Draws a `custom` item. The toolbar keeps whatever `render` holds without
   * looking at it, and hands it back here — so the package needs no opinion
   * about what a colour picker is. It arrives in the plain form, as before.
   */
  renderCustom?: (node: MenuCustomNode) => ReactNode;
  /** Draws an icon. Without it an icon that is already a React element is used as it is. */
  renderIcon?: (icon: unknown, item: MenuItem) => ReactNode;
  /** Called after any action is chosen — for closing a dialog the toolbar sits in, say. */
  onAction?: (action: Action) => void;
  /**
   * Whether a toolbar too long for its space scrolls.
   *
   * On by default, because the alternative is worse in a way that is hard to
   * see: a row of buttons wider than the window simply ends, and the ones past
   * the edge are not merely hard to reach but invisible and unreachable. A
   * finger drags the strip sideways (`touchAction` allows it), a trackpad and
   * a wheel work as they do anywhere, and the scrollbar itself is kept thin so
   * a bar does not grow a grey band across the bottom.
   */
  scrollable?: boolean;
  /** Extra styles for the container (`sx` from MUI). Position a floating palette with this. */
  sx?: Record<string, unknown>;
  /** For tests and for hosts that hold several toolbars. */
  'aria-label'?: string;
}

export function Toolbar({
  toolbar,
  nodes,
  orientation,
  variant,
  display,
  scrollable,
  renderCustom,
  renderIcon,
  onAction,
  sx,
  ...rest
}: ToolbarProps) {
  // Own one only when we were not given one. Rebuilding on every change of
  // `nodes` is what the plain form means: the tree is the truth, and the
  // objects are made to match it.
  const owned = useMemo(
    () =>
      toolbar
        ? null
        : ToolbarObject.fromModel(nodes ?? [], { orientation, variant, display, scrollable }),
    [toolbar, nodes, orientation, variant, display, scrollable]
  );
  useEffect(
    () => () => {
      owned?.destroy();
    },
    [owned]
  );
  const bar = toolbar ?? owned!;

  // Anything below changed — a label, a checkmark, an item added. Reading the
  // revision is what subscribes; the values themselves are read while drawing.
  useToolbarRevision(bar);

  const how: ToolbarDisplay = display ?? bar.effectiveDisplay;
  const vertical = (orientation ?? bar.orientation.value) === 'vertical';
  const floating = (variant ?? bar.variant.value) === 'floating';
  const scrolls = scrollable ?? bar.scrollable.value;
  const shown = bar.visibleItems;
  const icon = useIconRenderer(renderIcon);

  // Which list is showing is the toolbar's own business, not this component's:
  // `bar.openEntry` is the answer, and the rules about it — one at a time, the
  // pointer moving the opening, the click that follows not shutting it — are
  // in the object where a test can reach them.
  const openEntry = bar.openEntry;
  const anchors = useRef(new Map<string, HTMLElement>());
  const container = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => bar.closeMenus(), [bar]);

  // A click anywhere else closes the menu, and so does Escape.
  useDismissOnOutside(bar.isOpen, container, close);

  /** A top-level entry that is a command rather than a menu. */
  const choose = (action: Action) => {
    action.trigger();
    chosen(action);
  };

  /** Something in an open menu was performed — the menu did the performing. */
  const chosen = (action: Action) => {
    onAction?.(action);
    close();
  };

  return (
    <Box
      ref={container}
      role="menubar"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={rest['aria-label']}
      sx={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 0.25,
        p: floating ? 0.5 : 0.25,
        ...(scrolls
          ? {
              // Nothing wraps: a menu bar that folds onto a second line
              // moves every button below it, and the layout shifts under
              // the finger that is reaching for one.
              flexWrap: 'nowrap',
              overflowX: vertical ? 'hidden' : 'auto',
              overflowY: vertical ? 'auto' : 'hidden',
              // A finger drags the strip along its length; the other axis
              // is left to the page, so scrolling a long document does not
              // get caught by the toolbar lying across it.
              touchAction: vertical ? 'pan-y' : 'pan-x',
              scrollbarWidth: 'thin',
              // The scrollbar is there when it is being used and out of the
              // way otherwise — a permanent grey band across a toolbar of
              // six buttons looks like a fault.
              '&::-webkit-scrollbar': { height: 6, width: 6 },
              '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'action.disabled' },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              // Without this the buttons are squeezed instead of scrolling:
              // a flex child shrinks before its container overflows.
              '& > *': { flexShrink: 0 },
            }
          : {}),
        ...(floating
          ? { bgcolor: 'background.paper', borderRadius: 2, boxShadow: 6 }
          : {
              borderBottom: vertical ? 'none' : '1px solid',
              borderRight: vertical ? '1px solid' : 'none',
              borderColor: 'divider',
            }),
        ...sx,
      }}
    >
      {shown.map((entry) => {
        if (entry instanceof Separator) {
          return (
            <Divider
              key={entry.id}
              orientation={vertical ? 'horizontal' : 'vertical'}
              flexItem
              sx={{ mx: vertical ? 0 : 0.5, my: vertical ? 0.5 : 0 }}
            />
          );
        }
        if (entry instanceof CustomItem) {
          return (
            <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center' }}>
              {drawCustom(entry, renderCustom)}
            </Box>
          );
        }
        if (!(entry instanceof Action)) return null;

        const opensMenu = entry.hasMenu;
        const open = openEntry === entry;

        return (
          <Box key={entry.id} sx={{ display: 'flex' }}>
            <TopButton
              action={entry}
              how={how}
              open={open}
              opensMenu={opensMenu}
              vertical={vertical}
              icon={icon(entry)}
              elementRef={(el) => {
                if (el) anchors.current.set(entry.id, el);
                else anchors.current.delete(entry.id);
              }}
              onClick={() => {
                // Whether the click opens the menu or performs
                // the action is the action's own answer: a menu
                // opens, a split button acts and leaves the
                // arrow to open the list.
                if (entry.opensOnClick) {
                  bar.toggleMenuOf(entry);
                  return;
                }
                if (entry.checkable.value) {
                  entry.trigger();
                  onAction?.(entry);
                  return;
                }
                choose(entry);
              }}
              onOpenMenu={() => bar.toggleMenuOf(entry)}
              // Moving along an open bar opens what it passes over,
              // which is what a bar of menus does everywhere.
              onHover={() => bar.hoverMenuOf(entry)}
            />
            {opensMenu && (
              <Submenu
                menu={entry.menu}
                anchor={anchors.current.get(entry.id) ?? null}
                placement={vertical ? 'right-start' : 'bottom-start'}
                renderCustom={renderCustom}
                renderIcon={renderIcon}
                onChosen={chosen}
                onClose={close}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface TopButtonProps {
  action: Action;
  how: ToolbarDisplay;
  open: boolean;
  opensMenu: boolean;
  vertical: boolean;
  icon: ReactNode;
  /** The element the menu hangs from — anchoring the wrong one puts the menu in the wrong place. */
  elementRef: (el: HTMLElement | null) => void;
  onClick: () => void;
  onOpenMenu: () => void;
  onHover: () => void;
}

/** An action as it appears in the bar itself. */
function TopButton({
  action,
  how,
  open,
  opensMenu,
  vertical,
  icon,
  elementRef,
  onClick,
  onOpenMenu,
  onHover,
}: TopButtonProps) {
  const checked = action.checkable.value && action.checked.value;
  const label = action.text.value;
  const showLabel = how !== 'icon' && label !== '';
  const showIcon = how !== 'label' && icon !== null;
  const disabled = !action.enabled.value;
  const title = action.title;

  const content = (
    <Box
      ref={elementRef}
      component="button"
      type="button"
      role="menuitem"
      aria-haspopup={opensMenu || undefined}
      aria-expanded={opensMenu ? open : undefined}
      aria-checked={action.checkable.value ? checked : undefined}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={onHover}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        px: showLabel ? 1 : 0.75,
        py: 0.5,
        minWidth: 0,
        border: 'none',
        borderRadius: 1,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13,
        lineHeight: 1.4,
        color: disabled ? 'text.disabled' : 'text.primary',
        bgcolor: open || checked ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: disabled ? 'transparent' : 'action.hover' },
      }}
    >
      {showIcon && <Box sx={{ display: 'flex', fontSize: 18 }}>{icon}</Box>}
      {showLabel && <span>{label}</span>}
      {opensMenu && (
        <Box
          component="span"
          onClick={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onOpenMenu();
          }}
          sx={
            showLabel
              ? // Beside the label, where a menu's arrow belongs.
                { display: 'flex', ml: -0.25, opacity: 0.7 }
              : // On an icon-only button the arrow goes INSIDE, in the
                // corner, as FreeCAD draws it. Inline it would widen the
                // button past the strip that holds it, and in a narrow
                // vertical palette the arrows ended up hanging off the
                // side, over the drawing.
                {
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  opacity: 0.75,
                  lineHeight: 0,
                  '& svg': { fontSize: 13 },
                  '&:hover': { opacity: 1 },
                }
          }
        >
          {vertical || !showLabel ? (
            <ArrowRightIcon fontSize="small" />
          ) : (
            <ArrowDropDownIcon fontSize="small" />
          )}
        </Box>
      )}
    </Box>
  );

  // A button showing only an icon says nothing without one.
  return title && !showLabel ? (
    <Tooltip title={title} placement={vertical ? 'right' : 'bottom'}>
      {content}
    </Tooltip>
  ) : (
    content
  );
}

/** A convenience for the common case: a floating palette of icons. */
export function FloatingToolbar(props: Omit<ToolbarProps, 'variant'>) {
  return <Toolbar {...props} variant="floating" />;
}

/*
 * The menu bar is not here. It used to be `<Toolbar variant="bar" />`, which
 * drew the right thing and knew nothing: which menu is open, and the rule that
 * moving along the bar moves the opening, are a menu bar's own behaviour. It
 * lives in `../menubar`, on a `MenuBar` object that holds that state.
 */
