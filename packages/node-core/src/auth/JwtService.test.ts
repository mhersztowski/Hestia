import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { JwtService } from './JwtService';
import type { AuthTokenPayload } from '@hestia/core';

const payload: AuthTokenPayload = {
  userId: 'u1',
  userName: 'marcin',
  isAdmin: true,
  roles: ['admin', 'user'],
};

describe('JwtService', () => {
  it('signs and verifies a token round-trip', () => {
    const svc = new JwtService('secret-key');
    const token = svc.sign(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature

    const decoded = svc.verify(token);
    expect(decoded).toEqual(payload);
  });

  it('returns only the whitelisted payload fields (drops iat/exp/extra)', () => {
    const svc = new JwtService('secret-key');
    // Sign a token with extra fields directly to ensure verify strips them
    const raw = jwt.sign({ ...payload, extra: 'nope' } as any, 'secret-key', {
      expiresIn: 3600,
    });
    const decoded = svc.verify(raw);
    expect(decoded).toEqual(payload);
    expect(decoded).not.toHaveProperty('extra');
    expect(decoded).not.toHaveProperty('iat');
    expect(decoded).not.toHaveProperty('exp');
  });

  it('defaults TTL to 7 days (604800s)', () => {
    const svc = new JwtService('secret-key');
    const token = svc.sign(payload);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(604800);
  });

  it('honours a custom TTL', () => {
    const svc = new JwtService('secret-key', 120);
    const token = svc.sign(payload);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(120);
  });

  it('rejects a token signed with a different secret', () => {
    const signer = new JwtService('secret-a');
    const verifier = new JwtService('secret-b');
    const token = signer.sign(payload);
    expect(verifier.verify(token)).toBeNull();
  });

  it('rejects a tampered token', () => {
    const svc = new JwtService('secret-key');
    const token = svc.sign(payload);
    // Flip a character in the signature segment
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    expect(svc.verify(parts.join('.'))).toBeNull();
  });

  it('rejects a malformed / non-JWT token', () => {
    const svc = new JwtService('secret-key');
    expect(svc.verify('not-a-jwt')).toBeNull();
    expect(svc.verify('')).toBeNull();
  });

  it('rejects an expired token', () => {
    const svc = new JwtService('secret-key');
    // Sign already-expired token (issued in the past, negative expiry)
    const expired = jwt.sign(payload as any, 'secret-key', { expiresIn: -10 });
    expect(svc.verify(expired)).toBeNull();
  });
});
