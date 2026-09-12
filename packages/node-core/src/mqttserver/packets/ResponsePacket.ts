import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface ResponsePayload {
  requestId: string;
  data: unknown;
}

export class ResponsePacket extends Packet {
  public readonly requestId: string;
  public readonly data: unknown;

  constructor(requestId: string, data: unknown, id?: string) {
    super(PacketType.RESPONSE, id);
    this.requestId = requestId;
    this.data = data;
  }

  getPayload(): ResponsePayload {
    return { requestId: this.requestId, data: this.data };
  }
}
