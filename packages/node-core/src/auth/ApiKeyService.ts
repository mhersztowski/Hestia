import { createHash, randomBytes, randomUUID } from 'crypto';
import type { FileSystem } from '../filesystem/FileSystem';
import type { ApiKeyModel, AuthTokenPayload, ApiKeyCreateResponse, ApiKeyPublic } from '@hestia/core';

const API_KEY_PREFIX = 'minis_';
const KEY_BYTE_LENGTH = 32;

export class ApiKeyService {
  private keysByHash = new Map<string, ApiKeyModel>();
  private filePath: string;
  private fileSystem: FileSystem;

  constructor(fileSystem: FileSystem, filePath: string) {
    this.fileSystem = fileSystem;
    this.filePath = filePath;
  }

  static isApiKey(token: string): boolean {
    return token.startsWith(API_KEY_PREFIX);
  }

  static hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  async load(): Promise<void> {
    this.keysByHash.clear();
    try {
      const file = await this.fileSystem.readFile(this.filePath);
      const data = JSON.parse(file.content);
      const items: ApiKeyModel[] = data.items || [];
      for (const key of items) {
        this.keysByHash.set(key.hash, key);
      }
    } catch {
      // File doesn't exist yet — start empty
    }
  }

  private async save(): Promise<void> {
    const items = Array.from(this.keysByHash.values());
    await this.fileSystem.writeFile(
      this.filePath,
      JSON.stringify({ type: 'api_keys', items }, null, 2),
    );
  }

  verify(rawKey: string): AuthTokenPayload | null {
    const hash = ApiKeyService.hashKey(rawKey);
    const key = this.keysByHash.get(hash);
    if (!key) return null;
    key.lastUsedAt = Date.now();
    this.save().catch(() => {});
    return {
      userId: key.userId,
      userName: key.userName,
      isAdmin: key.isAdmin,
      roles: key.roles,
    };
  }

  async create(
    userName: string,
    userId: string,
    isAdmin: boolean,
    roles: string[],
    keyName: string,
  ): Promise<ApiKeyCreateResponse> {
    const rawKey = API_KEY_PREFIX + randomBytes(KEY_BYTE_LENGTH).toString('hex');
    const hash = ApiKeyService.hashKey(rawKey);
    const model: ApiKeyModel = {
      id: randomUUID(),
      name: keyName,
      prefix: rawKey.substring(0, 14),
      hash,
      userId,
      userName,
      isAdmin,
      roles,
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    this.keysByHash.set(hash, model);
    await this.save();
    const { hash: _, ...publicKey } = model;
    return { key: publicKey, rawKey };
  }

  listForUser(userName: string): ApiKeyPublic[] {
    return Array.from(this.keysByHash.values())
      .filter((k) => k.userName === userName)
      .map(({ hash: _, ...rest }) => rest);
  }

  async deleteKey(keyId: string, userName: string): Promise<boolean> {
    for (const [hash, key] of this.keysByHash) {
      if (key.id === keyId && key.userName === userName) {
        this.keysByHash.delete(hash);
        await this.save();
        return true;
      }
    }
    return false;
  }
}
