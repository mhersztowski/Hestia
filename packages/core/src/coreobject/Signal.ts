import { Connection } from './Connection';

export type Slot<T extends unknown[]> = (...args: T) => void;

/** Internal interface — implemented by CoreObject to auto-track connections. */
export interface IConnectionOwner {
  /** @internal */ _trackConnection(conn: Connection): void;
}

/** How many consecutive errors a slot may throw before it is auto-disconnected. */
const CIRCUIT_BREAKER_THRESHOLD = 3;

/** Warn when a signal has more than this many connections (likely a leak). */
const MAX_LISTENERS_WARN = 20;

interface SlotEntry<T extends unknown[]> {
  slot: Slot<T>;
  errorCount: number;
}

/**
 * Type-safe Qt-style signal with production-grade resilience:
 *
 * - **Re-entrancy queue**: if `emit()` is called recursively (a slot triggers
 *   the same signal), the nested emission is queued and executed after the
 *   current one completes — matching Qt queued-connection semantics.
 * - **Circuit breaker**: a slot that throws `CIRCUIT_BREAKER_THRESHOLD` times
 *   in a row is automatically disconnected to prevent log flooding.
 * - **Max-listeners warning**: logs when connection count exceeds
 *   `MAX_LISTENERS_WARN` (mirrors Node.js EventEmitter behaviour).
 * - **Error isolation**: one bad slot never prevents the rest from running.
 *
 * Usage:
 *   readonly clicked = new Signal<[x: number, y: number]>();
 *   this.clicked.connect((x, y) => { ... });
 *   this.clicked.emit(10, 20);
 *
 * Pass an CoreObject as `context` to have the connection auto-disconnected
 * when the context is destroyed.
 */
export class Signal<T extends unknown[] = []> {
  readonly #entries = new Map<symbol, SlotEntry<T>>();
  #blocked = false;
  #emitting = false;
  #pendingEmits: T[] = [];

  connect(slot: Slot<T>, context?: IConnectionOwner): Connection {
    const key = Symbol();
    this.#entries.set(key, { slot, errorCount: 0 });

    if (this.#entries.size > MAX_LISTENERS_WARN) {
      console.warn(`[Signal] ${this.#entries.size} connections — possible listener leak`);
    }

    const conn = new Connection(() => this.#entries.delete(key));
    if (context) {
      context._trackConnection(conn);
    }
    return conn;
  }

  emit(...args: T): void {
    if (this.#blocked) return;

    // Re-entrancy guard: queue nested emissions, drain after outer loop finishes
    if (this.#emitting) {
      this.#pendingEmits.push(args);
      return;
    }

    this.#emitting = true;
    try {
      this.#dispatchSnapshot(args);

      // Drain any emissions queued by re-entrant slots
      while (this.#pendingEmits.length > 0) {
        const queued = this.#pendingEmits.shift()!;
        this.#dispatchSnapshot(queued);
      }
    } finally {
      this.#emitting = false;
    }
  }

  /**
   * Schedule emission on the microtask queue (after the current call stack
   * unwinds). Useful when you want to decouple a state change from its
   * downstream effects — equivalent to Qt's `QueuedConnection` across threads.
   */
  emitQueued(...args: T): void {
    queueMicrotask(() => this.emit(...args));
  }

  /** Temporarily suspend emission without removing connections. */
  blockSignals(blocked: boolean): void {
    this.#blocked = blocked;
  }

  get blocked(): boolean {
    return this.#blocked;
  }

  get connectionCount(): number {
    return this.#entries.size;
  }

  /** Remove every connected slot. */
  disconnectAll(): void {
    this.#entries.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #dispatchSnapshot(args: T): void {
    // Snapshot keys so that connect/disconnect inside a slot is safe
    const keys = [...this.#entries.keys()];
    for (const key of keys) {
      const entry = this.#entries.get(key);
      if (!entry) continue; // disconnected during this emit
      try {
        entry.slot(...args);
        // Reset circuit breaker on success
        if (entry.errorCount > 0) entry.errorCount = 0;
      } catch (err) {
        entry.errorCount += 1;
        if (entry.errorCount >= CIRCUIT_BREAKER_THRESHOLD) {
          this.#entries.delete(key);
          console.error(
            `[Signal] Slot disconnected after ${CIRCUIT_BREAKER_THRESHOLD} consecutive errors:`,
            err
          );
        } else {
          console.error(
            `[Signal] Slot error (${entry.errorCount}/${CIRCUIT_BREAKER_THRESHOLD}):`,
            err
          );
        }
      }
    }
  }
}
