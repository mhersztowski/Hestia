import type {
  FileSystemProvider,
  FileSystemCapabilities,
  FileStat,
  DirectoryEntry,
  FileChangeEvent,
  WriteFileOptions,
  DeleteOptions,
  RenameOptions,
  VfsEvent,
} from './types';
import { FileChangeType } from './types';
import { VfsError, VfsErrorCode } from './errors';
import { VfsEventEmitter } from './EventEmitter';

export interface MqttFSOptions {
  /** Function to publish an MQTT message (server → device direction) */
  publishFn: (topic: string, payload: string) => void;
  /** Full MQTT topic for sending requests to the device, e.g. minis/user/device/ext/vfs/req */
  reqTopic: string;
  /** Milliseconds to wait for a device response before rejecting (default: 10 000) */
  timeoutMs?: number;
}

export interface MqttFSResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message?: string };
}

/**
 * VFS provider that tunnels all operations over MQTT to a device.
 *
 * Flow:
 *   1. Each VFS call sends a JSON request to `reqTopic` with a unique correlation `id`.
 *   2. The device performs the operation and publishes a response to its `ext/vfs/res` topic.
 *   3. The VfsExtension backend handler calls `handleResponse()` which resolves / rejects
 *      the pending Promise.
 *
 * Scheme: 'mqtt'
 */
export class MqttFS implements FileSystemProvider {
  readonly scheme = 'mqtt';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: false };

  private readonly emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  private readonly timeoutMs: number;
  private readonly pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly options: MqttFSOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  // --- Response ingestion (called by VfsExtension) ---

  handleResponse(response: MqttFSResponse): void {
    const entry = this.pending.get(response.id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(response.id);

    if (response.ok) {
      entry.resolve(response.data);
    } else {
      const err = response.error;
      entry.reject(
        new VfsError(
          (err?.code as VfsErrorCode) ?? VfsErrorCode.Unknown,
          err?.message,
        ),
      );
    }
  }

  // --- FileSystemProvider ---

  async stat(path: string): Promise<FileStat> {
    return await this.request('stat', path) as FileStat;
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    const data = await this.request('readdir', path) as { entries: DirectoryEntry[] };
    return data.entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = await this.request('readfile', path) as { data: string };
    return base64ToUint8Array(data.data);
  }

  async writeFile(path: string, content: Uint8Array, options?: WriteFileOptions): Promise<void> {
    await this.request('writefile', path, { data: uint8ArrayToBase64(content), options });
    this.emitter.fire([{ type: FileChangeType.Changed, path }]);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    await this.request('delete', path, { options });
    this.emitter.fire([{ type: FileChangeType.Deleted, path }]);
  }

  async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
    await this.request('rename', oldPath, { newPath, options });
    this.emitter.fire([
      { type: FileChangeType.Deleted, path: oldPath },
      { type: FileChangeType.Created, path: newPath },
    ]);
  }

  async mkdir(path: string): Promise<void> {
    await this.request('mkdir', path);
    this.emitter.fire([{ type: FileChangeType.Created, path }]);
  }

  // --- Cleanup ---

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(VfsError.unavailable('MqttFS disposed'));
    }
    this.pending.clear();
    this.emitter.dispose();
  }

  // --- Private ---

  private request(op: string, path?: string, extra?: Record<string, unknown>): Promise<unknown> {
    const id = generateId();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(VfsError.unavailable(`Device response timeout (op=${op}, path=${path ?? ''})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const payload: Record<string, unknown> = { id, op };
      if (path !== undefined) payload['path'] = path;
      if (extra) Object.assign(payload, extra);

      this.options.publishFn(this.options.reqTopic, JSON.stringify(payload));
    });
  }
}

// --- Helpers ---

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
