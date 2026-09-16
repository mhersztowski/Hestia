/**
 * Drive PIM page — Google-Drive-like file manager backed by the user's VFS.
 *
 * Roots at `data/Minis/Users/{userName}/drive/` and grows from there. Anything
 * placed under the special `public/` subtree is reachable over plain HTTP
 * via `/files/Minis/Users/{userName}/drive/public/{path}` — no auth — so the
 * user can hand out URLs to images, attachments, etc.
 *
 * Operations are pure thin wrappers around the existing per-user VFS API
 * (`/api/users/{u}/vfs/*`). No new backend endpoints needed.
 */

import {
  asText,
  fromText,
  readJson,
  readTextOrNull,
  sortVfsEntries,
  DIR_TYPE,
  FILE_TYPE,
  type DriveVfs,
  type VfsEntry,
} from './vfs';
import type { DriveAssistant, DriveEditor, DriveFileRef, DriveViewers } from './capabilities';
import type { DriveStore } from './store';
// The search types live beside the dialog that also reads them: the dialog is
// imported by this file, so it cannot import back, and a second copy of the
// shapes would be a second truth.
import type { SearchFileResult, SearchMatch, SearchProgress } from './driveSearchTypes';
import DriveSearchDialog from './DriveSearchDialog';
import { archiveNameFor, folderNameFor, isArchive } from './zip';
import {
  isRunnableScript,
  runScript,
  stopScript,
  MAX_CONSOLE_LINES,
  type ConsoleLine,
  type ScriptSession,
} from './runScript';
import {
  decideScript,
  detectPackageManager,
  installPlan,
  readPackageManagerField,
  readPackageScripts,
  type DetectedManager,
} from './npmProject';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Backdrop,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
  Switch,
  FormControlLabel,
  Popover,
} from '@mui/material';
// Side-effect: ensures Monaco workers + compiler options + completionItems
// configuration is in place BEFORE MdEditor (or the embedded workspace) mounts.
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import EditIcon from '@mui/icons-material/Edit';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import TuneIcon from '@mui/icons-material/Tune';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import TerminalIcon from '@mui/icons-material/Terminal';
import InventoryIcon from '@mui/icons-material/Inventory2';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import HomeIcon from '@mui/icons-material/Home';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LabelIcon from '@mui/icons-material/Label';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import LaunchIcon from '@mui/icons-material/Launch';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SubjectIcon from '@mui/icons-material/Subject';
import CodeIcon from '@mui/icons-material/Code';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';

// MJD editor — lazy-loaded so the (sizeable) editor bundle isn't pulled in
// until the user actually opens a .mjd / .data.json file. RemoteFS is the
// VFS adapter MjdVfsLoader expects.
// Value import (not just types): used to reach the live Monaco model of the
// file currently open in the embedded workspace (`file://<wsPath>`), so the
// in-browser runner executes unsaved edits, and to transpile .ts via the TS
// worker. Same module instance the workspace bundles, so getModel() resolves.

// ─── VFS helpers ─────────────────────────────────────────────────────────────

// navigator.clipboard is undefined outside a secure context (HTTP on a LAN IP,
// which is how the app is reached on mobile) — so we fall back to the legacy
// execCommand('copy') path, then to a manual prompt as a last resort.
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * The file operations, over the `DriveVfs` the host supplies.
 *
 * In MyCastle these built `/api/users/{user}/vfs/{op}` URLs and read a token
 * out of `localStorage`. The names and the shapes are unchanged — the page
 * calls them in forty-odd places — but the transport arrives from outside, so
 * the page no longer knows whose files these are or where they sit.
 */
async function vfsListDir(vfs: DriveVfs, relPath: string): Promise<VfsEntry[]> {
  // A directory that is not there yet is empty, not a failure: the page walks
  // into folders that are about to be created.
  const entries = await vfs.list(relPath).catch(() => [] as VfsEntry[]);
  return sortVfsEntries(entries);
}

async function vfsMkdir(vfs: DriveVfs, relPath: string): Promise<void> {
  if (!vfs.mkdir) throw new Error('This drive cannot create folders');
  await vfs.mkdir(relPath);
}

async function vfsDelete(vfs: DriveVfs, relPath: string, recursive: boolean): Promise<void> {
  if (!vfs.delete) throw new Error('This drive cannot delete');
  await vfs.delete(relPath, recursive);
}

async function vfsRename(vfs: DriveVfs, oldRel: string, newRel: string): Promise<void> {
  if (!vfs.rename) throw new Error('This drive cannot rename');
  await vfs.rename(oldRel, newRel);
}

async function vfsWriteFile(
  vfs: DriveVfs,
  relPath: string,
  data: Uint8Array,
  /** Called as the bytes go up — the upload dialog draws a bar per file. */
  onProgress?: (pct: number) => void
): Promise<void> {
  await vfs.writeFile(relPath, data, onProgress);
}

async function vfsCopy(vfs: DriveVfs, sourceRel: string, destRel: string): Promise<void> {
  if (vfs.copy) {
    await vfs.copy(sourceRel, destRel);
    return;
  }
  // Without a copy of its own: read and write it back. Fine for a file, and the
  // page only copies files — a folder goes through `vfsCopyTree` below.
  await vfs.writeFile(destRel, await vfs.readFile(sourceRel));
}

async function vfsStat(vfs: DriveVfs, relPath: string): Promise<{ type: number } | null> {
  if (!vfs.stat) return null;
  return vfs.stat(relPath).catch(() => null);
}

/** Tags and whatever else is said about a file, kept beside the files. */
const FILE_PROPS_PATH = '.fileproperties.json';

interface FileProperties {
  /** relPath → list of tags. Missing key === no tags. */
  tags: Record<string, string[]>;
}

const EMPTY_FILE_PROPS: FileProperties = { tags: {} };

async function loadFileProperties(vfs: DriveVfs): Promise<FileProperties> {
  try {
    const text = await readTextOrNull(vfs, FILE_PROPS_PATH);
    if (text === null) return EMPTY_FILE_PROPS;
    const parsed = JSON.parse(text) as Partial<FileProperties>;
    return {
      tags: parsed.tags && typeof parsed.tags === 'object' ? parsed.tags : {},
    };
  } catch {
    return EMPTY_FILE_PROPS;
  }
}

async function saveFileProperties(vfs: DriveVfs, props: FileProperties): Promise<void> {
  const text = JSON.stringify(props, null, 2);
  // UTF-8-safe base64: encodeURIComponent + escape handles non-ASCII (Polish
  // accents in tag names, file paths).

  await vfsWriteFile(vfs, FILE_PROPS_PATH, fromText(text));
}

const VIEW_SETTINGS_PATH = '.mdview.json';
type ViewSettings = Record<string, boolean>;
type ViewSettingsMap = Record<string, ViewSettings>;

async function loadViewSettings(vfs: DriveVfs): Promise<ViewSettingsMap> {
  const map = await readJson<ViewSettingsMap>(vfs, VIEW_SETTINGS_PATH, {});
  return map && typeof map === 'object' ? map : {};
}

async function saveViewSettings(vfs: DriveVfs, map: ViewSettingsMap): Promise<void> {
  await vfsWriteFile(vfs, VIEW_SETTINGS_PATH, fromText(JSON.stringify(map, null, 2)));
}

const SCHEDULES_PATH = '.schedules.json';
type DriveSchedules = Record<string, { cron: string; enabled: boolean; runAtStartup?: boolean }>;

async function loadSchedules(vfs: DriveVfs): Promise<DriveSchedules> {
  try {
    const text = await readTextOrNull(vfs, SCHEDULES_PATH);
    if (text === null) return {};
    const parsed = JSON.parse(text) as DriveSchedules;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSchedules(vfs: DriveVfs, schedules: DriveSchedules): Promise<void> {
  const text = JSON.stringify(schedules, null, 2);
  await vfsWriteFile(vfs, SCHEDULES_PATH, fromText(text));
  // MyCastle then asked its backend to re-register the user's cron jobs from
  // the file. Whether anything runs them here is the host's business: the page
  // writes the schedule, and a host that acts on it watches the file.
}

/** Bytes out of a base64 payload — what the clipboard hands us for an image. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Reads a file for the preview panel: the bytes always, and the text as well
 * when this is a file that reads as text.
 *
 * Four call sites did this separately and all four read text only — so an
 * image opened as an empty `data:` URL, which on screen is indistinguishable
 * from a file that failed to load.
 */
async function readForPreview(
  vfs: DriveVfs,
  rel: string,
  name: string
): Promise<{ mime: string; textContent?: string; bytes: Uint8Array }> {
  const bytes = await vfs.readFile(rel);
  const mime = guessMime(name);
  return { mime, bytes, textContent: isEditableTextFile(name, mime) ? asText(bytes) : undefined };
}

/**
 * Resolve filename collisions by appending " (copy)", " (copy 2)", ... before
 * the extension. Probes via stat — returns the first free path.
 */
async function uniqueName(vfs: DriveVfs, dirRel: string, baseName: string): Promise<string> {
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  for (let i = 0; i < 50; i++) {
    const candidateName = i === 0 ? baseName : `${stem} (copy${i > 1 ? ' ' + i : ''})${ext}`;
    const rel = dirRel ? `${dirRel}/${candidateName}` : candidateName;
    const stat = await vfsStat(vfs, rel);
    if (!stat) return candidateName;
  }
  return `${stem} (copy ${Date.now()})${ext}`;
}

/**
 * Downloading a file.
 *
 * MyCastle built a URL with the token in the query string, because an Android
 * WebView cannot carry an Authorization header through a navigation and ignores
 * the `download` attribute on a blob URL made in JavaScript. Whether that is
 * needed here is the host's business: `vfs.downloadUrl` returns an address to
 * navigate to, and when the host offers none the bytes are read and handed to
 * the browser as a blob, which works everywhere except that WebView.
 */
function downloadFile(vfs: DriveVfs, relPath: string, name: string): void {
  const direct = vfs.downloadUrl?.(relPath);
  const open = (href: string, revoke?: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.rel = 'noopener';
    link.download = name;
    // No `target="_blank"` — it would leave a blank tab dangling on a desktop.
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) URL.revokeObjectURL(revoke);
  };
  if (direct) {
    open(direct);
    return;
  }
  void vfs.readFile(relPath).then((bytes) => {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart]));
    open(url, url);
  });
}

/**
 * Whether a path lies in the drive's public area.
 *
 * The rule is the host's: it serves the files, so it decides which of them are
 * reachable without a token. `vfs.publicUrl` returning an address is that
 * decision; the page only shows it.
 */
function publicUrl(vfs: DriveVfs, relPath: string): string {
  return vfs.publicUrl?.(relPath) ?? '';
}

function isPublic(vfs: DriveVfs, relPath: string): boolean {
  return publicUrl(vfs, relPath) !== '';
}

function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

// ─── Full-text search (drive scan) ──────────────────────────────────────────
//
// Whitelist of file extensions we will read + grep. Anything not in this set
// is skipped silently. Better-safe-than-sorry: better miss a match in a
// non-listed extension than try to grep a 10MB binary and run the browser
// out of memory.
const TEXT_FILE_EXTS = new Set([
  // docs / config / data
  'md',
  'mdx',
  'txt',
  'json',
  'yaml',
  'yml',
  'xml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'properties',
  'env',
  'log',
  'csv',
  'tsv',
  // web / scripts
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'svg',
  'vue',
  'svelte',
  // backend / system
  'py',
  'rb',
  'php',
  'go',
  'rs',
  'java',
  'kt',
  'scala',
  'swift',
  'dart',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'ino',
  'pde',
  'cs',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'lua',
  'r',
  'pl',
]);

/** Files with no extension that are conventionally text. Compared
 *  case-insensitive against the basename. */
const TEXT_FILE_NAMES_NO_EXT = new Set([
  'dockerfile',
  'makefile',
  'readme',
  'license',
  'changelog',
  'authors',
  'contributors',
  'notice',
]);

function isTextFile(name: string): boolean {
  if (name.startsWith('.')) return false; // skip hidden / sidecar files
  const i = name.lastIndexOf('.');
  if (i < 0) return TEXT_FILE_NAMES_NO_EXT.has(name.toLowerCase());
  const ext = name.slice(i + 1).toLowerCase();
  return TEXT_FILE_EXTS.has(ext);
}

/** Walk a directory tree (DFS) collecting text-file paths. Skips hidden
 *  files / dirs. Bounded by `maxFiles` so a runaway recursion can't melt
 *  the browser. */
async function collectTextFiles(
  vfs: DriveVfs,
  baseRel: string,
  signal: AbortSignal | undefined,
  maxFiles: number
): Promise<string[]> {
  const results: string[] = [];
  // BFS — shorter queue than DFS for wide trees + we get partial results
  // sooner if we ever want to surface them mid-walk.
  const queue: string[] = [baseRel];
  while (queue.length > 0 && results.length < maxFiles) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const dir = queue.shift()!;
    let entries: VfsEntry[];
    try {
      entries = await vfsListDir(vfs, dir);
    } catch {
      continue;
    } // unreadable dir — skip silently
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === DIR_TYPE) {
        queue.push(rel);
      } else if (isTextFile(e.name)) {
        results.push(rel);
        if (results.length >= maxFiles) break;
      }
    }
  }
  return results;
}

/** Build a per-line matcher from the user query. Returns null if the
 *  regex source is invalid (caller surfaces the error in UI). */
function buildSearchRegex(query: string, caseSensitive: boolean, isRegex: boolean): RegExp | null {
  try {
    const source = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(source, caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

/** A file's content as text; empty when it is not there. */
async function readFileAsText(vfs: DriveVfs, rel: string): Promise<string> {
  return (await readTextOrNull(vfs, rel)) ?? '';
}

const SEARCH_MAX_FILES = 5000; // hard cap on scan size
const SEARCH_MAX_MATCHES_PER_FILE = 50; // stop collecting after this many
const SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — skip larger files

/** Drive-wide text search. Resolves with per-file results. Throws on
 *  abort (DOMException 'AbortError'); other per-file errors are swallowed
 *  so one unreadable file doesn't sink the whole search. */
async function searchInFiles(
  vfs: DriveVfs,
  baseRel: string,
  query: string,
  options: { caseSensitive: boolean; isRegex: boolean },
  signal: AbortSignal | undefined,
  onProgress: (p: SearchProgress) => void
): Promise<SearchFileResult[]> {
  if (!query) return [];
  const re = buildSearchRegex(query, options.caseSensitive, options.isRegex);
  if (!re) throw new Error('Niepoprawne wyrażenie regularne');

  onProgress({ scanned: 0, total: 0 });
  const files = await collectTextFiles(vfs, baseRel, signal, SEARCH_MAX_FILES);
  onProgress({ scanned: 0, total: files.length });

  const results: SearchFileResult[] = [];
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const path = files[i];
    onProgress({ scanned: i, total: files.length, current: path });

    let text: string;
    try {
      text = await readFileAsText(vfs, path);
    } catch {
      continue;
    }
    if (text.length > SEARCH_MAX_FILE_BYTES) continue;

    // Line-by-line scan — the regex is global, so `exec`-loop on each line
    // gives us all per-line occurrences with byte offsets we can show in UI.
    const lines = text.split('\n');
    const matches: SearchMatch[] = [];
    let truncated = false;
    outer: for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lineText)) !== null) {
        matches.push({
          lineNumber: lineIdx + 1,
          lineText,
          matchStart: m.index,
          matchEnd: m.index + m[0].length,
        });
        // Zero-width match guard — without this `re.lastIndex` doesn't
        // advance and we'd loop forever on patterns like `(?=)`.
        if (m.index === re.lastIndex) re.lastIndex++;
        if (matches.length >= SEARCH_MAX_MATCHES_PER_FILE) {
          truncated = true;
          break outer;
        }
      }
    }
    if (matches.length > 0) results.push({ path, matches, truncated });
  }
  onProgress({ scanned: files.length, total: files.length });
  return results;
}

// ─── MIME + encoding helpers ─────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  log: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  py: 'text/x-python',
  sh: 'text/x-shellscript',
  rb: 'text/x-ruby',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  c: 'text/x-c',
  h: 'text/x-c',
  cpp: 'text/x-c++',
  hpp: 'text/x-c++',
  toml: 'text/x-toml',
  ini: 'text/plain',
  env: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  djvu: 'image/vnd.djvu',
  djv: 'image/vnd.djvu',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};
function guessMime(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
const isTextMime = (m: string) =>
  m.startsWith('text/') ||
  m === 'application/json' ||
  m === 'application/xml' ||
  m === 'image/svg+xml';
// Files we offer to open in MdEditor. Plain text is valid markdown (round-trips
// safely as long as the user doesn't add markdown syntax), so .txt is included.
const isMdEditable = (name: string) => {
  const n = name.toLowerCase();
  return n.endsWith('.md') || n.endsWith('.txt') || n.endsWith('.markdown');
};

// Files runnable on the backend (Drive → Run). Typically placed under
// `drive/server/` or `drive/backend/`. TS files are transpiled+bundled on the
// backend (so they can import other local .ts/.js files); JS runs as-is.
const isRunnable = (name: string) => /\.(mjs|cjs|js|ts|tsx|mts|cts)$/i.test(name);

// ── MJD editor association ──────────────────────────────────────────────────
// `.mjd`           → opens MjdDefEditor (schema editor)
// ── New-file dialog presets ─────────────────────────────────────────────────
// Each preset advertises a default filename + an extension. When the user
// switches preset in the dialog, the name auto-suggests the preset default
// (only when the user hasn't typed something custom yet). At create-time
// `applyExtension` ensures the saved name actually ends with the preset's
// extension — typing "config" with the YAML preset selected becomes
// "config.yaml".
interface FilePreset {
  key: string;
  label: string;
  defaultName: string;
  extension: string;
}

const FILE_PRESETS: FilePreset[] = [
  { key: 'md', label: 'Markdown (.md)', defaultName: 'notatka.md', extension: '.md' },
  { key: 'json', label: 'JSON (.json)', defaultName: 'data.json', extension: '.json' },
  { key: 'mjd-def', label: 'MJD definition (.mjd)', defaultName: 'schema.mjd', extension: '.mjd' },
  {
    key: 'mjd-data',
    label: 'MJD data (.data.json)',
    defaultName: 'dane.data.json',
    extension: '.data.json',
  },
  {
    key: 'myschema',
    label: 'My Schema (.myschema.json)',
    defaultName: 'schema.myschema.json',
    extension: '.myschema.json',
  },
  {
    key: 'yaml',
    label: 'YAML — konfiguracja (.yaml)',
    defaultName: 'config.yaml',
    extension: '.yaml',
  },
  {
    key: 'toml',
    label: 'TOML — konfiguracja (.toml)',
    defaultName: 'config.toml',
    extension: '.toml',
  },
  { key: 'ini', label: 'INI — konfiguracja (.ini)', defaultName: 'config.ini', extension: '.ini' },
  { key: 'env', label: '.env — zmienne środowiskowe', defaultName: '.env', extension: '.env' },
  { key: 'ts', label: 'TypeScript (.ts)', defaultName: 'index.ts', extension: '.ts' },
  { key: 'tsx', label: 'TypeScript React (.tsx)', defaultName: 'Component.tsx', extension: '.tsx' },
  { key: 'js', label: 'JavaScript (.js)', defaultName: 'index.js', extension: '.js' },
  { key: 'py', label: 'Python (.py)', defaultName: 'main.py', extension: '.py' },
  { key: 'cpp', label: 'C++ (.cpp)', defaultName: 'main.cpp', extension: '.cpp' },
  { key: 'css', label: 'CSS (.css)', defaultName: 'styles.css', extension: '.css' },
  { key: 'html', label: 'HTML (.html)', defaultName: 'index.html', extension: '.html' },
  { key: 'sh', label: 'Shell script (.sh)', defaultName: 'script.sh', extension: '.sh' },
  {
    key: 'custom',
    label: 'Inny (bez wymuszania rozszerzenia)',
    defaultName: 'untitled.txt',
    extension: '',
  },
];

/** Append `ext` to `name` if not already present. Special-case the empty
 *  ext (custom preset): leave the name untouched. Case-insensitive check so
 *  "DATA.JSON" with the JSON preset doesn't become "DATA.JSON.json". */
function applyExtension(name: string, ext: string): string {
  if (!ext) return name;
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext;
}
// DjVu ma mime `image/vnd.djvu` (zaczyna się od image/), ale NIE jest obrazkiem <img> —
// wyklucz, by trafił do dedykowanego DocPreview (djvu), a nie do zepsutego <img>.
const isImageMime = (m: string) =>
  m.startsWith('image/') && m !== 'image/svg+xml' && m !== 'image/vnd.djvu' && m !== 'image/x-djvu';
const isPdfMime = (m: string) => m === 'application/pdf';
const isDjvuMime = (m: string) => m === 'image/vnd.djvu' || m === 'image/x-djvu';

/**
 * The PDF and DjVu preview.
 *
 * MyCastle drew it with the viewer components directly; here they are
 * `@hestia/viewers`, and they arrive as the `viewers` capability — so a host
 * that does not want a PDF decoder simply passes none, and this shows the file
 * as unviewable instead.
 */
const DocPreview: React.FC<{ viewers: DriveViewers | null; file: DriveFileRef }> = ({
  viewers,
  file,
}) => (
  <Box sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
    {viewers && viewers.canView(file) ? (
      viewers.render(file)
    ) : (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          No viewer for this kind of file.
        </Typography>
      </Box>
    )}
  </Box>
);

const isAudioMime = (m: string) => m.startsWith('audio/');
const isVideoMime = (m: string) => m.startsWith('video/');

/**
 * Anything that benefits from a real code editor (syntax highlight, brackets,
 * indent) versus the static `<pre>` viewer. Includes the obvious text/JSON/XML
 * MIME types (so the existing detection still wins) plus a long list of
 * source-code extensions whose MIME the backend often reports as
 * application/octet-stream.
 */
function isEditableTextFile(name: string, mime: string): boolean {
  if (isTextMime(mime)) return true;
  // MdEditor handles markdown — we don't want to route .md to Monaco.
  if (isMdEditable(name)) return false;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  // Same set of recognised extensions we'd highlight, minus the markdown
  // variants. Kept inline rather than via a Set so the literal stays a
  // single grep target.
  // hydra/hsch/hcomp: pliki projektu frameworka Hydra. Są YAML-em, ale mają
  // własne rozszerzenia, żeby wtyczka Hydra Studio mogła je rozpoznać —
  // otwarcie w tym edytorze uruchamia jej interfejs obok zakładki tekstowej.
  return /^(json|jsonc|json5|map|js|mjs|cjs|jsx|ts|tsx|mts|cts|py|pyi|xml|svg|xsd|xsl|html|htm|css|scss|less|yaml|yml|hydra|hsch|hcomp|sh|bash|zsh|sql|c|h|cpp|cc|cxx|hpp|hh|hxx|ino|pde|java|kt|rs|go|rb|php|cs|fs|swift|dart|lua|r|pl|ini|cfg|toml|env|conf|dockerfile|gitignore|gitattributes)$/.test(
    ext
  );
}

/**
 * What the page is given.
 *
 * In MyCastle it took nothing: it read the user out of a router parameter, the
 * token out of a context, and talked to one backend. Here everything it cannot
 * know arrives as a prop, and each capability is optional — `null` means the
 * page does not offer that at all (see `capabilities.ts`).
 */
export interface DrivePageProps {
  /** The files. */
  vfs: DriveVfs;
  /** Where to open. `''` is the root. */
  startDir?: string;
  /** The text editor, from `@hestia/ui-texteditor`. Absent: nothing is editable here. */
  editor?: DriveEditor | null;
  /** The AI assistant, from `@hestia/ui-ai`. Absent: no assistant. */
  assistant?: DriveAssistant | null;
  /** PDF and DjVu, from `@hestia/viewers`. Absent: those files are listed but not shown. */
  viewers?: DriveViewers | null;
  /** The host's own controls, at the start of the toolbar. */
  toolbarStart?: React.ReactNode;
}

export default function DrivePage({
  vfs,
  startDir = '',
  editor = null,
  assistant = null,
  viewers = null,
  toolbarStart,
}: DrivePageProps): React.ReactElement {
  // Inicjalizacja z `?cwd=` (wejście z Pulpitu do ulubionego katalogu) — dzięki temu PIERWSZY
  // refresh ładuje właściwy katalog (a nie root, który potem trzeba by nadpisać → wyścig).
  const [cwd, setCwd] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('cwd') ?? '';
    } catch {
      return '';
    }
  }); // relative under /drive/
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  // Forward declaration for the paste shortcut: the keyboard handler is
  // attached before `paste` is in scope, and going through a ref avoids the
  // temporal-dead-zone cycle that a direct dependency would create.
  const pasteRef = useRef<() => void>(() => {});
  const [entries, setEntries] = useState<VfsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Upload progress dialog state. `done` counts files already finished,
  // `currentName` is the file mid-flight, `currentPct` its byte progress.
  // Total file count is `done + (currentName ? 1 : 0) + remaining` — but
  // we keep the `total` field so the overall bar doesn't jump backwards
  // when the dialog closes.
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
    currentName: string | null;
    currentPct: number;
    failed: number;
  } | null>(null);
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, msg: '', severity: 'success' });
  const [menuFor, setMenuFor] = useState<{
    anchor: HTMLElement | null;
    entry: VfsEntry;
    pos?: { top: number; left: number };
  } | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameDialog, setRenameDialog] = useState<{ entry: VfsEntry; value: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Clipboard for cut/copy/paste. `mode` decides whether paste moves (cut) or duplicates (copy).
  const [clipboard, setClipboard] = useState<{
    entry: VfsEntry;
    sourceDir: string;
    mode: 'copy' | 'cut';
  } | null>(null);
  // View dialog state. textContent is set only when the MIME maps to a text-like format
  // OR the filename matches a recognised code-file extension — the Monaco editor
  // in the right panel uses textContent as its initial value.
  const [viewing, setViewing] = useState<{
    entry: VfsEntry;
    mime: string;
    textContent?: string;
    bytes?: Uint8Array;
  } | null>(null);
  // Git repo panel state — set when a `.repo.json` file is opened. `path` is the
  // .repo.json path relative to the user's drive root (e.g. `myrepo/.repo.json`).
  // Graphical (schema form) editor for a `.json` file. `rel` is drive-relative.
  // "Zmień schema" dialog — bound to the json file at `rel`; `current` is its
  // existing $schema binding (or null).
  // When a file is opened by clicking an embedded File component, remember the
  // source markdown so the opened editor can offer a "← back to markdown" button.
  // "New empty file" dialog. Just a name field — content is empty bytes.
  const [newFileDialog, setNewFileDialog] = useState<{ name: string; presetKey: string } | null>(
    null
  );
  // The upload paths trigger a hidden <input type="file">: one in the header,
  // one inside the staging dialog. A single shared ref would mean the dialog's
  // button reopening the header's picker while the dialog is over it.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogFileInputRef = useRef<HTMLInputElement>(null);
  // "Create from clipboard" dialog. `kind` distinguishes between system clipboard text
  // (editable in a textarea) and an image blob (rendered as a preview, name editable).
  const [clipboardCreateDialog, setClipboardCreateDialog] = useState<{
    name: string;
    kind: 'text' | 'image';
    textContent: string;
    imageB64: string;
    imageMime: string;
  } | null>(null);
  // [port] dropped — the MJD editor and the Qt UI designer, and the providers they needed

  // ── Right-panel code editor: full workspace ──────────────────────────────
  /** The file open in the host's editor, if any. */
  const [editing, setEditing] = useState<DriveFileRef | null>(null);

  /** Everything the page says to the user in passing, in one place. */
  const toast = useCallback((msg: string, severity: 'success' | 'error' | 'info' = 'success') => {
    setSnack({ open: true, msg, severity });
  }, []);

  // The right-hand panel, filling the window.
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  // The "more actions" menu of the toolbar.
  const [actionsMenu, setActionsMenu] = useState<HTMLElement | null>(null);
  // Files chosen for upload, waiting in the dialog.
  const [uploadDialog, setUploadDialog] = useState<{ files: File[] } | null>(null);

  // [port] dropped — the embedded Monaco workspace, its plugins, the
  // in-browser script runner, the scene panel and the Qt loader. They are
  // `@hestia/ui-texteditor` now and reach this page through the `DriveEditor`
  // capability; with none passed, the page offers no editing.
  // Favorites — per-user list of file paths (relative to /drive/). Stored
  // in VFS as `drive/.favorites.json` so it syncs across devices. The
  // collapse state is per-device though, so it lives in localStorage —
  // someone might want favorites hidden on phone but visible on desktop.
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favLoaded, setFavLoaded] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('drive_favs_open') !== '0';
    } catch {
      return true;
    }
  });
  // Beside the other two sidecars, and at the drive's own root: MyCastle's
  // `drive/` prefix was one level of its own layout, and the host's VFS decides
  // where the root is here — keeping the prefix put the favourites in a
  // subdirectory that then showed up in the listing as a folder.
  const FAV_PATH = '.favorites.json';

  // ── File properties (tags + future per-file metadata) ───────────────
  // Single source of truth for the whole drive; persisted as
  // `.fileproperties.json` in drive root. State is the IN-MEMORY mirror —
  // saved on every Properties-dialog "Zapisz".
  const [fileProperties, setFileProperties] = useState<FileProperties>(EMPTY_FILE_PROPS);
  const [fpLoaded, setFpLoaded] = useState(false);
  // Active Properties dialog (null = closed). `rel` is captured at open so a
  // background refresh / cwd change doesn't affect the dialog target.
  // `tags` is the draft list — committed only on Save.
  const [propsDialog, setPropsDialog] = useState<{ entry: VfsEntry; rel: string } | null>(null);
  const [propsDraftTags, setPropsDraftTags] = useState<string[]>([]);
  const [propsDraftTagInput, setPropsDraftTagInput] = useState('');
  // Cron schedules (rel → {cron, enabled}); draft fields edited in Properties.
  const [schedules, setSchedules] = useState<DriveSchedules>({});
  /** Saved view settings, by file path. Loaded with the other sidecars. */
  const [viewSettingsMap, setViewSettingsMap] = useState<ViewSettingsMap>({});
  const [viewSettingsAnchor, setViewSettingsAnchor] = useState<HTMLElement | null>(null);
  const [propsDraftCron, setPropsDraftCron] = useState('');
  const [propsDraftCronEnabled, setPropsDraftCronEnabled] = useState(false);
  const [propsDraftStartup, setPropsDraftStartup] = useState(false);

  // Full-text search dialog — closed by default; opened from the
  // "Search" button in the header. Reset on close happens inside the
  // dialog component itself.
  const [searchOpen, setSearchOpen] = useState(false);

  // Preview-navigation derived state — only file entries (directories are
  // navigated by double-click into them, not previewed).
  const fileEntries = useMemo(() => entries.filter((e) => e.type === FILE_TYPE), [entries]);
  const currentPreviewIdx = viewing
    ? fileEntries.findIndex((e) => e.name === viewing.entry.name)
    : -1;
  const hasPrev = currentPreviewIdx > 0;
  const hasNext = currentPreviewIdx >= 0 && currentPreviewIdx < fileEntries.length - 1;

  // Layout flags. The right panel embed kicks in at tablet portrait (≥sm,
  // ~600px) — small phones in portrait still fall back to the full-screen
  // Dialog because the sidebar+panel can't both fit comfortably below 600px.
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('sm'));
  // Below `md` (mobile and tablet portrait) the preview toolbar is too narrow
  // to hold every action button — collapse copy/edit/download into a kebab menu.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [viewActionsMenu, setViewActionsMenu] = useState<HTMLElement | null>(null);
  // Read-only log viewer (Drive → Logs). Shows drive/.logs/{rel}.log content.
  const [logsView, setLogsView] = useState<{ rel: string; content: string } | null>(null);
  const panelOpen = !!(viewing || editing || logsView);

  // Exactly ONE right-side panel may be open at a time. Every opener calls this
  // first, so a new panel never renders stacked next to a stale one (the bug
  // where two panels showed side by side). Aborts any in-flight run stream too.
  // Does NOT touch panelFullscreen — closeRightPanel handles that on close.
  /**
   * The same files, in the shape the capabilities speak.
   *
   * The page works on a `DriveVfs` (MyCastle's operations, kept as they were);
   * an editor, an assistant or a viewer is handed a `DriveStore`, which is the
   * smaller contract `@hestia/ui-core` describes. One object built from the
   * other, rather than two things for the host to supply and keep in step.
   */
  const driveStoreForCapabilities = useMemo<DriveStore>(
    () => ({
      startDir,
      list: async (dir) =>
        (await vfs.list(dir)).map((e) => ({
          name: e.name,
          directory: e.type === DIR_TYPE,
          size: e.size,
          modified: e.mtime,
        })),
      read: async (path) => asText(await vfs.readFile(path)),
      readBytes: (path) => vfs.readFile(path),
      write: (path, content) => vfs.writeFile(path, fromText(content)),
      ...(vfs.delete ? { remove: (path: string) => vfs.delete!(path, false) } : {}),
      ...(vfs.rename ? { rename: (from: string, to: string) => vfs.rename!(from, to) } : {}),
      ...(vfs.mkdir ? { createDir: (path: string) => vfs.mkdir!(path) } : {}),
      ...(vfs.downloadUrl ? { urlFor: (path: string) => vfs.downloadUrl!(path) } : {}),
    }),
    [startDir, vfs]
  );

  /**
   * Opens a file in the host's editor.
   *
   * MyCastle had one handler per editor — Markdown, MJD, JSON schema, the
   * dashboard, Qt. Here there is one capability, and whether a given file opens
   * in it is the editor's own answer (`canEdit`). With no editor passed this
   * does nothing at all, and the entries that call it are not drawn.
   */
  const openInEditor = useCallback(
    (entry: VfsEntry, relOverride?: string) => {
      if (!editor) return;
      const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
      const file: DriveFileRef = { path: rel, name: entry.name, store: driveStoreForCapabilities };
      if (!editor.canEdit(file)) return;
      setViewing(null);
      setEditing(file);
    },
    [cwd, editor, driveStoreForCapabilities]
  );

  const resetPanels = useCallback(() => {
    setViewing(null);
    setEditing(null);
    setLogsView(null);
  }, []);

  const closeRightPanel = useCallback(() => {
    resetPanels();
    setPanelFullscreen(false);
  }, [resetPanels]);

  /**
   * The log a scheduled script left behind, from `.logs/{path}.log`.
   *
   * MyCastle read this over an endpoint of its own; it is an ordinary file on
   * the drive, so here it goes through the VFS like everything else. Whoever
   * runs the script writes the file — the drive only reads it.
   */
  const openLogs = useCallback(
    async (rel: string) => {
      resetPanels();
      setLogsView({ rel, content: '…' });
      const content = await readTextOrNull(vfs, `.logs/${rel}.log`);
      setLogsView({
        rel,
        // An absent log and an empty one are different states, and saying so
        // saves the reader from wondering whether the script ran at all.
        content:
          content === null
            ? '(brak logów — uruchom skrypt albo poczekaj na cron)'
            : content === ''
              ? '(pusty log)'
              : content,
      });
    },
    [vfs, resetPanels]
  );

  const clearLogs = useCallback(
    async (rel: string) => {
      try {
        await vfsWriteFile(vfs, `.logs/${rel}.log`, fromText('')); // empty file = cleared
        setLogsView((prev) =>
          prev && prev.rel === rel ? { ...prev, content: '(wyczyszczono)' } : prev
        );
        toast('Wyczyszczono logi');
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [vfs, toast]
  );

  /**
   * Opens (creating on the first visit of the day) today's journal entry,
   * `Calendar/{year}/{month}/{day}.md`, and opens it in the host's editor.
   *
   * Nothing here is MyCastle's but the convention: the folders and the file are
   * ordinary VFS operations, and what opens the file is the `editor`
   * capability, so a host without one still gets the file created.
   */
  const openTodayJournal = useCallback(async () => {
    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const folderRel = `Calendar/${yyyy}/${mm}`;
    const fileName = `${dd}.md`;
    const rel = `${folderRel}/${fileName}`;

    try {
      // mkdir fails when the directory is there, which is the "create if
      // missing" we want — the failure is swallowed on purpose.
      await vfsMkdir(vfs, 'Calendar').catch(() => {});
      await vfsMkdir(vfs, `Calendar/${yyyy}`).catch(() => {});
      await vfsMkdir(vfs, folderRel).catch(() => {});

      // The template is written only on the first open of the day; an entry
      // already begun is never clobbered.
      if (!(await vfsStat(vfs, rel))) {
        const weekday = today.toLocaleDateString('pl-PL', { weekday: 'long' });
        await vfsWriteFile(vfs, rel, fromText(`# ${yyyy}-${mm}-${dd} (${weekday})\n\n`));
        toast(`Utworzono dziennik na dziś — ${yyyy}-${mm}-${dd}`);
      }

      // Jump the listing to the month so closing the editor leaves the reader
      // among the other days of that week.
      setCwd(folderRel);
      openInEditor({ name: fileName, type: FILE_TYPE }, rel);
    } catch (err) {
      toast(`Błąd otwarcia dziennika: ${(err as Error).message}`, 'error');
    }
  }, [vfs, openInEditor, toast]);

  /** Copies the address at which the host serves a public file. */
  const copyPublicUrl = useCallback(
    async (entry: VfsEntry, relOverride?: string) => {
      const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
      if (!isPublic(vfs, rel)) {
        toast('Ten plik nie jest publiczny — nie ma adresu do skopiowania', 'error');
        return;
      }
      const url = publicUrl(vfs, rel);
      toast((await copyTextToClipboard(url)) ? 'Link skopiowany do schowka' : url, 'info');
    },
    [vfs, cwd, toast]
  );

  // The editor/preview panel now opens inline on every screen size. On a phone
  // it takes over the whole viewport (the file list hides while it is open).
  const showRightPanel = panelOpen;
  const showSidebar = !((isWide && panelFullscreen) || (!isWide && panelOpen));
  // The assistant sits beside the listing, and the drive owns only the button
  // and the column — what is drawn inside comes from the capability.
  const [showAgent, setShowAgent] = useState(false);

  // ── Initial mkdir + refresh ─────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    const requested = cwd; // snapshot — odrzuć wynik, jeśli cwd zmienił się w międzyczasie
    try {
      // Make sure /drive/ exists at all — first-time users won't have it.
      if (cwd === '') {
        await vfsMkdir(vfs, '').catch(() => {
          /* already exists */
        });
      }
      const list = await vfsListDir(vfs, cwd);
      // Guard przeciw wyścigowi: nie nadpisuj listy, jeśli użytkownik jest już w innym katalogu.
      if (cwdRef.current === requested) setEntries(list);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      if (cwdRef.current === requested) setLoading(false);
    }
  }, [cwd, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      if (
        newFolderDialog ||
        renameDialog ||
        menuFor ||
        viewing ||
        newFileDialog ||
        clipboardCreateDialog
      )
        return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'v') {
        e.preventDefault();
        pasteRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [newFolderDialog, renameDialog, menuFor, viewing, newFileDialog, clipboardCreateDialog]);

  // The listing, on mount and on every change of directory. `refresh` is a
  // `useCallback` over `cwd`, so a new directory is a new function and this
  // runs again — without it `loading` stays true for ever and the page is a
  // spinner over a drive that answers perfectly well.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // [port] dropped — the schema editor is not part of this package

  // [port] dropped — the Markdown editor is not part of this package

  // [port] dropped — importing Markdown bundles needs JSZip

  // [port] dropped — importing Markdown bundles needs JSZip

  /**
   * Favourites and the per-file properties live on the drive, not in this
   * browser — they follow the user between devices. Both are read once on
   * mount; a missing file is an ordinary first visit, not a failure.
   */
  useEffect(() => {
    if (favLoaded) return;
    let cancelled = false;
    readJson<{ favorites?: string[] }>(vfs, FAV_PATH, {})
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.favorites)) {
          setFavorites(new Set(data.favorites.filter((x) => typeof x === 'string')));
        }
      })
      .catch((err) => console.warn('[Drive] favorites load failed:', err))
      .finally(() => {
        if (!cancelled) setFavLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, favLoaded]);

  // Saved after a short delay, so starring several files in a row is one write
  // rather than one per click — and never before the first read has finished,
  // which would put an empty set over what is on the disk.
  useEffect(() => {
    if (!favLoaded) return;
    const t = setTimeout(() => {
      void vfsWriteFile(
        vfs,
        FAV_PATH,
        fromText(JSON.stringify({ favorites: Array.from(favorites).sort() }, null, 2))
      ).catch((err) => console.warn('[Drive] favorites save failed:', err));
    }, 300);
    return () => clearTimeout(t);
  }, [favorites, favLoaded, vfs]);

  // The properties are saved by the dialog's own Save, so there is no
  // auto-save counterpart here.
  useEffect(() => {
    if (fpLoaded) return;
    let cancelled = false;
    loadFileProperties(vfs)
      .then((props) => {
        if (!cancelled) setFileProperties(props);
      })
      .catch((err) => console.warn('[Drive] fileProperties load failed:', err))
      .finally(() => {
        if (!cancelled) setFpLoaded(true);
      });
    loadSchedules(vfs)
      .then((sched) => {
        if (!cancelled) setSchedules(sched);
      })
      .catch(() => {});
    loadViewSettings(vfs)
      .then((m) => {
        if (!cancelled) setViewSettingsMap(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vfs, fpLoaded]);

  // Collapsed or not is a per-device preference, so it stays in this browser.
  useEffect(() => {
    try {
      localStorage.setItem('drive_favs_open', favoritesOpen ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [favoritesOpen]);

  // A closed panel must not stay "fullscreen": reopening it would hide the
  // listing with no way back to it.
  useEffect(() => {
    if (!panelOpen) setPanelFullscreen(false);
  }, [panelOpen]);

  // The same when the window narrows past `md` — the sidebar would vanish
  // entirely, with neither a dialog nor the list to return to.
  useEffect(() => {
    if (!isWide) setPanelFullscreen(false);
  }, [isWide]);

  /** What the editor should show this file as — empty until something is set. */
  const viewSettingsFor = useCallback(
    (rel: string): ViewSettings => viewSettingsMap[rel] ?? {},
    [viewSettingsMap]
  );

  /**
   * Flips one switch for one file and writes the whole map back.
   *
   * Saved immediately rather than debounced: a switch is flipped rarely and
   * deliberately, and the reader who flips it then closes the tab expects it
   * to be there next time.
   */
  const setViewSetting = useCallback(
    (rel: string, key: string, value: boolean) => {
      setViewSettingsMap((prev) => {
        const next = { ...prev, [rel]: { ...(prev[rel] ?? {}), [key]: value } };
        void saveViewSettings(vfs, next).catch((err) =>
          console.warn('[Drive] view settings save failed:', err)
        );
        return next;
      });
    },
    [vfs]
  );

  const isFavorite = useCallback((rel: string) => favorites.has(rel), [favorites]);

  // Toggle ulubionego po pełnej ścieżce (nie zależy od cwd) — używane w okienku Ulubione.
  const toggleFavoritePath = useCallback(
    (rel: string, name: string) => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(rel)) {
          next.delete(rel);
          toast(`Usunięto z ulubionych: ${name}`, 'info');
        } else {
          next.add(rel);
          toast(`Dodano do ulubionych: ${name}`);
        }
        return next;
      });
    },
    [toast]
  );

  const toggleFavorite = useCallback(
    (entry: VfsEntry) => {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(rel)) {
          next.delete(rel);
          toast(`Usunięto z ulubionych: ${entry.name}`, 'info');
        } else {
          next.add(rel);
          toast(`Dodano do ulubionych: ${entry.name}`);
        }
        return next;
      });
    },
    [cwd, toast]
  );

  // ── Properties dialog ────────────────────────────────────────────────
  // Open: snapshot the current tag list for this file into the dialog draft.
  // Tag input is cleared so the user sees a clean field.
  const openPropertiesDialog = useCallback(
    (entry: VfsEntry) => {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      setPropsDialog({ entry, rel });
      setPropsDraftTags(fileProperties.tags[rel] ?? []);
      setPropsDraftTagInput('');
      const sched = schedules[rel];
      setPropsDraftCron(sched?.cron ?? '');
      setPropsDraftCronEnabled(sched?.enabled ?? false);
      setPropsDraftStartup(sched?.runAtStartup ?? false);
    },
    [cwd, fileProperties.tags, schedules]
  );

  // Add the in-progress text input as a chip (Enter or "+" button). Rejects
  // empties and duplicates silently. Commas would split a tag on the next
  // serialization round-trip, so they're normalised to '-'.
  const commitDraftTag = useCallback(() => {
    const trimmed = propsDraftTagInput.trim();
    if (!trimmed) return;
    const safe = trimmed.replace(/,/g, '-');
    setPropsDraftTags((prev) => (prev.includes(safe) ? prev : [...prev, safe]));
    setPropsDraftTagInput('');
  }, [propsDraftTagInput]);

  // Save handler — atomic update of the on-disk index. Empty tag list is
  // stored as "key removed" so the JSON stays clean instead of accumulating
  // empty arrays for every file the user ever opened the dialog on.
  const saveProperties = useCallback(async () => {
    if (!propsDialog) return;
    const next: FileProperties = { ...fileProperties, tags: { ...fileProperties.tags } };
    if (propsDraftTags.length === 0) {
      delete next.tags[propsDialog.rel];
    } else {
      next.tags[propsDialog.rel] = [...propsDraftTags];
    }
    setFileProperties(next);
    try {
      await saveFileProperties(vfs, next);
      // Schedule (only for runnable JS files). Empty cron = remove the entry.
      if (isRunnable(propsDialog.entry.name)) {
        const nextSched: DriveSchedules = { ...schedules };
        const cronStr = propsDraftCron.trim();
        if (cronStr || propsDraftStartup) {
          nextSched[propsDialog.rel] = {
            cron: cronStr,
            enabled: propsDraftCronEnabled,
            runAtStartup: propsDraftStartup,
          };
        } else {
          delete nextSched[propsDialog.rel];
        }
        setSchedules(nextSched);
        await saveSchedules(vfs, nextSched);
      }
      toast(`Zapisano właściwości: ${propsDialog.entry.name}`);
      setPropsDialog(null);
    } catch (err) {
      toast(`Nie udało się zapisać właściwości: ${(err as Error).message}`, 'error');
    }
  }, [
    propsDialog,
    propsDraftTags,
    fileProperties,
    toast,
    schedules,
    propsDraftCron,
    propsDraftCronEnabled,
    propsDraftStartup,
  ]);

  // Forward-declared ref for opening files in MdEditor — set below once
  // `openInMdEditor` is in scope. Avoids the TDZ cycle that would otherwise
  // happen because `goToFavorite` is wired into render before openInMdEditor
  // is declared.
  // [port] dropped — jumping to a favourite went through the Markdown editor and the router
  // sets cwd to the folder, then opens the file (MdEditor for .md/.txt,
  // preview for everything else). Skips already-deleted favorites with
  // a friendly toast instead of a hard error.
  const goToFavorite = useCallback(
    async (rel: string) => {
      const lastSlash = rel.lastIndexOf('/');
      const folder = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
      const fileName = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
      const exists = await vfsStat(vfs, rel);
      if (!exists) {
        toast(`Ulubiony element już nie istnieje: ${rel} — usuń z listy`, 'error');
        return;
      }
      // Katalog w ulubionych → po prostu wejdź do niego (nie otwieraj jako plik).
      if (exists.type === DIR_TYPE) {
        resetPanels();
        setCwd(rel);
        return;
      }
      setCwd(folder);
      const entry: VfsEntry = { name: fileName, type: FILE_TYPE };
      // MyCastle chose between four editors by extension here. The editor now
      // answers for itself, and anything it will not take is previewed.
      if (
        editor &&
        editor.canEdit({ path: rel, name: fileName, store: driveStoreForCapabilities })
      ) {
        openInEditor(entry, rel);
      } else {
        // Inline read → setViewing (same as double-click on a file row).
        try {
          const loaded = await readForPreview(vfs, rel, fileName);
          resetPanels();
          setViewing({ entry, ...loaded });
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      }
    },
    [toast, resetPanels]
  );

  // [port] dropped — exporting Markdown bundles needs JSZip

  // ── Operations ──────────────────────────────────────────────────────────
  // Open a `.json` file in the graphical schema form editor (right panel).
  // Declared before onOpen so onOpen can reference it without a TDZ cycle.
  // [port] dropped — the JSON-schema form editor is not part of this package

  const onOpen = useCallback(
    (entry: VfsEntry) => {
      if (entry.type === DIR_TYPE) {
        setCwd((p) => (p ? `${p}/${entry.name}` : entry.name));
        return;
      }

      // MyCastle branched here on the extension — a schema editor, MJD, Markdown,
      // a dashboard, a git panel, a Qt designer — each opening a panel of its own.
      // The editor answers for itself now, and everything else is previewed.
      if (
        editor &&
        editor.canEdit({
          path: cwd ? `${cwd}/${entry.name}` : entry.name,
          name: entry.name,
          store: driveStoreForCapabilities,
        })
      ) {
        openInEditor(entry);
        return;
      }

      // Other files → preview / Monaco editor (matches OS file managers more
      // closely than auto-download; user can still hit "Pobierz" from the menu).
      void (async () => {
        try {
          const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
          const loaded = await readForPreview(vfs, rel, entry.name);
          resetPanels();
          setViewing({ entry, ...loaded });
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      })();
    },
    [cwd, toast, resetPanels]
  );

  const onDownload = useCallback(
    async (entry: VfsEntry, relOverride?: string) => {
      try {
        await downloadFile(
          vfs,
          relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name),
          entry.name
        );
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [cwd, toast]
  );

  // Nazwa pakowanego katalogu (≠ null ⇒ pokazujemy overlay ze spinnerem).
  // A run is a session, and the console below the panel is its output. The
  // session lives in a ref because a timer that fires after "Stop" must see
  // the stop, not the value React captured when the run began.
  const [scriptRunning, setScriptRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const scriptSessionRef = useRef<ScriptSession | null>(null);

  /**
   * The npm project the open `package.json` describes — its scripts and the
   * tool that builds it. Null whenever something else is open, or when the host
   * cannot run anything, in which case there is nothing to offer.
   */
  const [npmProject, setNpmProject] = useState<{
    dir: string;
    scripts: Record<string, string> | null;
    manager: DetectedManager;
  } | null>(null);
  const [npmMenu, setNpmMenu] = useState<HTMLElement | null>(null);
  const [npmScriptsOpen, setNpmScriptsOpen] = useState(false);

  /** Name of the folder being packed — non-null while the overlay is up. */
  const [zipping, setZipping] = useState<string | null>(null);

  /**
   * Packs a folder into an archive **beside it, on the drive** — the files
   * never leave the server. Unlike "download as ZIP", which is this followed by
   * a download of the result.
   */
  const packEntry = useCallback(
    async (entry: VfsEntry) => {
      if (!vfs.zipPack) return;
      try {
        // A unique name, so packing twice gives two archives instead of quietly
        // overwriting the first.
        const fileName = await uniqueName(vfs, cwd, archiveNameFor(entry.name));
        const source = cwd ? `${cwd}/${entry.name}` : entry.name;
        const destination = cwd ? `${cwd}/${fileName}` : fileName;
        await vfs.zipPack(source, destination);
        toast(`Spakowano do „${fileName}"`);
        await refresh();
      } catch (err) {
        toast(`Nie udało się spakować: ${(err as Error).message}`, 'error');
      }
    },
    [vfs, cwd, refresh, toast]
  );

  const unpackEntry = useCallback(
    async (entry: VfsEntry) => {
      if (!vfs.zipUnpack) return;
      try {
        // Same reasoning: unpacking twice gives two directories rather than
        // mixing the new contents into the old ones.
        const folder = await uniqueName(vfs, cwd, folderNameFor(entry.name));
        const archive = cwd ? `${cwd}/${entry.name}` : entry.name;
        const destination = cwd ? `${cwd}/${folder}` : folder;
        await vfs.zipUnpack(archive, destination);
        toast(`Rozpakowano do „${folder}"`);
        await refresh();
      } catch (err) {
        toast(`Nie udało się rozpakować: ${(err as Error).message}`, 'error');
      }
    },
    [vfs, cwd, refresh, toast]
  );

  /**
   * Packs a folder and downloads the result.
   *
   * MyCastle zipped this one in the browser; here the host does the packing and
   * the page downloads what came out, then removes it. The archive is written
   * to the drive for a moment — with a name of its own, so a failure leaves
   * something the user can find and delete rather than a mystery.
   */
  const downloadFolderZip = useCallback(
    async (entry: VfsEntry) => {
      if (!vfs.zipPack) return;
      setZipping(entry.name);
      const fileName = await uniqueName(vfs, cwd, archiveNameFor(entry.name));
      const destination = cwd ? `${cwd}/${fileName}` : fileName;
      try {
        await vfs.zipPack(cwd ? `${cwd}/${entry.name}` : entry.name, destination);
        downloadFile(vfs, destination, fileName);
        // The download reads the file, so removing it immediately would race it.
        // A moment is enough, and a leftover is visible in the listing anyway.
        setTimeout(() => {
          void vfs.delete?.(destination, false).catch(() => {});
        }, 5000);
      } catch (err) {
        toast(`Nie udało się spakować: ${(err as Error).message}`, 'error');
      } finally {
        setZipping(null);
        await refresh();
      }
    },
    [vfs, cwd, refresh, toast]
  );

  const onDelete = useCallback(
    async (entry: VfsEntry) => {
      const kind = entry.type === DIR_TYPE ? 'katalog' : 'plik';
      if (
        !confirm(
          `Usunąć ${kind} "${entry.name}"${entry.type === DIR_TYPE ? ' i całą jego zawartość' : ''}?`
        )
      )
        return;
      try {
        await vfsDelete(vfs, cwd ? `${cwd}/${entry.name}` : entry.name, entry.type === DIR_TYPE);
        toast(`Usunięto "${entry.name}"`);
        await refresh();
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [cwd, refresh, toast]
  );

  const doRename = useCallback(async () => {
    if (!renameDialog) return;
    const newName = renameDialog.value.trim();
    if (!newName || newName === renameDialog.entry.name) {
      setRenameDialog(null);
      return;
    }
    if (newName.includes('/')) {
      toast('Nazwa nie może zawierać "/"', 'error');
      return;
    }
    try {
      const oldRel = cwd ? `${cwd}/${renameDialog.entry.name}` : renameDialog.entry.name;
      const newRel = cwd ? `${cwd}/${newName}` : newName;
      await vfsRename(vfs, oldRel, newRel);
      toast(`Zmieniono nazwę na "${newName}"`);
      setRenameDialog(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [renameDialog, cwd, refresh, toast]);

  const doMkdir = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || name.includes('/')) {
      toast('Nazwa katalogu nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    try {
      await vfsMkdir(vfs, cwd ? `${cwd}/${name}` : name);
      toast(`Utworzono katalog "${name}"`);
      setNewFolderDialog(false);
      setNewFolderName('');
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [newFolderName, cwd, refresh, toast]);

  const moveToPublic = useCallback(
    async (entry: VfsEntry) => {
      if (isPublic(vfs, cwd ? `${cwd}/${entry.name}` : entry.name)) {
        toast('Plik jest już w katalogu publicznym', 'info');
        return;
      }
      try {
        await vfsMkdir(vfs, 'public').catch(() => {
          /* exists */
        });
        const oldRel = cwd ? `${cwd}/${entry.name}` : entry.name;
        await vfsRename(vfs, oldRel, `public/${entry.name}`);
        toast(`Przeniesiono "${entry.name}" do public/`);
        await refresh();
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [cwd, refresh, toast]
  );

  // ── Cut / Copy / Paste ────────────────────────────────────────────────

  const copyToClipboard = useCallback(
    (entry: VfsEntry, mode: 'copy' | 'cut') => {
      setClipboard({ entry, sourceDir: cwd, mode });
      const verb = mode === 'cut' ? 'Wycięto' : 'Skopiowano';
      toast(`${verb} "${entry.name}" — wklej w wybranym katalogu (Wklej / ⌘V)`, 'info');
    },
    [cwd, toast]
  );

  const paste = useCallback(async () => {
    if (!clipboard) return;
    try {
      const sourceRel = clipboard.sourceDir
        ? `${clipboard.sourceDir}/${clipboard.entry.name}`
        : clipboard.entry.name;
      // Same-dir paste needs a new name to avoid clobbering the source.
      const destName =
        clipboard.sourceDir === cwd
          ? await uniqueName(vfs, cwd, clipboard.entry.name)
          : await uniqueName(vfs, cwd, clipboard.entry.name);
      const destRel = cwd ? `${cwd}/${destName}` : destName;

      if (clipboard.mode === 'cut') {
        // Move via rename (works across dirs in the same VFS root)
        await vfsRename(vfs, sourceRel, destRel);
        toast(`Przeniesiono "${clipboard.entry.name}" → "${destName}"`);
      } else {
        await vfsCopy(vfs, sourceRel, destRel);
        toast(`Skopiowano "${clipboard.entry.name}" → "${destName}"`);
      }
      // Cut: clipboard consumed. Copy: preserved so user can paste multiple times.
      if (clipboard.mode === 'cut') setClipboard(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [clipboard, cwd, refresh, toast]);

  useEffect(() => {
    pasteRef.current = () => {
      void paste();
    };
  }, [paste]);

  // ── View / Open / Create ────────────────────────────────────────────────

  const viewFile = useCallback(
    async (entry: VfsEntry, relOverride?: string) => {
      if (entry.type !== FILE_TYPE) return;
      try {
        const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
        const loaded = await readForPreview(vfs, rel, entry.name);
        resetPanels();
        setViewing({ entry, ...loaded });
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [cwd, toast, resetPanels]
  );

  const doCreateEmpty = useCallback(async () => {
    if (!newFileDialog) return;
    const rawName = newFileDialog.name.trim();
    if (!rawName || rawName.includes('/')) {
      toast('Nazwa nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    // The preset's extension is applied when the name lacks it — typing
    // "config" with YAML selected creates "config.yaml".
    const preset = FILE_PRESETS.find((pr) => pr.key === newFileDialog.presetKey) ?? FILE_PRESETS[0];
    const name = applyExtension(rawName, preset.extension);
    try {
      const rel = cwd ? `${cwd}/${name}` : name;
      if (await vfsStat(vfs, rel)) {
        toast(`Plik "${name}" już istnieje — wybierz inną nazwę`, 'error');
        return;
      }
      await vfsWriteFile(vfs, rel, fromText(''));
      toast(`Utworzono "${name}"`);
      setNewFileDialog(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [newFileDialog, vfs, cwd, refresh, toast]);

  /**
   * A filename for pasted text, guessed from what the text looks like.
   *
   * Used when the dialog opens and again after a manual paste, which is the
   * only path a phone has.
   */
  const suggestNameForText = (text: string): string => {
    const trim = text.trim();
    if (!trim) return 'clipboard.txt';
    if (trim.startsWith('#')) return 'clipboard.md';
    if (
      (trim.startsWith('{') && trim.endsWith('}')) ||
      (trim.startsWith('[') && trim.endsWith(']'))
    )
      return 'clipboard.json';
    if (trim.startsWith('<') && trim.endsWith('>')) return 'clipboard.xml';
    return 'clipboard.txt';
  };

  /**
   * Steps through the files of this directory while previewing.
   *
   * Goes through `viewFile`, so reading, the MIME guess and the state swap
   * stay in one place.
   */
  const navigatePreview = useCallback(
    async (delta: number) => {
      if (!viewing || currentPreviewIdx < 0) return;
      const target = fileEntries[currentPreviewIdx + delta];
      if (!target) return;
      await viewFile(target);
    },
    [viewing, currentPreviewIdx, fileEntries, viewFile]
  );

  // Arrows step through the preview and Escape closes it — but not while the
  // focus is in a text field, and not over an open dialog or menu, where the
  // same keys mean something else.
  useEffect(() => {
    if (!viewing) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (
        newFolderDialog ||
        renameDialog ||
        menuFor ||
        newFileDialog ||
        clipboardCreateDialog ||
        actionsMenu
      )
        return;
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        void navigatePreview(-1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        void navigatePreview(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeRightPanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    viewing,
    hasPrev,
    hasNext,
    navigatePreview,
    closeRightPanel,
    newFolderDialog,
    renameDialog,
    menuFor,
    newFileDialog,
    clipboardCreateDialog,
    actionsMenu,
  ]);

  // [port] dropped — binding a JSON schema belonged to the schema form editor

  // [port] dropped — the schema dialog belonged to the schema form editor

  // Open .md in MdEditor.
  //   - Tablet portrait + desktop (≥sm): inline split-view inside DrivePage —
  //     Drive listing on the left, MdEditor on the right. Fullscreen toggle
  //     hides the left side.
  //   - Phone portrait (<sm): new tab to `/editor/md/{path}` (MdEditorPage uses
  //     `mqttClient.readFile` which resolves against ROOT_DIR, hence the full path).
  // `relOverride` lets callers (Today journal, etc.) point at a file that
  // isn't in the current cwd without first navigating there. When omitted
  // we fall back to the per-entry cwd-based path, preserving existing
  // call sites that pass just an entry from the file list.
  // [port] dropped — the Markdown editor is not part of this package

  // [port] dropped — opening a file outside the drive belonged to MyCastle's PIM
  // e.g. a Notes file `md/rome.md` → `/data/Minis/Users/{u}/md/rome.md`) in the
  // same right-hand editor panel. Mirrors `openInMdEditor` but reads/writes the
  // absolute user-root path instead of the drive-scoped one.
  // [port] dropped — opening a file outside the drive belonged to MyCastle's PIM

  // [port] dropped — following a Markdown link went with the editor

  // [port] dropped — going back to the Markdown editor

  // [port] dropped — streaming a run is MyCastle's own endpoint

  // [port] dropped — absolute backend paths were what MyCastle’s editors needed

  // [port] dropped — the MJD editor is not part of this package

  // [port] dropped — the schema editor is not part of this package
  // [port] dropped — the schema editor is not part of this package

  // [port] dropped — the Markdown editor is not part of this package
  // [port] dropped — the dashboard editor is not part of this package

  // [port] dropped — npm install is MyCastle's own endpoint

  // Auto-save callback from MdEditor. Fires on debounce (2s) and on the
  // toolbar's manual save button. Idempotent — writes the whole document each time.
  // [port] dropped — the Markdown editor is not part of this package

  // [port] dropped — the daily journal belonged to MyCastle's PIM

  // [port] dropped — exporting Markdown bundles needs JSZip
  const doCreateFromClipboard = useCallback(async () => {
    if (!clipboardCreateDialog) return;
    const name = clipboardCreateDialog.name.trim();
    if (!name || name.includes('/')) {
      toast('Nazwa nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    try {
      // Auto-suffix on collision instead of failing — clipboard pastes are usually rapid.
      const finalName = await uniqueName(vfs, cwd, name);
      const rel = cwd ? `${cwd}/${finalName}` : finalName;
      const bytes =
        clipboardCreateDialog.kind === 'image'
          ? base64ToBytes(clipboardCreateDialog.imageB64)
          : fromText(clipboardCreateDialog.textContent);
      await vfsWriteFile(vfs, rel, bytes);
      toast(`Utworzono "${finalName}"`);
      setClipboardCreateDialog(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [clipboardCreateDialog, cwd, refresh, toast]);

  // Copy view-dialog text content to the system clipboard.
  const copyViewTextToSystem = useCallback(async () => {
    if (!viewing?.textContent) return;
    const ok = await copyTextToClipboard(viewing.textContent);
    if (ok) toast('Skopiowano cały tekst do schowka');
    else toast('Nie udało się skopiować — zaznacz tekst i użyj ⌘C', 'error');
  }, [viewing, toast]);

  // ── Upload (file input + drag-and-drop) ─────────────────────────────────
  const upload = useCallback(
    async (files: ReadonlyArray<File | { file: File; relPath: string }>) => {
      // Accept either a plain File[] (from <input type=file>) or a list with
      // pre-computed relative paths (from a folder drag-and-drop). Normalise
      // both into the same `{file, relPath}` shape so the upload loop below
      // doesn't need to branch.
      const arr = Array.from(files).map((item) =>
        item instanceof File ? { file: item, relPath: item.name } : item
      );
      if (arr.length === 0) return;
      // Snapshot the current directory NOW — before any await — so that if the
      // user navigates to a different folder mid-upload, all files in this batch
      // still land in the directory that was active when the upload started.
      const uploadCwd = cwd;
      // A pre-flight size check gives a useful error instead of a vague 500 from
      // whatever the host's write does with a file this large.
      const HARD_LIMIT_BYTES = 140 * 1024 * 1024;
      setUploading({ done: 0, total: arr.length, currentName: null, currentPct: 0, failed: 0 });
      // mkdir is idempotent at this layer (we ignore errors), but doing it once
      // per directory saves a round-trip per file in deep tree uploads.
      const createdDirs = new Set<string>();
      let done = 0;
      let failed = 0;
      for (const { file, relPath } of arr) {
        // Show file name + reset per-file progress before each file starts.
        // Use relPath in the display so folder uploads show 'sub/foo.js' not just 'foo.js'.
        setUploading({ done, total: arr.length, currentName: relPath, currentPct: 0, failed });
        try {
          if (file.size > HARD_LIMIT_BYTES) {
            throw new Error(
              `Plik za duży (${(file.size / 1024 / 1024).toFixed(1)} MB; limit ${(HARD_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB)`
            );
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          const rel = uploadCwd ? `${uploadCwd}/${relPath}` : relPath;
          // For files inside subdirectories, ensure every parent dir exists
          // (Node's writeFile would error on a missing parent). We walk the
          // path and mkdir each segment in order — quietly ignoring "already
          // exists" responses since the backend doesn't surface them
          // specifically.
          const lastSlash = rel.lastIndexOf('/');
          if (lastSlash > 0) {
            const segments = rel.slice(0, lastSlash).split('/');
            let acc = '';
            for (const seg of segments) {
              acc = acc ? `${acc}/${seg}` : seg;
              if (!createdDirs.has(acc)) {
                await vfsMkdir(vfs, acc).catch(() => {
                  /* already exists or race */
                });
                createdDirs.add(acc);
              }
            }
          }
          // Live byte progress via the XHR variant of vfsWriteFile.
          await vfsWriteFile(vfs, rel, bytes, (pct) => {
            setUploading((prev) => (prev ? { ...prev, currentPct: pct } : prev));
          });
        } catch (err) {
          failed++;
          const msg = (err as Error).message;
          // Detect typical "body too large" failure modes from the backend
          // and surface them with a friendlier hint than the raw HTTP code.
          const friendly = /413|too large/i.test(msg)
            ? `Plik za duży dla serwera (${(file.size / 1024 / 1024).toFixed(1)} MB) — zwiększ limit lub podziel`
            : msg;
          toast(`Błąd uploadu "${relPath}": ${friendly}`, 'error');
        }
        done++;
        setUploading((prev) => (prev ? { ...prev, done, currentPct: 100, failed } : prev));
      }
      setUploading(null);
      const ok = done - failed;
      if (ok > 0) toast(`Wgrano ${ok} z ${arr.length} plików`);
      await refresh();
    },
    [cwd, refresh, toast]
  );

  /**
   * Walk a DataTransferItemList from a drop event, recursively expanding any
   * directories. Returns a flat list of files with their relative paths
   * preserved (`sub/foo.js`).
   *
   * Uses `webkitGetAsEntry()` — the only Web API that actually exposes
   * dropped directory structure. Note that the entries become stale ~100ms
   * after the drop event, so we collect everything synchronously into
   * promises first and only await afterwards. Otherwise Chrome throws
   * `NotFoundError: A requested file or directory could not be found at
   * the time an operation was processed.` — that's the exact error from
   * the report.
   */
  const collectDroppedFiles = useCallback(
    async (items: DataTransferItemList): Promise<{ file: File; relPath: string }[]> => {
      const results: { file: File; relPath: string }[] = [];

      const readDirEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
        // readEntries returns at most ~100 entries per call; iterate until empty.
        return new Promise((resolve, reject) => {
          const all: FileSystemEntry[] = [];
          const step = () =>
            reader.readEntries((batch) => {
              if (batch.length === 0) resolve(all);
              else {
                all.push(...batch);
                step();
              }
            }, reject);
          step();
        });
      };

      const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
        new Promise((resolve, reject) => entry.file(resolve, reject));

      const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
        if (entry.isFile) {
          const file = await entryToFile(entry as FileSystemFileEntry);
          results.push({ file, relPath: prefix ? `${prefix}/${file.name}` : file.name });
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          const children = await readDirEntries(reader);
          for (const child of children) {
            await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name);
          }
        }
      };

      // Materialise entries synchronously — they become invalid if we wait.
      const entries: FileSystemEntry[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      // Now walk asynchronously — at this point we hold real entry references,
      // not items from the original event.
      for (const entry of entries) await walk(entry, '');
      return results;
    },
    []
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) void upload(Array.from(e.target.files));
      e.target.value = '';
    },
    [upload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // Use the items list (with webkitGetAsEntry) when the browser exposes
      // it — that's the only way to detect dropped folders and recursively
      // upload their contents. Falls back to plain files when items aren't
      // available (very old browsers, or items.kind!=='file' for everything).
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        void (async () => {
          try {
            const entries = await collectDroppedFiles(e.dataTransfer.items);
            if (entries.length > 0) {
              await upload(entries);
            } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              // Some browsers (Safari < 13) populate `files` but not entry-aware
              // `items`. Fall back to flat upload in that case.
              await upload(Array.from(e.dataTransfer.files));
            }
          } catch (err) {
            toast(`Nie udało się odczytać upuszczonych plików: ${(err as Error).message}`, 'error');
          }
        })();
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void upload(Array.from(e.dataTransfer.files));
      }
    },
    [upload, collectDroppedFiles, toast]
  );

  // ── Upload dialog: staging area for files before commit ────────────────

  const openUploadDialog = useCallback(() => {
    setUploadDialog({ files: [] });
  }, []);

  /** Append picked / dropped files to the staging list, skipping duplicates
   *  (same name + same size = treat as already added). */
  const addFilesToUploadDialog = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploadDialog((prev) => {
      if (!prev) return prev;
      const seen = new Set(prev.files.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev.files];
      for (const f of arr) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key);
        }
      }
      return { files: merged };
    });
  }, []);

  const removeFileFromUploadDialog = useCallback((idx: number) => {
    setUploadDialog((prev) => (prev ? { files: prev.files.filter((_, i) => i !== idx) } : prev));
  }, []);

  const onDialogFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFilesToUploadDialog(e.target.files);
      e.target.value = ''; // reset so re-picking the same file fires onChange
    },
    [addFilesToUploadDialog]
  );

  // Commit dialog: kicks the existing `upload()` pipeline with all staged
  // files in one batch, then closes the dialog on success.
  const commitUploadDialog = useCallback(async () => {
    if (!uploadDialog || uploadDialog.files.length === 0) return;
    const files = uploadDialog.files;
    setUploadDialog(null);
    await upload(files);
  }, [uploadDialog, upload]);

  // ── Breadcrumbs ─────────────────────────────────────────────────────────
  const segments = useMemo(() => (cwd ? cwd.split('/').filter(Boolean) : []), [cwd]);

  // ── Right panel content (View or MdEditor) ──────────────────────────────
  // Rendered both as embedded panel (desktop) and as Dialog content (mobile).
  // Drive-relative path of the file currently previewed (used as the workspace
  // open target — the workspace's `/` is the Drive root via SubpathFS).
  const viewingRel = viewing ? (cwd ? `${cwd}/${viewing.entry.name}` : viewing.entry.name) : '';

  /**
   * A blob URL for the bytes being previewed, revoked when they change.
   *
   * A `data:` URL would mean base64 in the document for every image opened;
   * the blob is the same bytes with an address, and the browser frees it when
   * we say so — which is what the effect below is for.
   */
  const viewingUrl = useMemo(
    () =>
      viewing?.bytes
        ? URL.createObjectURL(new Blob([viewing.bytes as BlobPart], { type: viewing.mime }))
        : '',
    [viewing?.bytes, viewing?.mime]
  );
  useEffect(
    () => () => {
      if (viewingUrl) URL.revokeObjectURL(viewingUrl);
    },
    [viewingUrl]
  );

  /**
   * The file the panel is showing, whichever panel that is.
   *
   * Every action in the toolbar was written as `viewing && …`, so opening a
   * file in the editor left a bar with a name and nothing else on it — the
   * file was the same file, only in the other panel.
   */
  const panelFile = viewing
    ? { entry: viewing.entry, rel: viewingRel, name: viewing.entry.name }
    : editing
      ? {
          entry: { name: editing.name, type: FILE_TYPE } as VfsEntry,
          rel: editing.path,
          name: editing.name,
        }
      : null;

  const stopRun = useCallback(() => {
    if (scriptSessionRef.current) stopScript(scriptSessionRef.current);
    scriptSessionRef.current = null;
    setScriptRunning(false);
  }, []);

  // A run belongs to the file it was started from: opening another one ends it,
  // and so does leaving the page. A script left running against a file nobody
  // is looking at prints into a console that says someone else's name.
  useEffect(() => stopRun, [stopRun]);
  useEffect(() => {
    stopRun();
    setConsoleOpen(false);
    setConsoleLines([]);
  }, [viewing?.entry.name, editing?.path, stopRun]);

  /**
   * Runs the open `.js`/`.ts` file and shows what it prints.
   *
   * The source comes from the editor when it has one (`prepareScript`): that
   * is where the unsaved buffer and the TypeScript compiler are. Otherwise the
   * file is read from the drive as it stands.
   */
  const runOpenScript = useCallback(async () => {
    if (!panelFile) return;
    stopRun();

    const file: DriveFileRef = {
      path: panelFile.rel,
      name: panelFile.name,
      store: driveStoreForCapabilities,
    };
    let source: string;
    try {
      source = editor?.prepareScript
        ? await editor.prepareScript(file)
        : (viewing?.textContent ?? (await readTextOrNull(vfs, panelFile.rel)) ?? '');
    } catch (err) {
      setConsoleOpen(true);
      setConsoleLines([
        { level: 'error', text: `Nie udało się przygotować skryptu: ${(err as Error).message}` },
      ]);
      return;
    }

    const session: ScriptSession = { stopped: false, timers: [] };
    scriptSessionRef.current = session;
    setConsoleLines([]);
    setConsoleOpen(true);
    setScriptRunning(true);

    const append = (line: ConsoleLine) =>
      setConsoleLines((prev) =>
        // A runaway loop must not grow the page until it stops responding; the
        // oldest lines go, because the newest are the ones being read.
        prev.length >= MAX_CONSOLE_LINES ? [...prev.slice(1), line] : [...prev, line]
      );

    try {
      const { stillRunning } = await runScript(source, session, { onLine: append });
      if (session.stopped) return;
      if (stillRunning) {
        append({ level: 'info', text: 'Działa dalej — zatrzymaj przyciskiem ⏹.' });
      } else {
        append({ level: 'info', text: '✓ gotowe' });
        stopRun();
      }
    } catch (err) {
      append({ level: 'error', text: `${(err as Error).name}: ${(err as Error).message}` });
      stopRun();
    }
  }, [panelFile, editor, viewing, vfs, driveStoreForCapabilities, stopRun]);

  useEffect(() => {
    const rel = viewing ? viewingRel : editing?.path;
    if (!vfs.runCommand || !rel || (rel.split('/').pop() ?? rel) !== 'package.json') {
      setNpmProject(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      const text = viewing?.textContent ?? (await readTextOrNull(vfs, rel)) ?? '';
      // The manager is read from what lies beside the file, which is why this
      // needs the listing of that directory and not only the file itself.
      const siblings = await vfs
        .list(dir)
        .then((e) => e.map((x) => x.name))
        .catch(() => []);
      if (cancelled) return;
      setNpmProject({
        dir,
        scripts: readPackageScripts(text),
        manager: detectPackageManager(siblings, readPackageManagerField(text)),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [vfs, viewing, viewingRel, editing?.path]);

  /** Runs one command of the project, with its output in the same console. */
  const runNpm = useCallback(
    async (command: string, args: readonly string[], title: string) => {
      if (!vfs.runCommand || !npmProject) return;
      setNpmMenu(null);
      setConsoleLines([{ level: 'info', text: `$ ${command} ${args.join(' ')}` }]);
      setConsoleOpen(true);
      setScriptRunning(true);
      try {
        const { code } = await vfs.runCommand(npmProject.dir, command, args, (line) => {
          setConsoleLines((prev) =>
            prev.length >= MAX_CONSOLE_LINES
              ? [...prev.slice(1), { level: 'log' as const, text: line }]
              : [...prev, { level: 'log' as const, text: line }]
          );
        });
        setConsoleLines((prev) => [
          ...prev,
          {
            level: code === 0 ? 'info' : 'error',
            text: code === 0 ? `✓ ${title} zakończone` : `${title} zakończone kodem ${code}`,
          },
        ]);
      } catch (err) {
        setConsoleLines((prev) => [
          ...prev,
          { level: 'error', text: `${title}: ${(err as Error).message}` },
        ]);
      } finally {
        setScriptRunning(false);
      }
    },
    [vfs, npmProject]
  );

  const viewerBody =
    viewing &&
    (isImageMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', p: 2, height: '100%', overflow: 'auto' }}>
        <img
          src={viewingUrl}
          alt={viewing.entry.name}
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 16px)' }}
        />
      </Box>
    ) : isPdfMime(viewing.mime) ? (
      <DocPreview
        viewers={viewers}
        file={{ path: viewingRel, name: viewing.entry.name, store: driveStoreForCapabilities }}
      />
    ) : isDjvuMime(viewing.mime) ? (
      <DocPreview
        viewers={viewers}
        file={{ path: viewingRel, name: viewing.entry.name, store: driveStoreForCapabilities }}
      />
    ) : isAudioMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <Box component="audio" controls src={viewingUrl} sx={{ width: '100%', maxWidth: 500 }} />
      </Box>
    ) : isVideoMime(viewing.mime) ? (
      <Box
        component="video"
        controls
        src={viewingUrl}
        sx={{ width: '100%', maxHeight: '100%', display: 'block' }}
      />
    ) : (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Plik binarny <code>{viewing.mime}</code> (~{formatBytes(viewing.bytes?.byteLength)}) —
          podgląd niedostępny w przeglądarce. Pobierz, aby otworzyć w odpowiedniej aplikacji.
        </Alert>
      </Box>
    ));

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    // 100% of the fullBleed Layout main — Layout sets a flex column with
    // a static AppBar above us, so the remaining flex slot already has the
    // exact "viewport minus topbar" height. Hard-coding `calc(100vh - 64px)`
    // previously overshot when the topbar wasn't 64px (macOS dense toolbar,
    // banner injection, etc.) — page wound up taller than the viewport.
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {showSidebar && (
          <Box
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              // 280-620px sidebar: low end fits tablet portrait (~600px viewport)
              // with ~320px left for the right panel; high end caps on ultrawides
              // so the editor gets the dominant share.
              // When a file preview is open the sidebar is a clamped column. When only
              // the agent is open they split the canvas 50/50 (both flex:1).
              flex: showRightPanel ? `0 0 clamp(280px, 36%, 620px)` : 1,
              minWidth: 0,
              overflow: 'hidden',
              borderRight: showRightPanel || showAgent ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            {/* Header — single "Actions" dropdown gathers every directory-level
          operation. Per-file ops live in the row's context menu (MoreVertIcon). */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
              {toolbarStart && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: 'action.hover',
                    borderRadius: 1.5,
                    px: 0.25,
                    mr: 0.5,
                  }}
                >
                  {toolbarStart}
                </Box>
              )}
              <Typography
                variant="h5"
                sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
              >
                <DriveFolderUploadIcon /> Drive
                {clipboard && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color="primary"
                    icon={<ContentPasteIcon />}
                    label={`${clipboard.mode === 'cut' ? 'Wycięto' : 'Skopiowano'}: ${clipboard.entry.name}`}
                    sx={{ ml: 1, fontWeight: 400 }}
                  />
                )}
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={onFileInputChange}
              />
              <Tooltip title="Otwórz/utwórz dziennik na dziś — Calendar/{rok}/{miesiąc}/{dzień}.md">
                <Button variant="outlined" startIcon={<TodayIcon />} onClick={openTodayJournal}>
                  Today
                </Button>
              </Tooltip>
              {assistant && (
                <Tooltip title={assistant.label ?? 'Asystent'}>
                  <Button
                    variant={showAgent ? 'contained' : 'outlined'}
                    startIcon={<SmartToyIcon />}
                    onClick={() => setShowAgent((v) => !v)}
                  >
                    {assistant.label ?? 'Asystent'}
                  </Button>
                </Tooltip>
              )}
              <Tooltip title="Szukaj tekstu w plikach (bieżący katalog lub cały drive)">
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  onClick={() => setSearchOpen(true)}
                >
                  Search
                </Button>
              </Tooltip>
              <Button
                variant="contained"
                endIcon={<KeyboardArrowDownIcon />}
                onClick={(e) => setActionsMenu(e.currentTarget)}
              >
                Actions
              </Button>
            </Box>
            <Menu
              anchorEl={actionsMenu}
              open={actionsMenu !== null}
              onClose={() => setActionsMenu(null)}
              slotProps={{ paper: { sx: { minWidth: 260 } } }}
            >
              <MenuItem
                onClick={() => {
                  openUploadDialog();
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <CloudUploadIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Upload plików…"
                  secondary="Wybierz / przeciągnij, przejrzyj, wgraj"
                />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setNewFolderDialog(true);
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <CreateNewFolderIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Nowy katalog" />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setNewFileDialog({ name: 'notatka.md', presetKey: 'md' });
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <NoteAddIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Nowy pusty plik"
                  secondary="Z rozszerzeniem (np. .md, .json)"
                />
              </MenuItem>
              {/* [port] dropped — creating a file from the clipboard needs the editor */}
              <Divider />
              <MenuItem
                disabled={!clipboard}
                onClick={() => {
                  void paste();
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <ContentPasteIcon fontSize="small" color={clipboard ? 'primary' : 'inherit'} />
                </ListItemIcon>
                <ListItemText
                  primary={clipboard ? `Wklej "${clipboard.entry.name}"` : 'Wklej'}
                  secondary={
                    clipboard
                      ? `${clipboard.mode === 'cut' ? 'przenieś' : 'duplikat'} · ⌘V`
                      : 'Schowek pusty — skorzystaj z "Kopiuj" / "Wytnij" w menu pliku'
                  }
                />
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  const url = `/workspace/md?path=${encodeURIComponent(`/home/drive${cwd ? '/' + cwd : ''}`)}`;
                  window.open(url, '_blank');
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <LaunchIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Otwórz w workspace"
                  secondary="Monaco editor — kod, JSON, terminal, agent"
                />
              </MenuItem>
              {/* [port] dropped — the assistant is a capability now */}
              <MenuItem
                onClick={() => {
                  setSearchOpen(true);
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <SearchIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Szukaj w plikach…"
                  secondary="Bieżący katalog lub cały drive"
                />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void refresh();
                  setActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <RefreshIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Odśwież" />
              </MenuItem>
            </Menu>

            {/* Breadcrumbs */}
            <Paper sx={{ p: 1, mb: 1 }}>
              <Breadcrumbs>
                <Link
                  component="button"
                  underline="hover"
                  onClick={() => setCwd('')}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <HomeIcon fontSize="small" /> drive
                </Link>
                {segments.map((seg, i) =>
                  i === segments.length - 1 ? (
                    <Typography key={i} color="text.primary">
                      {seg}
                    </Typography>
                  ) : (
                    <Link
                      key={i}
                      component="button"
                      underline="hover"
                      onClick={() => setCwd(segments.slice(0, i + 1).join('/'))}
                    >
                      {seg}
                    </Link>
                  )
                )}
                {isPublic(vfs, cwd) && (
                  <Chip size="small" icon={<PublicIcon />} label="public" color="success" />
                )}
              </Breadcrumbs>
            </Paper>

            {/* Upload progress dialog — full overview while files are being shipped:
          per-file progress bar + name + overall position. Stops disabling
          the inline area of the file list and is impossible to miss on
          mobile, where the previous tiny LinearProgress was easy to scroll
          past. */}
            {uploading && (
              <Dialog
                open
                hideBackdrop={false}
                maxWidth="xs"
                fullWidth
                disableEscapeKeyDown
                slotProps={{ paper: { sx: { p: 0 } } }}
              >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                  <CloudUploadIcon />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
                      Wgrywanie plików
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {uploading.done} z {uploading.total} ukończonych
                      {uploading.failed > 0 && ` · ${uploading.failed} błąd`}
                    </Typography>
                  </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 0 }}>
                  {/* Overall — counts a fully-finished file as 100%, in-flight file as its byte %. */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Łączny postęp
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {Math.round(
                          ((uploading.done +
                            (uploading.currentName ? uploading.currentPct / 100 : 0)) /
                            uploading.total) *
                            100
                        )}
                        %
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        ((uploading.done +
                          (uploading.currentName ? uploading.currentPct / 100 : 0)) /
                          uploading.total) *
                        100
                      }
                      sx={{ height: 8, borderRadius: 1 }}
                    />
                  </Box>

                  {/* Current file — name + per-file progress. Hidden between files. */}
                  {uploading.currentName && (
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <InsertDriveFileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ flex: 1, minWidth: 0 }}
                          title={uploading.currentName}
                        >
                          {uploading.currentName}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {uploading.currentPct}%
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={uploading.currentPct}
                        sx={{ height: 6, borderRadius: 0.5 }}
                        // While the file-reader is encoding to base64 the XHR hasn't
                        // started yet, so we get a long 0% phase. An indeterminate
                        // bar reads as "still working" instead of "stuck".
                        {...(uploading.currentPct === 0 && { variant: 'indeterminate' as const })}
                      />
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        {uploading.currentPct === 0
                          ? 'Przygotowywanie pliku…'
                          : uploading.currentPct < 100
                            ? 'Wysyłanie do serwera…'
                            : 'Zapisywanie…'}
                      </Typography>
                    </Box>
                  )}
                </DialogContent>
              </Dialog>
            )}

            {/* Favorites — compact card above the file list. Rendered only when
          there's at least one favorite; collapsing-when-empty would make the
          UI flicker as the user un-stars the last item. */}
            {favorites.size > 0 && (
              <Paper variant="outlined" sx={{ mb: 1, p: 1 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setFavoritesOpen((v) => !v)}
                >
                  <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Ulubione ({favorites.size})
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" sx={{ p: 0.25 }}>
                    {favoritesOpen ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>
                </Stack>
                <Collapse in={favoritesOpen} unmountOnExit>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ mt: 1 }}>
                    {Array.from(favorites)
                      .sort()
                      .map((rel) => {
                        const lastSlash = rel.lastIndexOf('/');
                        const fileName = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
                        const folder = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
                        return (
                          <Chip
                            key={rel}
                            size="small"
                            icon={
                              fileName.includes('.') ? (
                                <InsertDriveFileIcon fontSize="small" />
                              ) : (
                                <FolderIcon fontSize="small" />
                              )
                            }
                            label={fileName}
                            title={folder ? `${folder}/${fileName}` : fileName}
                            onClick={() => {
                              void goToFavorite(rel);
                            }}
                            onDelete={() => {
                              setFavorites((prev) => {
                                const next = new Set(prev);
                                next.delete(rel);
                                return next;
                              });
                            }}
                            sx={{ maxWidth: 260 }}
                          />
                        );
                      })}
                  </Stack>
                </Collapse>
              </Paper>
            )}

            {/* File list with drag-and-drop overlay */}
            <Paper
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              sx={{
                flex: 1,
                overflow: 'auto',
                position: 'relative',
                border: dragOver ? '2px dashed' : '2px dashed transparent',
                borderColor: dragOver ? 'primary.main' : 'transparent',
                transition: 'border-color 0.15s',
              }}
            >
              {dragOver && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(0,0,0,0.05)',
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <Typography variant="h6" color="primary">
                    Upuść pliki tutaj
                  </Typography>
                </Box>
              )}
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                  <CircularProgress />
                </Box>
              ) : entries.length === 0 ? (
                <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body1">Pusty katalog</Typography>
                  <Typography variant="caption">
                    Przeciągnij pliki tutaj lub użyj <strong>Upload</strong> /{' '}
                    <strong>New folder</strong>
                  </Typography>
                </Box>
              ) : (
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell></TableCell>
                      <TableCell>Nazwa</TableCell>
                      <TableCell sx={{ width: 100, display: { xs: 'none', md: 'table-cell' } }}>
                        Rozmiar
                      </TableCell>
                      <TableCell sx={{ width: 200, display: { xs: 'none', md: 'table-cell' } }}>
                        Modyfikowane
                      </TableCell>
                      <TableCell sx={{ width: 50 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map((e) => {
                      const rel = cwd ? `${cwd}/${e.name}` : e.name;
                      const pub = isPublic(vfs, rel);
                      return (
                        <TableRow
                          key={e.name}
                          hover
                          onDoubleClick={() => onOpen(e)}
                          onContextMenu={(ev) => {
                            // Prawy przycisk myszy (desktop) otwiera to samo menu co kebab (⋮),
                            // zakotwiczone w pozycji kursora (anchorPosition).
                            ev.preventDefault();
                            setMenuFor({
                              anchor: null,
                              entry: e,
                              pos: { top: ev.clientY, left: ev.clientX },
                            });
                          }}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell sx={{ width: 40 }}>
                            {e.type === DIR_TYPE ? (
                              <FolderIcon sx={{ color: pub ? 'success.main' : 'primary.main' }} />
                            ) : (
                              <InsertDriveFileIcon
                                sx={{ color: pub ? 'success.main' : 'text.secondary' }}
                              />
                            )}
                          </TableCell>
                          <TableCell onClick={() => e.type === DIR_TYPE && onOpen(e)}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ flexWrap: 'wrap', rowGap: 0.5 }}
                            >
                              <span>{e.name}</span>
                              {/* Passive favorite indicator — small filled star next to
                            the name when the file is in favorites. The toggle
                            itself lives in the row's context menu (`⋯`); having
                            both a clickable toggle here and the same item in
                            the menu was redundant. */}
                              {isFavorite(rel) && (
                                <Tooltip title="Ulubiony — zarządzaj przez menu (⋯)">
                                  <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                                </Tooltip>
                              )}
                              {pub && (
                                <Tooltip title="Publiczny — dostępny przez HTTP bez logowania">
                                  <PublicIcon fontSize="small" color="success" />
                                </Tooltip>
                              )}
                              {/* File-property tags — chips inline next to the
                            name. Read from the in-memory fileProperties
                            mirror (loaded once on mount), so rendering
                            stays fast even with hundreds of entries. */}
                              {(fileProperties.tags[rel] ?? []).map((tag) => (
                                <Chip
                                  key={`tag-${tag}`}
                                  label={tag}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.65rem',
                                    '& .MuiChip-label': { px: 0.75 },
                                  }}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            {e.type === DIR_TYPE ? '—' : formatBytes(e.size)}
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            <Typography variant="caption">{formatDate(e.mtime)}</Typography>
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setMenuFor({ anchor: ev.currentTarget, entry: e });
                              }}
                            >
                              <MoreVertIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Paper>
          </Box>
        )}
        {showRightPanel && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minWidth: 0,
              bgcolor: 'background.default',
            }}
          >
            {/* Panel toolbar */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              {viewing && (
                <>
                  <Tooltip title={hasPrev ? 'Poprzedni plik (←)' : 'To jest pierwszy plik'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!hasPrev}
                        onClick={() => void navigatePreview(-1)}
                      >
                        <NavigateBeforeIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Typography
                    variant="caption"
                    sx={{
                      minWidth: 48,
                      textAlign: 'center',
                      userSelect: 'none',
                      color: 'text.secondary',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {currentPreviewIdx >= 0
                      ? `${currentPreviewIdx + 1} / ${fileEntries.length}`
                      : '—'}
                  </Typography>
                  <Tooltip title={hasNext ? 'Następny plik (→)' : 'To jest ostatni plik'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!hasNext}
                        onClick={() => void navigatePreview(1)}
                      >
                        <NavigateNextIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                </>
              )}
              {logsView ? (
                <SubjectIcon fontSize="small" />
              ) : viewing ? (
                <VisibilityIcon fontSize="small" />
              ) : (
                <EditNoteIcon fontSize="small" />
              )}
              <Typography
                variant="subtitle1"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(logsView ? `${logsView.rel} · logi` : undefined) ??
                  viewing?.entry.name ??
                  editing?.name}
              </Typography>
              {viewing && !isCompact && (
                <Chip size="small" variant="outlined" label={viewing.mime} />
              )}
              {viewing && !isCompact && viewing.textContent !== undefined && (
                <Tooltip title="Kopiuj cały tekst do systemowego schowka">
                  <IconButton size="small" onClick={copyViewTextToSystem}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {/*
              Editing and previewing are two views of one file, so the bar
              offers the other one — the counterpart of MyCastle's "open the
              source" and "open in the editor".
            */}
              {panelFile && !isCompact && editing && (
                <Tooltip title="Podgląd (bez edytora)">
                  <IconButton
                    size="small"
                    onClick={() => void viewFile(panelFile.entry, panelFile.rel)}
                  >
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {panelFile &&
                !isCompact &&
                viewing &&
                editor &&
                editor.canEdit({
                  path: panelFile.rel,
                  name: panelFile.name,
                  store: driveStoreForCapabilities,
                }) && (
                  <Tooltip title="Edytuj">
                    <IconButton
                      size="small"
                      onClick={() => openInEditor(panelFile.entry, panelFile.rel)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              {panelFile && !isCompact && (
                <Tooltip
                  title={isFavorite(panelFile.rel) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                >
                  <IconButton
                    size="small"
                    onClick={() => toggleFavoritePath(panelFile.rel, panelFile.name)}
                  >
                    {isFavorite(panelFile.rel) ? (
                      <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                    ) : (
                      <StarBorderIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              {panelFile && !isCompact && isPublic(vfs, panelFile.rel) && (
                <Tooltip title="Kopiuj link publiczny">
                  <IconButton
                    size="small"
                    onClick={() => void copyPublicUrl(panelFile.entry, panelFile.rel)}
                  >
                    <LinkIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {panelFile && !isCompact && (
                <Tooltip title="Pobierz">
                  <IconButton
                    size="small"
                    onClick={() => void onDownload(panelFile.entry, panelFile.rel)}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {panelFile && isCompact && (
                <Tooltip title="Akcje pliku">
                  <IconButton size="small" onClick={(ev) => setViewActionsMenu(ev.currentTarget)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {npmProject && !isCompact && (
                <Tooltip title="Projekt npm">
                  <IconButton size="small" onClick={(e) => setNpmMenu(e.currentTarget)}>
                    <InventoryIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {panelFile && !isCompact && isRunnableScript(panelFile.name) && (
                <Tooltip title={scriptRunning ? 'Zatrzymaj' : 'Uruchom w przeglądarce'}>
                  <IconButton
                    size="small"
                    color={scriptRunning ? 'error' : 'success'}
                    onClick={() => (scriptRunning ? stopRun() : void runOpenScript())}
                  >
                    {scriptRunning ? (
                      <StopIcon fontSize="small" />
                    ) : (
                      <PlayArrowIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              {panelFile && !isCompact && isRunnableScript(panelFile.name) && (
                <Tooltip title={consoleOpen ? 'Ukryj konsolę' : 'Pokaż konsolę'}>
                  <IconButton size="small" onClick={() => setConsoleOpen((v) => !v)}>
                    <TerminalIcon
                      fontSize="small"
                      sx={{ color: scriptRunning ? 'success.main' : 'text.secondary' }}
                    />
                  </IconButton>
                </Tooltip>
              )}
              {editing && editor?.viewOptions?.length && (
                <Tooltip title="Ustawienia widoku (zapisywane per plik)">
                  <IconButton
                    size="small"
                    // Coloured when anything is on, so it is visible from the bar
                    // that this file is being shown differently from the rest.
                    color={
                      editor.viewOptions.some((o) => viewSettingsFor(editing.path)[o.key])
                        ? 'primary'
                        : 'default'
                    }
                    onClick={(e) => setViewSettingsAnchor(e.currentTarget)}
                  >
                    <TuneIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip
                title={
                  panelFullscreen
                    ? 'Pokaż listę plików'
                    : 'Ukryj listę plików (panel na cały ekran)'
                }
              >
                <IconButton size="small" onClick={() => setPanelFullscreen((f) => !f)}>
                  {panelFullscreen ? (
                    <FullscreenExitIcon fontSize="small" />
                  ) : (
                    <FullscreenIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="Zamknij panel">
                <IconButton size="small" onClick={closeRightPanel}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            {/* Panel content */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {viewing && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ flex: 1, minHeight: 0 }}>{viewerBody}</Box>
                  {/*
                  Panel sceny nad konsolą i **wyżej** niż ona: scena wymaga
                  miejsca, żeby dało się cokolwiek na niej zobaczyć, a konsola
                  jest przy niej dopiskiem.
                */}

                  {/* [port] dropped — the in-browser runner’s console */}
                </Box>
              )}
              {/*
              The editor itself. MyCastle rendered a component per editor here —
              Markdown, MJD, the schema form, the dashboard, Qt — each with its
              own state. There is one capability now, and what it draws is the
              host's business; the page supplies the file and the panel.
            */}
              {editing && editor && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {editor.render(editing, {
                    onClose: closeRightPanel,
                    onSaved: () => {
                      void refresh();
                    },
                    view: viewSettingsFor(editing.path),
                  })}
                </Box>
              )}
              {/*
              The console sits under whatever the panel is showing rather than
              replacing it: a script is read and run in the same breath, and a
              console that covers the source makes the next edit guesswork.
              A third of the height, so both halves stay usable.
            */}
              {consoleOpen && (
                <Box
                  sx={{
                    flex: '0 0 33%',
                    minHeight: 120,
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={<TerminalIcon />}
                      color={scriptRunning ? 'success' : 'default'}
                      label={scriptRunning ? 'działa' : 'konsola'}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" onClick={() => setConsoleLines([])}>
                      Wyczyść
                    </Button>
                    <Tooltip title="Ukryj konsolę">
                      <IconButton size="small" onClick={() => setConsoleOpen(false)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      flex: 1,
                      m: 0,
                      p: 1.5,
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      bgcolor: '#1e1e1e',
                      color: '#d4d4d4',
                    }}
                  >
                    {consoleLines.length === 0 ? (
                      <Box component="span" sx={{ opacity: 0.5 }}>
                        (brak wyjścia)
                      </Box>
                    ) : (
                      consoleLines.map((line, i) => (
                        <Box
                          key={i}
                          component="div"
                          sx={{
                            color:
                              line.level === 'error'
                                ? '#f48771'
                                : line.level === 'warn'
                                  ? '#dcdcaa'
                                  : line.level === 'debug'
                                    ? '#808080'
                                    : '#d4d4d4',
                          }}
                        >
                          {line.text}
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>
              )}
              {logsView && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={<SubjectIcon />}
                      label="logi skryptu"
                    />
                    <Box sx={{ flex: 1 }} />
                    {/* [port] dropped — the log stream is MyCastle's own endpoint */}
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => void clearLogs(logsView.rel)}
                    >
                      Wyczyść
                    </Button>
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      flex: 1,
                      m: 0,
                      p: 1.5,
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      bgcolor: '#1e1e1e',
                      color: '#d4d4d4',
                    }}
                  >
                    {logsView.content || '(pusty)'}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
        {assistant && showAgent && (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {assistant.render(
              {
                store: driveStoreForCapabilities,
                dir: cwd,
                file: viewing
                  ? { path: viewingRel, name: viewing.entry.name, store: driveStoreForCapabilities }
                  : editing,
                onFileOpen: (path) => {
                  void goToFavorite(path);
                },
                onFileWritten: () => {
                  void refresh();
                },
              },
              { onClose: () => setShowAgent(false) }
            )}
          </Box>
        )}
      </Box>

      <Backdrop
        open={zipping !== null}
        sx={{ zIndex: (t) => t.zIndex.modal + 10, color: '#fff', flexDirection: 'column', gap: 2 }}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body1">Pakowanie „{zipping}" do ZIP…</Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          To może chwilę potrwać przy dużych katalogach.
        </Typography>
      </Backdrop>

      {/*
        The view settings, drawn from what the editor declares. The page knows
        the mechanics — a switch, a file, a saved value — and nothing about what
        any of them does.
      */}
      {editing && editor?.viewOptions?.length && (
        <Popover
          open={Boolean(viewSettingsAnchor)}
          anchorEl={viewSettingsAnchor}
          onClose={() => setViewSettingsAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ p: 1.5, minWidth: 320 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'text.secondary',
                mb: 0.5,
              }}
            >
              Ustawienia widoku
            </Typography>
            {editor.viewOptions.map((option) => (
              <FormControlLabel
                key={option.key}
                sx={{
                  ml: 0,
                  width: '100%',
                  justifyContent: 'space-between',
                  mr: 0,
                  alignItems: 'flex-start',
                  py: 0.5,
                }}
                labelPlacement="start"
                label={
                  <Box>
                    <Typography variant="body2">{option.label}</Typography>
                    {option.description && (
                      <Typography variant="caption" color="text.secondary">
                        {option.description}
                      </Typography>
                    )}
                  </Box>
                }
                control={
                  <Switch
                    size="small"
                    checked={Boolean(viewSettingsFor(editing.path)[option.key])}
                    onChange={(e) => setViewSetting(editing.path, option.key, e.target.checked)}
                  />
                }
              />
            ))}
          </Box>
        </Popover>
      )}

      {/*
        The npm project's menu: install, and the scripts the file declares.
        What each of them runs is decided by `npmProject.ts` — which manager,
        which arguments, and whether the name may be passed on at all.
      */}
      {npmProject && (
        <Menu
          anchorEl={npmMenu}
          open={npmMenu !== null}
          onClose={() => setNpmMenu(null)}
          slotProps={{ paper: { sx: { minWidth: 320 } } }}
        >
          {(() => {
            const plan = installPlan(npmProject.manager.id, npmProject.manager.hasLockfile);
            return (
              <MenuItem
                onClick={() =>
                  void runNpm(plan.command, plan.args, `${plan.command} ${plan.args[0]}`)
                }
              >
                <ListItemIcon>
                  <DownloadIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={`${plan.command} ${plan.args.join(' ')}`}
                  secondary={plan.note}
                />
              </MenuItem>
            );
          })()}
          <MenuItem onClick={() => setNpmScriptsOpen((v) => !v)}>
            <ListItemIcon>
              <PlayArrowIcon fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText
              primary={`${npmProject.manager.command} run`}
              secondary={
                npmProject.scripts === null
                  ? 'Nie udało się odczytać package.json'
                  : `${Object.keys(npmProject.scripts).length} skryptów w package.json`
              }
            />
            {npmScriptsOpen ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </MenuItem>
          <Collapse in={npmScriptsOpen} unmountOnExit>
            {Object.entries(npmProject.scripts ?? {}).map(([name, body]) => {
              const decision = decideScript(name, npmProject.scripts, npmProject.manager.id);
              return (
                <MenuItem
                  key={name}
                  sx={{ pl: 4 }}
                  disabled={!decision.ok}
                  title={decision.ok ? body : decision.reason}
                  onClick={() =>
                    decision.ok && void runNpm(decision.plan.command, decision.plan.args, name)
                  }
                >
                  <ListItemIcon>
                    <PlayArrowIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={name}
                    secondary={decision.ok ? body : decision.reason}
                    secondaryTypographyProps={{
                      sx: { fontFamily: 'monospace', fontSize: '0.72rem' },
                    }}
                  />
                </MenuItem>
              );
            })}
          </Collapse>
          <Divider />
          <MenuItem disabled sx={{ opacity: '1 !important' }}>
            <ListItemText
              secondary={
                npmProject.manager.detected
                  ? `Menedżer: ${npmProject.manager.command} (${npmProject.manager.lockfile})`
                  : `Menedżer: ${npmProject.manager.command} — zgaduję, brak pliku blokady`
              }
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
        </Menu>
      )}

      {/* Per-entry menu */}
      <Menu
        anchorEl={menuFor?.anchor}
        anchorReference={menuFor?.pos ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={menuFor?.pos}
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
      >
        {menuFor && menuFor.entry.type === DIR_TYPE && (
          <MenuItem
            onClick={() => {
              const entry = menuFor.entry;
              setMenuFor(null);
              onOpen(entry);
            }}
          >
            <ListItemIcon>
              <FolderOpenIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Otwórz</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem
            onClick={() => {
              void viewFile(menuFor.entry);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <VisibilityIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Podgląd</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isRunnable(menuFor.entry.name) && (
          <MenuItem
            onClick={() => {
              const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
              void openLogs(rel);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <SubjectIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Logs" secondary="Wyjście skryptu (Run + cron)" />
          </MenuItem>
        )}
        {/*
          The archive actions appear only when the host can perform them —
          `zipPack` and `zipUnpack` are optional, and a button that always ends
          in an error is worse than no button.
        */}
        {menuFor && menuFor.entry.type === DIR_TYPE && vfs.zipPack && (
          <MenuItem
            disabled={zipping !== null}
            onClick={() => {
              const e = menuFor.entry;
              setMenuFor(null);
              void downloadFolderZip(e);
            }}
          >
            <ListItemIcon>
              <FolderZipIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Pobierz ZIP" secondary="Spakuj katalog i pobierz" />
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === DIR_TYPE && vfs.zipPack && (
          <MenuItem
            onClick={() => {
              const e = menuFor.entry;
              setMenuFor(null);
              void packEntry(e);
            }}
          >
            <ListItemIcon>
              <FolderZipIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Spakuj" secondary="Archiwum .zip powstanie obok katalogu" />
          </MenuItem>
        )}
        {menuFor &&
          menuFor.entry.type === FILE_TYPE &&
          isArchive(menuFor.entry.name) &&
          vfs.zipUnpack && (
            <MenuItem
              onClick={() => {
                const e = menuFor.entry;
                setMenuFor(null);
                void unpackEntry(e);
              }}
            >
              <ListItemIcon>
                <FolderZipIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Rozpakuj" secondary="Zawartość trafi do katalogu obok" />
            </MenuItem>
          )}
        {menuFor &&
          (() => {
            const rel = cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name;
            const isFav = isFavorite(rel);
            const isDir = menuFor.entry.type === DIR_TYPE;
            return (
              <MenuItem
                onClick={() => {
                  toggleFavorite(menuFor.entry);
                  setMenuFor(null);
                }}
              >
                <ListItemIcon>
                  {isFav ? (
                    <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  ) : (
                    <StarBorderIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText>
                  {isFav ? 'Usuń z ulubionych' : `Dodaj do ulubionych${isDir ? ' (katalog)' : ''}`}
                </ListItemText>
              </MenuItem>
            );
          })()}
        {menuFor && menuFor.entry.type === FILE_TYPE && isMdEditable(menuFor.entry.name) && (
          <MenuItem
            onClick={() => {
              openInEditor(menuFor.entry);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <EditNoteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Otwórz w MdEditor</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem
            onClick={() => {
              void onDownload(menuFor.entry);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Pobierz</ListItemText>
          </MenuItem>
        )}
        {/* [port] dropped — downloading a folder as a zip needs JSZip */}
        {menuFor && !isPublic(vfs, cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          <MenuItem
            onClick={() => {
              void moveToPublic(menuFor.entry);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <DriveFileMoveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Make public (przenieś do public/)</ListItemText>
          </MenuItem>
        )}
        {menuFor && isPublic(vfs, cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          /*
            Dla plików i katalogów jednakowo: adres katalogu też bywa potrzebny
            (baza wiedzy to katalog, nie plik), a rozróżnianie tych przypadków
            w menu było pozostałością po czasach, gdy publiczny był tylko
            `public/` z pojedynczymi obrazkami.
          */
          <MenuItem
            onClick={() => {
              void copyPublicUrl(menuFor.entry);
              setMenuFor(null);
            }}
          >
            <ListItemIcon>
              <LinkIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Kopiuj link publiczny</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={async () => {
            // Ścieżka w formacie używanym przez api.file w skryptach automatyzacji
            // (userBase-relative: `drive/{rel}`), nie backendowa /data/Minis/Users/...
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            const apiPath = `drive/${rel}`;
            setMenuFor(null);
            const ok = await copyTextToClipboard(apiPath);
            if (ok) toast(`Skopiowano ścieżkę: ${apiPath}`);
            else prompt('Skopiuj ścieżkę ręcznie:', apiPath);
          }}
        >
          <ListItemIcon>
            <CodeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Path" secondary="Ścieżka dla api.file (skrypty)" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            copyToClipboard(menuFor!.entry, 'copy');
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Kopiuj</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            copyToClipboard(menuFor!.entry, 'cut');
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <ContentCutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Wytnij</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setRenameDialog({ entry: menuFor!.entry, value: menuFor!.entry.name });
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zmień nazwę</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            openPropertiesDialog(menuFor!.entry);
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <InfoOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Właściwości…</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            void onDelete(menuFor!.entry);
            setMenuFor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Usuń</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Full-text search dialog ───────────────────────────────────── */}
      {/* `runSearch` is the actual top-level helper bound to the current
          user. The dialog owns query state, results, abort control —
          DrivePage just supplies "where to search" and "what to do when
          a result is clicked". */}
      {/* [port] dropped — the search dialog was a component of its own in MyCastle */}

      {/* ── Schema picker ("Zmień schema") ────────────────────────────── */}
      {/* [port] dropped — the schema picker went with the schema editor */}

      {/* ── Properties dialog (tags + future per-file metadata) ───────── */}
      <Dialog open={!!propsDialog} onClose={() => setPropsDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon fontSize="small" />
          Właściwości: {propsDialog?.entry.name}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Ścieżka: {propsDialog?.rel}
          </Typography>

          {/* Tags section — mirror of the AutomateScript settings dialog
              tags UX so the user gets the same chip-input across the app. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <LabelIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" fontWeight={600}>
              Tagi pliku
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mb: 1,
              minHeight: 32,
              p: 0.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            {propsDraftTags.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 0.5 }}>
                Brak tagów — dodaj poniżej.
              </Typography>
            ) : (
              propsDraftTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onDelete={() => setPropsDraftTags((prev) => prev.filter((t) => t !== tag))}
                />
              ))
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              value={propsDraftTagInput}
              onChange={(e) => setPropsDraftTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraftTag();
                } else if (
                  e.key === 'Backspace' &&
                  !propsDraftTagInput &&
                  propsDraftTags.length > 0
                ) {
                  // Empty-input backspace deletes the last chip — same UX as
                  // Gmail/Slack recipient fields.
                  e.preventDefault();
                  setPropsDraftTags((prev) => prev.slice(0, -1));
                }
              }}
              placeholder="np. daily, projekt-A, notatki"
              size="small"
              fullWidth
            />
            <IconButton
              size="small"
              onClick={commitDraftTag}
              disabled={!propsDraftTagInput.trim()}
              sx={{ border: 1, borderColor: 'divider' }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Tagi są zapisywane w <code>drive/.fileproperties.json</code>. Przydaje się do
            filtrowania / grupowania plików w przyszłych narzędziach.
          </Typography>

          {/* Cron schedule — only for runnable JS scripts (drive/server/*.mjs etc.) */}
          {propsDialog && isRunnable(propsDialog.entry.name) && (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ScheduleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" fontWeight={600}>
                  Harmonogram (cron)
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  value={propsDraftCron}
                  onChange={(e) => setPropsDraftCron(e.target.value)}
                  placeholder="np. 0 * * * *  (co godzinę)"
                  size="small"
                  fullWidth
                />
                <FormControlLabel
                  sx={{ whiteSpace: 'nowrap', mr: 0 }}
                  control={
                    <Switch
                      size="small"
                      checked={propsDraftCronEnabled}
                      onChange={(e) => setPropsDraftCronEnabled(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">Aktywny</Typography>}
                />
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {[
                  { l: 'co min', c: '* * * * *' },
                  { l: 'co 5 min', c: '*/5 * * * *' },
                  { l: 'co godz.', c: '0 * * * *' },
                  { l: 'codz. 8:00', c: '0 8 * * *' },
                  { l: 'pon-pt 9:00', c: '0 9 * * 1-5' },
                ].map((p) => (
                  <Chip
                    key={p.c}
                    label={p.l}
                    size="small"
                    variant="outlined"
                    onClick={() => setPropsDraftCron(p.c)}
                  />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Skrypt uruchamiany na backendzie (<code>node {propsDialog.rel}</code>) wg wyrażenia
                cron (minuta godzina dzień miesiąc dzień-tygodnia). Puste pole = brak harmonogramu.
                Zapis do <code>drive/.schedules.json</code>.
              </Typography>

              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Switch
                    size="small"
                    checked={propsDraftStartup}
                    onChange={(e) => setPropsDraftStartup(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Uruchom przy starcie serwera</Typography>}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPropsDialog(null)}>Anuluj</Button>
          <Button onClick={saveProperties} variant="contained">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>

      {/* New folder dialog */}
      <Dialog
        open={newFolderDialog}
        onClose={() => setNewFolderDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Nowy katalog</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doMkdir();
            }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)}>Anuluj</Button>
          <Button variant="contained" disabled={!newFolderName.trim()} onClick={doMkdir}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      {renameDialog && (
        <Dialog open onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Zmień nazwę</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Nowa nazwa"
              value={renameDialog.value}
              onChange={(e) => setRenameDialog({ ...renameDialog, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doRename();
              }}
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog(null)}>Anuluj</Button>
            <Button
              variant="contained"
              disabled={
                !renameDialog.value.trim() || renameDialog.value === renameDialog.entry.name
              }
              onClick={doRename}
            >
              Zmień
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Ruchome okienka: Spis treści / Ulubione (per-plik, ustawiane w Ustawieniach). */}
      {/* [port] dropped — the Markdown table of contents */}
      {/* [port] dropped — the Markdown favourites panel */}

      {/* Preview actions menu — shared between mobile Dialog and the compact
          panel toolbar (tablet portrait). Mirrors what desktop shows inline. */}
      {panelFile && (
        <Menu
          anchorEl={viewActionsMenu}
          open={viewActionsMenu !== null}
          onClose={() => setViewActionsMenu(null)}
          slotProps={{ paper: { sx: { minWidth: 240 } } }}
        >
          <MenuItem disabled sx={{ opacity: '1 !important' }}>
            <ListItemText
              primary={panelFile.name}
              secondary={viewing?.mime ?? panelFile.rel}
              primaryTypographyProps={{ noWrap: true, fontWeight: 500 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <Divider />
          {viewing?.textContent !== undefined && (
            <MenuItem
              onClick={() => {
                void copyViewTextToSystem();
                setViewActionsMenu(null);
              }}
            >
              <ListItemIcon>
                <ContentCopyIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Kopiuj cały tekst" secondary="Do systemowego schowka" />
            </MenuItem>
          )}
          {editing && (
            <MenuItem
              onClick={() => {
                void viewFile(panelFile.entry, panelFile.rel);
                setViewActionsMenu(null);
              }}
            >
              <ListItemIcon>
                <VisibilityIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Podgląd" secondary="Bez edytora" />
            </MenuItem>
          )}
          {viewing &&
            editor &&
            editor.canEdit({
              path: panelFile.rel,
              name: panelFile.name,
              store: driveStoreForCapabilities,
            }) && (
              <MenuItem
                onClick={() => {
                  openInEditor(panelFile.entry, panelFile.rel);
                  setViewActionsMenu(null);
                }}
              >
                <ListItemIcon>
                  <EditNoteIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Edytuj" secondary="W prawym panelu" />
              </MenuItem>
            )}
          <MenuItem
            onClick={() => {
              toggleFavoritePath(panelFile.rel, panelFile.name);
              setViewActionsMenu(null);
            }}
          >
            <ListItemIcon>
              {isFavorite(panelFile.rel) ? (
                <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
              ) : (
                <StarBorderIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={isFavorite(panelFile.rel) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            />
          </MenuItem>
          {isPublic(vfs, panelFile.rel) && (
            <MenuItem
              onClick={() => {
                void copyPublicUrl(panelFile.entry, panelFile.rel);
                setViewActionsMenu(null);
              }}
            >
              <ListItemIcon>
                <LinkIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Kopiuj link publiczny" />
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              void onDownload(panelFile.entry, panelFile.rel);
              setViewActionsMenu(null);
            }}
          >
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Pobierz" />
          </MenuItem>
        </Menu>
      )}

      {/* New empty file dialog */}
      {newFileDialog &&
        (() => {
          const currentPreset =
            FILE_PRESETS.find((p) => p.key === newFileDialog.presetKey) ?? FILE_PRESETS[0];
          // Live preview of the name that will actually land on disk —
          // matches what `doCreateEmpty` will produce.
          const previewName = newFileDialog.name.trim()
            ? applyExtension(newFileDialog.name.trim(), currentPreset.extension)
            : '';
          return (
            <Dialog open onClose={() => setNewFileDialog(null)} maxWidth="xs" fullWidth>
              <DialogTitle>Nowy pusty plik</DialogTitle>
              <DialogContent>
                <FormControl fullWidth size="small" margin="normal">
                  <InputLabel id="new-file-preset-label">Typ pliku</InputLabel>
                  <Select
                    labelId="new-file-preset-label"
                    label="Typ pliku"
                    value={newFileDialog.presetKey}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      const nextPreset =
                        FILE_PRESETS.find((p) => p.key === nextKey) ?? FILE_PRESETS[0];
                      // Auto-update name to the new preset's default IF the user
                      // hasn't typed something custom (still on a known default).
                      // Otherwise keep their text — they'll get auto-extension on save.
                      const wasDefault = FILE_PRESETS.some(
                        (p) => p.defaultName === newFileDialog.name
                      );
                      setNewFileDialog({
                        presetKey: nextKey,
                        name: wasDefault ? nextPreset.defaultName : newFileDialog.name,
                      });
                    }}
                  >
                    {FILE_PRESETS.map((p) => (
                      <MenuItem key={p.key} value={p.key}>
                        {p.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  autoFocus
                  fullWidth
                  label="Nazwa pliku"
                  value={newFileDialog.name}
                  onChange={(e) => setNewFileDialog({ ...newFileDialog, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doCreateEmpty();
                  }}
                  margin="normal"
                  helperText={
                    currentPreset.extension
                      ? `Rozszerzenie ${currentPreset.extension} zostanie dodane automatycznie jeśli go nie wpiszesz.`
                      : 'Wpisz pełną nazwę z rozszerzeniem.'
                  }
                />
                {previewName && previewName !== newFileDialog.name && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: 'block' }}
                  >
                    Końcowa nazwa: <code>{previewName}</code>
                  </Typography>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setNewFileDialog(null)}>Anuluj</Button>
                <Button
                  variant="contained"
                  disabled={!newFileDialog.name.trim()}
                  onClick={doCreateEmpty}
                >
                  Utwórz
                </Button>
              </DialogActions>
            </Dialog>
          );
        })()}

      {/* Create-from-clipboard dialog */}
      {clipboardCreateDialog && (
        <Dialog open onClose={() => setClipboardCreateDialog(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ContentPasteGoIcon /> Utwórz ze schowka
            <Chip
              size="small"
              label={clipboardCreateDialog.kind === 'image' ? 'obraz' : 'tekst'}
              color={clipboardCreateDialog.kind === 'image' ? 'primary' : 'default'}
              sx={{ ml: 1 }}
            />
          </DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Nazwa pliku"
              value={clipboardCreateDialog.name}
              onChange={(e) =>
                setClipboardCreateDialog({ ...clipboardCreateDialog, name: e.target.value })
              }
              margin="normal"
              helperText="Jeśli plik o takiej nazwie istnieje, dostanie sufix (copy)"
            />
            {clipboardCreateDialog.kind === 'image' ? (
              <Box
                sx={{ textAlign: 'center', mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}
              >
                <img
                  src={`data:${clipboardCreateDialog.imageMime};base64,${clipboardCreateDialog.imageB64}`}
                  alt="podgląd"
                  style={{ maxWidth: '100%', maxHeight: '50vh' }}
                />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {clipboardCreateDialog.imageMime} • ~
                  {formatBytes(Math.floor((clipboardCreateDialog.imageB64.length * 3) / 4))}
                </Typography>
              </Box>
            ) : (
              <>
                {!clipboardCreateDialog.textContent && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Twoja przeglądarka nie pozwala odczytać systemowego schowka automatycznie
                    (typowo: telefon, tablet, lub strona pod HTTP).
                    <br />
                    <strong>Wklej zawartość ręcznie w polu poniżej</strong> — użyj <code>⌘V</code>/
                    <code>Ctrl+V</code> na desktopie, lub przytrzymaj pole i wybierz{' '}
                    <strong>Wklej</strong> na mobile.
                  </Alert>
                )}
                <TextField
                  fullWidth
                  multiline
                  rows={12}
                  label="Treść (wklej lub edytuj)"
                  autoFocus={!clipboardCreateDialog.textContent}
                  value={clipboardCreateDialog.textContent}
                  onChange={(e) => {
                    const newText = e.target.value;
                    setClipboardCreateDialog((prev) => {
                      if (!prev) return null;
                      // Re-detect filename only if it's still the default and we're
                      // transitioning from empty → content (right after manual paste).
                      // This catches the mobile fallback flow without surprising the
                      // user who already renamed the file.
                      const wasEmpty = !prev.textContent && newText;
                      const stillDefault = prev.name === 'clipboard.txt';
                      const nextName =
                        wasEmpty && stillDefault ? suggestNameForText(newText) : prev.name;
                      return { ...prev, textContent: newText, name: nextName };
                    });
                  }}
                  margin="normal"
                  slotProps={{
                    htmlInput: {
                      style: {
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 13,
                      },
                    },
                  }}
                  helperText={`${clipboardCreateDialog.textContent.length} znaków`}
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClipboardCreateDialog(null)}>Anuluj</Button>
            <Button
              variant="contained"
              disabled={!clipboardCreateDialog.name.trim()}
              onClick={doCreateFromClipboard}
            >
              Zapisz
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <DriveSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        cwd={cwd}
        runSearch={({ baseRel, query, caseSensitive, isRegex, signal, onProgress }) =>
          searchInFiles(vfs, baseRel, query, { caseSensitive, isRegex }, signal, onProgress)
        }
        onOpenFile={(rel) => {
          // A synthetic entry saves the openers a code path of their own, and
          // the listing jumps to the file's directory: a result found deep in
          // the tree should not leave the breadcrumbs pointing elsewhere.
          const name = rel.split('/').pop() || rel;
          const synthetic: VfsEntry = { name, type: FILE_TYPE };
          const targetDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
          if (targetDir !== cwd) setCwd(targetDir);
          // `rel` is passed explicitly: `cwd` may not have committed yet, and
          // the editor decides for itself whether it takes the file at all.
          if (editor && editor.canEdit({ path: rel, name, store: driveStoreForCapabilities })) {
            openInEditor(synthetic, rel);
          } else {
            void viewFile(synthetic, rel);
          }
          setSearchOpen(false);
        }}
      />

      {/* Upload staging dialog — pick / drop multiple files, review, commit. */}
      {uploadDialog &&
        (() => {
          const UPLOAD_LIMIT = 140 * 1024 * 1024; // pre-flight limit aligned with upload()
          const totalBytes = uploadDialog.files.reduce((sum, f) => sum + f.size, 0);
          const oversized = uploadDialog.files.filter((f) => f.size > UPLOAD_LIMIT).length;
          return (
            <Dialog open onClose={() => setUploadDialog(null)} maxWidth="sm" fullWidth>
              <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudUploadIcon /> Upload plików do <code>/{cwd || ''}</code>
              </DialogTitle>
              <DialogContent>
                <input
                  ref={dialogFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={onDialogFileInputChange}
                />

                {/* Drop zone + pick button */}
                <Box
                  onClick={() => dialogFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      addFilesToUploadDialog(e.dataTransfer.files);
                    }
                  }}
                  sx={{
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 3,
                    mt: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: 'action.hover',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'action.selected' },
                  }}
                >
                  <DriveFolderUploadIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 0.5 }} />
                  <Typography variant="body2">
                    <strong>Kliknij</strong>, aby wybrać pliki — lub przeciągnij tu z systemu
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Możesz dodawać kolejne — pliki nie znikają po kolejnym kliknięciu
                  </Typography>
                </Box>

                {/* Staged file list */}
                {uploadDialog.files.length > 0 && (
                  <Box
                    sx={{
                      mt: 2,
                      maxHeight: 320,
                      overflowY: 'auto',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    {uploadDialog.files.map((f, i) => {
                      const tooBig = f.size > UPLOAD_LIMIT;
                      return (
                        <Box
                          key={`${f.name}-${i}`}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 1,
                            py: 0.75,
                            borderBottom: i < uploadDialog.files.length - 1 ? '1px solid' : 'none',
                            borderColor: 'divider',
                          }}
                        >
                          <InsertDriveFileIcon
                            fontSize="small"
                            sx={{ color: tooBig ? 'error.main' : 'text.secondary' }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap title={f.name}>
                              {f.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color={tooBig ? 'error.main' : 'text.secondary'}
                            >
                              {formatBytes(f.size)}
                              {tooBig && ` — za duży (max ${formatBytes(UPLOAD_LIMIT)})`}
                            </Typography>
                          </Box>
                          <IconButton size="small" onClick={() => removeFileFromUploadDialog(i)}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {/* Summary */}
                <Box
                  sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${uploadDialog.files.length} plik${uploadDialog.files.length === 1 ? '' : 'ów'}`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Razem ${formatBytes(totalBytes)}`}
                  />
                  {oversized > 0 && (
                    <Chip
                      size="small"
                      color="error"
                      variant="outlined"
                      label={`${oversized} za duży — usuń przed uploadem`}
                    />
                  )}
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setUploadDialog(null)}>Anuluj</Button>
                <Button
                  variant="contained"
                  startIcon={<CloudUploadIcon />}
                  disabled={uploadDialog.files.length === 0 || oversized > 0}
                  onClick={commitUploadDialog}
                >
                  Wgraj {uploadDialog.files.length > 0 ? `(${uploadDialog.files.length})` : ''}
                </Button>
              </DialogActions>
            </Dialog>
          );
        })()}

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
      >
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
