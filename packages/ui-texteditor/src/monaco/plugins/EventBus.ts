// ── Event Bus ─────────────────────────────────────────────────────────────────
// Global pub/sub used for communication between plugins and the editor shell.

type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);
    return () => {
      this.listeners.get(event)?.delete(handler as EventHandler);
    };
  }

  /** Publish an event to all subscribers. Errors in handlers are caught and logged. */
  emit<T>(event: string, payload: T): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Handler error for "${event}":`, err);
      }
    });
  }

  /** Subscribe once — handler is automatically removed after first call. */
  once<T>(event: string, handler: EventHandler<T>): () => void {
    const unsub = this.on<T>(event, (payload) => {
      handler(payload);
      unsub();
    });
    return unsub;
  }

  /** Remove all handlers for a specific event. */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/**
 * Singleton event bus shared across the entire editor shell.
 *
 * System events emitted by MonacoMultiEditor:
 *   system:editor:modelChanged   { uri: string }
 *   system:editor:cursorMoved    { lineNumber: number; column: number }
 *   system:editor:didSave        { uri: string }
 *   system:theme:changed         { theme: 'dark' | 'light' }
 *   plugin:registered            { pluginId: string }
 *   plugin:activated             { pluginId: string }
 *   plugin:deactivated           { pluginId: string }
 *   ui:toolbar:changed           undefined
 *   ui:statusbar:changed         undefined
 *   ui:sidebar:changed           undefined
 *   ui:contextmenu:changed       undefined
 *   ui:commandpalette:changed    undefined
 */
export const globalEventBus = new EventBus();
