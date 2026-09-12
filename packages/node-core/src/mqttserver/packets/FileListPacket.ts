import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileListPayload {
  path?: string;
}

export class FileListPacket extends Packet {
  public readonly path: string;

  constructor(path: string = '', id?: string) {
    super(PacketType.FILE_LIST, id);
    this.path = path;
  }

  getPayload(): FileListPayload {
    return { path: this.path };
  }

  static fromPayload(payload: FileListPayload, id?: string): FileListPacket {
    return new FileListPacket(payload.path || '', id);
  }
}
