import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage } from 'http';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { extractBearerToken, checkAuth } from './authMiddleware';
import { JwtService } from './JwtService';
import { ApiKeyService } from './ApiKeyService';
import { FileSystem } from '../filesystem/FileSystem';
import type { AuthTokenPayload } from '@hestia/core';

// Minimal IncomingMessage stub — checkAuth only reads headers.authorization
function reqWith(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

const payload: AuthTokenPayload = {
  userId: 'u1',
  userName: 'marcin',
  isAdmin: false,
  roles: [],
};

describe('extractBearerToken', () => {
  it('extracts the token after "Bearer "', () => {
    expect(extractBearerToken(reqWith('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('returns null when no authorization header', () => {
    expect(extractBearerToken(reqWith())).toBeNull();
  });

  it('returns null for a non-Bearer scheme', () => {
    expect(extractBearerToken(reqWith('Basic dXNlcjpwYXNz'))).toBeNull();
  });
});

describe('checkAuth', () => {
  let tmpDir: string;
  let fileSystem: FileSystem;
  let jwtService: JwtService;
  let apiKeyService: ApiKeyService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authmw-test-'));
    fileSystem = new FileSystem(tmpDir);
    await fileSystem.initialize();
    jwtService = new JwtService('secret');
    apiKeyService = new ApiKeyService(fileSystem, 'auth/api_keys.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no token is present', () => {
    expect(checkAuth(reqWith(), jwtService)).toBeNull();
  });

  it('verifies a JWT token', () => {
    const token = jwtService.sign(payload);
    expect(checkAuth(reqWith(`Bearer ${token}`), jwtService)).toEqual(payload);
  });

  it('returns null for an invalid JWT token', () => {
    expect(checkAuth(reqWith('Bearer garbage'), jwtService)).toBeNull();
  });

  it('routes minis_ tokens to the ApiKeyService when provided', async () => {
    const { rawKey } = await apiKeyService.create('marcin', 'u1', true, ['admin'], 'k');
    const result = checkAuth(reqWith(`Bearer ${rawKey}`), jwtService, apiKeyService);
    expect(result).toEqual({
      userId: 'u1',
      userName: 'marcin',
      isAdmin: true,
      roles: ['admin'],
    });
  });

  it('returns null for an unknown api key', () => {
    expect(checkAuth(reqWith('Bearer minis_unknown'), jwtService, apiKeyService)).toBeNull();
  });

  it('falls back to JWT verify for minis_ tokens when no ApiKeyService is given', () => {
    // Without an ApiKeyService the minis_ token is treated as a JWT → fails
    expect(checkAuth(reqWith('Bearer minis_something'), jwtService)).toBeNull();
  });
});
