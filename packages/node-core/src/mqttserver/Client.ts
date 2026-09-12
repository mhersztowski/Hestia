import { Client as AedesClient } from 'aedes';

export class Client {
  public readonly id: string;
  public readonly connectedAt: Date;
  private aedesClient: AedesClient;

  constructor(aedesClient: AedesClient) {
    this.aedesClient = aedesClient;
    this.id = aedesClient.id;
    this.connectedAt = new Date();
  }

  get isConnected(): boolean {
    return this.aedesClient.connected;
  }

  publish(topic: string, message: string): void {
    this.aedesClient.publish(
      {
        cmd: 'publish',
        qos: 1,
        topic,
        payload: Buffer.from(message),
        dup: false,
        retain: false,
      },
      (err) => {
        if (err) {
          console.error(`Error publishing to client ${this.id}:`, err);
        }
      }
    );
  }

  close(): void {
    this.aedesClient.close();
  }
}
