import type { IncomingMessage } from 'http';
import type { AuthTokenPayload } from '@hestia/core';
import type { JwtService } from './JwtService';
import { ApiKeyService } from './ApiKeyService';

export function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function checkAuth(
  req: IncomingMessage,
  jwtService: JwtService,
  apiKeyService?: ApiKeyService
): AuthTokenPayload | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  if (apiKeyService && ApiKeyService.isApiKey(token)) {
    return apiKeyService.verify(token);
  }
  return jwtService.verify(token);
}
