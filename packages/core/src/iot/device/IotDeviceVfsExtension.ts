import { mqttTopics } from '../../mqtt/topics';
import type { FileSystemProvider, WriteFileOptions, DeleteOptions, RenameOptions } from '../../vfs/types';
import { VfsError, VfsErrorCode } from '../../vfs/errors';
import type { IotDeviceExtension } from './IotDeviceExtension';

export interface IotDeviceVfsExtensionOptions {
  /** FileSystemProvider that backs the VFS exposed to the server */
  provider: FileSystemProvider;
  /** Function to publish MQTT messages (device → server direction) */
  publishFn: (topic: string, payload: string) => void;
  /** Full MQTT topic for sending responses, e.g. minis/user/device/ext/vfs/res */
  resTopic: string;
}

/**
 * Device-side VFS extension.
 *
 * Listens for VFS operation requests from the server (via `handleRequest`),
 * delegates them to a `FileSystemProvider`, and publishes the result back.
 *
 * Supported operations:
 *   stat      path → FileStat
 *   readdir   path → { entries: DirectoryEntry[] }
 *   readfile  path → { data: base64 }
 *   writefile path + data (base64) + options → {}
 *   delete    path + options → {}
 *   rename    path (old) + newPath + options → {}
 *   mkdir     path → {}
 */
export class IotDeviceVfsExtension implements IotDeviceExtension {
  readonly type = 'vfs';

  private readonly provider: FileSystemProvider;
  private readonly publishFn: (topic: string, payload: string) => void;
  private readonly resTopic: string;

  constructor(options: IotDeviceVfsExtensionOptions) {
    this.provider = options.provider;
    this.publishFn = options.publishFn;
    this.resTopic = options.resTopic;
  }

  async handleRequest(payload: unknown): Promise<void> {
    const result = mqttTopics.extReq.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn('[IotDeviceVfsExtension] Invalid request payload:', result.error.issues);
      return;
    }

    const { id, op, path, newPath, data, options } = result.data;

    try {
      const responseData = await this.dispatch(op, path, newPath, data, options);
      this.respond(id, true, responseData);
    } catch (err) {
      const vfsErr = err instanceof VfsError ? err : null;
      this.respond(id, false, undefined, {
        code: vfsErr?.code ?? VfsErrorCode.Unknown,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --- Private ---

  private async dispatch(
    op: string,
    path: string | undefined,
    newPath: string | undefined,
    data: string | undefined,
    options: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    switch (op) {
      case 'stat':
        return this.provider.stat(requirePath(op, path));

      case 'readdir': {
        const entries = await this.provider.readDirectory(requirePath(op, path));
        return { entries };
      }

      case 'readfile': {
        const content = await this.provider.readFile(requirePath(op, path));
        return { data: uint8ArrayToBase64(content) };
      }

      case 'writefile': {
        if (!this.provider.writeFile) throw VfsError.noPermissions(path);
        const content = base64ToUint8Array(data ?? '');
        await this.provider.writeFile(requirePath(op, path), content, options as WriteFileOptions);
        return {};
      }

      case 'delete': {
        if (!this.provider.delete) throw VfsError.noPermissions(path);
        await this.provider.delete(requirePath(op, path), options as DeleteOptions);
        return {};
      }

      case 'rename': {
        if (!this.provider.rename) throw VfsError.noPermissions(path);
        if (!newPath) throw new VfsError(VfsErrorCode.Unknown, 'rename requires newPath');
        await this.provider.rename(requirePath(op, path), newPath, options as RenameOptions);
        return {};
      }

      case 'mkdir': {
        if (!this.provider.mkdir) throw VfsError.noPermissions(path);
        await this.provider.mkdir(requirePath(op, path));
        return {};
      }

      default:
        throw new VfsError(VfsErrorCode.Unknown, `Unknown VFS operation: ${op}`);
    }
  }

  private respond(
    id: string,
    ok: boolean,
    data?: unknown,
    error?: { code: string; message?: string },
  ): void {
    const payload: Record<string, unknown> = { id, ok };
    if (data !== undefined) payload['data'] = data;
    if (error !== undefined) payload['error'] = error;
    this.publishFn(this.resTopic, JSON.stringify(payload));
  }
}

// --- Helpers ---

function requirePath(op: string, path: string | undefined): string {
  if (!path) throw new VfsError(VfsErrorCode.Unknown, `Operation '${op}' requires 'path'`);
  return path;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}
