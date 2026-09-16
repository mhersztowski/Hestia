/**
 * The plain form of a menu bar.
 *
 * A menu bar is a toolbar whose top level is all menus: "File", "Edit", "View",
 * each opening onto what it holds and doing nothing by itself. So there is no
 * new vocabulary here — a menu is the `item` with children that `toolbar.ts`
 * already describes — only the names that say which of the two you meant, and
 * the one rule that tells them apart.
 *
 * The live form is `coreobject/ui/MenuBar`, which adds what a bar of menus has
 * and a row of buttons does not: exactly one menu open at a time.
 */

import { childrenOf, submenu, type MenuItemNode, type ToolbarNode } from './toolbar';

/** A top-level entry of a menu bar. It is an item with children, nothing more. */
export type MenuNode = MenuItemNode;

/** A whole menu bar, as it would be written in a file. */
export interface MenuBarModel {
  id?: string;
  menus: MenuNode[];
}

/**
 * A menu for a menu bar. The same thing as `submenu`, under the name that reads
 * correctly where it is used — and it insists on children, because a menu with
 * nothing in it opens onto nothing.
 */
export function menu(
  id: string,
  label: string,
  children: ToolbarNode[],
  rest: Omit<MenuItemNode, 'kind' | 'id' | 'label' | 'children'> = {}
): MenuNode {
  return submenu(id, label, children, rest);
}

export function menuBar(menus: MenuNode[], id?: string): MenuBarModel {
  return { id, menus };
}

/** Whether a node would work as a top-level menu: it opens something. */
export function isMenu(node: ToolbarNode): node is MenuNode {
  return node.kind === 'item' && childrenOf(node).length > 0;
}

/**
 * The nodes of a tree that are menus.
 *
 * A menu bar built from a mixed list is worth catching early: a bare button
 * among the menus looks the same until it is clicked and nothing opens.
 */
export function menusOf(nodes: readonly ToolbarNode[]): MenuNode[] {
  return nodes.filter(isMenu);
}
