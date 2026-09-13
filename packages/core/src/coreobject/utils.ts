import { CoreObject } from './CoreObject';
import { Signal } from './Signal';

/**
 * Returns a debounced version of `fn` that is auto-cleared when `context` is destroyed.
 *
 * Usage:
 *   const save = debounce(() => persist(), 300, this);
 *   input.changed.connect(save);
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number,
  context?: CoreObject,
): (...args: T) => void {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  if (context) {
    context.destroyed.connect(cancel, context);
  }

  return (...args: T): void => {
    cancel();
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, delayMs);
  };
}

/**
 * Returns a throttled version of `fn` (leading edge).
 * Auto-cleaned up when `context` is destroyed.
 */
export function throttle<T extends unknown[]>(
  fn: (...args: T) => void,
  intervalMs: number,
  context?: CoreObject,
): (...args: T) => void {
  let lastCall = 0;
  let active = true;

  if (context) {
    context.destroyed.connect(() => {
      active = false;
    }, context);
  }

  return (...args: T): void => {
    if (!active) return;
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Wraps a Promise in a signal pair: `resolved` and `rejected`.
 * Auto-cancels (suppresses signals) when `context` is destroyed.
 *
 * Usage:
 *   const { resolved, rejected } = promiseToSignals(fetch('/api/data'), this);
 *   resolved.connect((data) => setData(data));
 *   rejected.connect((err) => showError(err));
 */
export function promiseToSignals<T>(
  promise: Promise<T>,
  context?: CoreObject,
): {
  resolved: Signal<[value: T]>;
  rejected: Signal<[error: unknown]>;
} {
  const resolved = new Signal<[value: T]>();
  const rejected = new Signal<[error: unknown]>();
  let alive = true;

  if (context) {
    context.destroyed.connect(() => {
      alive = false;
    });
  }

  promise.then(
    (value) => { if (alive) resolved.emit(value); },
    (err)   => { if (alive) rejected.emit(err); },
  );

  return { resolved, rejected };
}

/**
 * One-shot connection: automatically disconnects after the first emission.
 *
 * Usage:
 *   connectOnce(button.clicked, () => doOnce());
 */
export function connectOnce<T extends unknown[]>(
  signal: Signal<T>,
  slot: (...args: T) => void,
  context?: CoreObject,
): void {
  let conn = signal.connect((...args) => {
    conn.disconnect();
    slot(...args);
  }, context);
}
