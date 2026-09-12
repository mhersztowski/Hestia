/**
 * The toolbar's model: what a menu is made of, before anything draws it.
 *
 * A toolbar is a **tree of nodes**, and the same tree serves a menu bar across
 * the top and a floating palette of icons — what differs is how it is drawn, not
 * what it says. So the tree is defined here on its own, with no React in sight:
 * it can be built on a server, kept in a file, checked in a test, and read by
 * something that is not a toolbar at all.
 *
 * Four kinds of node, and the kind is what a node **is**, not how it looks:
 *
 * - `item`     — something to do. It has an `onSelect`, or `children`, or both:
 *                a node with children is a submenu, however deep it goes.
 * - `toggle`   — something that is on or off, and shows which. It may have
 *                children as well: that is a split button — the button itself
 *                turns the thing on, the arrow beside it offers the variants.
 * - `separator`— a line between groups.
 * - `custom`   — anything the tree has no vocabulary for (a colour picker, a
 *                zoom readout), handed back to the host to render.
 *
 * There is no separate `menu` or `submenu` kind on purpose. A submenu is an item
 * that happens to have children, and that is how menus behave everywhere: the
 * top-level "File" is the same kind of thing as "Export" inside it.
 */

/** Everything every node has. */
export interface NodeBase {
    /**
     * Unique among its siblings — it is how a node is referred to from outside
     * (which one is open, which is selected) and how React tells them apart.
     */
    id: string;
    /** The text. Optional for an icon-only button, but see `title`. */
    label?: string;
    /**
     * The icon. The package does not know what an icon is — a React element, an
     * SVG, a name for the host to resolve — so it keeps whatever it is given and
     * hands it back when drawing.
     */
    icon?: unknown;
    /** The hover text; falls back to `label`. An icon-only node with neither is unreadable to a screen reader. */
    title?: string;
    /** Greyed out and unselectable. A reason belongs in `title`: a button that does nothing and says nothing is a bug report. */
    disabled?: boolean;
    /** Hidden entirely — a node that does not apply is better absent than greyed. */
    hidden?: boolean;
    /** The keyboard shortcut, as text to show (`Ctrl+S`). Binding it is the host's business. */
    shortcut?: string;
}

/** Something to do — and, with `children`, something to open. */
export interface MenuItemNode extends NodeBase {
    kind: 'item';
    onSelect?: () => void;
    /** A submenu. An item with children and an `onSelect` does both: clicking acts, the arrow opens. */
    children?: ToolbarNode[];
}

/** Something that is on or off. */
export interface MenuToggleNode extends NodeBase {
    kind: 'toggle';
    checked: boolean;
    onChange?: (checked: boolean) => void;
    /**
     * Variants, opened by the arrow beside the button — a split button.
     *
     * A tool palette is what this is for: the button turns the tool on and shows
     * that it is on, while the arrow offers the kinds of it (a circle by centre
     * or by three points). Without it the two would have to be separate nodes,
     * and the one showing the state would not be the one being clicked.
     */
    children?: ToolbarNode[];
    /**
     * Toggles sharing a group behave as radio buttons: turning one on turns the
     * others off. The group name is local to the parent's children.
     */
    group?: string;
}

/** A line between groups. It has an id like everything else, so a list of them stays keyed. */
export interface MenuSeparatorNode extends Pick<NodeBase, 'id' | 'hidden'> {
    kind: 'separator';
}

/** Anything the tree has no vocabulary for. The host draws it; the toolbar only finds it a place. */
export interface MenuCustomNode extends NodeBase {
    kind: 'custom';
    /** Handed back to the renderer untouched. */
    render: unknown;
}

export type ToolbarNode = MenuItemNode | MenuToggleNode | MenuSeparatorNode | MenuCustomNode;

/** A node that can hold others: an item (a menu) or a toggle (a split button). */
export type ToolbarParent = MenuItemNode | MenuToggleNode;

// ── Building ─────────────────────────────────────────────────────────────────
//
// The constructors below are shorter than the object literals and, more to the
// point, they put `kind` in for you — a tree written by hand is where a missing
// discriminant hides longest.

export function item(id: string, label: string, rest: Omit<MenuItemNode, 'kind' | 'id' | 'label'> = {}): MenuItemNode {
    return { kind: 'item', id, label, ...rest };
}

export function submenu(id: string, label: string, children: ToolbarNode[], rest: Omit<MenuItemNode, 'kind' | 'id' | 'label' | 'children'> = {}): MenuItemNode {
    return { kind: 'item', id, label, children, ...rest };
}

export function toggle(id: string, label: string, checked: boolean, rest: Omit<MenuToggleNode, 'kind' | 'id' | 'label' | 'checked'> = {}): MenuToggleNode {
    return { kind: 'toggle', id, label, checked, ...rest };
}

/**
 * A split button: on or off like a toggle, with variants behind the arrow.
 * `toggle(..., { children })` says the same thing; this names it.
 */
export function splitToggle(id: string, label: string, checked: boolean, children: ToolbarNode[], rest: Omit<MenuToggleNode, 'kind' | 'id' | 'label' | 'checked' | 'children'> = {}): MenuToggleNode {
    return { kind: 'toggle', id, label, checked, children, ...rest };
}

export function separator(id: string): MenuSeparatorNode {
    return { kind: 'separator', id };
}

export function custom(id: string, render: unknown, rest: Omit<MenuCustomNode, 'kind' | 'id' | 'render'> = {}): MenuCustomNode {
    return { kind: 'custom', id, render, ...rest };
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** The children of a node, or none — a separator and a custom node never have any. */
export function childrenOf(node: ToolbarNode): ToolbarNode[] {
    return node.kind === 'item' || node.kind === 'toggle' ? node.children ?? [] : [];
}

/** Whether a node opens a submenu. An empty `children` array does not: there would be nothing in it. */
export function hasSubmenu(node: ToolbarNode): node is MenuItemNode | MenuToggleNode {
    return childrenOf(node).length > 0;
}

/** Whether a node can be interacted with at all. */
export function isActionable(node: ToolbarNode): boolean {
    if (node.kind === 'separator' || node.hidden || node.disabled) return false;
    if (node.kind === 'item') return node.onSelect !== undefined || hasSubmenu(node);
    return true;
}

/** What to show on hover: the explicit title, or the label. */
export function titleOf(node: ToolbarNode): string | undefined {
    if (node.kind === 'separator') return undefined;
    return node.title ?? node.label;
}

/** The path to a node, by id, from the tree's root; `null` when there is none. */
export function findPath(nodes: ToolbarNode[], id: string): ToolbarNode[] | null {
    for (const node of nodes) {
        if (node.id === id) return [node];
        const below = findPath(childrenOf(node), id);
        if (below) return [node, ...below];
    }
    return null;
}

/** The node with this id, anywhere in the tree. */
export function findNode(nodes: ToolbarNode[], id: string): ToolbarNode | null {
    return findPath(nodes, id)?.at(-1) ?? null;
}

/** Every node, depth first — for shortcuts, for tests, for anything that has to see them all. */
export function walk(nodes: ToolbarNode[]): ToolbarNode[] {
    return nodes.flatMap((node) => [node, ...walk(childrenOf(node))]);
}

/**
 * The nodes to draw: the hidden ones dropped, and separators that would end up
 * leading, trailing or doubled dropped with them.
 *
 * Hiding a node is how a menu adapts, and a menu that adapts grows stray lines:
 * hide the only item between two separators and the result is two rules against
 * each other. Rather than have every caller think about it, the drawing side
 * asks for the list and gets one that reads properly.
 */
export function visibleNodes(nodes: ToolbarNode[]): ToolbarNode[] {
    const shown = nodes.filter((n) => !n.hidden);
    const out: ToolbarNode[] = [];
    for (const node of shown) {
        if (node.kind === 'separator') {
            if (out.length === 0) continue;                       // leading
            if (out[out.length - 1].kind === 'separator') continue; // doubled
        }
        out.push(node);
    }
    while (out.length > 0 && out[out.length - 1].kind === 'separator') out.pop(); // trailing
    return out;
}

/**
 * Applies a toggle within its group: the one that changed takes the value, and
 * its siblings in the same group are turned off when it went on. Returns a new
 * tree; nothing is mutated, so React sees a change.
 *
 * Radio behaviour belongs here rather than in the drawing: a caller that keeps
 * its toggles in state needs the same rule, and a rule written twice is a rule
 * that will differ.
 */
export function applyToggle(nodes: ToolbarNode[], id: string, checked: boolean): ToolbarNode[] {
    const target = findNode(nodes, id);
    if (!target || target.kind !== 'toggle') return nodes;
    const group = target.group;

    const inThisLevel = (level: ToolbarNode[], hasTarget: boolean): ToolbarNode[] => level.map((node) => {
        let next: ToolbarNode = node;
        if (node.kind === 'toggle') {
            if (node.id === id) next = { ...node, checked };
            // Only siblings of the target, and only when it went on: turning one
            // off leaves a group with nothing chosen, which is a state a radio
            // group is allowed to be in.
            else if (hasTarget && checked && group !== undefined && node.group === group) next = { ...node, checked: false };
        }
        // A split button's variants are a level of their own, and the target may
        // be among them.
        if ((next.kind === 'item' || next.kind === 'toggle') && next.children) {
            const holdsTarget = next.children.some((c) => c.id === id);
            next = { ...next, children: inThisLevel(next.children, holdsTarget) };
        }
        return next;
    });

    return inThisLevel(nodes, nodes.some((n) => n.id === id));
}
