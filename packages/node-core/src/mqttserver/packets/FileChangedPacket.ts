import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileChangedPayload {
  path: string;
  action: 'write' | 'delete';
}

export class FileChangedPacket extends Packet {
  public readonly path: string;
  public readonly action: 'write' | 'delete';

  constructor(path: string, action: 'write' | 'delete', id?: string) {
    super(PacketType.FILE_CHANGED, id);
    this.path = path;
    this.action = action;
  }

  getPayload(): FileChangedPayload {
    return { path: this.path, action: this.action };
  }

  static fromPayload(payload: FileChangedPayload, id?: string): FileChangedPacket {
    return new FileChangedPacket(payload.path, payload.action, id);
  }
}
