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
  asText, fromText, readJson, readTextOrNull, sortVfsEntries, DIR_TYPE, FILE_TYPE,
  type DriveVfs, type VfsEntry,
} from '../src/drive/vfs';
import type { DriveAssistant, DriveEditor, DriveFileRef, DriveViewers } from '../src/drive/capabilities';
import type { DriveStore } from '../src/drive/store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Backdrop, Box, Breadcrumbs, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel, LinearProgress,
  Link, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Select, Snackbar, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
  Switch, FormControlLabel, Popover,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArticleIcon from '@mui/icons-material/Article';
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DynamicFormIcon from '@mui/icons-material/DynamicForm';
import SchemaIcon from '@mui/icons-material/Schema';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import EditIcon from '@mui/icons-material/Edit';
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
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import TerminalIcon from '@mui/icons-material/Terminal';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SubjectIcon from '@mui/icons-material/Subject';
import CodeIcon from '@mui/icons-material/Code';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DescriptionIcon from '@mui/icons-material/Description';
import DashboardIcon from '@mui/icons-material/Dashboard';


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
  } catch { /* fall through to legacy path */ }
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
  } catch { return false; }
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
  onProgress?: (pct: number) => void,
): Promise<void> {
  await vfs.writeFile(relPath, data, onProgress);
}

async function vfsReadFile(vfs: DriveVfs, relPath: string): Promise<Uint8Array> {
  return vfs.readFile(relPath);
}

async function vfsReadText(vfs: DriveVfs, relPath: string): Promise<string> {
  return asText(await vfs.readFile(relPath));
}

async function vfsCopy(vfs: DriveVfs, sourceRel: string, destRel: string): Promise<void> {
  if (vfs.copy) { await vfs.copy(sourceRel, destRel); return; }
  // Without a copy of its own: read and write it back. Fine for a file, and the
  // page only copies files — a folder goes through `vfsCopyTree` below.
  await vfs.writeFile(destRel, await vfs.readFile(sourceRel));
}

async function vfsStat(vfs: DriveVfs, relPath: string): Promise<{ type: number } | null> {
  if (!vfs.stat) return null;
  return vfs.stat(relPath).catch(() => null);
}


// ─── File properties (sidecar JSON in drive root) ───────────────────────────
// All per-file metadata that isn't part of the file body itself lives in a
// single sidecar JSON at `drive/.fileproperties.json` — keeps the directory
// clean (no `.tags` siblings everywhere) and lets us cache the whole index
// once on mount instead of doing N reads per listing render.
//
// Keyed by relPath (same `cwd/name` convention used elsewhere in this file)
// so a rename or move would orphan a tag entry — acceptable cost for the
// simplicity. Future revision can migrate to a content-hash key.

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
      tags: (parsed.tags && typeof parsed.tags === 'object') ? parsed.tags : {},
    };
  } catch { return EMPTY_FILE_PROPS; }
}

async function saveFileProperties(vfs: DriveVfs, props: FileProperties): Promise<void> {
  const text = JSON.stringify(props, null, 2);
  // UTF-8-safe base64: encodeURIComponent + escape handles non-ASCII (Polish
  // accents in tag names, file paths).

  await vfsWriteFile(vfs, FILE_PROPS_PATH, fromText(text));
}

// ─── Ustawienia widoku markdown (per-plik, zapisywane na backend) ────────────
// Jeden plik na usera: klucz = ścieżka pliku (taka sama jak `filePath` przekazany
// do MdEditor), wartość = { minimalView }.
const MDVIEW_PATH = '.mdview.json';
interface MdViewEntry { minimalView?: boolean; showToc?: boolean; showFavorites?: boolean; smallText?: boolean; fullWidth?: boolean }
interface MdViewMap { [fileKey: string]: MdViewEntry }

async function loadMdViewSettingsMap(vfs: DriveVfs): Promise<MdViewMap> {
  try {
    const text = await readTextOrNull(vfs, MDVIEW_PATH);
    if (text === null) return {};
    const parsed = JSON.parse(text) as MdViewMap;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

async function saveMdViewSettingsMap(vfs: DriveVfs, map: MdViewMap): Promise<void> {
  await vfsWriteFile(vfs, MDVIEW_PATH, fromText(JSON.stringify(map, null, 2)));
}

// ─── Cron schedules for backend JS scripts (Drive → Właściwości) ─────────────
// Stored in `drive/.schedules.json`, keyed by drive-relative path:
//   { "server/foo.mjs": { "cron": "0 * * * *", "enabled": true } }
// The backend DriveScriptScheduler reads this file and runs `node {file}` on cron.
const SCHEDULES_PATH = '.schedules.json';
type DriveSchedules = Record<string, { cron: string; enabled: boolean; runAtStartup?: boolean }>;

async function loadSchedules(vfs: DriveVfs): Promise<DriveSchedules> {
  try {
    const text = await readTextOrNull(vfs, SCHEDULES_PATH);
    if (text === null) return {};
    const parsed = JSON.parse(text) as DriveSchedules;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

async function saveSchedules(vfs: DriveVfs, schedules: DriveSchedules): Promise<void> {
  const text = JSON.stringify(schedules, null, 2);
  await vfsWriteFile(vfs, SCHEDULES_PATH, fromText(text));
  // MyCastle then asked its backend to re-register the user's cron jobs from
  // the file. Whether anything runs them here is the host's business: the page
  // writes the schedule, and a host that acts on it watches the file.
}

/** One hit inside a file. */
export interface SearchMatch {
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

/** What one file yielded. */
export interface SearchFileResult {
  /** Path relative to the drive's root. */
  path: string;
  matches: SearchMatch[];
  /** Stopped collecting at `maxMatchesPerFile` — there may be more. */
  truncated: boolean;
}

/** How far the scan has got, for the dialog's bar. */
export interface SearchProgress {
  scanned: number;
  total: number;
  current?: string;
}

// ─── Full-text search (drive scan) ──────────────────────────────────────────
//
// Whitelist of file extensions we will read + grep. Anything not in this set
// is skipped silently. Better-safe-than-sorry: better miss a match in a
// non-listed extension than try to grep a 10MB binary and run the browser
// out of memory.
const TEXT_FILE_EXTS = new Set([
  // docs / config / data
  'md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'conf', 'cfg',
  'properties', 'env', 'log', 'csv', 'tsv',
  // web / scripts
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'css', 'scss', 'sass', 'less',
  'html', 'htm', 'svg', 'vue', 'svelte',
  // backend / system
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'scala', 'swift', 'dart',
  'c', 'cpp', 'cc', 'h', 'hpp', 'ino', 'pde', 'cs', 'sh', 'bash', 'zsh', 'fish',
  'sql', 'lua', 'r', 'pl',
]);

/** Files with no extension that are conventionally text. Compared
 *  case-insensitive against the basename. */
const TEXT_FILE_NAMES_NO_EXT = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'changelog',
  'authors', 'contributors', 'notice',
]);

function isTextFile(name: string): boolean {
  if (name.startsWith('.')) return false;   // skip hidden / sidecar files
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
  maxFiles: number,
): Promise<string[]> {
  const results: string[] = [];
  // BFS — shorter queue than DFS for wide trees + we get partial results
  // sooner if we ever want to surface them mid-walk.
  const queue: string[] = [baseRel];
  while (queue.length > 0 && results.length < maxFiles) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const dir = queue.shift()!;
    let entries: VfsEntry[] = [];
    try { entries = await vfsListDir(vfs, dir); }
    catch { continue; } // unreadable dir — skip silently
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
function buildSearchRegex(
  query: string,
  caseSensitive: boolean,
  isRegex: boolean,
): RegExp | null {
  try {
    const source = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(source, caseSensitive ? 'g' : 'gi');
  } catch { return null; }
}

/** A file's content as text; empty when it is not there. */
async function readFileAsText(vfs: DriveVfs, rel: string): Promise<string> {
  return (await readTextOrNull(vfs, rel)) ?? '';
}

const SEARCH_MAX_FILES = 5000;          // hard cap on scan size
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
  onProgress: (p: SearchProgress) => void,
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
    try { text = await readFileAsText(vfs, path); }
    catch { continue; }
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
  txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
  csv: 'text/csv', tsv: 'text/tab-separated-values', log: 'text/plain',
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript',
  tsx: 'text/typescript', jsx: 'text/javascript',
  py: 'text/x-python', sh: 'text/x-shellscript', rb: 'text/x-ruby',
  go: 'text/x-go', rs: 'text/x-rust', java: 'text/x-java',
  c: 'text/x-c', h: 'text/x-c', cpp: 'text/x-c++', hpp: 'text/x-c++',
  toml: 'text/x-toml', ini: 'text/plain', env: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf', djvu: 'image/vnd.djvu', djv: 'image/vnd.djvu',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
};
function guessMime(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
const isTextMime = (m: string) => m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m === 'image/svg+xml';
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
// `.data.json`     → opens MjdDataEditor (form for the sibling .mjd)
// Both render in the right-side preview panel via MjdVfsLoader, same UX as
// Markdown editing.
type MjdMode = 'def' | 'data';

const getMjdMode = (name: string): MjdMode | null => {
  const n = name.toLowerCase();
  if (n.endsWith('.mjd')) return 'def';
  if (n.endsWith('.data.json')) return 'data';
  return null;
};
const isMjdEditable = (name: string) => getMjdMode(name) !== null;

// `.myschema.json` → graphical schema/.d.ts editor (GlobalJsonLoader), opened in
// the same right-side preview panel. Standalone JSON, no linked .mjd schema.
const isMySchemaJson = (name: string) => /\.myschema\.json$/i.test(name);

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
  { key: 'md',        label: 'Markdown (.md)',                  defaultName: 'notatka.md',         extension: '.md' },
  { key: 'json',      label: 'JSON (.json)',                    defaultName: 'data.json',          extension: '.json' },
  { key: 'mjd-def',   label: 'MJD definition (.mjd)',           defaultName: 'schema.mjd',         extension: '.mjd' },
  { key: 'mjd-data',  label: 'MJD data (.data.json)',           defaultName: 'dane.data.json',     extension: '.data.json' },
  { key: 'myschema',  label: 'My Schema (.myschema.json)',      defaultName: 'schema.myschema.json', extension: '.myschema.json' },
  { key: 'yaml',      label: 'YAML — konfiguracja (.yaml)',     defaultName: 'config.yaml',        extension: '.yaml' },
  { key: 'toml',      label: 'TOML — konfiguracja (.toml)',     defaultName: 'config.toml',        extension: '.toml' },
  { key: 'ini',       label: 'INI — konfiguracja (.ini)',       defaultName: 'config.ini',         extension: '.ini' },
  { key: 'env',       label: '.env — zmienne środowiskowe',     defaultName: '.env',               extension: '.env' },
  { key: 'ts',        label: 'TypeScript (.ts)',                defaultName: 'index.ts',           extension: '.ts' },
  { key: 'tsx',       label: 'TypeScript React (.tsx)',         defaultName: 'Component.tsx',      extension: '.tsx' },
  { key: 'js',        label: 'JavaScript (.js)',                defaultName: 'index.js',           extension: '.js' },
  { key: 'py',        label: 'Python (.py)',                    defaultName: 'main.py',            extension: '.py' },
  { key: 'cpp',       label: 'C++ (.cpp)',                      defaultName: 'main.cpp',           extension: '.cpp' },
  { key: 'css',       label: 'CSS (.css)',                      defaultName: 'styles.css',         extension: '.css' },
  { key: 'html',      label: 'HTML (.html)',                    defaultName: 'index.html',         extension: '.html' },
  { key: 'sh',        label: 'Shell script (.sh)',              defaultName: 'script.sh',          extension: '.sh' },
  { key: 'custom',    label: 'Inny (bez wymuszania rozszerzenia)', defaultName: 'untitled.txt',    extension: '' },
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
const isImageMime = (m: string) => m.startsWith('image/') && m !== 'image/svg+xml' && m !== 'image/vnd.djvu' && m !== 'image/x-djvu';
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
const DocPreview: React.FC<{ viewers: DriveViewers | null; file: DriveFileRef }> = ({ viewers, file }) => (
  <Box sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
    {viewers && viewers.canView(file)
      ? viewers.render(file)
      : (
        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
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
  const ext = (name.toLowerCase().split('.').pop() ?? '');
  // Same set of recognised extensions we'd highlight, minus the markdown
  // variants. Kept inline rather than via a Set so the literal stays a
  // single grep target.
  // hydra/hsch/hcomp: pliki projektu frameworka Hydra. Są YAML-em, ale mają
  // własne rozszerzenia, żeby wtyczka Hydra Studio mogła je rozpoznać —
  // otwarcie w tym edytorze uruchamia jej interfejs obok zakładki tekstowej.
  return /^(json|jsonc|json5|map|js|mjs|cjs|jsx|ts|tsx|mts|cts|py|pyi|xml|svg|xsd|xsl|html|htm|css|scss|less|yaml|yml|hydra|hsch|hcomp|sh|bash|zsh|sql|c|h|cpp|cc|cxx|hpp|hh|hxx|ino|pde|java|kt|rs|go|rb|php|cs|fs|swift|dart|lua|r|pl|ini|cfg|toml|env|conf|dockerfile|gitignore|gitattributes)$/.test(ext);
}

// Lekkie czyszczenie markdown wyeksportowanego z Notion: dekoduje %20 w lokalnych
// linkach i usuwa 32-znakowy hash Notion z nazw plików ("Nazwa 1a2b…def.md" → "Nazwa.md").
function cleanNotionMarkdown(md: string): string {
  let s = md.replace(/\r\n/g, '\n');
  s = s.replace(/\]\(([^)]+)\)/g, (m, url: string) => {
    if (/^https?:/i.test(url)) return m;
    try { return `](${decodeURIComponent(url).replace(/ [0-9a-f]{32}(?=[./]|$)/gi, '')})`; } catch { return m; }
  });
  s = s.replace(/ [0-9a-f]{32}(?=[.\s)/])/gi, '');
  return s.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function stripNotionHash(s: string): string { return s.replace(/ [0-9a-f]{32}(?=\.|\/|$)/gi, ''); }
function sanitizeFileName(s: string): string { return (s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'plik'); }

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}

function base64ToText(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function textToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = fr.result;
      if (typeof r !== 'string') { reject(new Error('FileReader gave non-string')); return; }
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
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

/** Convert a File to base64 (no `data:...,` prefix). Streams via FileReader. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = fr.result;
      if (typeof r !== 'string') { reject(new Error('FileReader gave non-string')); return; }
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/** Read the JWT from localStorage — same source as authHeaders(). */
function authToken(): string | undefined {
  try {
    const raw = localStorage.getItem('minis_current_user');
    return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
  } catch { return undefined; }
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
  if (direct) { open(direct); return; }
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

// ─── In-browser script runner ────────────────────────────────────────────────
// JS/TS files opened in the Drive editor can be executed in the page itself
// (the user's own code, same trust model as Plugin Scripts). `console.*` is
// redirected into a panel below the editor.
type BrowserConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface BrowserConsoleLine { level: BrowserConsoleLevel; text: string }
const MAX_BROWSER_CONSOLE = 500;
const isBrowserRunnable = (name: string) => /\.(js|mjs|cjs|ts)$/i.test(name);
function fmtConsoleArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? a.message;
  try { return JSON.stringify(a, null, 2); } catch { return String(a); }
}
function browserConsoleColor(l: BrowserConsoleLevel): string {
  return l === 'error' ? 'error.main'
    : l === 'warn' ? 'warning.main'
    : l === 'info' ? 'info.main'
    : l === 'debug' ? 'text.secondary'
    : 'text.primary';
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  vfs, startDir = '', editor = null, assistant = null, viewers = null, toolbarStart,
}: DrivePageProps): React.ReactElement {
  // Inicjalizacja z `?cwd=` (wejście z Pulpitu do ulubionego katalogu) — dzięki temu PIERWSZY
  // refresh ładuje właściwy katalog (a nie root, który potem trzeba by nadpisać → wyścig).
  const [cwd, setCwd] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('cwd') ?? ''; } catch { return ''; }
  });                                                       // relative under /drive/
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
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
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success'|'error'|'info' }>({ open: false, msg: '', severity: 'success' });
  const [menuFor, setMenuFor] = useState<{ anchor: HTMLElement | null; entry: VfsEntry; pos?: { top: number; left: number } } | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameDialog, setRenameDialog] = useState<{ entry: VfsEntry; value: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Clipboard for cut/copy/paste. `mode` decides whether paste moves (cut) or duplicates (copy).
  const [clipboard, setClipboard] = useState<{ entry: VfsEntry; sourceDir: string; mode: 'copy' | 'cut' } | null>(null);
  // View dialog state. textContent is set only when the MIME maps to a text-like format
  // OR the filename matches a recognised code-file extension — the Monaco editor
  // in the right panel uses textContent as its initial value.
  const [viewing, setViewing] = useState<{ entry: VfsEntry; mime: string; textContent?: string } | null>(null);
  // Git repo panel state — set when a `.repo.json` file is opened. `path` is the
  // .repo.json path relative to the user's drive root (e.g. `myrepo/.repo.json`).
  // Graphical (schema form) editor for a `.json` file. `rel` is drive-relative.
  // "Zmień schema" dialog — bound to the json file at `rel`; `current` is its
  // existing $schema binding (or null).
  // When a file is opened by clicking an embedded File component, remember the
  // source markdown so the opened editor can offer a "← back to markdown" button.
  // "New empty file" dialog. Just a name field — content is empty bytes.
  const [newFileDialog, setNewFileDialog] = useState<{ name: string; presetKey: string } | null>(null);
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
  const toast = useCallback((msg: string, severity: 'success'|'error'|'info' = 'success') => {
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
    try { return localStorage.getItem('drive_favs_open') !== '0'; }
    catch { return true; }
  });
  const FAV_PATH = 'drive/.favorites.json';

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
  const currentPreviewIdx = viewing ? fileEntries.findIndex((e) => e.name === viewing.entry.name) : -1;
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
  // Run-on-backend console state (Drive → Run). Declared here so panelOpen below
  // can include it; the run/stop handlers live near closeRightPanel.
  const [running, setRunning] = useState<{ rel: string; output: string; status: 'running' | 'done' | 'error'; kind: 'run' | 'install'; target: string } | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  // Read-only log viewer (Drive → Logs). Shows drive/.logs/{rel}.log content.
  const [logsView, setLogsView] = useState<{ rel: string; content: string } | null>(null);
  const panelOpen = !!(viewing || editing || running || logsView);

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
  const driveStoreForCapabilities = useMemo<DriveStore>(() => ({
    startDir,
    list: async (dir) => (await vfs.list(dir)).map((e) => ({
      name: e.name, directory: e.type === DIR_TYPE, size: e.size, modified: e.mtime,
    })),
    read: async (path) => asText(await vfs.readFile(path)),
    readBytes: (path) => vfs.readFile(path),
    write: (path, content) => vfs.writeFile(path, fromText(content)),
    ...(vfs.delete ? { remove: (path: string) => vfs.delete!(path, false) } : {}),
    ...(vfs.rename ? { rename: (from: string, to: string) => vfs.rename!(from, to) } : {}),
    ...(vfs.mkdir ? { createDir: (path: string) => vfs.mkdir!(path) } : {}),
    ...(vfs.downloadUrl ? { urlFor: (path: string) => vfs.downloadUrl!(path) } : {}),
  }), [startDir, vfs]);

  /**
   * Opens a file in the host's editor.
   *
   * MyCastle had one handler per editor — Markdown, MJD, JSON schema, the
   * dashboard, Qt. Here there is one capability, and whether a given file opens
   * in it is the editor's own answer (`canEdit`). With no editor passed this
   * does nothing at all, and the entries that call it are not drawn.
   */
  const openInEditor = useCallback((entry: VfsEntry, relOverride?: string) => {
    if (!editor) return;
    const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
    const file: DriveFileRef = { path: rel, name: entry.name, store: driveStoreForCapabilities };
    if (!editor.canEdit(file)) return;
    setViewing(null);
    setEditing(file);
  }, [cwd, editor, driveStoreForCapabilities]);

  const resetPanels = useCallback(() => {
    setViewing(null);
    setEditing(null);
    runAbortRef.current?.abort();
    setRunning(null);
    setLogsView(null);
  }, []);

  // The editor/preview panel now opens inline on every screen size. On a phone
  // it takes over the whole viewport (the file list hides while it is open).
  const showRightPanel = panelOpen;
  const showSidebar = !((isWide && panelFullscreen) || (!isWide && panelOpen));
  // [port] dropped — the agent panel is the `assistant` capability now

  // ── Initial mkdir + refresh ─────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    const requested = cwd; // snapshot — odrzuć wynik, jeśli cwd zmienił się w międzyczasie
    try {
      // Make sure /drive/ exists at all — first-time users won't have it.
      if (cwd === '') {
        await vfsMkdir(vfs, '').catch(() => {/* already exists */});
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

  // [port] dropped — the schema editor is not part of this package

  // [port] dropped — the Markdown editor is not part of this package

  // [port] dropped — importing Markdown bundles needs JSZip

  // [port] dropped — importing Markdown bundles needs JSZip

  const isFavorite = useCallback((rel: string) => favorites.has(rel), [favorites]);

  // Toggle ulubionego po pełnej ścieżce (nie zależy od cwd) — używane w okienku Ulubione.
  const toggleFavoritePath = useCallback((rel: string, name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) { next.delete(rel); toast(`Usunięto z ulubionych: ${name}`, 'info'); }
      else { next.add(rel); toast(`Dodano do ulubionych: ${name}`); }
      return next;
    });
  }, [toast]);

  const toggleFavorite = useCallback((entry: VfsEntry) => {
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
  }, [cwd, toast]);

  // ── Properties dialog ────────────────────────────────────────────────
  // Open: snapshot the current tag list for this file into the dialog draft.
  // Tag input is cleared so the user sees a clean field.
  const openPropertiesDialog = useCallback((entry: VfsEntry) => {
    const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
    setPropsDialog({ entry, rel });
    setPropsDraftTags(fileProperties.tags[rel] ?? []);
    setPropsDraftTagInput('');
    const sched = schedules[rel];
    setPropsDraftCron(sched?.cron ?? '');
    setPropsDraftCronEnabled(sched?.enabled ?? false);
    setPropsDraftStartup(sched?.runAtStartup ?? false);
  }, [cwd, fileProperties.tags, schedules]);

  // Add the in-progress text input as a chip (Enter or "+" button). Rejects
  // empties and duplicates silently. Commas would split a tag on the next
  // serialization round-trip, so they're normalised to '-'.
  const commitDraftTag = useCallback(() => {
    const trimmed = propsDraftTagInput.trim();
    if (!trimmed) return;
    const safe = trimmed.replace(/,/g, '-');
    setPropsDraftTags(prev => prev.includes(safe) ? prev : [...prev, safe]);
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
          nextSched[propsDialog.rel] = { cron: cronStr, enabled: propsDraftCronEnabled, runAtStartup: propsDraftStartup };
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
  }, [propsDialog, propsDraftTags, fileProperties, toast, schedules, propsDraftCron, propsDraftCronEnabled, propsDraftStartup]);

  // Forward-declared ref for opening files in MdEditor — set below once
  // `openInMdEditor` is in scope. Avoids the TDZ cycle that would otherwise
  // happen because `goToFavorite` is wired into render before openInMdEditor
  // is declared.
  const openInMdEditorRef = useRef<(entry: VfsEntry, relOverride?: string) => Promise<void>>(
    async () => {},
  );

  // [port] dropped — jumping to a favourite went through the Markdown editor and the router
  // sets cwd to the folder, then opens the file (MdEditor for .md/.txt,
  // preview for everything else). Skips already-deleted favorites with
  // a friendly toast instead of a hard error.
  const goToFavorite = useCallback(async (rel: string) => {
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
    if (editor && editor.canEdit({ path: rel, name: fileName, store: driveStoreForCapabilities })) {
      openInEditor(entry, rel);
    } else {
      // Inline read → setViewing (same as double-click on a file row).
      try {
        const text = await readTextOrNull(vfs, rel);
        if (text === null) return null;
        const mime = guessMime(fileName);
        // Source code / config files (.json, .ts, .py, …) are routed to the
        // Monaco editor, so we decode them as text too — not just text/* MIMEs.
        const textContent = isEditableTextFile(fileName, mime) ? text : undefined;
        resetPanels();
        setViewing({ entry, mime, textContent });
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    }
  }, [toast, resetPanels]);

  // [port] dropped — exporting Markdown bundles needs JSZip

  // ── Operations ──────────────────────────────────────────────────────────
  // Open a `.json` file in the graphical schema form editor (right panel).
  // Declared before onOpen so onOpen can reference it without a TDZ cycle.
  // [port] dropped — the JSON-schema form editor is not part of this package

  const onOpen = useCallback((entry: VfsEntry) => {
    if (entry.type === DIR_TYPE) {
      setCwd((p) => (p ? `${p}/${entry.name}` : entry.name));
      return;
    }

    // MyCastle branched here on the extension — a schema editor, MJD, Markdown,
    // a dashboard, a git panel, a Qt designer — each opening a panel of its own.
    // The editor answers for itself now, and everything else is previewed.
    if (editor && editor.canEdit({ path: cwd ? `${cwd}/${entry.name}` : entry.name, name: entry.name, store: driveStoreForCapabilities })) {
      openInEditor(entry);
      return;
    }

    // Other files → preview / Monaco editor (matches OS file managers more
    // closely than auto-download; user can still hit "Pobierz" from the menu).
    void (async () => {
      try {
        const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
        const text = await readTextOrNull(vfs, rel);
        if (text === null) return null;
        const mime = guessMime(entry.name);
        // See goToFavorite — same routing rule (code-like extensions get
        // decoded so the Monaco editor can highlight them).
        const textContent = isEditableTextFile(entry.name, mime) ? text : undefined;
        // `.json` with a drive-relative `$schema` binding → graphical form editor.
        if (textContent !== undefined && /\.json$/i.test(entry.name)) {
          try {
          } catch { /* not valid JSON — fall through to text editor */ }
        }
        resetPanels();
        setViewing({ entry, mime, textContent });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    })();
  }, [cwd, toast, resetPanels]);

  const onDownload = useCallback(async (entry: VfsEntry) => {
    try {
      await downloadFile(vfs, cwd ? `${cwd}/${entry.name}` : entry.name, entry.name);
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [cwd, toast]);

  // Nazwa pakowanego katalogu (≠ null ⇒ pokazujemy overlay ze spinnerem).
  const [zipping, setZipping] = useState<string | null>(null);

  // [port] dropped — zipping a folder in the browser needs JSZip — a dependency a file list should not carry

  const onDelete = useCallback(async (entry: VfsEntry) => {
    const kind = entry.type === DIR_TYPE ? 'katalog' : 'plik';
    if (!confirm(`Usunąć ${kind} "${entry.name}"${entry.type === DIR_TYPE ? ' i całą jego zawartość' : ''}?`)) return;
    try {
      await vfsDelete(vfs, cwd ? `${cwd}/${entry.name}` : entry.name, entry.type === DIR_TYPE);
      toast(`Usunięto "${entry.name}"`);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [cwd, refresh, toast]);

  const doRename = useCallback(async () => {
    if (!renameDialog) return;
    const newName = renameDialog.value.trim();
    if (!newName || newName === renameDialog.entry.name) { setRenameDialog(null); return; }
    if (newName.includes('/')) { toast('Nazwa nie może zawierać "/"', 'error'); return; }
    try {
      const oldRel = cwd ? `${cwd}/${renameDialog.entry.name}` : renameDialog.entry.name;
      const newRel = cwd ? `${cwd}/${newName}` : newName;
      await vfsRename(vfs, oldRel, newRel);
      toast(`Zmieniono nazwę na "${newName}"`);
      setRenameDialog(null);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [renameDialog, cwd, refresh, toast]);

  const doMkdir = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || name.includes('/')) { toast('Nazwa katalogu nie może być pusta ani zawierać "/"', 'error'); return; }
    try {
      await vfsMkdir(vfs, cwd ? `${cwd}/${name}` : name);
      toast(`Utworzono katalog "${name}"`);
      setNewFolderDialog(false);
      setNewFolderName('');
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [newFolderName, cwd, refresh, toast]);

  const moveToPublic = useCallback(async (entry: VfsEntry) => {
    if (isPublic(vfs, cwd ? `${cwd}/${entry.name}` : entry.name)) {
      toast('Plik jest już w katalogu publicznym', 'info');
      return;
    }
    try {
      await vfsMkdir(vfs, 'public').catch(() => {/* exists */});
      const oldRel = cwd ? `${cwd}/${entry.name}` : entry.name;
      await vfsRename(vfs, oldRel, `public/${entry.name}`);
      toast(`Przeniesiono "${entry.name}" do public/`);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [cwd, refresh, toast]);

  // ── Cut / Copy / Paste ────────────────────────────────────────────────

  const copyToClipboard = useCallback((entry: VfsEntry, mode: 'copy' | 'cut') => {
    setClipboard({ entry, sourceDir: cwd, mode });
    const verb = mode === 'cut' ? 'Wycięto' : 'Skopiowano';
    toast(`${verb} "${entry.name}" — wklej w wybranym katalogu (Wklej / ⌘V)`, 'info');
  }, [cwd, toast]);

  const paste = useCallback(async () => {
    if (!clipboard) return;
    try {
      const sourceRel = clipboard.sourceDir ? `${clipboard.sourceDir}/${clipboard.entry.name}` : clipboard.entry.name;
      // Same-dir paste needs a new name to avoid clobbering the source.
      const destName = (clipboard.sourceDir === cwd)
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

  // [port] dropped — exporting a zip needs JSZip

  // ── View / Open / Create ────────────────────────────────────────────────

  const viewFile = useCallback(async (entry: VfsEntry, relOverride?: string) => {
    if (entry.type !== FILE_TYPE) return;
    try {
      const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
      const text = await readTextOrNull(vfs, rel);
      if (text === null) return null;
      const mime = guessMime(entry.name);
      // Decode UTF-8 for both proper text MIMEs and recognised code-file
      // extensions (Monaco gets to highlight either way). Binary content
      // stays as base64 — we render via data: URLs (img/iframe/audio/video).
      const textContent = isEditableTextFile(entry.name, mime) ? text : undefined;
      resetPanels();
      setViewing({ entry, mime, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [cwd, toast, resetPanels]);

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
  const openMdAsRawSource = useCallback(async (entry: VfsEntry) => {
    try {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      const text = await readTextOrNull(vfs, rel);
      if (text === null) return null;
      const mime = guessMime(entry.name) || 'text/markdown';
      // Force-decode as text — the standard `isEditableTextFile` check would
      // refuse markdown to keep MdEditor as the default; we're explicitly
      // overriding that here.
      const textContent = text;
      resetPanels();
      setViewing({ entry, mime, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [cwd, toast, resetPanels]);

  // [port] dropped — the dashboard editor is not part of this package

  // [port] dropped — npm install is MyCastle's own endpoint

  // Auto-save callback from MdEditor. Fires on debounce (2s) and on the
  // toolbar's manual save button. Idempotent — writes the whole document each time.
  // [port] dropped — the Markdown editor is not part of this package

  // [port] dropped — the daily journal belonged to MyCastle's PIM

  // [port] dropped — exporting Markdown bundles needs JSZip
  const exportCleanMd = useCallback(async () => {
    // [port] dropped — the Markdown editor is not part of this package
  }, []);

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
      const b64 = clipboardCreateDialog.kind === 'image'
        ? clipboardCreateDialog.imageB64
        : textToBase64(clipboardCreateDialog.textContent);
      await vfsWriteFile(vfs, rel, fromText(text));
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
  const upload = useCallback(async (files: ReadonlyArray<File | { file: File; relPath: string }>) => {
    // Accept either a plain File[] (from <input type=file>) or a list with
    // pre-computed relative paths (from a folder drag-and-drop). Normalise
    // both into the same `{file, relPath}` shape so the upload loop below
    // doesn't need to branch.
    const arr = Array.from(files).map(item =>
      item instanceof File ? { file: item, relPath: item.name } : item,
    );
    if (arr.length === 0) return;
    // Snapshot the current directory NOW — before any await — so that if the
    // user navigates to a different folder mid-upload, all files in this batch
    // still land in the directory that was active when the upload started.
    const uploadCwd = cwd;
    // Base64 encoding inflates ~33%. The backend's JSON body cap is 200 MB,
    // so anything past ~140 MB raw will be rejected before we even POST.
    // Pre-flight check gives a useful error instead of a vague 500.
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
          throw new Error(`Plik za duży (${(file.size / 1024 / 1024).toFixed(1)} MB; limit ${(HARD_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB)`);
        }
        const b64 = await fileToBase64(file);
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
              await vfsMkdir(vfs, acc).catch(() => { /* already exists or race */ });
              createdDirs.add(acc);
            }
          }
        }
        // Live byte progress via the XHR variant of vfsWriteFile.
        await vfsWriteFile(vfs, rel, bytes, (pct) => {
          setUploading((prev) => prev ? { ...prev, currentPct: pct } : prev);
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
      setUploading((prev) => prev ? { ...prev, done, currentPct: 100, failed } : prev);
    }
    setUploading(null);
    const ok = done - failed;
    if (ok > 0) toast(`Wgrano ${ok} z ${arr.length} plików`);
    await refresh();
  }, [cwd, refresh, toast]);

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
  const collectDroppedFiles = useCallback(async (
    items: DataTransferItemList,
  ): Promise<{ file: File; relPath: string }[]> => {
    const results: { file: File; relPath: string }[] = [];

    const readDirEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
      // readEntries returns at most ~100 entries per call; iterate until empty.
      return new Promise((resolve, reject) => {
        const all: FileSystemEntry[] = [];
        const step = () => reader.readEntries((batch) => {
          if (batch.length === 0) resolve(all);
          else { all.push(...batch); step(); }
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
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void upload(Array.from(e.target.files));
    e.target.value = '';
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
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
  }, [upload, collectDroppedFiles, toast]);

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
      const seen = new Set(prev.files.map(f => `${f.name}:${f.size}`));
      const merged = [...prev.files];
      for (const f of arr) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) { merged.push(f); seen.add(key); }
      }
      return { files: merged };
    });
  }, []);

  const removeFileFromUploadDialog = useCallback((idx: number) => {
    setUploadDialog((prev) => prev ? { files: prev.files.filter((_, i) => i !== idx) } : prev);
  }, []);

  const onDialogFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesToUploadDialog(e.target.files);
    e.target.value = '';   // reset so re-picking the same file fires onChange
  }, [addFilesToUploadDialog]);

  // Commit dialog: kicks the existing `upload()` pipeline with all staged
  // files in one batch, then closes the dialog on success.
  const commitUploadDialog = useCallback(async () => {
    if (!uploadDialog || uploadDialog.files.length === 0) return;
    const files = uploadDialog.files;
    setUploadDialog(null);
    await upload(files);
  }, [uploadDialog, upload]);

  // ── Breadcrumbs ─────────────────────────────────────────────────────────
  const segments = useMemo(() => cwd ? cwd.split('/').filter(Boolean) : [], [cwd]);


  // ── Right panel content (View or MdEditor) ──────────────────────────────
  // Rendered both as embedded panel (desktop) and as Dialog content (mobile).
  // Drive-relative path of the file currently previewed (used as the workspace
  // open target — the workspace's `/` is the Drive root via SubpathFS).
  const viewingRel = viewing ? (cwd ? `${cwd}/${viewing.entry.name}` : viewing.entry.name) : '';

  const viewerBody = viewing && (
    viewing.textContent !== undefined && driveWorkspaceFs ? (
      // Full editor — same component as Electronics → Editor. The workspace
      // owns loading/saving (Ctrl+S → VFS), IntelliSense, tabs and search;
      // `initialPath` opens the clicked file. Keyed by user so switching
      // files reuses the same workspace (new tabs) instead of remounting.
      {/* [port] dropped — the embedded workspace: the host supplies an editor through the `editor` capability */}
    ) : isImageMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', p: 2, height: '100%', overflow: 'auto' }}>
        <img
          src={`data:${viewing.mime};base64,${''}`}
          alt={viewing.entry.name}
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 16px)' }}
        />
      </Box>
    ) : isPdfMime(viewing.mime) ? (
      <DocPreview viewers={viewers} file={{ path: viewingRel, name: viewing.entry.name, store: driveStoreForCapabilities }} />
    ) : isDjvuMime(viewing.mime) ? (
      <DocPreview viewers={viewers} file={{ path: viewingRel, name: viewing.entry.name, store: driveStoreForCapabilities }} />
    ) : isAudioMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <Box component="audio" controls
          src={`data:${viewing.mime};base64,${''}`}
          sx={{ width: '100%', maxWidth: 500 }}
        />
      </Box>
    ) : isVideoMime(viewing.mime) ? (
      <Box component="video" controls
        src={`data:${viewing.mime};base64,${''}`}
        sx={{ width: '100%', maxHeight: '100%', display: 'block' }}
      />
    ) : (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Plik binarny <code>{viewing.mime}</code> (~{formatBytes(Math.floor(''.length * 3 / 4))}) —
          podgląd niedostępny w przeglądarce. Pobierz, aby otworzyć w odpowiedniej aplikacji.
        </Alert>
      </Box>
    )
  );

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
      <Box sx={{
        p: 2,
        display: 'flex', flexDirection: 'column',
        // 280-620px sidebar: low end fits tablet portrait (~600px viewport)
        // with ~320px left for the right panel; high end caps on ultrawides
        // so the editor gets the dominant share.
        // When a file preview is open the sidebar is a clamped column. When only
        // the agent is open they split the canvas 50/50 (both flex:1).
        flex: showRightPanel ? `0 0 clamp(280px, 36%, 620px)` : 1,
        minWidth: 0, overflow: 'hidden',
        borderRight: (showRightPanel || showAgent) ? '1px solid' : 'none',
        borderColor: 'divider',
      }}>
      {/* Header — single "Actions" dropdown gathers every directory-level
          operation. Per-file ops live in the row's context menu (MoreVertIcon). */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        {/* Main nav + account — only as a full route (Global window has no params.userName) */}
        {params.userName && (
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1.5, px: 0.25, mr: 0.5 }}>
            <Tooltip title="Menu główne"><IconButton size="small" onClick={openNav}><MenuIcon /></IconButton></Tooltip>
          </Box>
        )}
        <Typography variant="h5" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
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
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFileInputChange} />
        <Tooltip title="Otwórz/utwórz dziennik na dziś — Calendar/{rok}/{miesiąc}/{dzień}.md">
          <Button
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={openTodayJournal}
          >
            Today
          </Button>
        </Tooltip>
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
        <MenuItem onClick={() => { openUploadDialog(); setActionsMenu(null); }}>
          <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Upload plików…" secondary="Wybierz / przeciągnij, przejrzyj, wgraj" />
        </MenuItem>
        <MenuItem onClick={() => { setNewFolderDialog(true); setActionsMenu(null); }}>
          <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Nowy katalog" />
        </MenuItem>
        <MenuItem onClick={() => { setNewFileDialog({ name: 'notatka.md', presetKey: 'md' }); setActionsMenu(null); }}>
          <ListItemIcon><NoteAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Nowy pusty plik" secondary="Z rozszerzeniem (np. .md, .json)" />
        </MenuItem>
        {/* [port] dropped — creating a file from the clipboard needs the editor */}
        <Divider />
        <MenuItem
          disabled={!clipboard}
          onClick={() => { void paste(); setActionsMenu(null); }}
        >
          <ListItemIcon><ContentPasteIcon fontSize="small" color={clipboard ? 'primary' : 'inherit'} /></ListItemIcon>
          <ListItemText
            primary={clipboard ? `Wklej "${clipboard.entry.name}"` : 'Wklej'}
            secondary={clipboard
              ? `${clipboard.mode === 'cut' ? 'przenieś' : 'duplikat'} · ⌘V`
              : 'Schowek pusty — skorzystaj z "Kopiuj" / "Wytnij" w menu pliku'}
          />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          const url = `/workspace/md?path=${encodeURIComponent(`/home/drive${cwd ? '/' + cwd : ''}`)}`;
          window.open(url, '_blank');
          setActionsMenu(null);
        }}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Otwórz w workspace"
            secondary="Monaco editor — kod, JSON, terminal, agent"
          />
        </MenuItem>
        {/* [port] dropped — the assistant is a capability now */}
        <MenuItem onClick={() => { setSearchOpen(true); setActionsMenu(null); }}>
          <ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Szukaj w plikach…"
            secondary="Bieżący katalog lub cały drive"
          />
        </MenuItem>
        <MenuItem onClick={() => { void refresh(); setActionsMenu(null); }}>
          <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Odśwież" />
        </MenuItem>
      </Menu>

      {/* Breadcrumbs */}
      <Paper sx={{ p: 1, mb: 1 }}>
        <Breadcrumbs>
          <Link component="button" underline="hover" onClick={() => setCwd('')}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <HomeIcon fontSize="small" /> drive
          </Link>
          {segments.map((seg, i) => (
            i === segments.length - 1 ? (
              <Typography key={i} color="text.primary">{seg}</Typography>
            ) : (
              <Link key={i} component="button" underline="hover"
                onClick={() => setCwd(segments.slice(0, i + 1).join('/'))}>
                {seg}
              </Link>
            )
          ))}
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
        <Dialog open hideBackdrop={false} maxWidth="xs" fullWidth disableEscapeKeyDown
          slotProps={{ paper: { sx: { p: 0 } } }}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <CloudUploadIcon />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>Wgrywanie plików</Typography>
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
                <Typography variant="caption" color="text.secondary">Łączny postęp</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(((uploading.done + (uploading.currentName ? uploading.currentPct / 100 : 0)) / uploading.total) * 100)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={((uploading.done + (uploading.currentName ? uploading.currentPct / 100 : 0)) / uploading.total) * 100}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Current file — name + per-file progress. Hidden between files. */}
            {uploading.currentName && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <InsertDriveFileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={uploading.currentName}>
                    {uploading.currentName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
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
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
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
              {favoritesOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Stack>
          <Collapse in={favoritesOpen} unmountOnExit>
            <Stack
              direction="row"
              flexWrap="wrap"
              useFlexGap
              spacing={0.75}
              sx={{ mt: 1 }}
            >
              {Array.from(favorites).sort().map((rel) => {
                const lastSlash = rel.lastIndexOf('/');
                const fileName = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
                const folder = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
                return (
                  <Chip
                    key={rel}
                    size="small"
                    icon={fileName.includes('.') ? <InsertDriveFileIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
                    label={fileName}
                    title={folder ? `${folder}/${fileName}` : fileName}
                    onClick={() => { void goToFavorite(rel); }}
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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        sx={{
          flex: 1, overflow: 'auto', position: 'relative',
          border: dragOver ? '2px dashed' : '2px dashed transparent',
          borderColor: dragOver ? 'primary.main' : 'transparent',
          transition: 'border-color 0.15s',
        }}
      >
        {dragOver && (
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.05)', zIndex: 10, pointerEvents: 'none',
          }}>
            <Typography variant="h6" color="primary">Upuść pliki tutaj</Typography>
          </Box>
        )}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
        ) : entries.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1">Pusty katalog</Typography>
            <Typography variant="caption">Przeciągnij pliki tutaj lub użyj <strong>Upload</strong> / <strong>New folder</strong></Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Nazwa</TableCell>
                <TableCell sx={{ width: 100, display: { xs: 'none', md: 'table-cell' } }}>Rozmiar</TableCell>
                <TableCell sx={{ width: 200, display: { xs: 'none', md: 'table-cell' } }}>Modyfikowane</TableCell>
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
                      setMenuFor({ anchor: null, entry: e, pos: { top: ev.clientY, left: ev.clientX } });
                    }}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ width: 40 }}>
                      {e.type === DIR_TYPE
                        ? <FolderIcon sx={{ color: pub ? 'success.main' : 'primary.main' }} />
                        : <InsertDriveFileIcon sx={{ color: pub ? 'success.main' : 'text.secondary' }} />}
                    </TableCell>
                    <TableCell onClick={() => e.type === DIR_TYPE && onOpen(e)}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
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
                        {pub && <Tooltip title="Publiczny — dostępny przez HTTP bez logowania"><PublicIcon fontSize="small" color="success" /></Tooltip>}
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
                            sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
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
                      <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); setMenuFor({ anchor: ev.currentTarget, entry: e }); }}>
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
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0, bgcolor: 'background.default',
        }}>
          {/* Panel toolbar */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
            borderBottom: '1px solid', borderColor: 'divider',
            bgcolor: 'background.paper',
          }}>
            {/* [port] dropped — going back to the Markdown editor */}
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
            {/* Run the open .js/.ts file in the browser (live editor buffer) +
                console panel toggle. */}
            {/* [port] dropped — the in-browser script runner went with the editor */}
            <Tooltip title="Zamknij panel">
              <IconButton size="small" onClick={closeRightPanel}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          {/* Panel content */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
            {running && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Console toolbar — status + Stop / Re-run */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  borderBottom: '1px solid', borderColor: 'divider',
                }}>
                  <Chip
                    size="small"
                    color={running.status === 'running' ? 'info' : running.status === 'done' ? 'success' : 'error'}
                    label={running.status === 'running' ? 'Uruchomione…' : running.status === 'done' ? 'Zakończono' : 'Błąd'}
                  />
                  <Box sx={{ flex: 1 }} />
                  {running.status === 'running' ? (
                    <Button size="small" color="error" startIcon={<CloseIcon />} onClick={stopScript}>
                      Stop
                    </Button>
                  ) : (
                    {/* [port] dropped — npm install is MyCastle's own endpoint */}
                  )}
                </Box>
                <Box component="pre" sx={{
                  flex: 1, m: 0, p: 1.5, overflow: 'auto',
                  fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  bgcolor: '#1e1e1e', color: '#d4d4d4',
                }}>
                  {running.output || (running.status === 'running' ? '…' : '(brak wyjścia)')}
                </Box>
              </Box>
            )}
            {logsView && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  borderBottom: '1px solid', borderColor: 'divider',
                }}>
                  <Chip size="small" variant="outlined" icon={<SubjectIcon />} label="logi skryptu" />
                  <Box sx={{ flex: 1 }} />
                  {/* [port] dropped — the log stream is MyCastle's own endpoint */}
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => void clearLogs(logsView.rel)}>
                    Wyczyść
                  </Button>
                </Box>
                <Box component="pre" sx={{
                  flex: 1, m: 0, p: 1.5, overflow: 'auto',
                  fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  bgcolor: '#1e1e1e', color: '#d4d4d4',
                }}>
                  {logsView.content || '(pusty)'}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
      {/* [port] dropped — the AI agent panel: `@hestia/ui-ai` supplies it through the `assistant` capability */}
      </Box>

      {/* Per-entry menu */}
      <Menu
        anchorEl={menuFor?.anchor}
        anchorReference={menuFor?.pos ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={menuFor?.pos}
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
      >
        {menuFor && menuFor.entry.type === DIR_TYPE && (
          <MenuItem onClick={() => { const entry = menuFor.entry; setMenuFor(null); onOpen(entry); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Otwórz</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void viewFile(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Podgląd</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && /\.(md|markdown)$/i.test(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            const relEnc = rel.split('/').map(encodeURIComponent).join('/');
            navigate(`/viewer/md-rich/u/${encodeURIComponent(userName)}/${relEnc}`);
            setMenuFor(null);
          }}>
            <ListItemIcon><ArticleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Otwórz w Viewer</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isRunnable(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            void restartScript(rel);
            setMenuFor(null);
          }}>
            <ListItemIcon><RestartAltIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
            <ListItemText primary="Restart" secondary="Ubij i uruchom w tle nową wersję" />
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isRunnable(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            void openLogs(rel);
            setMenuFor(null);
          }}>
            <ListItemIcon><SubjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Logs" secondary="Wyjście skryptu (Run + cron)" />
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && menuFor.entry.name === 'package.json' && (
          {/* [port] dropped — npm install is MyCastle's own endpoint */}
        )}
        {menuFor && (() => {
          const rel = cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name;
          const isFav = isFavorite(rel);
          const isDir = menuFor.entry.type === DIR_TYPE;
          return (
            <MenuItem onClick={() => { toggleFavorite(menuFor.entry); setMenuFor(null); }}>
              <ListItemIcon>
                {isFav
                  ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  : <StarBorderIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{isFav ? 'Usuń z ulubionych' : `Dodaj do ulubionych${isDir ? ' (katalog)' : ''}`}</ListItemText>
            </MenuItem>
          );
        })()}
        {menuFor && menuFor.entry.type === FILE_TYPE && isMdEditable(menuFor.entry.name) && (
          <MenuItem onClick={() => { openInEditor(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><EditNoteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Otwórz w MdEditor</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void onDownload(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Pobierz</ListItemText>
          </MenuItem>
        )}
        {/* [port] dropped — downloading a folder as a zip needs JSZip */}
        {menuFor && !isPublic(vfs, cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          <MenuItem onClick={() => { void moveToPublic(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
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
          <MenuItem onClick={() => { void copyPublicUrl(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Kopiuj link publiczny</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={async () => {
          // Ścieżka w formacie używanym przez api.file w skryptach automatyzacji
          // (userBase-relative: `drive/{rel}`), nie backendowa /data/Minis/Users/...
          const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
          const apiPath = `drive/${rel}`;
          setMenuFor(null);
          const ok = await copyTextToClipboard(apiPath);
          if (ok) toast(`Skopiowano ścieżkę: ${apiPath}`);
          else prompt('Skopiuj ścieżkę ręcznie:', apiPath);
        }}>
          <ListItemIcon><CodeIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Path" secondary="Ścieżka dla api.file (skrypty)" />
        </MenuItem>
        <MenuItem onClick={async () => {
          // Pełna ścieżka VFS w katalogu użytkownika (backendowa: /data/Minis/Users/{u}/...).
          const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
          const vfsPath = `/data/Minis/Users/${userName}/drive/${rel}`;
          setMenuFor(null);
          const ok = await copyTextToClipboard(vfsPath);
          if (ok) toast(`Skopiowano VFS path: ${vfsPath}`);
          else prompt('Skopiuj VFS path ręcznie:', vfsPath);
        }}>
          <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="VFS path" secondary="Pełna ścieżka w katalogu użytkownika" />
        </MenuItem>
        <MenuItem onClick={() => { copyToClipboard(menuFor!.entry, 'copy'); setMenuFor(null); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Kopiuj</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { copyToClipboard(menuFor!.entry, 'cut'); setMenuFor(null); }}>
          <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Wytnij</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setRenameDialog({ entry: menuFor!.entry, value: menuFor!.entry.name }); setMenuFor(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Zmień nazwę</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { openPropertiesDialog(menuFor!.entry); setMenuFor(null); }}>
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Właściwości…</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { void onDelete(menuFor!.entry); setMenuFor(null); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Usuń</ListItemText>
        </MenuItem>
      </Menu>

      {/* Overlay podczas pakowania katalogu do ZIP — kółko + informacja. */}
      <Backdrop
        open={zipping !== null}
        sx={{ zIndex: (t) => t.zIndex.modal + 10, color: '#fff', flexDirection: 'column', gap: 2 }}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body1">Pakowanie „{zipping}" do ZIP…</Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>To może chwilę potrwać przy dużych katalogach.</Typography>
      </Backdrop>

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
            <Typography variant="body2" fontWeight={600}>Tagi pliku</Typography>
          </Box>
          <Box sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mb: 1,
            minHeight: 32,
            p: 0.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
          }}>
            {propsDraftTags.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 0.5 }}>
                Brak tagów — dodaj poniżej.
              </Typography>
            ) : propsDraftTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => setPropsDraftTags(prev => prev.filter(t => t !== tag))}
              />
            ))}
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              value={propsDraftTagInput}
              onChange={e => setPropsDraftTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraftTag();
                } else if (e.key === 'Backspace' && !propsDraftTagInput && propsDraftTags.length > 0) {
                  // Empty-input backspace deletes the last chip — same UX as
                  // Gmail/Slack recipient fields.
                  e.preventDefault();
                  setPropsDraftTags(prev => prev.slice(0, -1));
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
            Tagi są zapisywane w <code>drive/.fileproperties.json</code>. Przydaje się do filtrowania /
            grupowania plików w przyszłych narzędziach.
          </Typography>

          {/* Cron schedule — only for runnable JS scripts (drive/server/*.mjs etc.) */}
          {propsDialog && isRunnable(propsDialog.entry.name) && (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ScheduleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" fontWeight={600}>Harmonogram (cron)</Typography>
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
                  control={<Switch size="small" checked={propsDraftCronEnabled} onChange={(e) => setPropsDraftCronEnabled(e.target.checked)} />}
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
                ].map(p => (
                  <Chip key={p.c} label={p.l} size="small" variant="outlined" onClick={() => setPropsDraftCron(p.c)} />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Skrypt uruchamiany na backendzie (<code>node {propsDialog.rel}</code>) wg wyrażenia cron
                (minuta godzina dzień miesiąc dzień-tygodnia). Puste pole = brak harmonogramu.
                Zapis do <code>drive/.schedules.json</code>.
              </Typography>

              <FormControlLabel
                sx={{ mt: 1 }}
                control={<Switch size="small" checked={propsDraftStartup} onChange={(e) => setPropsDraftStartup(e.target.checked)} />}
                label={
                  <Typography variant="body2">
                    Uruchom przy starcie serwera
                  </Typography>
                }
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPropsDialog(null)}>Anuluj</Button>
          <Button onClick={saveProperties} variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={newFolderDialog} onClose={() => setNewFolderDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nowy katalog</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nazwa" value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doMkdir(); }}
            margin="normal" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)}>Anuluj</Button>
          <Button variant="contained" disabled={!newFolderName.trim()} onClick={doMkdir}>Utwórz</Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      {renameDialog && (
        <Dialog open onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Zmień nazwę</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth label="Nowa nazwa" value={renameDialog.value}
              onChange={(e) => setRenameDialog({ ...renameDialog, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void doRename(); }}
              margin="normal" />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!renameDialog.value.trim() || renameDialog.value === renameDialog.entry.name} onClick={doRename}>
              Zmień
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Ustawienia widoku markdown (per-plik, zapisywane na backend). */}
      <Popover
        open={Boolean(mdSettingsAnchor)}
        anchorEl={mdSettingsAnchor}
        onClose={() => setMdSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, minWidth: 280 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>
            Ustawienia widoku
          </Typography>
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.minimalView} onChange={(e) => setMdSetting({ minimalView: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Widok minimalny</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Bez marginesów i bez nagłówków/ramek osadzonych bloczków</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.fullWidth} onChange={(e) => setMdSetting({ fullWidth: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pełna szerokość</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Treść na całą szerokość — bez pustych obszarów po bokach</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.smallText} onChange={(e) => setMdSetting({ smallText: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Mały tekst</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Mniejsza czcionka treści dokumentu</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.showToc} onChange={(e) => setMdSetting({ showToc: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pokaż spis treści</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Ruchome okienko z nagłówkami (linki)</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.showFavorites} onChange={(e) => setMdSetting({ showFavorites: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pokaż ulubione</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Ruchome okienko z ulubionymi plikami</Typography></Box>}
          />
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>
            Import / Eksport
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon fontSize="small" />} onClick={() => triggerMdImport('plain')} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Importuj czysty .md (z dysku)
            </Button>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon fontSize="small" />} onClick={() => triggerMdImport('notion')} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Importuj z Notion (.md / .zip)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportCleanMd()} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj czysty .md (bez rozszerzeń)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportZip(true)} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj strony → zip (czysty)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportZip(false)} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj strony → zip (z rozszerzeniami)
            </Button>
          </Box>
        </Box>
      </Popover>
      {/* Ukryty input pliku do importu markdown. */}
      <input ref={mdImportInputRef} type="file" accept=".md,.markdown,.txt,.zip" style={{ display: 'none' }} onChange={onMdImportFile} />

      {/* Ruchome okienka: Spis treści / Ulubione (per-plik, ustawiane w Ustawieniach). */}
      {/* [port] dropped — the Markdown table of contents */}
      {/* [port] dropped — the Markdown favourites panel */}

      {/* Preview actions menu — shared between mobile Dialog and the compact
          panel toolbar (tablet portrait). Mirrors what desktop shows inline. */}
      {viewing && (
        <Menu
          anchorEl={viewActionsMenu}
          open={viewActionsMenu !== null}
          onClose={() => setViewActionsMenu(null)}
          slotProps={{ paper: { sx: { minWidth: 240 } } }}
        >
          <MenuItem disabled sx={{ opacity: '1 !important' }}>
            <ListItemText
              primary={viewing.entry.name}
              secondary={viewing.mime}
              primaryTypographyProps={{ noWrap: true, fontWeight: 500 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <Divider />
          {viewing.textContent !== undefined && (
            <MenuItem onClick={() => { void copyViewTextToSystem(); setViewActionsMenu(null); }}>
              <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Kopiuj cały tekst" secondary="Do systemowego schowka" />
            </MenuItem>
          )}
          {isMdEditable(viewing.entry.name) && (
            <MenuItem onClick={() => {
              void openInEditor(viewing.entry);
              if (!isWide) setViewing(null);   // mobile Dialog: close on hand-off to new tab
              setViewActionsMenu(null);
            }}>
              <ListItemIcon><EditNoteIcon fontSize="small" /></ListItemIcon>
              <ListItemText
                primary="Edytuj w MdEditor"
                secondary={isWide ? 'Inline w prawym panelu' : 'W nowej karcie'}
              />
            </MenuItem>
          )}
          <MenuItem onClick={() => { void onDownload(viewing.entry); setViewActionsMenu(null); }}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Pobierz" />
          </MenuItem>
        </Menu>
      )}


      {/* New empty file dialog */}
      {newFileDialog && (() => {
        const currentPreset = FILE_PRESETS.find(p => p.key === newFileDialog.presetKey) ?? FILE_PRESETS[0];
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
                  const nextPreset = FILE_PRESETS.find(p => p.key === nextKey) ?? FILE_PRESETS[0];
                  // Auto-update name to the new preset's default IF the user
                  // hasn't typed something custom (still on a known default).
                  // Otherwise keep their text — they'll get auto-extension on save.
                  const wasDefault = FILE_PRESETS.some(p => p.defaultName === newFileDialog.name);
                  setNewFileDialog({
                    presetKey: nextKey,
                    name: wasDefault ? nextPreset.defaultName : newFileDialog.name,
                  });
                }}
              >
                {FILE_PRESETS.map(p => (
                  <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField autoFocus fullWidth label="Nazwa pliku" value={newFileDialog.name}
              onChange={(e) => setNewFileDialog({ ...newFileDialog, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void doCreateEmpty(); }}
              margin="normal"
              helperText={
                currentPreset.extension
                  ? `Rozszerzenie ${currentPreset.extension} zostanie dodane automatycznie jeśli go nie wpiszesz.`
                  : 'Wpisz pełną nazwę z rozszerzeniem.'
              }
            />
            {previewName && previewName !== newFileDialog.name && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Końcowa nazwa: <code>{previewName}</code>
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewFileDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!newFileDialog.name.trim()} onClick={doCreateEmpty}>Utwórz</Button>
          </DialogActions>
        </Dialog>
        );
      })()}

      {/* Create-from-clipboard dialog */}
      {clipboardCreateDialog && (
        <Dialog open onClose={() => setClipboardCreateDialog(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ContentPasteGoIcon /> Utwórz ze schowka
            <Chip size="small" label={clipboardCreateDialog.kind === 'image' ? 'obraz' : 'tekst'}
              color={clipboardCreateDialog.kind === 'image' ? 'primary' : 'default'}
              sx={{ ml: 1 }}
            />
          </DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Nazwa pliku" value={clipboardCreateDialog.name}
              onChange={(e) => setClipboardCreateDialog({ ...clipboardCreateDialog, name: e.target.value })}
              margin="normal"
              helperText="Jeśli plik o takiej nazwie istnieje, dostanie sufix (copy)"
            />
            {clipboardCreateDialog.kind === 'image' ? (
              <Box sx={{ textAlign: 'center', mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <img
                  src={`data:${clipboardCreateDialog.imageMime};base64,${clipboardCreateDialog.imageB64}`}
                  alt="podgląd"
                  style={{ maxWidth: '100%', maxHeight: '50vh' }}
                />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {clipboardCreateDialog.imageMime} • ~{formatBytes(Math.floor(clipboardCreateDialog.imageB64.length * 3 / 4))}
                </Typography>
              </Box>
            ) : (
              <>
                {!clipboardCreateDialog.textContent && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Twoja przeglądarka nie pozwala odczytać systemowego schowka automatycznie
                    (typowo: telefon, tablet, lub strona pod HTTP).
                    <br />
                    <strong>Wklej zawartość ręcznie w polu poniżej</strong> —
                    użyj <code>⌘V</code>/<code>Ctrl+V</code> na desktopie,
                    lub przytrzymaj pole i wybierz <strong>Wklej</strong> na mobile.
                  </Alert>
                )}
                <TextField fullWidth multiline rows={12} label="Treść (wklej lub edytuj)"
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
                      const nextName = (wasEmpty && stillDefault) ? suggestNameForText(newText) : prev.name;
                      return { ...prev, textContent: newText, name: nextName };
                    });
                  }}
                  margin="normal"
                  slotProps={{ htmlInput: { style: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13 } } }}
                  helperText={`${clipboardCreateDialog.textContent.length} znaków`}
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClipboardCreateDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!clipboardCreateDialog.name.trim()} onClick={doCreateFromClipboard}>
              Zapisz
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Upload staging dialog — pick / drop multiple files, review, commit. */}
      {uploadDialog && (() => {
        const UPLOAD_LIMIT = 140 * 1024 * 1024;   // pre-flight limit aligned with upload()
        const totalBytes = uploadDialog.files.reduce((sum, f) => sum + f.size, 0);
        const oversized = uploadDialog.files.filter(f => f.size > UPLOAD_LIMIT).length;
        return (
          <Dialog open onClose={() => setUploadDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CloudUploadIcon /> Upload plików do <code>/{cwd || ''}</code>
            </DialogTitle>
            <DialogContent>
              <input
                ref={dialogFileInputRef} type="file" multiple
                style={{ display: 'none' }} onChange={onDialogFileInputChange}
              />

              {/* Drop zone + pick button */}
              <Box
                onClick={() => dialogFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    addFilesToUploadDialog(e.dataTransfer.files);
                  }
                }}
                sx={{
                  border: '2px dashed', borderColor: 'divider',
                  borderRadius: 1, p: 3, mt: 1, textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.selected' },
                }}
              >
                <DriveFolderUploadIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 0.5 }} />
                <Typography variant="body2"><strong>Kliknij</strong>, aby wybrać pliki — lub przeciągnij tu z systemu</Typography>
                <Typography variant="caption" color="text.secondary">
                  Możesz dodawać kolejne — pliki nie znikają po kolejnym kliknięciu
                </Typography>
              </Box>

              {/* Staged file list */}
              {uploadDialog.files.length > 0 && (
                <Box sx={{ mt: 2, maxHeight: 320, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {uploadDialog.files.map((f, i) => {
                    const tooBig = f.size > UPLOAD_LIMIT;
                    return (
                      <Box key={`${f.name}-${i}`} sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75,
                        borderBottom: i < uploadDialog.files.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}>
                        <InsertDriveFileIcon fontSize="small" sx={{ color: tooBig ? 'error.main' : 'text.secondary' }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap title={f.name}>{f.name}</Typography>
                          <Typography variant="caption" color={tooBig ? 'error.main' : 'text.secondary'}>
                            {formatBytes(f.size)}{tooBig && ` — za duży (max ${formatBytes(UPLOAD_LIMIT)})`}
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
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  size="small" variant="outlined"
                  label={`${uploadDialog.files.length} plik${uploadDialog.files.length === 1 ? '' : 'ów'}`}
                />
                <Chip
                  size="small" variant="outlined"
                  label={`Razem ${formatBytes(totalBytes)}`}
                />
                {oversized > 0 && (
                  <Chip size="small" color="error" variant="outlined"
                    label={`${oversized} za duży — usuń przed uploadem`} />
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

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
