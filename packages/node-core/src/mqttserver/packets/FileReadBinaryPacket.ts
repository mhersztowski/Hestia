import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileReadBinaryPayload {
  path: string;
}

export class FileReadBinaryPacket extends Packet {
  public readonly path: string;

  constructor(path: string, id?: string) {
    super(PacketType.FILE_READ_BINARY, id);
    this.path = path;
  }

  getPayload(): FileReadBinaryPayload {
    return { path: this.path };
  }

  static fromPayload(payload: FileReadBinaryPayload, id?: string): FileReadBinaryPacket {
    if (!payload.path || typeof payload.path !== 'string') {
      throw new Error('Invalid FileReadBinaryPacket payload: path is required');
    }
    return new FileReadBinaryPacket(payload.path, id);
  }
}
