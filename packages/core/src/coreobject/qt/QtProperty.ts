import { Signal } from '../Signal';
import { isQtSignal } from './types';
import type { QtObjectLike, QtPropertyMeta, QtConnectionLike } from './types';

/**
 * Live-bound view over a browser-Qt `Q_PROPERTY`.
 *
 * Unlike {@link Property} (which owns its value), a `QtProperty` is a *thin
 * binding*: the source of truth is always the native object.
 *  - `get value()` reads through `native.property(name)`.
 *  - `set value(v)` writes through `native.setProperty(name, v)`.
 *  - `changed(newValue, oldValue)` fires when the property's `notify` signal
 *    emits (or, for properties without a notify, right after a local write).
 *
 * The public surface mirrors {@link Property} (`.value`, `.changed`,
 * `.setSilent`) so it drops into existing minislib code.
 */
export class QtProperty<T = unknown> {
  readonly changed = new Signal<[newValue: T, oldValue: T]>();
  readonly name: string;
  readonly writable: boolean;
  readonly type?: string;

  #native: QtObjectLike;
  #last: T;
  #notifyConn: QtConnectionLike | null = null;
  #muted = false;

  constructor(native: QtObjectLike, name: string, meta: QtPropertyMeta) {
    this.#native = native;
    this.name = name;
    this.writable = typeof meta.set === 'function';
    this.type = meta.type;
    this.#last = native.property(name) as T;

    // Bridge the declared notify signal → `changed`.
    if (meta.notify) {
      const sig = native[meta.notify];
      if (isQtSignal(sig)) {
        this.#notifyConn = sig.connect(() => this.#syncFromNative());
      }
    }
  }

  /** Current value, read straight from the native object. */
  get value(): T {
    return this.#native.property(this.name) as T;
  }

  /** Write through to the native object (no-op + warn if read-only). */
  set value(next: T) {
    if (!this.writable) {
      console.warn(`[QtProperty] '${this.name}' is read-only`);
      return;
    }
    const old = this.value;
    if (Object.is(old, next)) return;
    this.#native.setProperty(this.name, next);
    // No notify signal → emit `changed` ourselves so consumers still react.
    if (!this.#notifyConn) {
      this.#last = next;
      this.changed.emit(next, old);
    }
  }

  /** Set the native value without emitting `changed`. */
  setSilent(next: T): void {
    if (!this.writable) return;
    this.#muted = true;
    try {
      this.#native.setProperty(this.name, next);
    } finally {
      this.#muted = false;
    }
    this.#last = next;
  }

  /** Mirror another property (or Property) into this one, both initial + updates. */
  bindTo(source: { value: T; changed: Signal<[T, T]> }): void {
    if (!this.writable) return;
    this.value = source.value;
    source.changed.connect((v: T) => {
      this.value = v;
    });
  }

  /** Detach the notify bridge and drop all listeners. */
  dispose(): void {
    this.#notifyConn?.disconnect();
    this.#notifyConn = null;
    this.changed.disconnectAll();
  }

  toString(): string {
    return String(this.value);
  }

  #syncFromNative(): void {
    if (this.#muted) return;
    const nv = this.value;
    const old = this.#last;
    if (Object.is(nv, old)) return;
    this.#last = nv;
    this.changed.emit(nv, old);
  }
}
