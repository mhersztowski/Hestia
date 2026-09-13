import { CoreObject } from './CoreObject';
import { Signal } from './Signal';

/**
 * Higher-level scene/tree node built on top of CoreObject.
 *
 * Over CoreObject it adds:
 *  - `id` — unique UUID per instance
 *  - Typed parent/children access (only `TreeNode` descendants visible)
 *  - `childAdded` / `childRemoved` / `parentChanged` signals
 *  - `addNode(child)` / `removeNode(child)` semantic API
 *  - `traverse(fn)` — depth-first walk including self
 *  - `findNode(predicate)` / `findById(id)` — typed search
 */
export class TreeNode extends CoreObject {
  readonly id: string;

  readonly childAdded = new Signal<[child: TreeNode]>();
  readonly childRemoved = new Signal<[child: TreeNode]>();
  readonly parentChanged = new Signal<[parent: TreeNode | null]>();

  constructor(parent?: TreeNode, objectName = '') {
    super(parent, objectName);
    this.id = crypto.randomUUID();
  }

  // ── Typed tree access ────────────────────────────────────────────────────

  /** Parent cast to TreeNode, or null if parent is a plain CoreObject or absent. */
  get parentNode(): TreeNode | null {
    const p = this.parent;
    return p instanceof TreeNode ? p : null;
  }

  /** Children that are TreeNode instances (excludes plain CoreObject children). */
  get nodes(): readonly TreeNode[] {
    return this.children.filter((c): c is TreeNode => c instanceof TreeNode);
  }

  // ── Tree mutation ────────────────────────────────────────────────────────

  /**
   * Append `child` to this node.
   * Equivalent to `child.setParent(this)` — preferred for readability.
   */
  addNode(child: TreeNode): void {
    child.setParent(this);
  }

  /**
   * Detach `child` from this node.
   * No-op if `child` is not a direct child.
   */
  removeNode(child: TreeNode): void {
    if (child.parent === this) child.setParent(null);
  }

  /**
   * Override setParent to emit tree-change signals.
   * Passing a non-TreeNode CoreObject throws — TreeNode trees are typed.
   */
  override setParent(parent: CoreObject | null): void {
    if (parent !== null && !(parent instanceof TreeNode)) {
      throw new TypeError('TreeNode.setParent: parent must be a TreeNode or null');
    }
    const oldParent = this.parentNode;
    super.setParent(parent);
    const newParent = this.parentNode;
    if (oldParent !== newParent) {
      oldParent?.childRemoved.emit(this);
      newParent?.childAdded.emit(this);
      this.parentChanged.emit(newParent);
    }
  }

  // ── Traversal & search ───────────────────────────────────────────────────

  /** Depth-first traversal — visits this node first, then children recursively. */
  traverse(fn: (node: TreeNode) => void): void {
    fn(this);
    for (const child of this.nodes) {
      child.traverse(fn);
    }
  }

  /** Post-order depth-first traversal — visits children before self. */
  traversePost(fn: (node: TreeNode) => void): void {
    for (const child of this.nodes) {
      child.traversePost(fn);
    }
    fn(this);
  }

  /** Find first descendant matching predicate (depth-first). Does not test self. */
  findNode<T extends TreeNode = TreeNode>(predicate: (n: TreeNode) => boolean): T | null {
    for (const child of this.nodes) {
      if (predicate(child)) return child as T;
      const found = child.findNode<T>(predicate);
      if (found) return found;
    }
    return null;
  }

  /** Find first descendant by id. */
  findById(id: string): TreeNode | null {
    return this.findNode((n) => n.id === id);
  }

  /** Ancestor chain from direct parent up to root. */
  ancestors(): TreeNode[] {
    const result: TreeNode[] = [];
    let cur = this.parentNode;
    while (cur) {
      result.push(cur);
      cur = cur.parentNode;
    }
    return result;
  }

  /** Depth relative to root (root = 0). */
  get depth(): number {
    return this.ancestors().length;
  }

  /** True if `candidate` is an ancestor of this node. */
  isDescendantOf(candidate: TreeNode): boolean {
    return this.ancestors().includes(candidate);
  }
}
