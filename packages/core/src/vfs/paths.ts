export function normalize(path: string): string {
  if (!path) return '/';
  const isAbs = path.charCodeAt(0) === 47; // '/'
  const parts = path.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else if (!isAbs) {
        resolved.push('..');
      }
    } else {
      resolved.push(part);
    }
  }

  const result = resolved.join('/');
  if (isAbs) return '/' + result;
  return result || '.';
}

export function join(...parts: string[]): string {
  if (parts.length === 0) return '.';
  return normalize(parts.filter(Boolean).join('/'));
}

export function dirname(path: string): string {
  const normalized = normalize(path);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return normalized.slice(0, lastSlash);
}

export function basename(path: string, ext?: string): string {
  const normalized = normalize(path);
  const lastSlash = normalized.lastIndexOf('/');
  const name = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length);
  }
  return name;
}

export function extname(path: string): string {
  const name = basename(path);
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return name.slice(dotIndex);
}

export function isAbsolute(path: string): boolean {
  return path.length > 0 && path.charCodeAt(0) === 47; // '/'
}

export function segments(path: string): string[] {
  const normalized = normalize(path);
  if (normalized === '/' || normalized === '.') return [];
  const stripped = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  return stripped.split('/');
}
