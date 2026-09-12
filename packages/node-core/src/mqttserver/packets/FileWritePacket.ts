import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface FileWritePayload {
  path: string;
  content: string;
}

export class FileWritePacket extends Packet {
  public readonly path: string;
  public readonly content: string;

  constructor(path: string, content: string, id?: string) {
    super(PacketType.FILE_WRITE, id);
    this.path = path;
    this.content = content;
  }

  getPayload(): FileWritePayload {
    return { path: this.path, content: this.content };
  }

  static fromPayload(payload: FileWritePayload, id?: string): FileWritePacket {
    if (!payload.path || typeof payload.path !== 'string') {
      throw new Error('Invalid FileWritePacket payload: path is required');
    }
    if (typeof payload.content !== 'string') {
      throw new Error('Invalid FileWritePacket payload: content is required');
    }
    return new FileWritePacket(payload.path, payload.content, id);
  }
}
