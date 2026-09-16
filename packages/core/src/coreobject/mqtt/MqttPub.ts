import { Signal } from '../Signal';
import { CoreObject } from '../CoreObject';
import { MqttConn } from './MqttConn';

/**
 * MQTT publisher node.
 *
 * Attach as a child (direct or indirect) of an `MqttConn` node.
 * Call `publish(payload)` to send a message — the payload is
 * JSON-stringified automatically when an object is passed.
 *
 * Usage:
 *   const pub = new MqttPub('home/lights/living', conn);
 *   pub.publish({ brightness: 80 });
 *   pub.publish('raw string');
 */
export class MqttPub extends CoreObject {
  /** Emitted after each successful publish. */
  readonly published = new Signal<[topic: string]>();
  /** Emitted when publish fails (no connection, not connected, etc.). */
  readonly error = new Signal<[err: Error]>();

  #topic: string;
  #qos: 0 | 1 | 2;
  #retain: boolean;

  constructor(topic: string, parent?: CoreObject, opts?: { qos?: 0 | 1 | 2; retain?: boolean }) {
    super(parent, 'MqttPub');
    this.#topic = topic;
    this.#qos = opts?.qos ?? 0;
    this.#retain = opts?.retain ?? false;
  }

  get topic(): string {
    return this.#topic;
  }
  set topic(v: string) {
    this.#topic = v;
  }

  get qos(): 0 | 1 | 2 {
    return this.#qos;
  }
  set qos(v: 0 | 1 | 2) {
    this.#qos = v;
  }

  get retain(): boolean {
    return this.#retain;
  }
  set retain(v: boolean) {
    this.#retain = v;
  }

  /**
   * Publish `payload` to the configured topic.
   * Objects are serialized as JSON automatically.
   * Emits `error` (not throws) when the connection is unavailable.
   */
  publish(payload: string | object): void {
    const conn = this.#conn;
    if (!conn) {
      this.error.emit(new Error('MqttPub: no MqttConn ancestor found'));
      return;
    }
    if (!conn.isConnected) {
      this.error.emit(new Error('MqttPub: not connected'));
      return;
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    try {
      conn.publish(this.#topic, body, { qos: this.#qos, retain: this.#retain });
      this.published.emit(this.#topic);
    } catch (err) {
      this.error.emit(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  get #conn(): MqttConn | null {
    for (const anc of this.ancestors()) {
      if (anc instanceof MqttConn) return anc;
    }
    return null;
  }
}
