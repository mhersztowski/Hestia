import type { Disposable } from './types';

/**
 * A store for managing multiple disposables
 */
export class DisposableStore implements Disposable {
  private readonly disposables = new Set<Disposable>();
  private isDisposed = false;

  /**
   * Adds a disposable to the store
   */
  add<T extends Disposable>(disposable: T): T {
    if (this.isDisposed) {
      disposable.dispose();
      return disposable;
    }
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Removes a disposable from the store without disposing it
   */
  delete(disposable: Disposable): boolean {
    return this.disposables.delete(disposable);
  }

  /**
   * Disposes all stored disposables and clears the store
   */
  clear(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.clear();
  }

  /**
   * Disposes all stored disposables and marks the store as disposed
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.clear();
  }

  /**
   * Returns whether the store has been disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Returns the number of disposables in the store
   */
  get size(): number {
    return this.disposables.size;
  }
}

/**
 * Creates a disposable from a cleanup function
 */
export function toDisposable(cleanup: () => void): Disposable {
  let disposed = false;
  return {
    dispose(): void {
      if (!disposed) {
        disposed = true;
        cleanup();
      }
    },
  };
}

/**
 * Creates a disposable that tracks whether it has been disposed
 */
export class MutableDisposable<T extends Disposable> implements Disposable {
  private current: T | undefined;
  private isDisposed = false;

  get value(): T | undefined {
    return this.current;
  }

  set value(value: T | undefined) {
    if (this.isDisposed) {
      value?.dispose();
      return;
    }
    this.current?.dispose();
    this.current = value;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.current?.dispose();
    this.current = undefined;
  }
}
