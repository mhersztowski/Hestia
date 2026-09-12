import { PacketType } from './PacketType';

export interface PacketData {
  type: PacketType;
  id: string;
  timestamp: number;
  payload: unknown;
}

export interface FileData {
  path: string;
  content: string;
  lastModified: string;
}

export interface BinaryFileData {
  path: string;
  data: string; // Base64 encoded
  mimeType: string;
  size: number;
  lastModified: string;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
}

export interface ResponsePayload {
  requestId: string;
  data: unknown;
}

export interface ErrorPayload {
  requestId: string;
  message: string;
  code?: string;
}

export interface FileChangedPayload {
  path: string;
  action: 'write' | 'delete';
}
