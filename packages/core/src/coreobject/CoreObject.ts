import { Connection } from './Connection';
import { Signal, type IConnectionOwner, type Slot } from './Signal';

/**
 * Base class for all minislib objects — equivalent to Qt's QObject.
 *
 * Features:
 *  - Parent/child object tree with automatic cascade destroy
 *  - Tracked connections: auto-disconnected when this object is destroyed
 *  - objectName for introspection / findChild
 *  - destroyed signal emitted just before teardown
 */
export class CoreObject implements IConnectionOwner {
  #parent: CoreObject | null = null;
  #children: CoreObject[] = [];
  #trackedConnections: Connection[] = [];
  #destroyed = false;

  objectName: string;

  /** Emitted once, immediately before the object is torn down. */
  readonly destroyed = new Signal<[obj: CoreObject]>();

  constructor(parent?: CoreObject, objectName = '') {
    this.objectName = objectName;
    if (parent) {
      this.setParent(parent);
    }
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
    if (this.#parent) {
      this.#parent.#removeChild(this);
    }
    this.#parent = parent;
    if (parent) {
      parent.#addChild(this);
    }
  }

  /** Returns the root ancestor of this object. */
  get root(): CoreObject {
    let node: CoreObject = this;
    while (node.#parent) node = node.#parent;
    return node;
  }

  /** Depth-first search by name. */
  findChild<T extends CoreObject = CoreObject>(name: string): T | null {
    for (const child of this.#children) {
      if (child.objectName === name) return child as T;
      const found = child.findChild<T>(name);
      if (found) return found;
    }
    return null;
  }

  /** Returns all descendants matching the predicate (depth-first). */
  findChildren<T extends CoreObject = CoreObject>(
    predicate?: (obj: CoreObject) => boolean,
  ): T[] {
    const results: T[] = [];
    for (const child of this.#children) {
      if (!predicate || predicate(child)) results.push(child as T);
      results.push(...child.findChildren<T>(predicate));
    }
    return results;
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
    return this.#destroyed;
  }

  /**
   * Destroy this object and all its children (depth-first, children first).
   * Emits `destroyed`, disconnects all tracked connections, detaches from parent.
   */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;

    // Destroy children first — copy array to avoid mutation issues
    for (const child of [...this.#children]) {
      child.destroy();
    }
    this.#children = [];

    this.destroyed.emit(this);

    for (const conn of this.#trackedConnections) {
      conn.disconnect();
    }
    this.#trackedConnections = [];

    if (this.#parent) {
      this.#parent.#removeChild(this);
      this.#parent = null;
    }

    this.onDestroy();
  }

  /** Override in subclasses for custom cleanup. Called inside destroy(). */
  protected onDestroy(): void {
    // no-op by default
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  #addChild(child: CoreObject): void {
    if (!this.#children.includes(child)) {
      this.#children.push(child);
    }
  }

  #removeChild(child: CoreObject): void {
    const idx = this.#children.indexOf(child);
    if (idx !== -1) this.#children.splice(idx, 1);
  }
}
