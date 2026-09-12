import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileDeletePayload {
  path: string;
}

export class FileDeletePacket extends Packet {
  public readonly path: string;

  constructor(path: string, id?: string) {
    super(PacketType.FILE_DELETE, id);
    this.path = path;
  }

  getPayload(): FileDeletePayload {
    return { path: this.path };
  }

  static fromPayload(payload: FileDeletePayload, id?: string): FileDeletePacket {
    if (!payload.path || typeof payload.path !== 'string') {
      throw new Error('Invalid FileDeletePacket payload: path is required');
    }
    return new FileDeletePacket(payload.path, id);
  }
}
