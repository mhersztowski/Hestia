/**
 * Device-side extension interface.
 *
 * An IoT device implementing this interface can expose additional protocol
 * functionality via MQTT sub-topics under its device topic prefix:
 *
 *   minis/{user}/{device}/ext/{type}/req  — server→device (request arrives here)
 *   minis/{user}/{device}/ext/{type}/res  — device→server (response published here)
 *
 * Usage in a device application:
 *   const client = new IotDeviceClient({ topicPrefix, publishFn });
 *   client.addExtension(new IotDeviceVfsExtension(myFsProvider, publishFn, resTopic));
 *   // on incoming MQTT message for this device:
 *   client.handleMessage(subTopic, rawPayload);
 */
export interface IotDeviceExtension {
  /** Matches the extType segment in the MQTT topic, e.g. 'vfs' */
  readonly type: string;

  /**
   * Called when an MQTT request message arrives from the server
   * on `.../ext/{type}/req`.
   * Implementations should parse the payload, execute the operation
   * and publish a response on the corresponding `res` topic.
   *
   * @param payload Parsed JSON payload from the incoming MQTT message
   */
  handleRequest(payload: unknown): void | Promise<void>;
}
