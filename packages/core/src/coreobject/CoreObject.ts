import { Connection } from './Connection';
import { Signal, type IConnectionOwner, type Slot } from './Signal';

/**
 * Base class for every object in the library — the equivalent of Qt's QObject.
 *
 * Features:
 *  - Parent/child object tree with automatic cascade destroy
 *  - Tree signals: `childAdded`, `childRemoved`, `parentChanged`, `destroyed`
 *  - Depth-first traversal and search (`traverse`, `find`, `findChild`, …)
 *  - A stable `id`, useful for serialisation and view keys
 *  - Tracked connections: auto-disconnected when this object is destroyed
 *
 * **Signals and `id` are allocated lazily.** A scene of 10 000 leaves that
 * nobody subscribes to pays one empty slot per feature instead of four `Signal`
 * instances (each holding a `Map`) plus a UUID per node. The emit sites use
 * `this.#childAdded?.emit(…)`, so an unobserved signal never materialises.
 */
export class CoreObject implements IConnectionOwner {
  #parent: CoreObject | null = null;
  #children: CoreObject[] = [];
  #trackedConnections: Connection[] = [];
  #isDestroyed = false;

  #id?: string;
  #destroyed?: Signal<[obj: CoreObject]>;
  #childAdded?: Signal<[child: CoreObject]>;
  #childRemoved?: Signal<[child: CoreObject]>;
  #parentChanged?: Signal<[parent: CoreObject | null]>;

  objectName: string;

  constructor(parent?: CoreObject, objectName = '') {
    this.objectName = objectName;
    // Safe: every field of this class is initialised before the constructor
    // body runs, so the signals below already exist when setParent emits.
    if (parent) this.setParent(parent);
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  /** Unique id, generated on first read and stable from then on. */
  get id(): string {
    return (this.#id ??= crypto.randomUUID());
  }

  /**
   * Assign an id instead of letting one be generated — used when restoring a
   * tree from persistence, and by subclasses whose id is semantic (see `State`).
   */
  set id(value: string) {
    this.#id = value;
  }

  // ── Signals ──────────────────────────────────────────────────────────────

  /** Emitted once, immediately before the object is torn down. */
  get destroyed(): Signal<[obj: CoreObject]> {
    return (this.#destroyed ??= new Signal());
  }

  /** Emitted on the *parent* when a child is attached to it. */
  get childAdded(): Signal<[child: CoreObject]> {
    return (this.#childAdded ??= new Signal());
  }

  /** Emitted on the *parent* when a child is detached from it. */
  get childRemoved(): Signal<[child: CoreObject]> {
    return (this.#childRemoved ??= new Signal());
  }

  /** Emitted on the child when it is reparented. */
  get parentChanged(): Signal<[parent: CoreObject | null]> {
    return (this.#parentChanged ??= new Signal());
  }

  // ── Tree ─────────────────────────────────────────────────────────────────

  get parent(): CoreObject | null {
    return this.#parent;
  }

  get children(): readonly CoreObject[] {
    return this.#children;
  }

  setParent(parent: CoreObject | null): void {
    if (this.#parent === parent) return;
    if (parent === this) {
      throw new TypeError('CoreObject.setParent: an object cannot be its own parent');
    }
    if (parent?.isDescendantOf(this)) {
      throw new TypeError(
        'CoreObject.setParent: cycle — the new parent is a descendant of this object'
      );
    }

    // `obj?.#field` is not valid TypeScript (TS18030), hence the plain guards.
    const previous = this.#parent;
    if (previous) previous.#detach(this);
    this.#parent = parent;
    if (parent) parent.#attach(this);

    if (previous) previous.#childRemoved?.emit(this);
    if (parent) parent.#childAdded?.emit(this);
    this.#parentChanged?.emit(parent);
  }

  /** Attach `child` to this object. Reads better than `child.setParent(this)`. */
  addChild(child: CoreObject): void {
    child.setParent(this);
  }

  /** Detach `child`. No-op when `child` is not a direct child. */
  removeChild(child: CoreObject): void {
    if (child.#parent === this) child.setParent(null);
  }

  /** Root ancestor of this object (itself when it has no parent). */
  get root(): CoreObject {
    let node: CoreObject = this;
    while (node.#parent) node = node.#parent;
    return node;
  }

  /** Ancestor chain, from the direct parent up to the root. */
  ancestors(): CoreObject[] {
    const result: CoreObject[] = [];
    for (let cur = this.#parent; cur; cur = cur.#parent) result.push(cur);
    return result;
  }

  /** Distance from the root (root = 0). */
  get depth(): number {
    let n = 0;
    for (let cur = this.#parent; cur; cur = cur.#parent) n += 1;
    return n;
  }

  isDescendantOf(candidate: CoreObject): boolean {
    for (let cur = this.#parent; cur; cur = cur.#parent) {
      if (cur === candidate) return true;
    }
    return false;
  }

  // ── Traversal & search ───────────────────────────────────────────────────

  /** Depth-first, this object first, then children recursively. */
  traverse(fn: (obj: CoreObject) => void): void {
    fn(this);
    for (const child of this.#children) child.traverse(fn);
  }

  /** Depth-first, children before self — the order to use when tearing down. */
  traversePost(fn: (obj: CoreObject) => void): void {
    for (const child of this.#children) child.traversePost(fn);
    fn(this);
  }

  /**
   * First descendant matching `predicate` (depth-first). Does not test self.
   * Named `findDescendant`, not `find`, because subclasses own `find` for their
   * own contents — `ListModel.find` searches items, not the object tree.
   */
  findDescendant<T extends CoreObject = CoreObject>(
    predicate: (obj: CoreObject) => boolean
  ): T | null {
    for (const child of this.#children) {
      if (predicate(child)) return child as T;
      const found = child.findDescendant<T>(predicate);
      if (found) return found;
    }
    return null;
  }

  /** All descendants matching `predicate` (depth-first; all of them when omitted). */
  findChildren<T extends CoreObject = CoreObject>(predicate?: (obj: CoreObject) => boolean): T[] {
    const results: T[] = [];
    for (const child of this.#children) {
      if (!predicate || predicate(child)) results.push(child as T);
      results.push(...child.findChildren<T>(predicate));
    }
    return results;
  }

  /** First descendant with this `objectName`. */
  findChild<T extends CoreObject = CoreObject>(name: string): T | null {
    return this.findDescendant<T>((obj) => obj.objectName === name);
  }

  /**
   * First descendant with this `id`. Compares the raw field, so objects whose
   * id was never read stay id-less instead of being assigned one by the search.
   */
  findById<T extends CoreObject = CoreObject>(id: string): T | null {
    return this.findDescendant<T>((obj) => obj.#id === id);
  }

  // ── Connections ──────────────────────────────────────────────────────────

  /**
   * Connect a signal and track the connection on this object.
   * The connection is automatically severed when this object is destroyed.
   */
  connect<T extends unknown[]>(signal: Signal<T>, slot: Slot<T>): Connection {
    return signal.connect(slot, this);
  }

  /** @internal Used by Signal.connect(slot, context). */
  _trackConnection(conn: Connection): void {
    this.#trackedConnections.push(conn);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  get isDestroyed(): boolean {
    return this.#isDestroyed;
  }

  /**
   * Destroy this object and all its children (depth-first, children first).
   * Emits `destroyed`, disconnects all tracked connections, detaches from parent.
   */
  destroy(): void {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;

    // Destroy children first — copy the array to avoid mutation issues
    for (const child of [...this.#children]) {
      child.destroy();
    }
    this.#children = [];

    this.#destroyed?.emit(this);

    for (const conn of this.#trackedConnections) {
      conn.disconnect();
    }
    this.#trackedConnections = [];

    if (this.#parent) {
      this.#parent.#detach(this);
      this.#parent = null;
    }

    this.onDestroy();
  }

  /** Override in subclasses for custom cleanup. Called inside destroy(). */
  protected onDestroy(): void {
    // no-op by default
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  #attach(child: CoreObject): void {
    if (!this.#children.includes(child)) {
      this.#children.push(child);
    }
  }

  #detach(child: CoreObject): void {
    const idx = this.#children.indexOf(child);
    if (idx !== -1) this.#children.splice(idx, 1);
  }
}
