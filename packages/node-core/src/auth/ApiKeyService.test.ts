import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ApiKeyService } from './ApiKeyService';
import { FileSystem } from '../filesystem/FileSystem';

let tmpDir: string;
let fileSystem: FileSystem;
const KEYS_PATH = 'auth/api_keys.json';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apikey-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function newService() {
  return new ApiKeyService(fileSystem, KEYS_PATH);
}

describe('ApiKeyService', () => {
  describe('static helpers', () => {
    it('isApiKey detects the minis_ prefix', () => {
      expect(ApiKeyService.isApiKey('minis_abc')).toBe(true);
      expect(ApiKeyService.isApiKey('minis_')).toBe(true);
      expect(ApiKeyService.isApiKey('eyJhbGci.jwt.token')).toBe(false);
      expect(ApiKeyService.isApiKey('')).toBe(false);
    });

    it('hashKey is a deterministic sha256 hex digest', () => {
      const h = ApiKeyService.hashKey('minis_deadbeef');
      expect(h).toBe(createHash('sha256').update('minis_deadbeef').digest('hex'));
      expect(h).toHaveLength(64);
      expect(ApiKeyService.hashKey('minis_deadbeef')).toBe(h);
      expect(ApiKeyService.hashKey('minis_other')).not.toBe(h);
    });
  });

  describe('create', () => {
    it('generates a raw key with the minis_ prefix and a 14-char stored prefix', async () => {
      const svc = newService();
      const { rawKey, key } = await svc.create('marcin', 'u1', true, ['admin'], 'CI key');

      expect(rawKey.startsWith('minis_')).toBe(true);
      // minis_ (6) + 32 bytes hex (64) = 70 chars
      expect(rawKey).toHaveLength(70);
      expect(key.prefix).toBe(rawKey.substring(0, 14));
      expect(key.name).toBe('CI key');
      expect(key.userName).toBe('marcin');
      expect(key.userId).toBe('u1');
      expect(key.isAdmin).toBe(true);
      expect(key.roles).toEqual(['admin']);
      expect(key.lastUsedAt).toBeNull();
      // public key must not leak the hash
      expect(key).not.toHaveProperty('hash');
    });

    it('persists keys to the filesystem', async () => {
      const svc = newService();
      await svc.create('marcin', 'u1', false, [], 'k');
      const file = await fileSystem.readFile(KEYS_PATH);
      const data = JSON.parse(file.content);
      expect(data.type).toBe('api_keys');
      expect(data.items).toHaveLength(1);
      expect(data.items[0].hash).toHaveLength(64);
    });

    it('generates unique raw keys across calls', async () => {
      const svc = newService();
      const a = await svc.create('marcin', 'u1', false, [], 'a');
      const b = await svc.create('marcin', 'u1', false, [], 'b');
      expect(a.rawKey).not.toBe(b.rawKey);
      expect(a.key.id).not.toBe(b.key.id);
    });
  });

  describe('verify', () => {
    it('verifies a freshly created raw key and returns its payload', async () => {
      const svc = newService();
      const { rawKey } = await svc.create('marcin', 'u1', true, ['admin'], 'k');
      const payload = svc.verify(rawKey);
      expect(payload).toEqual({
        userId: 'u1',
        userName: 'marcin',
        isAdmin: true,
        roles: ['admin'],
      });
    });

    it('returns null for an unknown / wrong key', async () => {
      const svc = newService();
      await svc.create('marcin', 'u1', false, [], 'k');
      expect(svc.verify('minis_not_a_real_key')).toBeNull();
    });

    it('updates lastUsedAt on successful verify', async () => {
      const svc = newService();
      const { rawKey, key } = await svc.create('marcin', 'u1', false, [], 'k');
      expect(key.lastUsedAt).toBeNull();
      svc.verify(rawKey);
      const [listed] = svc.listForUser('marcin');
      expect(listed.lastUsedAt).not.toBeNull();
      expect(typeof listed.lastUsedAt).toBe('number');
    });
  });

  describe('load', () => {
    it('reloads persisted keys into a fresh instance', async () => {
      const svc = newService();
      const { rawKey } = await svc.create('marcin', 'u1', false, ['x'], 'k');

      const fresh = newService();
      await fresh.load();
      expect(fresh.verify(rawKey)).toEqual({
        userId: 'u1',
        userName: 'marcin',
        isAdmin: false,
        roles: ['x'],
      });
    });

    it('starts empty when the keys file does not exist', async () => {
      const svc = newService();
      await svc.load(); // no file yet — must not throw
      expect(svc.listForUser('marcin')).toEqual([]);
    });
  });

  describe('listForUser', () => {
    it('returns only the requesting user keys, without hashes', async () => {
      const svc = newService();
      await svc.create('marcin', 'u1', false, [], 'a');
      await svc.create('marcin', 'u1', false, [], 'b');
      await svc.create('other', 'u2', false, [], 'c');

      const mine = svc.listForUser('marcin');
      expect(mine).toHaveLength(2);
      for (const k of mine) {
        expect(k).not.toHaveProperty('hash');
        expect(k.userName).toBe('marcin');
      }
    });
  });

  describe('deleteKey', () => {
    it('deletes an owned key and invalidates it', async () => {
      const svc = newService();
      const { rawKey, key } = await svc.create('marcin', 'u1', false, [], 'k');
      const ok = await svc.deleteKey(key.id, 'marcin');
      expect(ok).toBe(true);
      expect(svc.verify(rawKey)).toBeNull();
      expect(svc.listForUser('marcin')).toEqual([]);
    });

    it('does not delete a key owned by another user', async () => {
      const svc = newService();
      const { key } = await svc.create('marcin', 'u1', false, [], 'k');
      const ok = await svc.deleteKey(key.id, 'someone-else');
      expect(ok).toBe(false);
      expect(svc.listForUser('marcin')).toHaveLength(1);
    });

    it('returns false for an unknown key id', async () => {
      const svc = newService();
      expect(await svc.deleteKey('does-not-exist', 'marcin')).toBe(false);
    });
  });
});
