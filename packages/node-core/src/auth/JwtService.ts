import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@hestia/core';

export class JwtService {
  private secret: string;
  private ttlSeconds: number;

  constructor(secret: string, ttlSeconds = 604800) {
    this.secret = secret;
    this.ttlSeconds = ttlSeconds;
  }

  sign(payload: AuthTokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.ttlSeconds });
  }

  verify(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as AuthTokenPayload;
      return {
        userId: decoded.userId,
        userName: decoded.userName,
        isAdmin: decoded.isAdmin,
        roles: decoded.roles,
      };
    } catch {
      return null;
    }
  }
}
