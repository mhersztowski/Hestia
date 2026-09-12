/**
 * The toolbar: one tree of nodes, drawn as a menu bar or as a floating palette,
 * in either orientation.
 *
 * Both are the same component, because they are the same thing: a row (or a
 * column) of nodes, some of which open a menu below or beside themselves. The
 * differences that matter are three props — `orientation`, `variant` and
 * whether a node shows its label, its icon or both — and each of them changes
 * how a node is drawn, never what it does.
 *
 * A submenu is an item with children (see `model.ts`), and nesting goes as deep
 * as the tree does: a menu opens below the bar, and everything inside it opens
 * to the side, which is how menus behave everywhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Divider, MenuItem, MenuList, Paper, Popper, Tooltip, Typography } from '@mui/material';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import {
    hasSubmenu, titleOf, visibleNodes,
    type MenuCustomNode, type MenuItemNode, type MenuToggleNode, type ToolbarNode,
} from './model';

export type ToolbarOrientation = 'horizontal' | 'vertical';

/**
 * `bar` is a menu bar: it sits in the layout, fills its width (or height), and
 * is where labels belong. `floating` is a palette: it hovers over what it acts
 * on, is dragged nowhere by itself, and is where icons belong.
 */
export type ToolbarVariant = 'bar' | 'floating';

/** What a node shows in the bar itself. Inside an open menu there is always a label. */
export type ToolbarDisplay = 'icon' | 'label' | 'both';

export interface ToolbarProps {
    /** The tree. Build it with the constructors in `model.ts`, or write it out. */
    nodes: ToolbarNode[];
    orientation?: ToolbarOrientation;
    variant?: ToolbarVariant;
    /** Defaults to `label` in a bar and `icon` in a floating palette. */
    display?: ToolbarDisplay;
    /**
     * Draws a `custom` node. The toolbar keeps whatever `render` holds without
     * looking at it, and hands it back here — so the package needs no opinion
     * about what a colour picker is.
     */
    renderCustom?: (node: MenuCustomNode) => ReactNode;
    /** Draws an `icon`. Without it an icon that is already a React element is used as it is. */
    renderIcon?: (icon: unknown, node: ToolbarNode) => ReactNode;
    /** Called after any item is chosen — for closing a dialog the toolbar sits in, say. */
    onAction?: (node: MenuItemNode) => void;
    /**
     * Whether a toolbar too long for its space scrolls.
     *
     * On by default, because the alternative is worse in a way that is hard to
     * see: a row of buttons wider than the window simply ends, and the ones past
     * the edge are not merely hard to reach but invisible and unreachable. A
     * finger drags the strip sideways (`touchAction` allows it), a trackpad and
     * a wheel work as they do anywhere, and the scrollbar itself is kept thin so
     * a bar does not grow a grey band across the bottom.
     *
     * Turn it off for a toolbar that is certainly short, or one whose container
     * scrolls already.
     */
    scrollable?: boolean;
    /** Extra styles for the container (`sx` from MUI). Position a floating palette with this. */
    sx?: Record<string, unknown>;
    /** For tests and for hosts that hold several toolbars. */
    'aria-label'?: string;
}

const isElement = (x: unknown): x is ReactNode =>
    typeof x === 'object' && x !== null && '$$typeof' in (x as Record<string, unknown>);

export function Toolbar({
    nodes, orientation = 'horizontal', variant = 'bar', display, scrollable = true,
    renderCustom, renderIcon, onAction, sx, ...rest
}: ToolbarProps) {
    const shown = useMemo(() => visibleNodes(nodes), [nodes]);
    const how: ToolbarDisplay = display ?? (variant === 'bar' ? 'label' : 'icon');

    /** The open top-level node, by id — only one at a time, as a menu bar has. */
    const [openId, setOpenId] = useState<string | null>(null);
    const anchors = useRef(new Map<string, HTMLElement>());
    const container = useRef<HTMLDivElement | null>(null);

    const close = useCallback(() => setOpenId(null), []);

    // A click anywhere else closes the menu, and so does Escape. Without this a
    // menu opened by accident follows the pointer around the page.
    useEffect(() => {
        if (openId === null) return;
        const onDown = (e: MouseEvent | PointerEvent) => {
            const target = e.target as Node | null;
            if (container.current?.contains(target ?? null)) return;
            // A submenu lives in a portal, outside the container — its own
            // clicks close the menu through `choose`, so anything landing in one
            // is not an outside click.
            if (target instanceof Element && target.closest('[data-toolbar-menu]')) return;
            close();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey);
        };
    }, [openId, close]);

    const icon = (node: ToolbarNode): ReactNode => {
        if (node.kind === 'separator' || node.icon === undefined) return null;
        if (renderIcon) return renderIcon(node.icon, node);
        return isElement(node.icon) ? node.icon : null;
    };

    const choose = (node: MenuItemNode) => {
        node.onSelect?.();
        onAction?.(node);
        close();
    };

    const vertical = orientation === 'vertical';

    return (
        <Box
            ref={container}
            role="menubar"
            aria-orientation={orientation}
            aria-label={rest['aria-label']}
            sx={{
                display: 'flex',
                flexDirection: vertical ? 'column' : 'row',
                alignItems: 'center',
                gap: 0.25,
                p: variant === 'floating' ? 0.5 : 0.25,
                ...(scrollable ? {
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
                } : {}),
                ...(variant === 'floating'
                    ? { bgcolor: 'background.paper', borderRadius: 2, boxShadow: 6 }
                    : { borderBottom: vertical ? 'none' : '1px solid', borderRight: vertical ? '1px solid' : 'none', borderColor: 'divider' }),
                ...sx,
            }}
        >
            {shown.map((node) => {
                if (node.kind === 'separator') {
                    return <Divider key={node.id} orientation={vertical ? 'horizontal' : 'vertical'} flexItem sx={{ mx: vertical ? 0 : 0.5, my: vertical ? 0.5 : 0 }} />;
                }
                if (node.kind === 'custom') {
                    return <Box key={node.id} sx={{ display: 'flex', alignItems: 'center' }}>{renderCustom?.(node) ?? (isElement(node.render) ? node.render : null)}</Box>;
                }

                const opensMenu = hasSubmenu(node);
                const open = openId === node.id;

                return (
                    <Box key={node.id} sx={{ display: 'flex' }}>
                        <TopButton
                            node={node}
                            how={how}
                            open={open}
                            opensMenu={opensMenu}
                            vertical={vertical}
                            icon={icon(node)}
                            elementRef={(el) => { if (el) anchors.current.set(node.id, el); else anchors.current.delete(node.id); }}
                            onClick={() => {
                                // A toggle with variants is a split button: the
                                // button turns the thing on, the arrow beside it
                                // opens the list.
                                if (node.kind === 'toggle') { node.onChange?.(!node.checked); return; }
                                // An item with children and something to do:
                                // clicking the button does the thing, and the
                                // arrow beside it opens the menu.
                                if (opensMenu && !node.onSelect) { setOpenId(open ? null : node.id); return; }
                                choose(node as MenuItemNode);
                            }}
                            onOpenMenu={() => setOpenId(open ? null : node.id)}
                            // Moving along an open menu bar opens what it passes
                            // over, which is what a menu bar does everywhere.
                            onHover={() => { if (openId !== null && opensMenu) setOpenId(node.id); }}
                        />
                        {opensMenu && (
                            <Submenu
                                nodes={(node as MenuItemNode | MenuToggleNode).children ?? []}
                                open={open}
                                anchor={anchors.current.get(node.id) ?? null}
                                placement={vertical ? 'right-start' : 'bottom-start'}
                                renderCustom={renderCustom}
                                renderIcon={renderIcon}
                                onChoose={choose}
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
    node: MenuItemNode | MenuToggleNode;
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

/** A node as it appears in the bar itself. */
function TopButton({ node, how, open, opensMenu, vertical, icon, elementRef, onClick, onOpenMenu, onHover }: TopButtonProps) {
    const checked = node.kind === 'toggle' && node.checked;
    const showLabel = how !== 'icon' && node.label !== undefined;
    const showIcon = how !== 'label' && icon !== null;
    const title = titleOf(node);

    const content = (
        <Box
            ref={elementRef}
            component="button"
            type="button"
            role="menuitem"
            aria-haspopup={opensMenu || undefined}
            aria-expanded={opensMenu ? open : undefined}
            aria-checked={node.kind === 'toggle' ? checked : undefined}
            disabled={node.disabled}
            onClick={onClick}
            onPointerEnter={onHover}
            sx={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                px: showLabel ? 1 : 0.75, py: 0.5, minWidth: 0,
                border: 'none', borderRadius: 1, cursor: 'pointer',
                font: 'inherit', fontSize: 13, lineHeight: 1.4,
                color: node.disabled ? 'text.disabled' : 'text.primary',
                bgcolor: open || checked ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: node.disabled ? 'transparent' : 'action.hover' },
            }}
        >
            {showIcon && <Box sx={{ display: 'flex', fontSize: 18 }}>{icon}</Box>}
            {showLabel && <span>{node.label}</span>}
            {opensMenu && (
                <Box
                    component="span"
                    onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onOpenMenu(); }}
                    sx={showLabel
                        // Beside the label, where a menu's arrow belongs.
                        ? { display: 'flex', ml: -0.25, opacity: 0.7 }
                        // On an icon-only button the arrow goes INSIDE, in the
                        // corner, as FreeCAD draws it. Inline it would widen the
                        // button past the strip that holds it, and in a narrow
                        // vertical palette the arrows ended up hanging off the
                        // side, over the drawing.
                        : {
                            position: 'absolute', right: 0, bottom: 0,
                            display: 'flex', opacity: 0.75, lineHeight: 0,
                            '& svg': { fontSize: 13 },
                            '&:hover': { opacity: 1 },
                        }}
                >
                    {vertical || !showLabel ? <ArrowRightIcon fontSize="small" /> : <ArrowDropDownIcon fontSize="small" />}
                </Box>
            )}
        </Box>
    );

    // A button showing only an icon says nothing without one.
return title && !showLabel ? <Tooltip title={title} placement={vertical ? 'right' : 'bottom'}>{content}</Tooltip> : content;
}

interface SubmenuProps {
    nodes: ToolbarNode[];
    open: boolean;
    anchor: HTMLElement | null;
    placement: 'bottom-start' | 'right-start';
    renderCustom?: (node: MenuCustomNode) => ReactNode;
    renderIcon?: (icon: unknown, node: ToolbarNode) => ReactNode;
    onChoose: (node: MenuItemNode) => void;
    onClose: () => void;
}

/**
 * An open menu, and the menus it opens in turn.
 *
 * It draws itself recursively rather than flattening the tree: a submenu is a
 * menu, and the depth it goes to is the tree's business, not this component's.
 */
function Submenu({ nodes, open, anchor, placement, renderCustom, renderIcon, onChoose, onClose }: SubmenuProps) {
    const shown = useMemo(() => visibleNodes(nodes), [nodes]);
    const [openId, setOpenId] = useState<string | null>(null);
    const anchors = useRef(new Map<string, HTMLElement>());

    // A menu that closes should not reopen with a submenu still hanging out of it.
    useEffect(() => { if (!open) setOpenId(null); }, [open]);

    if (!anchor) return null;

    const icon = (node: ToolbarNode): ReactNode => {
        if (node.kind === 'separator' || node.icon === undefined) return null;
        if (renderIcon) return renderIcon(node.icon, node);
        return isElement(node.icon) ? node.icon : null;
    };

    return (
        <Popper open={open} anchorEl={anchor} placement={placement} style={{ zIndex: 1400 }}>
            <Paper data-toolbar-menu elevation={8} sx={{ minWidth: 180, py: 0.5 }}>
                <MenuList dense disablePadding>
                    {shown.map((node) => {
                        if (node.kind === 'separator') return <Divider key={node.id} sx={{ my: 0.5 }} />;
                        if (node.kind === 'custom') {
                            return <Box key={node.id} sx={{ px: 1.5, py: 0.5 }}>{renderCustom?.(node) ?? (isElement(node.render) ? node.render : null)}</Box>;
                        }

                        const opens = hasSubmenu(node);
                        const isOpen = openId === node.id;
                        const checked = node.kind === 'toggle' && node.checked;

                        return (
                            <Box key={node.id}>
                                <MenuItem
                                    ref={(el: HTMLElement | null) => { if (el) anchors.current.set(node.id, el); else anchors.current.delete(node.id); }}
                                    disabled={node.disabled}
                                    selected={isOpen}
                                    // Hovering opens a submenu and closes the one
                                    // that was open beside it — two open menus
                                    // side by side is a state nothing recovers from.
                                    onPointerEnter={() => setOpenId(opens ? node.id : null)}
                                    onClick={() => {
                                        if (node.kind === 'toggle') { node.onChange?.(!node.checked); onClose(); return; }
                                        if (opens && !node.onSelect) { setOpenId(isOpen ? null : node.id); return; }
                                        onChoose(node);
                                    }}
                                    sx={{ gap: 1, pr: 1.5 }}
                                >
                                    <Box sx={{ width: 20, display: 'flex', alignItems: 'center', fontSize: 18 }}>
                                        {node.kind === 'toggle' && checked ? <CheckIcon fontSize="small" /> : icon(node)}
                                    </Box>
                                    <Typography variant="body2" sx={{ flex: 1 }}>{node.label}</Typography>
                                    {node.shortcut && (
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>{node.shortcut}</Typography>
                                    )}
                                    {opens && <ArrowRightIcon fontSize="small" sx={{ ml: 0.5, opacity: 0.7 }} />}
                                </MenuItem>
                                {opens && (
                                    <Submenu
                                        nodes={(node as MenuItemNode | MenuToggleNode).children ?? []}
                                        open={isOpen}
                                        anchor={anchors.current.get(node.id) ?? null}
                                        // Deeper menus always go sideways: below
                                        // would land on the item beneath.
                                        placement="right-start"
                                        renderCustom={renderCustom}
                                        renderIcon={renderIcon}
                                        onChoose={onChoose}
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

/** A convenience for the common case: a floating palette of icons. */
export function FloatingToolbar(props: Omit<ToolbarProps, 'variant'>) {
    return <Toolbar {...props} variant="floating" />;
}

/** A convenience for the other common case: a menu bar of labels. */
export function MenuBar(props: Omit<ToolbarProps, 'variant'>) {
    return <Toolbar {...props} variant="bar" />;
}
