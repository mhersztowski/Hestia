import { randomUUID } from 'crypto';
import { PacketType } from '@hestia/core';

export interface PacketData {
  type: PacketType;
  id: string;
  timestamp: number;
  payload: unknown;
}

export abstract class Packet {
  public readonly type: PacketType;
  public readonly id: string;
  public readonly timestamp: number;

  constructor(type: PacketType, id?: string) {
    this.type = type;
    this.id = id || this.generateId();
    this.timestamp = Date.now();
  }

  private generateId(): string {
    return randomUUID();
  }

  abstract getPayload(): unknown;

  serialize(): string {
    const data: PacketData = {
      type: this.type,
      id: this.id,
      timestamp: this.timestamp,
      payload: this.getPayload(),
    };
    return JSON.stringify(data);
  }

  static deserialize(json: string): PacketData {
    const data = JSON.parse(json) as PacketData;
    Packet.validate(data);
    return data;
  }

  static validate(data: PacketData): void {
    if (!data.type || !Object.values(PacketType).includes(data.type)) {
      throw new Error(`Invalid packet type: ${data.type}`);
    }
    if (!data.id || typeof data.id !== 'string') {
      throw new Error('Invalid packet id');
    }
    if (!data.timestamp || typeof data.timestamp !== 'number') {
      throw new Error('Invalid packet timestamp');
    }
  }
}
