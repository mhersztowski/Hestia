import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileWriteBinaryPayload {
  path: string;
  data: string; // Base64 encoded
  mimeType: string;
}

export class FileWriteBinaryPacket extends Packet {
  public readonly path: string;
  public readonly data: string;
  public readonly mimeType: string;

  constructor(path: string, data: string, mimeType: string, id?: string) {
    super(PacketType.FILE_WRITE_BINARY, id);
    this.path = path;
    this.data = data;
    this.mimeType = mimeType;
  }

  getPayload(): FileWriteBinaryPayload {
    return { path: this.path, data: this.data, mimeType: this.mimeType };
  }

  static fromPayload(payload: FileWriteBinaryPayload, id?: string): FileWriteBinaryPacket {
    if (!payload.path || typeof payload.path !== 'string') {
      throw new Error('Invalid FileWriteBinaryPacket payload: path is required');
    }
    if (!payload.data || typeof payload.data !== 'string') {
      throw new Error('Invalid FileWriteBinaryPacket payload: data is required');
    }
    if (!payload.mimeType || typeof payload.mimeType !== 'string') {
      throw new Error('Invalid FileWriteBinaryPacket payload: mimeType is required');
    }
    return new FileWriteBinaryPacket(payload.path, payload.data, payload.mimeType, id);
  }
}
