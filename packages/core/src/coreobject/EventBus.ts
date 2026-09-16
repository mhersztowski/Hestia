import { CoreObject } from './CoreObject';
import { Signal, type IConnectionOwner } from './Signal';
import { Connection } from './Connection';

type AnySlot = (...args: unknown[]) => void;

/**
 * Decoupled publish/subscribe event bus.
 *
 * Unlike Signals (which are owned by an object and require a direct reference
 * to the emitter), EventBus allows truly anonymous communication between
 * components that don't know about each other.
 *
 * Usage:
 *   const bus = EventBus.global();
 *
 *   bus.subscribe<{ x: number }>('mouse:moved', (e) => console.log(e.x));
 *   bus.publish('mouse:moved', { x: 42 });
 *
 * Topic namespacing convention:  'domain:event'  e.g. 'iot:telemetry'
 */
export class EventBus extends CoreObject {
  readonly #channels = new Map<string, Signal<[payload: unknown]>>();
  #wildcardSignal: Signal<[topic: string, payload: unknown]>;

  constructor(parent?: CoreObject) {
    super(parent, 'EventBus');
    this.#wildcardSignal = new Signal();
  }

  /** Publish a payload to all subscribers of `topic`. */
  publish<T = unknown>(topic: string, payload: T): void {
    this.#channels.get(topic)?.emit(payload as unknown);
    this.#wildcardSignal.emit(topic, payload as unknown);
  }

  /**
   * Subscribe to a specific topic.
   * Optionally pass an CoreObject as `context` for auto-unsubscribe on destroy.
   */
  subscribe<T = unknown>(
    topic: string,
    slot: (payload: T) => void,
    context?: IConnectionOwner
  ): Connection {
    if (!this.#channels.has(topic)) {
      this.#channels.set(topic, new Signal());
    }
    return this.#channels.get(topic)!.connect(slot as AnySlot, context);
  }

  /**
   * Subscribe to ALL topics.
   * Useful for logging / middleware.
   */
  subscribeAll(
    slot: (topic: string, payload: unknown) => void,
    context?: IConnectionOwner
  ): Connection {
    return this.#wildcardSignal.connect(slot, context);
  }

  /** Remove all subscribers for a topic. */
  clearTopic(topic: string): void {
    this.#channels.get(topic)?.disconnectAll();
    this.#channels.delete(topic);
  }

  /** Remove all subscribers for all topics. */
  clearAll(): void {
    for (const sig of this.#channels.values()) sig.disconnectAll();
    this.#channels.clear();
    this.#wildcardSignal.disconnectAll();
  }

  /** Returns the set of all topics that have at least one subscriber. */
  get activeTopics(): string[] {
    return [...this.#channels.keys()].filter(
      (t) => (this.#channels.get(t)?.connectionCount ?? 0) > 0
    );
  }

  // ── Singleton ────────────────────────────────────────────────────────────

  static #global: EventBus | null = null;

  /** Process-wide singleton bus. Use for cross-module events. */
  static global(): EventBus {
    if (!EventBus.#global) {
      EventBus.#global = new EventBus();
    }
    return EventBus.#global;
  }

  /** Reset the global bus (useful in tests). */
  static resetGlobal(): void {
    EventBus.#global?.clearAll();
    EventBus.#global = null;
  }

  protected override onDestroy(): void {
    this.clearAll();
  }
}
