/**
 * The drive's view of a file store, and the rules that do not need a browser.
 *
 * The component describes what it needs; the host supplies it. It cannot reach
 * for a file system itself: `@hestia/node-core`'s `FileSystem` is Node code
 * (`node:fs`), and this runs in a page. In Hestia the host's store talks to the
 * platform over `/platform/api/vfs/*`, and the thing answering on the other end
 * **is** that `FileSystem` — the same store, reached the only way a browser can.
 *
 * Every path here is relative to the store's own root, with `/` between
 * segments and no leading slash. Where that root sits on disk is the host's
 * business and the component never learns it.
 */

/** One entry in a directory. */
export interface DriveEntry {
  name: string;
  directory: boolean;
  /** Bytes. Absent when the store does not report it. */
  size?: number;
  /** Milliseconds since the epoch. Absent when the store does not report it. */
  modified?: number;
}

export interface DriveStore {
  /** Where the drive opens. `''` is the root. */
  startDir?: string;
  /** Contents of a directory. A directory that does not exist yet is empty, not an error. */
  list(dir: string): Promise<DriveEntry[]>;
  /** A text file's contents. */
  read(path: string): Promise<string>;
  /** Bytes, for what is not text — an image, a PDF. Absent = those files are listed but not previewed. */
  readBytes?(path: string): Promise<Uint8Array>;
  write?(path: string, content: string): Promise<void>;
  remove?(path: string): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  createDir?(path: string): Promise<void>;
  /** An address to open the file at, for what the drive cannot show itself. */
  urlFor?(path: string): string | null;
}

// ── Paths ────────────────────────────────────────────────────────────────────

/** Joins a directory and a name, with no double slashes and no leading one. */
export function pathIn(dir: string, name: string): string {
  const d = dir.replace(/^\/+|\/+$/g, '');
  return d ? `${d}/${name}` : name;
}

/** The directory holding this path; `''` at the root. */
export function parentDir(path: string): string {
  const p = path.replace(/^\/+|\/+$/g, '');
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** The last segment of a path. */
export function baseName(path: string): string {
  const p = path.replace(/^\/+|\/+$/g, '');
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

/**
 * The path as a trail of steps, root first, for the breadcrumbs. Each step
 * carries the path to jump to, so a click needs no arithmetic of its own.
 */
export function breadcrumbs(dir: string, rootLabel = 'Drive'): { label: string; path: string }[] {
  const parts = dir
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  const out = [{ label: rootLabel, path: '' }];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    out.push({ label: part, path: acc });
  }
  return out;
}

/**
 * A name typed by a person, made safe to put in a directory: slashes flattened
 * and `..` defused. Without this a name is a path, and a path can leave the
 * directory the user is looking at.
 */
export function safeName(raw: string): string {
  const name = raw
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+$/, '');
  return name || 'untitled';
}

// ── Sorting and kinds ────────────────────────────────────────────────────────

/** Directories first, then by name — the order a file list is read in. */
export function sortEntries(entries: DriveEntry[]): DriveEntry[] {
  return [...entries].sort((a, b) =>
    a.directory !== b.directory ? (a.directory ? -1 : 1) : a.name.localeCompare(b.name)
  );
}

export type FileKind = 'text' | 'image' | 'pdf' | 'other';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'java',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'bash',
  'zsh',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'svg',
  'xml',
  'csv',
  'tsv',
  'log',
  'gitignore',
  'gcode',
  'ino',
  'lua',
  'kt',
  'swift',
  'gradle',
  'properties',
]);
const TEXT_NAMES = new Set(['readme', 'license', 'licence', 'makefile', 'dockerfile', 'claude']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']);

/** The extension, lower-case and without the dot; `''` when there is none. */
export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * What the drive can show for this file.
 *
 * By extension rather than by content: the listing has to say what a file is
 * before anything is read, and reading a directory of large files to find out
 * would cost more than the answer is worth. SVG counts as text — it is markup,
 * and seeing it is usually why one opens it.
 */
export function kindOf(name: string): FileKind {
  const ext = extensionOf(name);
  if (!ext) return TEXT_NAMES.has(name.toLowerCase()) ? 'text' : 'other';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'other';
}

/** A size for a person to read. */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  // One decimal below 10, none above — "9.4 MB" and "250 MB" both read at a glance.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** A media type for an image, so the preview can build a `data:` address. */
export function imageMimeType(name: string): string {
  const ext = extensionOf(name);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'ico') return 'image/x-icon';
  return `image/${ext || 'png'}`;
}

/** Bytes as a base64 `data:` address — how an image or a PDF reaches an `<img>` or an `<object>`. */
export function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  // In chunks: `String.fromCharCode(...bytes)` on a megabyte-long array blows
  // the argument limit and throws, which looks like a corrupt file.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
