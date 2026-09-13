import { TreeNode } from '../TreeNode';
import { Signal } from '../Signal';
import { QtProperty } from './QtProperty';
import { isQtSignal } from './types';
import type { QtObjectLike, QtConnectionLike } from './types';

export interface QtWrapOptions {
  /** Parent wrapper to attach this node under. */
  parent?: QtNode;
  /** Also wrap the native child tree as child `QtNode`s. Default: `false`. */
  recursive?: boolean;
  /** How child wrappers are constructed (the registry injects a typed factory). */
  wrapChild?: (native: QtObjectLike, parent: QtNode) => QtNode;
  /** Destroy the native object when this wrapper is destroyed. Default: `false`. */
  ownsNative?: boolean;
}

/**
 * Generic reflective wrapper turning any browser-Qt `QObject` into a minislib
 * {@link TreeNode}, bridging its meta-properties and signals.
 *
 *  - **Properties** — every declared `Q_PROPERTY` is available as a live
 *    {@link QtProperty} via `prop(name)`, plus `get(name)` / `set(name, v)`.
 *  - **Signals/slots** — every native signal is exposed as a minislib
 *    {@link Signal} via `signal(name)`, or connect directly with `on(name, fn)`.
 *  - **Tree** — optionally mirrors the native child tree as `QtNode` children.
 *  - **Lifecycle** — bridges are torn down on `destroy()`; a destroyed native
 *    object tears the wrapper down too.
 *
 * Typed subclasses (see `widgets.ts`) add convenience accessors on top.
 */
export class QtNode extends TreeNode {
  /** The wrapped native browser-Qt object. */
  readonly native: QtObjectLike;

  readonly #props = new Map<string, QtProperty>();
  readonly #signals = new Map<string, Signal<unknown[]>>();
  readonly #bridges = new Map<string, QtConnectionLike>();
  #destroyedConn: QtConnectionLike | null = null;
  readonly #ownsNative: boolean;

  /**
   * Native browser-Qt class name used to auto-create a native object when a
   * typed wrapper is constructed with no `native` argument (e.g. `new
   * QtButtonNode()` emitted by the visual graph). Subclasses set this; the
   * native class is resolved from `globalThis` (populated by `qt.module.js`).
   */
  static readonly qtClass?: string;

  constructor(native?: QtObjectLike, parent?: QtNode, opts: QtWrapOptions = {}) {
    // No native passed → auto-create one from globalThis using the subclass's
    // `qtClass` (so `new QtLineEditNode()` yields a real native QLineEdit).
    const resolved = native ?? QtNode.#autoNative((new.target as unknown as { qtClass?: string })?.qtClass);
    if (!resolved) {
      throw new Error(
        `${(new.target as { name?: string })?.name ?? 'QtNode'}: no native object provided and ` +
        `no browser-Qt class available (load qt.module.js, or pass a native object / use createQt).`,
      );
    }
    // Attach the parent *after* super() — TreeNode's tree signals aren't
    // initialised until its field initialisers run (post-super), so passing a
    // parent into CoreObject's ctor (which calls setParent) would NPE.
    super(undefined, resolved.objectName());
    this.native = resolved;
    this.#ownsNative = opts.ownsNative ?? native === undefined;

    const p = parent ?? opts.parent;
    if (p) this.setParent(p);

    // Native teardown → tear down the wrapper (guarded against recursion).
    if (isQtSignal(resolved.destroyed)) {
      this.#destroyedConn = resolved.destroyed.connect(() => {
        if (!this.isDestroyed) this.destroy();
      });
    }

    if (opts.recursive) {
      const wrapChild = opts.wrapChild ?? ((n, p) => new QtNode(n, p, opts));
      for (const child of resolved.children()) {
        wrapChild(child, this);
      }
    }
  }

  /** Native class name (e.g. `'QPushButton'`). */
  get className(): string {
    return this.native.className();
  }

  // ── Properties ─────────────────────────────────────────────────────────────

  /** Names of all readable/writable properties (declared + dynamic). */
  propertyNames(): string[] {
    return this.native.propertyNames();
  }

  /**
   * Live-bound {@link QtProperty} for a declared meta-property (cached).
   * Returns `null` if the object declares no such property.
   */
  prop<T = unknown>(name: string): QtProperty<T> | null {
    const cached = this.#props.get(name);
    if (cached) return cached as QtProperty<T>;
    const meta = this.native.metaProperties()[name];
    if (!meta) return null;
    const p = new QtProperty<T>(this.native, name, meta);
    this.#props.set(name, p as unknown as QtProperty);
    return p;
  }

  /** Read any property (declared getter or dynamic). */
  get<T = unknown>(name: string): T {
    return this.native.property(name) as T;
  }

  /** Write any property (declared setter fires its notify signal, or dynamic). */
  set(name: string, value: unknown): this {
    const p = this.prop(name);
    if (p) p.value = value;
    else this.native.setProperty(name, value);
    return this;
  }

  // ── Signals / slots ────────────────────────────────────────────────────────

  /** Names of declared signals (e.g. `['clicked', 'toggled', …]`). */
  signalNames(): string[] {
    return this.native.signalNames();
  }

  /**
   * minislib {@link Signal} bridged to the native signal `name` (cached).
   * Works for declared signals and built-ins (`destroyed`, `objectNameChanged`).
   */
  signal<T extends unknown[] = unknown[]>(name: string): Signal<T> {
    const cached = this.#signals.get(name);
    if (cached) return cached as unknown as Signal<T>;
    const sig = new Signal<unknown[]>();
    const nativeSig = this.native[name];
    if (isQtSignal(nativeSig)) {
      const conn = nativeSig.connect((...args: unknown[]) => sig.emit(...args));
      this.#bridges.set(name, conn);
    } else {
      console.warn(`[QtNode] no native signal '${name}' on ${this.className}`);
    }
    this.#signals.set(name, sig);
    return sig as unknown as Signal<T>;
  }

  /** Connect a slot to native signal `name`; auto-disconnected on destroy. */
  on<T extends unknown[] = unknown[]>(name: string, slot: (...args: T) => void): this {
    this.signal<T>(name).connect(slot, this);
    return this;
  }

  /** Emit a native signal by name (rarely needed — mostly for testing). */
  emitSignal(name: string, ...args: unknown[]): this {
    const nativeSig = this.native[name];
    if (isQtSignal(nativeSig)) nativeSig.emit(...args);
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  protected override onDestroy(): void {
    this.#destroyedConn?.disconnect();
    this.#destroyedConn = null;
    for (const c of this.#bridges.values()) c.disconnect();
    this.#bridges.clear();
    for (const p of this.#props.values()) p.dispose();
    this.#props.clear();
    for (const s of this.#signals.values()) s.disconnectAll();
    this.#signals.clear();
    if (this.#ownsNative && !this.native.isDestroyed()) this.native.destroy();
  }

  /** Instantiate a native browser-Qt object by class name from `globalThis`. */
  static #autoNative(className?: string): QtObjectLike | null {
    if (!className) return null;
    const Ctor = (globalThis as Record<string, unknown>)[className];
    return typeof Ctor === 'function' ? new (Ctor as new () => QtObjectLike)() : null;
  }
}
