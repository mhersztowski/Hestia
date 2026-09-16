import { Signal } from '../Signal';
import { CoreObject } from '../CoreObject';
import { MqttConn } from './MqttConn';

/**
 * MQTT subscription node.
 *
 * Attach as a child (direct or indirect) of an `MqttConn` node.
 * Automatically subscribes when the connection is ready and
 * re-subscribes after reconnects. Emits `messageReceived` for
 * every incoming message matching the topic pattern (supports
 * `+` single-level and `#` multi-level wildcards).
 *
 * Usage:
 *   const sub = new MqttSub('sensors/+/temp', conn);
 *   sub.messageReceived.connect((topic, payload) => {
 *     console.log(topic, JSON.parse(payload));
 *   });
 */
export class MqttSub extends CoreObject {
  /** Emitted for each matching incoming message. */
  readonly messageReceived = new Signal<[topic: string, payload: string]>();

  #topic: string;
  #qos: 0 | 1 | 2;
  #subscribed = false;

  constructor(topic: string, parent?: CoreObject, qos: 0 | 1 | 2 = 0) {
    super(parent, 'MqttSub');
    this.#topic = topic;
    this.#qos = qos;
    this.#bind();
  }

  get topic(): string {
    return this.#topic;
  }
  set topic(v: string) {
    const conn = this.#conn;
    if (this.#subscribed && conn) conn.unsubscribe(this.#topic);
    this.#topic = v;
    if (conn?.isConnected) this.#doSubscribe(conn);
  }

  get qos(): 0 | 1 | 2 {
    return this.#qos;
  }
  set qos(v: 0 | 1 | 2) {
    this.#qos = v;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  get #conn(): MqttConn | null {
    for (const anc of this.ancestors()) {
      if (anc instanceof MqttConn) return anc;
    }
    return null;
  }

  #bind(): void {
    const conn = this.#conn;
    if (!conn) return;

    this.connect(conn.connected, () => this.#doSubscribe(conn));
    this.connect(conn.disconnected, (_reason: string) => {
      this.#subscribed = false;
    });
    this.connect(conn.messageArrived, (topic: string, payload: string) => {
      if (this.#matchTopic(topic)) this.messageReceived.emit(topic, payload);
    });

    if (conn.isConnected) this.#doSubscribe(conn);
  }

  #doSubscribe(conn: MqttConn): void {
    conn.subscribe(this.#topic, this.#qos);
    this.#subscribed = true;
  }

  /** MQTT wildcard matching: `+` = single level, `#` = multi-level suffix. */
  #matchTopic(incoming: string): boolean {
    if (this.#topic === incoming) return true;
    const segments = this.#topic.split('/');
    const re =
      '^' +
      segments
        .map((seg) => {
          if (seg === '#') return '.*';
          if (seg === '+') return '[^/]+';
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$';
    return new RegExp(re).test(incoming);
  }

  protected override onDestroy(): void {
    const conn = this.#conn;
    if (this.#subscribed && conn) {
      conn.unsubscribe(this.#topic);
      this.#subscribed = false;
    }
  }
}
