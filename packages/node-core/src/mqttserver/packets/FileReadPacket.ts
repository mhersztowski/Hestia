import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileReadPayload {
  path: string;
}

export class FileReadPacket extends Packet {
  public readonly path: string;

  constructor(path: string, id?: string) {
    super(PacketType.FILE_READ, id);
    this.path = path;
  }

  getPayload(): FileReadPayload {
    return { path: this.path };
  }

  static fromPayload(payload: FileReadPayload, id?: string): FileReadPacket {
    if (!payload.path || typeof payload.path !== 'string') {
      throw new Error('Invalid FileReadPacket payload: path is required');
    }
    return new FileReadPacket(payload.path, id);
  }
}
