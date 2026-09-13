/**
 * Structural (duck-typed) views of the vanilla-JS browser-Qt objects from
 * `packages/core/browser/qt` (`qobject.module.js` / `qt.module.js`).
 *
 * That library exports nothing — its classes live on `globalThis` and are meant
 * for eval/AsyncFunction/Lit contexts. So here we describe only the *shape* we
 * consume; the wrappers reference native instances at runtime, never import them.
 *
 * The native `QObject` ships a meta-object system:
 *  - `metaProperties()` — `{ name: { get, set?, notify?, type? } }`
 *  - `metaSignals()`    — `{ name: { params: string[] } }`
 *  - `property(k)` / `setProperty(k, v)` — reflective access (fires `notify`)
 *  - signal instances live as fields on the object (`o.clicked`, `o.valueChanged`)
 * which is exactly what the wrappers bridge into minislib Signals/properties.
 */

/** A browser-Qt `Signal` (see `qobject.module.js`). */
export interface QtSignalLike {
  connect(slot: (...args: any[]) => void, context?: unknown): QtConnectionLike;
  disconnect(slotOrConnection?: unknown, context?: unknown): boolean;
  emit(...args: any[]): boolean;
  name(): string;
  isBlocked?(): boolean;
}

/** Handle returned by `Signal.connect` — call `.disconnect()` to sever it. */
export interface QtConnectionLike {
  disconnect(): void;
}

/** Declared Q_PROPERTY descriptor (`static properties = { … }`). */
export interface QtPropertyMeta {
  get: (o: any) => unknown;
  set?: (o: any, v: unknown) => void;
  /** Name of the signal emitted when the value changes, if any. */
  notify?: string;
  /** Qt type hint: 'string' | 'number' | 'bool' | 'QRect' | 'color' | … */
  type?: string;
}

/** Declared signal descriptor (`static signals = { name: { params } }`). */
export interface QtSignalMeta {
  params: string[];
}

/** A browser-Qt `QObject` (or any subclass: widgets, layouts, actions…). */
export interface QtObjectLike {
  objectName(): string;
  setObjectName(name: string): unknown;
  className(): string;
  inherits(className: string): boolean;
  isDestroyed(): boolean;

  property(key: string): unknown;
  setProperty(key: string, value: unknown): unknown;
  metaProperties(): Record<string, QtPropertyMeta>;
  metaSignals(): Record<string, QtSignalMeta>;
  propertyNames(): string[];
  signalNames(): string[];

  parent(): QtObjectLike | null;
  children(): QtObjectLike[];
  destroy(): unknown;

  readonly destroyed: QtSignalLike;
  readonly objectNameChanged?: QtSignalLike;

  /** Signal fields (`clicked`, `valueChanged`, …) reachable by name. */
  [key: string]: any;
}

/** True if `x` quacks like a browser-Qt Signal. */
export function isQtSignal(x: unknown): x is QtSignalLike {
  return (
    !!x &&
    typeof (x as { connect?: unknown }).connect === 'function' &&
    typeof (x as { emit?: unknown }).emit === 'function'
  );
}
