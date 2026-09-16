/**
 * Serving the built frontend.
 *
 * Path resolution is split out of the server, because this is where the one
 * dangerous bug of this layer lives: escaping the public directory exposes the
 * server's disk. A pure function can be checked by a test without standing up a
 * server.
 */

import * as path from 'node:path';

/**
 * A safe path to a file below the public directory, or `null`.
 *
 * The URL is decoded **before** the check, because `%2e%2e` is the same two
 * dots, and full paths are compared with a trailing separator — a plain text
 * prefix would let a `public-secret` directory next to `public` through.
 */
export function resolvePath(publicDir: string, url: string): string | null {
  const root = path.resolve(publicDir);
  let requested: string;
  try {
    requested = decodeURIComponent(url.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (requested === '/' || requested === '') requested = '/index.html';
  const full = path.resolve(root, `.${path.posix.normalize(requested)}`);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Content type from the extension; anything unknown goes as a byte stream. */
export function mimeType(filePath: string): string {
  return TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
