import type { Disposable } from '../utils/types';

// Using `any` so that interfaces (which lack an implicit index signature) satisfy the constraint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = Record<string, any>;

/**
 * Type-safe event emitter
 */
export class EventEmitter<T extends EventMap> implements Disposable {
  private readonly listeners = new Map<keyof T, Set<(data: unknown) => void>>();
  private isDisposed = false;

  /**
   * Subscribe to an event
   */
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): Disposable {
    if (this.isDisposed) {
      return { dispose: () => {} };
    }

    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(event, eventListeners);
    }
    eventListeners.add(listener as (data: unknown) => void);

    return {
      dispose: () => {
        eventListeners?.delete(listener as (data: unknown) => void);
      },
    };
  }

  /**
   * Subscribe to an event, but only fire once
   */
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): Disposable {
    const disposable = this.on(event, (data) => {
      disposable.dispose();
      listener(data);
    });
    return disposable;
  }

  /**
   * Emit an event to all listeners
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    if (this.isDisposed) {
      return;
    }

    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for "${String(event)}":`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Dispose of the emitter and all listeners
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.listeners.clear();
  }
}
