import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface ErrorPayload {
  requestId: string;
  message: string;
  code?: string;
}

export class ErrorPacket extends Packet {
  public readonly requestId: string;
  public readonly message: string;
  public readonly code?: string;

  constructor(requestId: string, message: string, code?: string, id?: string) {
    super(PacketType.ERROR, id);
    this.requestId = requestId;
    this.message = message;
    this.code = code;
  }

  getPayload(): ErrorPayload {
    return { requestId: this.requestId, message: this.message, code: this.code };
  }
}
