import { useState, useRef, useCallback, useEffect, memo, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
// Inline SVG icons for toolbar (avoids @mui/icons-material peer dependency)
const SvgSave = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10z"/></svg>;
const SvgUndo = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8"/></svg>;
const SvgRedo = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7z"/></svg>;
const SvgSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"/></svg>;
const SvgFindReplace = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 6c1.38 0 2.63.56 3.54 1.46L12 10h6V4l-2.05 2.05C14.68 4.78 12.93 4 11 4c-3.53 0-6.43 2.61-6.92 6H6.1c.46-2.28 2.48-4 4.9-4m5.64 9.14c.66-.9 1.12-1.97 1.28-3.14H15.9c-.46 2.28-2.48 4-4.9 4-1.38 0-2.63-.56-3.54-1.46L10 12H4v6l2.05-2.05C7.32 17.22 9.07 18 11 18c1.55 0 2.98-.51 4.14-1.36L20 21.49 21.49 20z"/></svg>;
const SvgFolderSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 13.5v2c0 .28.22.5.5.5h.5v.68l1.76 1.76c-.28.05-.51.07-.76.07-2.48 0-4.5-2.02-4.5-4.5S10.02 9 12.5 9c2.16 0 3.96 1.5 4.39 3.5H15v-.5c0-.28-.22-.5-.5-.5h-3c-.28 0-.5.22-.5.5M22 17.17l-2.64-2.62C19.74 14.06 20 13.31 20 12.5 20 10.01 17.99 8 15.5 8S11 10.01 11 12.5s2.01 4.5 4.5 4.5c.81 0 1.56-.26 2.17-.73L20.29 19H22v-1.83zM15.5 15c-1.38 0-2.5-1.12-2.5-2.5S14.12 10 15.5 10s2.5 1.12 2.5 2.5S16.88 15 15.5 15zM6 8l-4 4v8h16v-2H4v-5.17L7.17 12H8v-4H6z"/></svg>;
const SvgFormat = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3zm0-4h18v-2H3zm0-4h18v-2H3zm0-4h18V7H3zm0-6v2h18V3z"/></svg>;
const SvgSuggest = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/></svg>;
// braces { } — "insert $schema"
const SvgSchema = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 7v2c0 1.1-.9 2-2 2v2c1.1 0 2 .9 2 2v2c0 1.66 1.34 3 3 3h2v-2H7c-.55 0-1-.45-1-1v-2c0-1.3-.84-2.42-2-2.83v-.34C5.16 11.42 6 10.3 6 9V7c0-.55.45-1 1-1h2V4H7C5.34 4 4 5.34 4 7m16 4c-1.1 0-2-.9-2-2V7c0-1.66-1.34-3-3-3h-2v2h2c.55 0 1 .45 1 1v2c0 1.3.84 2.42 2 2.83v.34c-1.16.41-2 1.52-2 2.83v2c0 .55-.45 1-1 1h-2v2h2c1.66 0 3-1.34 3-3v-2c0-1.1.9-2 2-2z"/></svg>;

const SvgCut = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg>;
const SvgCopy = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>;
const SvgPaste = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>;
// Backspace / delete-selection icon (≈ keyboard backspace key shape)
const SvgDeleteSel = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>;
// Selection-anchor icons for mobile FROM/TO touch selection
const SvgSelFrom = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    {/* left bracket */}
    <rect x="2" y="2" width="2" height="12" />
    <rect x="2" y="2" width="5" height="2" />
    <rect x="2" y="12" width="5" height="2" />
    {/* cursor bar */}
    <rect x="10" y="3" width="2" height="10" />
  </svg>
);
const SvgSelTo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    {/* cursor bar */}
    <rect x="4" y="3" width="2" height="10" />
    {/* right bracket */}
    <rect x="10" y="2" width="2" height="12" />
    <rect x="9" y="2" width="5" height="2" />
    <rect x="9" y="12" width="5" height="2" />
  </svg>
);
import type { FileSystemProvider } from '@hestia/core';
import { decodeText, encodeText, FileType } from '@hestia/core';

import { VfsExplorer } from '../vfs/VfsExplorer';
import type { VfsProviderDef } from '../vfs/providerRegistry';
import type { OutputLine } from '../vfs/project/types';
import { EditorInstance } from './core/EditorInstance';
import { MobileCursorBar } from './ui/MobileCursorBar';
import { ModelManager } from './core/ModelManager';
import { KeyMod, KeyCode } from './core/CommandRegistry';
import type { DocumentUri } from './utils/types';
import { createDocumentUri } from './utils/types';
/*
 * The AI assistant is not this package's any more — it is `@hestia/ui-ai`,
 * because an assistant is a thing a page may or may not want and the pages that
 * do not should carry no part of it: no provider, no key handling, no chat.
 *
 * So it arrives as a slot. The host renders whatever it wants in the panel and
 * this editor only decides where the panel sits and when it is open. With no
 * `agentPanel` given there is no assistant button at all — not a button that
 * opens an empty drawer.
 */
import { BottomPanel } from './BottomPanel';
import type { BottomTab } from './BottomPanel';
import { InsertSchemaDialog } from './ui/InsertSchemaDialog';
import * as monaco from 'monaco-editor';
import type { IPlugin, ContextMenuContribution, CommandPaletteContribution, ToolbarContribution } from './plugins/types';
import {
  globalPluginRegistry,
  globalCommandRegistry,
  globalEventBus,
  useToolbarItems,
  useStatusBarPluginItems,
  useSidebarContributions,
  useContextMenuContributions,
  useCommandPaletteContributions,
  usePlugins,
} from './plugins';

/* ── Types ── */

export interface MonacoMultiEditorProps {
  provider: FileSystemProvider;
  height?: number | string;
  readOnly?: boolean;
  providerRegistry?: VfsProviderDef[];
  onFileSave?: (path: string, content: Uint8Array) => void | Promise<void>;
  /** Plugin instances to activate when the editor mounts. */
  plugins?: IPlugin[];
  /**
   * The assistant panel, supplied by the host — `@hestia/ui-ai` has one.
   * `onFileOpen` lets it ask the editor to show a file it has been working on,
   * and `onFileWritten` tells the editor which files changed underneath it, so
   * open tabs reload instead of quietly showing stale text. Absent means this
   * editor offers no assistant.
   */
  agentPanel?: (opts: {
    onFileOpen: (path: string) => void;
    onFileWritten: (paths: string[]) => void | Promise<void>;
  }) => ReactNode;
  enableTerminal?: boolean;
  terminalWsUrl?: string;
  terminalToken?: string;
  /** Called when the user clicks the configure button in the terminal header. */
  onTerminalConfigRequest?: () => void;
  /** Passed through to VfsExplorer so project action buttons can make authenticated API calls. */
  projectDeps?: import('../vfs/project/types').ProjectDeps;
  /** Passed through to VfsExplorer — called when a project action with hasDialog=true is clicked. */
  onDialogAction?: import('../vfs/types').VfsExplorerProps['onDialogAction'];
  /** Built-in mount presets always shown in the VFS mount manager (cannot be deleted by user). */
  defaultMountPresets?: import('../vfs/vfsMountPresets').VfsMountPreset[];
  /**
   * File to open automatically once the editor has mounted. Re-opening happens
   * whenever the value changes (so a host can drive which file is shown). The
   * path must be valid within {@link provider} (e.g. `/home/foo/config.json`).
   */
  initialPath?: string;
}

interface TabInfo {
  path: string;
  label: string;
  modified: boolean;
  uri: DocumentUri;
  /** When set, the tab renders a React component instead of Monaco (no VFS backing). */
  virtual?: { component: ComponentType };
}

interface EditorGroup {
  id: string;
  tabs: TabInfo[];
  activeTab: string | null;
  /** Flex size weight (default 1). Adjusted by group splitters. */
  size: number;
}

// Built-in panels + any string id contributed by a plugin
type SidebarPanel = 'explorer' | 'search' | 'extensions' | string | null;

/* ── Search types ── */

interface SearchMatch {
  line: number;
  col: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

interface FileSearchResult {
  path: string;
  matches: SearchMatch[];
  collapsed: boolean;
}

/* ── JSON schema auto-loader ── */

// Walk a parsed schema and collect file-relative `$ref` targets (skips internal
// `#/...` pointers and absolute http(s) URLs).
function collectSchemaRefs(obj: unknown, acc: string[] = []): string[] {
  if (Array.isArray(obj)) {
    for (const x of obj) collectSchemaRefs(x, acc);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') {
        if (!v.startsWith('#') && !/^https?:\/\//.test(v)) acc.push(v);
      } else {
        collectSchemaRefs(v, acc);
      }
    }
  }
  return acc;
}

// Normalize an absolute VFS path, resolving "." / ".." segments.
function normalizeVfsPath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return '/' + out.join('/');
}

// Resolve a `$ref` (possibly with a #fragment) against the directory of the
// schema that contains it → an absolute VFS path (or null to skip).
function resolveRefToVfs(dir: string, ref: string): string | null {
  const file = ref.split('#')[0];
  if (!file) return null; // pure fragment → same document
  return file.startsWith('/') ? normalizeVfsPath(file) : normalizeVfsPath(`${dir}/${file}`);
}

// Anchor a root-relative path (e.g. `drive/global/…`) to the open file's mount
// prefix, so it resolves whether the workspace is mounted at `/drive/…` (user)
// or `/user/drive/…` (admin). Falls back to a plain absolute path.
function anchorRootRelative(p: string, filePath: string): string | null {
  const rest = p.replace(/^\/+/, '');
  if (!rest) return null;
  const firstSeg = rest.split('/')[0];
  const idx = filePath.indexOf(`/${firstSeg}/`);
  if (idx >= 0) return normalizeVfsPath(filePath.slice(0, idx + 1) + rest);
  return normalizeVfsPath(`/${rest}`);
}

// Resolve a JSON file's `$schema` value to an absolute VFS path. Supports:
//   • scheme URIs (inmemory://drive/…, file:///drive/…) → anchored root-relative
//   • absolute-ish paths (/drive/…) → anchored to the file's mount prefix
//   • relative paths (./Type.schema.json, Type.schema.json) → file's directory
// Returns null for http(s) (Monaco fetches those itself) or unusable refs.
function resolveSchemaRefToVfs(raw: string, filePath: string): string | null {
  if (/^https?:\/\//.test(raw)) return null;
  const scheme = raw.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
  if (scheme) return anchorRootRelative(scheme[1], filePath);
  if (raw.startsWith('/')) return anchorRootRelative(raw, filePath);
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  return normalizeVfsPath(`${dir}/${raw}`);
}

/**
 * When a JSON file declares `"$schema": "<vfs ref>"`, load that schema from the
 * VFS and register it with Monaco's JSON language service so validation +
 * property completions work. The `$schema` value may be a scheme URI
 * (`inmemory://drive/…`), an absolute VFS path, or a relative path.
 *
 * Cross-file `$ref`s (one generated `*.schema.json` referencing sibling type
 * files) are resolved too: every referenced schema is read from the VFS and
 * registered under a matching `file://` URI, so Monaco follows the refs locally
 * without any network access.
 */
async function loadJsonSchemaFromVfs(
  provider: FileSystemProvider,
  filePath: string,
  content: string,
  fileUri: string,
): Promise<void> {
  const schemaMatch = content.match(/"?\$schema"?\s*:\s*"([^"]+)"/);
  if (!schemaMatch) return;
  const rootVfsPath = resolveSchemaRefToVfs(schemaMatch[1], filePath);
  if (!rootVfsPath) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonDefaults = (monaco.languages as any).json?.jsonDefaults;
  if (!jsonDefaults) return;

  const currentOpts = jsonDefaults.diagnosticsOptions ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byUri = new Map<string, any>();
  for (const s of (Array.isArray(currentOpts.schemas) ? currentOpts.schemas : [])) {
    const uri = s && typeof s === 'object' ? (s as { uri?: string }).uri : undefined;
    if (uri) byUri.set(uri, s);
  }

  // BFS over the root schema + all of its cross-file $refs.
  const visited = new Set<string>();
  const queue = [rootVfsPath];
  let changed = false;
  while (queue.length && visited.size < 300) {
    const vfsPath = queue.shift()!;
    if (visited.has(vfsPath)) continue;
    visited.add(vfsPath);

    let schemaObj: unknown;
    try {
      schemaObj = JSON.parse(decodeText(await provider.readFile(vfsPath)));
    } catch {
      // A referenced schema we can't read/parse: register a permissive {} under
      // its URI so the PARENT schema still resolves and keeps validating
      // (`required` etc.), instead of one bad $ref disabling the whole thing.
      if (vfsPath !== rootVfsPath) {
        const uri = `file://${vfsPath}`;
        if (!byUri.has(uri)) { byUri.set(uri, { uri, schema: {} }); changed = true; }
      }
      continue;
    }

    const uri = `file://${vfsPath}`;
    const isRoot = vfsPath === rootVfsPath;
    const prev = byUri.get(uri) as { fileMatch?: string[]; schema?: unknown } | undefined;
    const fileMatch = isRoot
      ? Array.from(new Set([...(prev?.fileMatch ?? []), fileUri, filePath]))
      : prev?.fileMatch;
    const sameSchema = prev && JSON.stringify(prev.schema) === JSON.stringify(schemaObj);
    const sameMatch = JSON.stringify(prev?.fileMatch ?? null) === JSON.stringify(fileMatch ?? null);
    if (!prev || !sameSchema || !sameMatch) {
      byUri.set(uri, fileMatch ? { uri, fileMatch, schema: schemaObj } : { uri, schema: schemaObj });
      changed = true;
    }

    const dir = vfsPath.substring(0, vfsPath.lastIndexOf('/'));
    for (const ref of collectSchemaRefs(schemaObj)) {
      const child = resolveRefToVfs(dir, ref);
      if (child && !visited.has(child)) queue.push(child);
    }
  }

  if (changed) {
    jsonDefaults.setDiagnosticsOptions({ ...currentOpts, validate: true, schemas: Array.from(byUri.values()) });
    console.log(`[Monaco] JSON schema loaded from VFS: ${rootVfsPath} (${visited.size} file(s)) → ${fileUri}`);
  }
}

/* ── Language map ── */

const extensionToLanguage: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', mdx: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', ino: 'cpp',
  sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml',
  // Pliki frameworka Hydra: projekt, schemat połączeń, definicja układu.
  // Są YAML-em — własne rozszerzenia mają po to, żeby wtyczka Hydra Studio
  // mogła je rozpoznać i otworzyć obok swój interfejs.
  hydra: 'yaml', hsch: 'yaml', hcomp: 'yaml',
  xml: 'xml', svg: 'xml',
  sql: 'sql',
  dockerfile: 'dockerfile',
  txt: 'plaintext',
};

/**
 * Ścieżka pliku dla zakładki — także wtedy, gdy zakładkę otworzyła wtyczka.
 *
 * Wtyczki otwierają własne widoki pod identyfikatorem ze schematem
 * (`hydra-studio:///drive/projekt.hydra`), żeby nie kolidować z zakładką
 * tekstową tego samego pliku. Eksplorator porównuje jednak identyfikator
 * z nazwami węzłów drzewa, a te są zwykłymi ścieżkami — bez odcięcia schematu
 * aktywny widok wtyczki nie zaznacza niczego i wygląda to, jakby eksplorator
 * nie nadążał.
 *
 * Odcinamy tylko znany kształt `schemat://`; zwykła ścieżka przechodzi bez zmian.
 */
function vfsPathOfTab(tab: string | null | undefined): string | undefined {
  if (!tab) return undefined;
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\/.*)$/i.exec(tab);
  const path = match ? match[1] : tab;
  try {
    if (localStorage.getItem('HYDRA_DEBUG') === '1') {
      console.log('[hydra] aktywna zakładka:', tab, '→ ścieżka dla eksploratora:', path);
    }
  } catch { /* brak localStorage */ }
  return path;
}

function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return extensionToLanguage[ext] ?? 'plaintext';
}

function fileLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

let nextGroupId = 1;
function makeGroupId() { return `g${nextGroupId++}`; }


/* ── SVG Icons ── */

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <rect x="1" y="2" width="14" height="12" rx="1" stroke="#ccc" strokeWidth="1.2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="#ccc" strokeWidth="1.2" />
    </svg>
  );
}

function ExplorerIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M3 4h7l2 2h9v13H3V4z" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" fill="none" />
      <path d="M3 9h18" stroke={active ? '#fff' : '#858585'} strokeWidth="1.2" />
    </svg>
  );
}

function SearchIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <circle cx="10.5" cy="10.5" r="5.5" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" />
      <path d="M14.5 14.5L19 19" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExtensionsIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <rect x="4" y="10" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="10" y="4" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="10" y="10" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="16" y="10" width="4" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
    </svg>
  );
}

function SearchInputIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <circle cx="10.5" cy="10.5" r="5.5" stroke="#858585" strokeWidth="1.5" />
      <path d="M14.5 14.5L19 19" stroke="#858585" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AgentIcon({ active }: { active?: boolean }) {
  const c = active ? '#fff' : '#858585';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M12 2L14 8L20 8L15 12L17 18L12 14L7 18L9 12L4 8L10 8Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function TerminalIcon({ active }: { active?: boolean }) {
  const c = active ? '#fff' : '#858585';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M2 3l5 5-5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 13h6" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── Go to File Dialog ── */

interface GoToFileDialogProps {
  open: boolean;
  files: string[];
  loading: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

function GoToFileDialog({ open, files, loading, onClose, onSelect }: GoToFileDialogProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = (() => {
    if (!query.trim()) return files.slice(0, 60);
    const q = query.toLowerCase();
    return files.filter(f => {
      const name = f.split('/').pop()?.toLowerCase() ?? '';
      return name.includes(q) || f.toLowerCase().includes(q);
    }).slice(0, 60);
  })();

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '8vh' }}>
      {/* Backdrop */}
      <Box onClick={onClose} sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.45)' }} />
      <Box sx={{
        position: 'relative',
        width: 580,
        maxWidth: '92vw',
        bgcolor: '#252526',
        border: '1px solid #454545',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}>
        {/* Input row */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, borderBottom: '1px solid #3c3c3c', gap: 1 }}>
          <SearchInputIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); onSelect(filtered[activeIdx]); }
            }}
            placeholder="Go to file..."
            style={{ flexGrow: 1, background: 'transparent', border: 'none', outline: 'none', color: '#ccc', fontSize: 14, fontFamily: 'inherit' }}
          />
          {loading && <CircularProgress size={14} sx={{ color: '#858585', flexShrink: 0 }} />}
          <Typography component="span" sx={{ fontSize: 11, color: '#606060', flexShrink: 0 }}>
            {filtered.length} / {files.length}
          </Typography>
        </Box>
        {/* Results */}
        <Box ref={listRef} sx={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {filtered.map((path, idx) => (
            <Box
              key={path}
              onClick={() => onSelect(path)}
              sx={{
                px: 2, py: 0.75, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0.125,
                bgcolor: idx === activeIdx ? '#2a2d2e' : 'transparent',
                '&:hover': { bgcolor: '#2a2d2e' },
              }}
            >
              <Typography sx={{ fontSize: 13, color: '#ccc', fontWeight: idx === activeIdx ? 500 : 400 }}>
                {path.split('/').pop()}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#606060' }}>{path}</Typography>
            </Box>
          ))}
          {filtered.length === 0 && !loading && (
            <Box sx={{ px: 2, py: 2, color: '#606060', fontSize: 13, textAlign: 'center' }}>
              No files found
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ── Constants ── */

const MIN_PANEL_PX = 180;
const ACTIVITY_BAR_W = 48;
const MENU_BAR_H = 30;
const STATUS_BAR_H = 22;

/* ── VFS search helpers ── */

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','ico','bmp','webp','svg',
  'bin','exe','dll','so','wasm','pdf','zip','tar','gz','7z',
  'mp3','mp4','webm','wav','ogg','ttf','woff','woff2','eot',
]);
const SKIP_DIRS = new Set([
  '.git','node_modules','__pycache__','.venv','venv',
  'dist','build','.next','.cache','coverage','.turbo',
]);

async function walkVfsForSearch(
  provider: FileSystemProvider,
  dirPath: string,
  regex: RegExp,
  results: FileSearchResult[],
): Promise<void> {
  let entries: { name: string; type: FileType }[];
  try { entries = await provider.readDirectory(dirPath); }
  catch { return; }

  for (const { name, type: fileType } of entries) {
    const full = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
    if (fileType === FileType.Directory) {
      if (!SKIP_DIRS.has(name)) await walkVfsForSearch(provider, full, regex, results);
    } else {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (BINARY_EXTS.has(ext)) continue;
      try {
        const text = decodeText(await provider.readFile(full));
        const lines = text.split('\n');
        const matches: SearchMatch[] = [];
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const re = new RegExp(regex.source, regex.flags.replace('g', '') + 'g');
          let m: RegExpExecArray | null;
          while ((m = re.exec(lineText)) !== null) {
            matches.push({ line: i + 1, col: m.index + 1, lineText, matchStart: m.index, matchEnd: m.index + m[0].length });
          }
        }
        if (matches.length > 0) results.push({ path: full, matches, collapsed: false });
      } catch { /* skip unreadable */ }
    }
  }
}


/* ── Kbd shortcut label ── */

function Kbd({ children }: { children: string }) {
  return (
    <Typography component="span" sx={{ color: '#6e6e6e', fontSize: 12, ml: 'auto', pl: 3, whiteSpace: 'nowrap' }}>
      {children}
    </Typography>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const mod = isMac ? '\u2318' : 'Ctrl+';
function useIsMobile() {
  // Touch device (phone/tablet) OR narrow window — catches landscape phones too
  const detect = () =>
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.innerWidth < 900;
  const [mobile, setMobile] = useState(detect);
  useEffect(() => {
    const fn = () => setMobile(detect);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

/* ── EditorGroupPane ── */

interface HandlePos { x: number; y: number; lineHeight: number }

interface EditorGroupPaneProps {
  group: EditorGroup;
  isActive: boolean;
  modelManager: ModelManager;
  readOnly: boolean;
  onTabSwitch: (groupId: string, path: string) => void;
  onTabClose: (groupId: string, path: string) => void;
  onFocus: (groupId: string) => void;
  onSave: (groupId: string) => Promise<void>;
  onSplit: (groupId: string) => void;
  onCursorChange: (groupId: string, ln: number, col: number) => void;
  onSelectionChange: (groupId: string, sel: { startLn: number; startCol: number; endLn: number; endCol: number; chars: number } | null) => void;
  onContentChange: (groupId: string, path: string) => void;
  navPendingRef?: React.MutableRefObject<{ path: string; line: number; col: number } | null>;
  /* ── VSCode-like features ── */
  minimapEnabled: boolean;
  wordWrap: 'off' | 'on';
  showBreadcrumbs: boolean;
  formatOnSave: boolean;
  onGoToFile: () => void;
  onToggleMinimap: () => void;
  onToggleWordWrap: () => void;
  onEditorReady: (groupId: string, editor: monaco.editor.IStandaloneCodeEditor) => void;
  /* ── Plugin contribution points ── */
  pluginContextMenuItems: ContextMenuContribution[];
  pluginCommandPaletteItems: CommandPaletteContribution[];
  /** Increment to force an immediate handle-position recompute (used after programmatic setSelection). */
  forceHandleUpdate?: number;
}

const EditorGroupPane = memo(function EditorGroupPane({
  group,
  isActive,
  modelManager,
  readOnly,
  onTabSwitch,
  onTabClose,
  onFocus,
  onSave,
  onSplit,
  onCursorChange,
  onSelectionChange,
  onContentChange,
  navPendingRef,
  minimapEnabled,
  wordWrap,
  showBreadcrumbs,
  formatOnSave,
  onGoToFile,
  onToggleMinimap,
  onToggleWordWrap,
  onEditorReady,
  pluginContextMenuItems,
  pluginCommandPaletteItems,
  forceHandleUpdate,
}: EditorGroupPaneProps) {
  const editorRef = useRef<EditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewStateRef = useRef<Map<string, { scrollTop: number; scrollLeft: number; lineNumber: number; column: number }>>(new Map());

  /* ── Selection handles (Android-style drag handles) ── */
  // end === null means cursor-only (no selection) — only the start handle is shown.
  const [selHandles, setSelHandles] = useState<{ start: HandlePos; end: HandlePos | null } | null>(null);

  // Stable ref to the latest updateHandlesLocal — lets external triggers call it without
  // requiring a closure over the useEffect-scoped function.
  const updateHandlesRef = useRef<(() => void) | null>(null);

  // When MonacoMultiEditor increments forceHandleUpdate (after programmatic setSelection),
  // recompute handle positions after a short delay so revealRange scroll can settle.
  useEffect(() => {
    if (!forceHandleUpdate) return;
    const id = setTimeout(() => updateHandlesRef.current?.(), 60);
    return () => clearTimeout(id);
  }, [forceHandleUpdate]);


  // For 'cursor' drag: anchor position saved at pointerdown so we know the selection origin.
  const dragAnchorRef = useRef<monaco.Position | null>(null);

  // Apply drag movement: update Monaco selection based on pointer position.
  const applyHandleDrag = useCallback((which: 'start' | 'end' | 'cursor', clientX: number, clientY: number) => {
    const editor = editorRef.current?.getMonacoEditor();
    if (!editor) return;
    const target = editor.getTargetAtClientPoint(clientX, clientY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPos = (target as any)?.position as monaco.Position | null | undefined;
    if (!newPos) return;

    if (which === 'cursor') {
      const anchor = dragAnchorRef.current;
      if (!anchor) return;
      const anchorLn = anchor.lineNumber; const anchorCol = anchor.column;
      if (newPos.lineNumber > anchorLn || (newPos.lineNumber === anchorLn && newPos.column > anchorCol)) {
        editor.setSelection({ startLineNumber: anchorLn, startColumn: anchorCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      } else if (newPos.lineNumber < anchorLn || newPos.column < anchorCol) {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: anchorLn, endColumn: anchorCol });
      }
      return;
    }

    const sel = editor.getSelection();
    if (!sel) return;
    if (which === 'start') {
      const endLn = sel.endLineNumber; const endCol = sel.endColumn;
      if (newPos.lineNumber < endLn || (newPos.lineNumber === endLn && newPos.column <= endCol)) {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: endLn, endColumn: endCol });
      } else {
        editor.setSelection({ startLineNumber: endLn, startColumn: endCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      }
    } else {
      const startLn = sel.startLineNumber; const startCol = sel.startColumn;
      if (newPos.lineNumber > startLn || (newPos.lineNumber === startLn && newPos.column >= startCol)) {
        editor.setSelection({ startLineNumber: startLn, startColumn: startCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      } else {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: startLn, endColumn: startCol });
      }
    }
  }, []);

  // Handle pointer-down on a gizmo handle.
  // Registers document-level pointermove/pointerup so drag works even when the
  // finger moves far outside the small handle div (common on mobile).
  const handlePointerDownOnHandle = useCallback((which: 'start' | 'end' | 'cursor', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (which === 'cursor') {
      dragAnchorRef.current = editorRef.current?.getMonacoEditor().getPosition() ?? null;
    }

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    // Distinguish tap (minimal movement) from drag — threshold in CSS px.
    // Fingers naturally jitter ±4px; 8px avoids accidental drag on a stationary tap.
    const DRAG_THRESHOLD = 8;
    let hasMoved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      if (!hasMoved) {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) hasMoved = true;
      }
      if (hasMoved) applyHandleDrag(which, ev.clientX, ev.clientY);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      const me = editorRef.current?.getMonacoEditor();
      if (me) {
        if (!hasMoved && which === 'cursor') {
          // Pure tap on the cursor handle — move cursor to the tapped position.
          // Without this the tap is swallowed (e.preventDefault above) and the
          // cursor stays put, making repositioning impossible by tapping near it.
          const target = me.getTargetAtClientPoint(ev.clientX, ev.clientY);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newPos = (target as any)?.position as monaco.Position | null | undefined;
          if (newPos) me.setPosition(newPos);
        }
        me.focus();
      }
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
  }, [applyHandleDrag]);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const groupIdRef = useRef(group.id);
  groupIdRef.current = group.id;
  const tabsRef = useRef(group.tabs);
  tabsRef.current = group.tabs;

  // Stable refs for callbacks used inside once-only useEffect
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const formatOnSaveRef = useRef(formatOnSave);
  formatOnSaveRef.current = formatOnSave;
  const onGoToFileRef = useRef(onGoToFile);
  onGoToFileRef.current = onGoToFile;
  const onToggleMinimapRef = useRef(onToggleMinimap);
  onToggleMinimapRef.current = onToggleMinimap;
  const onToggleWordWrapRef = useRef(onToggleWordWrap);
  onToggleWordWrapRef.current = onToggleWordWrap;

  // Track previous active tab for view state saving
  const prevActiveTabRef = useRef<string | null>(null);

  // Create editor
  useEffect(() => {
    const container = containerRef.current;
    if (!container || editorRef.current) return;

    const editor = EditorInstance.create(container, {
      theme: 'vs-dark',
      readOnly,
      minimap: { enabled: false },
      wordWrap: 'off',
      fontSize: 14,
      // fixedOverflowWidgets: widget uses position:fixed so it escapes overflow:hidden ancestors.
      fixedOverflowWidgets: true,
      // strings: 'on' is required for JSON — all keys/values are strings,
      // so 'off' would suppress autocomplete entirely in JSON files.
      quickSuggestions: { other: 'on', comments: 'off', strings: 'on' },
      wordBasedSuggestions: 'currentDocument',
      suggestOnTriggerCharacters: true,
      // Suppress word-based (abc) completions — schema/type-aware items take over.
      // This prevents "wordBasedSuggestions: currentDocument" from polluting the list.
      suggest: { showWords: false },
      showFoldingControls: 'always',
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      // On Android, enable accessibility mode so Monaco populates the textarea with
      // surrounding text (PagedScreenReaderStrategy).  Gboard then sees real characters
      // and its InputConnection.setSelection() actually changes selectionStart, which
      // lets the Gboard spacebar cursor-control bridge detect deltas.
      // 'auto' on all other platforms to avoid unnecessary overhead.
      accessibilitySupport: 'auto',
    });
    editorRef.current = editor;
    onEditorReady(group.id, editor.getMonacoEditor());

    const saveAction = editor.getMonacoEditor().addAction({
      id: 'file.save',
      label: 'File: Save',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: async () => {
        if (formatOnSaveRef.current) {
          const fmt = editor.getMonacoEditor().getAction('editor.action.formatDocument');
          if (fmt) {
            try { await fmt.run(); } catch { /* ignore */ }
          }
        }
        saveRef.current(groupIdRef.current);
      },
    });

    const splitAction = editor.getMonacoEditor().addAction({
      id: 'editor.splitRight',
      label: 'View: Split Editor Right',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Backslash],
      run: () => { onSplit(groupIdRef.current); },
    });

    const goToFileAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.quickOpen',
      label: 'Go to File...',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyP],
      run: () => { onGoToFileRef.current(); },
    });

    const toggleMinimapAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.view.toggleMinimap',
      label: 'View: Toggle Minimap',
      run: () => { onToggleMinimapRef.current(); },
    });

    const toggleWordWrapAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.view.toggleWordWrap',
      label: 'View: Toggle Word Wrap',
      keybindings: [KeyMod.Alt | KeyCode.KeyZ],
      run: () => { onToggleWordWrapRef.current(); },
    });

    const formatDocAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.formatDocument',
      label: 'Format Document',
      keybindings: [KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF],
      run: async () => {
        const fmt = editor.getMonacoEditor().getAction('editor.action.formatDocument');
        if (fmt) { try { await fmt.run(); } catch { /* ignore */ } }
      },
    });


    // Command palette is handled at MonacoMultiEditor level (custom overlay)

    // Selection handle listeners — must be registered here (editor is ready)
    const me = editor.getMonacoEditor();
    const updateHandlesLocal = () => {
      const sel = me.getSelection();
      if (!sel) { setSelHandles(null); return; }
      // Use Monaco's own DOM node — getScrolledVisiblePosition() returns coords
      // relative to this element, so we need its viewport offset, not the wrapper's.
      const rect = me.getDomNode()?.getBoundingClientRect();
      if (!rect) { setSelHandles(null); return; }

      const isCollapsed = sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn;
      const startPos = me.getScrolledVisiblePosition({ lineNumber: sel.startLineNumber, column: sel.startColumn });

      if (!startPos) { setSelHandles(null); return; }

      const lineH = startPos.height ?? 18;

      if (isCollapsed) {
        setSelHandles({
          start: { x: rect.left + startPos.left, y: rect.top + startPos.top, lineHeight: lineH },
          end: null,
        });
        return;
      }

      const endPos = me.getScrolledVisiblePosition({ lineNumber: sel.endLineNumber, column: sel.endColumn });
      const ep = endPos ?? { left: rect.width - 4, top: rect.height - lineH, height: lineH };

      setSelHandles({
        start: { x: rect.left + startPos.left, y: rect.top + startPos.top, lineHeight: lineH },
        end:   { x: rect.left + ep.left, y: rect.top + ep.top, lineHeight: ep.height },
      });
    };

    // Expose via ref so external forceHandleUpdate can call it without closure capture issues.
    updateHandlesRef.current = updateHandlesLocal;

    // Shared mutable ref for the double-tap word-selection guard (see below).
    // Declared here so dSel can access it before the double-tap block is reached.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingWordRangeRef: { current: any | null } = { current: null };

    const dSel = me.onDidChangeCursorSelection(() => {
      const sel = me.getSelection();
      const isCollapsed = !sel || (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);

      if (pendingWordRangeRef.current && isCollapsed) {
        me.setSelection(pendingWordRangeRef.current);
        return;
      }
      updateHandlesLocal();
    });
    const dCursor = me.onDidChangeCursorPosition(updateHandlesLocal);
    const dScroll = me.onDidScrollChange(updateHandlesLocal);
    const dLayout = me.onDidLayoutChange(updateHandlesLocal);

    // Double-tap word selection — Monaco on mobile moves cursor only on double-tap;
    // it never calls getWordAtPosition() itself. We detect the double-tap here and
    // call setSelection(wordRange) AFTER Monaco has already moved the cursor.
    //
    // pendingWordRangeRef.current: when set, guards against Monaco immediately collapsing
    // our word selection (can happen because click/touchend fires async on some mobile
    // browsers after our setTimeout reapplied the selection).
    let pendingWordRangeTtl: ReturnType<typeof setTimeout> | null = null;

    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    // Gboard spacebar cursor-control: tracks the last time a Gboard delta was applied
    // so we can suppress Monaco's own pointer handler during the gesture.
    const gboardState = { lastActive: 0 };

    const onDocPointerDown = (e: PointerEvent) => {
      // When Gboard's spacebar-swipe gesture is active the sliding finger may enter
      // the editor viewport and fire a touch pointerdown.  Monaco would then move the
      // cursor to the touch position, overwriting the Gboard delta we just applied.
      // Suppress those touch events for 800 ms after the last Gboard delta.
      if (e.pointerType === 'touch' && Date.now() - gboardState.lastActive < 800) {
        e.stopPropagation();
        return;
      }

      // Use bounding-rect check instead of DOM containment — the second tap of a
      // Double-tap tracking happens BEFORE the inEditor check — the second tap can
      // land on our handle div (portaled to body, outside Monaco's rect). We still
      // want to detect it as a double-tap; word selection uses me.getPosition() so
      // we don't need the second tap's exact coordinates to be inside the editor.
      const now = Date.now();
      const dx = Math.abs(e.clientX - lastTapX);
      const dy = Math.abs(e.clientY - lastTapY);
      const dt = now - lastTapTime;
      const isDouble = dt < 400 && dx < 40 && dy < 40;
      lastTapTime = isDouble ? 0 : now;
      lastTapX = e.clientX;
      lastTapY = e.clientY;

      if (!isDouble) return;

      // Let Monaco process its own pointerdown first (moves cursor), then override.
      // Use me.getPosition() — the cursor is already at the right position from tap 1.
      setTimeout(() => {
        const model = me.getModel();
        if (!model) return;
        // Use cursor position (Monaco moved it on the first tap)
        const pos = me.getPosition();
        if (!pos) return;
        const wordRange = model.getWordAtPosition(pos)
          ?? model.getWordAtPosition({ lineNumber: pos.lineNumber, column: Math.max(1, pos.column - 1) });
        if (!wordRange) return;

        // Arm the guard BEFORE calling setSelection so that any immediate
        // onDidChangeCursorSelection triggered within setSelection sees it.
        pendingWordRangeRef.current = {
          startLineNumber: pos.lineNumber,
          startColumn: wordRange.startColumn,
          endLineNumber: pos.lineNumber,
          endColumn: wordRange.endColumn,
        };
        if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
        // Auto-disarm after 600ms in case nothing collapses the selection
        pendingWordRangeTtl = setTimeout(() => { pendingWordRangeRef.current = null; pendingWordRangeTtl = null; }, 600);

        me.setSelection(pendingWordRangeRef.current);
        updateHandlesLocal();
      }, 50);
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);

    // ── Gboard spacebar cursor-control (Android only) ─────────────────────────
    // Gboard's hold-spacebar+swipe gesture calls InputConnection.setSelection()
    // on the hidden textarea. Chrome maps this to a 'selectionchange' DOM event.
    //
    // Problem: Monaco uses an EMPTY textarea on Android (TextAreaState.EMPTY,
    // value=""). Gboard establishes InputConnection at focus time and reads the
    // textarea value then. With empty value, Gboard thinks there is no content to
    // navigate, so selectionStart never changes.
    //
    // Solution — Shadow Cursor:
    //   1. Write a long all-spaces SHADOW string into Chrome's C++ textarea storage
    //      via the native HTMLTextAreaElement value setter (bypasses JS overrides).
    //   2. Override the JS .value getter to return '' AND swallow every write —
    //      Monaco sees '' and its IME surrounding-text mirror can't clobber SHADOW.
    //   3. Override .setSelectionRange on this instance — Monaco's calls are
    //      blocked; Gboard's C++-level setSelection bypasses JS entirely.
    //   4. Blur/focus cycle — forces Chrome to re-establish InputConnection by
    //      reading the C++ storage, which now has SHADOW. Gboard now knows the
    //      field has many chars and will change selectionStart on gesture.
    //   5. selectionchange listener reads the native selectionStart and applies the
    //      *incremental* delta since the previous event, moving Monaco's cursor in
    //      lock-step with Gboard's finger; the buffer is recentered near its edges.
    let gboardCleanup: (() => void) | null = null;
    if (/Android/i.test(navigator.userAgent)) {
      const monacoTextarea = me.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea');
      if (monacoTextarea) {
        // Debug overlay — remove once confirmed working
        let dbgEl: HTMLDivElement | null = null;
        const dbg = (msg: string) => {
          if (!dbgEl) {
            dbgEl = document.createElement('div');
            dbgEl.style.cssText = 'position:fixed;bottom:72px;right:6px;background:rgba(0,0,0,.82);color:#7fff00;font:10px/1.4 monospace;padding:4px 8px;z-index:99999;pointer-events:none;max-width:240px;border-radius:4px;white-space:pre-wrap;';
            // document.body.appendChild(dbgEl); // temporarily hidden
          }
          const ls = (dbgEl.textContent ?? '').split('\n').filter(Boolean);
          ls.unshift(new Date().toISOString().slice(14, 22) + ' ' + msg);
          if (ls.length > 10) ls.length = 10;
          dbgEl.textContent = ls.join('\n');
        };

        // SHADOW: 21 spaces — invisible, neutral, gives Gboard room to move left/right
        const SHADOW = '                     '; // 21 spaces
        const SHADOW_MID = 10; // cursor sits in the middle

        // Grab the native property descriptor from the prototype chain
        // so we can write directly into Chrome's C++ value storage.
        const nativeValDesc = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype, 'value'
        )!;
        const nativeSsr = HTMLTextAreaElement.prototype.setSelectionRange;

        // Write SHADOW into C++ storage (Chrome reads this to init InputConnection)
        nativeValDesc.set!.call(monacoTextarea, SHADOW);

        // Override JS .value getter on this instance so Monaco always sees ''
        Object.defineProperty(monacoTextarea, 'value', {
          get() { return ''; },
          set(v: string) {
            // Monaco sets value=''; ignore — keep SHADOW in C++ storage
            // But if Monaco sets a non-empty value (shouldn't happen), allow it
            if (v !== '') nativeValDesc.set!.call(monacoTextarea, v);
          },
          configurable: true,
        });

        // Override .setSelectionRange on this instance — blocks Monaco's calls;
        // Gboard's InputConnection.setSelection() is C++ and bypasses JS.
        const origSsr = monacoTextarea.setSelectionRange.bind(monacoTextarea);
        void origSsr; // suppress lint
        Object.defineProperty(monacoTextarea, 'setSelectionRange', {
          value(..._args: unknown[]) {
            // Silently block — keep shadow cursor at SHADOW_MID
          },
          configurable: true,
          writable: true,
        });

        // Reset shadow cursor to middle via native setter (bypasses our override)
        const resetShadow = () => {
          nativeValDesc.set!.call(monacoTextarea, SHADOW);
          nativeSsr.call(monacoTextarea, SHADOW_MID, SHADOW_MID);
        };

        // Blur/focus cycle: forces Chrome to re-init InputConnection from C++ storage.
        // Create a tiny off-screen textarea to take focus temporarily.
        const tmp = document.createElement('textarea');
        tmp.style.cssText = 'position:fixed;opacity:0;top:-9999px;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(tmp);

        const doBlurFocusCycle = () => {
          resetShadow();
          tmp.focus(); // moves focus away → Chrome will re-init InputConnection on next focus
          requestAnimationFrame(() => {
            monacoTextarea.focus(); // Chrome re-establishes InputConnection, reads C++ storage (SHADOW)
            requestAnimationFrame(() => {
              resetShadow(); // ensure cursor is at SHADOW_MID after IC init
              dbg(`shadow ready mid=${SHADOW_MID}`);
            });
          });
        };

        // Run initial blur/focus cycle after Monaco has finished its own setup
        const initTimer = setTimeout(doBlurFocusCycle, 300);

        // When Monaco refocuses textarea (e.g. after tap), redo the cycle.
        // Guard prevents recursive triggering when doBlurFocusCycle itself
        // calls monacoTextarea.focus().
        let cycleInProgress = false;
        const onFocus = () => {
          if (cycleInProgress) return;
          dbg('focus — resetting shadow');
          cycleInProgress = true;
          setTimeout(() => {
            doBlurFocusCycle();
            setTimeout(() => { cycleInProgress = false; }, 400);
          }, 50);
        };
        monacoTextarea.addEventListener('focus', onFocus);

        // Track whether we are mid-gesture to suppress Monaco pointer handler
        let applyingDelta = false;

        const onGboardSel = () => {
          // Read native selectionStart directly from C++ storage
          const nativeSS = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype, 'selectionStart'
          )!.get!.call(monacoTextarea) as number;

          const delta = nativeSS - SHADOW_MID;
          const active = document.activeElement === monacoTextarea;

          if (!active) return;
          if (applyingDelta) return;
          if (delta === 0) return;

          // Reset shadow immediately so next Gboard step is relative to mid
          resetShadow();

          const model = me.getModel();
          const pos = me.getPosition();
          if (!model || !pos) return;

          const newOffset = Math.max(0, Math.min(model.getValueLength(), model.getOffsetAt(pos) + delta));

          applyingDelta = true;
          gboardState.lastActive = Date.now();
          me.setPosition(model.getPositionAt(newOffset));
          me.revealPositionInCenter(model.getPositionAt(newOffset));

          // Release flag after Monaco echo SC fires
          requestAnimationFrame(() => { applyingDelta = false; });
        };

        document.addEventListener('selectionchange', onGboardSel);

        gboardCleanup = () => {
          clearTimeout(initTimer);
          document.removeEventListener('selectionchange', onGboardSel);
          monacoTextarea.removeEventListener('focus', onFocus);
          // Restore .value and .setSelectionRange on this instance
          delete (monacoTextarea as unknown as Record<string, unknown>).value;
          delete (monacoTextarea as unknown as Record<string, unknown>).setSelectionRange;
          tmp.remove();
          dbgEl?.remove();
        };
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Scroll-vs-tap: suppress keyboard when user pans/scrolls the editor ──
    // Monaco calls textarea.focus() on every pointerup regardless of movement.
    // We track touch displacement and re-blur if the gesture was a scroll.
    //
    // Touches that START on Monaco floating widgets (suggest list, hover cards,
    // context menus) are exempt — the user may be scrolling the suggestion list
    // and we must not interfere with focus there.
    let scrollGestureActive = false;
    let scrollOnWidget = false;
    let scrollOriginX = 0;
    let scrollOriginY = 0;
    const onContainerPDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      scrollGestureActive = false;
      const target = e.target as Element | null;
      scrollOnWidget = !!target?.closest(
        '.suggest-widget, .editor-widget, .monaco-menu, .context-view',
      );
      if (scrollOnWidget) return;
      scrollOriginX = e.clientX;
      scrollOriginY = e.clientY;
    };
    const onContainerPMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || scrollGestureActive || scrollOnWidget) return;
      if (Math.abs(e.clientX - scrollOriginX) > 8 || Math.abs(e.clientY - scrollOriginY) > 8) {
        scrollGestureActive = true;
      }
    };
    const onContainerPUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !scrollGestureActive) return;
      scrollGestureActive = false;
      const ta = me.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea');
      if (!ta) return;
      // readOnly = true prevents the soft keyboard from appearing even when Monaco
      // calls textarea.focus() asynchronously — no timing race to win.
      // blur() hides the keyboard immediately; readOnly keeps it hidden during
      // Monaco's async refocus. Restored after scroll recovery completes.
      ta.readOnly = true;
      ta.blur();
      setTimeout(() => { ta.readOnly = false; }, 300);
    };
    container.addEventListener('pointerdown', onContainerPDown, true);
    container.addEventListener('pointermove', onContainerPMove, { capture: true, passive: true });
    container.addEventListener('pointerup', onContainerPUp, true);
    // ─────────────────────────────────────────────────────────────────────────

    return () => {
      gboardCleanup?.();
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      container.removeEventListener('pointerdown', onContainerPDown, true);
      container.removeEventListener('pointermove', onContainerPMove, true);
      container.removeEventListener('pointerup', onContainerPUp, true);
      if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
      pendingWordRangeRef.current = null;
      updateHandlesRef.current = null;
      setSelHandles(null);
      dSel.dispose();
      dCursor.dispose();
      dScroll.dispose();
      dLayout.dispose();
      saveAction.dispose();
      splitAction.dispose();
      goToFileAction.dispose();
      toggleMinimapAction.dispose();
      toggleWordWrapAction.dispose();
      formatDocAction.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync minimap / wordWrap / theme options whenever they change
  useEffect(() => {
    editorRef.current?.updateOptions({ minimap: { enabled: minimapEnabled }, wordWrap });
  }, [minimapEnabled, wordWrap]);

  // Register plugin context-menu contributions as Monaco actions
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const disposables = pluginContextMenuItems.map((item) =>
      editor.getMonacoEditor().addAction({
        id: `plugin.cm.${item.id}`,
        label: item.label,
        contextMenuGroupId: item.group ?? 'plugin',
        contextMenuOrder: item.order ?? 0,
        run: () => {
          globalCommandRegistry.execute(item.command).catch((e) =>
            console.error('[Plugin] contextmenu command error:', e),
          );
        },
      }),
    );
    return () => disposables.forEach((d) => d.dispose());
  }, [pluginContextMenuItems]);

  // Register plugin command-palette contributions as Monaco actions (visible in F1)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const disposables = pluginCommandPaletteItems.map((item) =>
      editor.getMonacoEditor().addAction({
        id: `plugin.cp.${item.command}`,
        label: item.category ? `${item.category}: ${item.title}` : item.title,
        run: () => {
          globalCommandRegistry.execute(item.command).catch((e) =>
            console.error('[Plugin] commandpalette command error:', e),
          );
        },
      }),
    );
    return () => disposables.forEach((d) => d.dispose());
  }, [pluginCommandPaletteItems]);

  // Emit cursor position to plugin event bus
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('cursorPositionChanged', (pos) => {
      globalEventBus.emit('system:editor:cursorMoved', pos);
    });
    return () => sub.dispose();
  }, []);

  // Track cursor position → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('cursorPositionChanged', (pos) => {
      onCursorChange(group.id, pos.lineNumber, pos.column);
    });
    return () => sub.dispose();
  }, [group.id, onCursorChange]);

  // Track selection → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('selectionChanged', (e) => {
      const sel = e.selection;
      const isEmpty = sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn;
      if (isEmpty) {
        onSelectionChange(group.id, null);
      } else {
        const model = editor.getModel();
        const chars = model ? model.getValueInRange(sel).length : 0;
        onSelectionChange(group.id, {
          startLn: sel.startLineNumber, startCol: sel.startColumn,
          endLn: sel.endLineNumber, endCol: sel.endColumn,
          chars,
        });
      }
    });
    return () => sub.dispose();
  }, [group.id, onSelectionChange]);

  // Track content changes → parent + emit to plugin event bus
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('contentChanged', () => {
      if (group.activeTab) onContentChange(group.id, group.activeTab);
      globalEventBus.emit('system:editor:contentChanged', { text: editor.getContent() });
    });
    return () => sub.dispose();
  }, [group.id, group.activeTab, onContentChange]);

  // Track focus → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('focusChanged', ({ focused }) => {
      if (focused) onFocus(group.id);
    });
    return () => sub.dispose();
  }, [group.id, onFocus]);

  // Switch model when activeTab changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Read tabs from ref to avoid re-running this effect when only tab metadata
    // (e.g. isDirty/modified flag) changes — those changes must not reset the cursor.
    const tabs = tabsRef.current;

    // Virtual tab — clear Monaco model, nothing else to do
    const activeTabInfo = tabs.find(t => t.path === group.activeTab);
    if (activeTabInfo?.virtual) {
      // Blur Monaco before hiding it. On Android, hiding a focused element without
      // moving focus explicitly causes the browser to auto-focus the next available
      // input (TipTap's contenteditable), which triggers the soft keyboard and a
      // viewport resize that looks like a "flash and reset".
      (document.activeElement as HTMLElement | null)?.blur();
      editor.setModel(null);
      return;
    }

    // Save previous tab's view state
    const prevTab = prevActiveTabRef.current;
    if (prevTab && prevTab !== group.activeTab) {
      const pos = editor.getCursorPosition();
      const me = editor.getMonacoEditor();
      viewStateRef.current.set(prevTab, {
        scrollTop: me.getScrollTop(),
        scrollLeft: me.getScrollLeft(),
        lineNumber: pos?.lineNumber ?? 1,
        column: pos?.column ?? 1,
      });
    }
    prevActiveTabRef.current = group.activeTab;

    if (!group.activeTab) {
      editor.setModel(null);
      return;
    }

    const tabInfo = tabs.find(t => t.path === group.activeTab);
    if (!tabInfo) return;

    const model = modelManager.getModel(tabInfo.uri);
    if (model) {
      editor.setModel(model);
      // Notify plugins about the model change with the actual text
      globalEventBus.emit('system:editor:modelChanged', {
        uri: group.activeTab,
        text: model.getValue(),
      });

      // Check pending navigation from Find in Files (takes priority over saved view state)
      const nav = navPendingRef?.current;
      if (nav && nav.path === group.activeTab) {
        navPendingRef!.current = null;
        requestAnimationFrame(() => {
          const me = editorRef.current?.getMonacoEditor();
          if (!me) return;
          me.setPosition({ lineNumber: nav.line, column: nav.col });
          me.revealLineInCenter(nav.line);
          editorRef.current?.focus();
        });
      } else {
        const vs = viewStateRef.current.get(group.activeTab);
        if (vs) {
          editor.setCursorPosition(vs.lineNumber, vs.column);
          editor.getMonacoEditor().setScrollPosition({ scrollTop: vs.scrollTop, scrollLeft: vs.scrollLeft });
        }
        editor.focus();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.activeTab, modelManager, navPendingRef]);

  // Layout on resize
  useEffect(() => {
    const raf = requestAnimationFrame(() => { editorRef.current?.layout(); });
    return () => cancelAnimationFrame(raf);
  });

  const activeTabIndex = group.tabs.findIndex(t => t.path === group.activeTab);

  const handleTabMouseDown = useCallback((path: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      onTabClose(group.id, path);
    }
  }, [group.id, onTabClose]);

  return (
    <Box
      onClick={() => onFocus(group.id)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: MIN_PANEL_PX,
        flex: `${group.size} 1 0`,
        borderTop: isActive ? '2px solid #007acc' : '2px solid transparent',
      }}
    >
      {/* Tab bar */}
      {group.tabs.length > 0 && (
        <Box sx={{ bgcolor: '#252526', borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center' }}>
          <Tabs
            value={activeTabIndex >= 0 ? activeTabIndex : false}
            onChange={(_, idx) => { if (group.tabs[idx]) onTabSwitch(group.id, group.tabs[idx].path); }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 35,
              flexGrow: 1,
              '& .MuiTabs-indicator': { bgcolor: '#007acc', height: 2 },
              '& .MuiTab-root': {
                minHeight: 35,
                py: 0,
                px: 1.5,
                textTransform: 'none',
                color: '#969696',
                fontSize: 13,
                '&.Mui-selected': { color: '#ffffff' },
              },
            }}
          >
            {group.tabs.map((tab) => (
              <Tab
                key={tab.path}
                onMouseDown={(e) => handleTabMouseDown(tab.path, e)}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {tab.label}{tab.modified ? ' \u25CF' : ''}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTabClose(group.id, tab.path); }}
                      sx={{
                        p: 0.25,
                        ml: 0.5,
                        color: '#969696',
                        '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Box>
                }
              />
            ))}
          </Tabs>
          {/* Split button in tab bar */}
          <IconButton
            size="small"
            title="Split Editor Right"
            onClick={() => onSplit(group.id)}
            sx={{ color: '#858585', mx: 0.5, '&:hover': { color: '#ccc' } }}
          >
            <SplitIcon />
          </IconButton>
        </Box>
      )}

      {/* Breadcrumbs */}
      {showBreadcrumbs && group.activeTab && (
        <Box sx={{
          bgcolor: '#1e1e1e',
          borderBottom: '1px solid #2d2d2d',
          px: 1.5,
          py: 0.375,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {group.activeTab.split('/').filter(Boolean).map((segment, idx, arr) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', flexShrink: idx < arr.length - 1 ? 1 : 0, minWidth: 0 }}>
              {idx > 0 && (
                <Typography sx={{ color: '#606060', fontSize: 12, mx: 0.5, flexShrink: 0 }}>›</Typography>
              )}
              <Typography sx={{
                fontSize: 12,
                color: idx === arr.length - 1 ? '#ccc' : '#858585',
                fontWeight: idx === arr.length - 1 ? 500 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {segment}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Virtual tab content (rendered instead of Monaco) */}
      {(() => {
        const activeVirtual = group.tabs.find(t => t.path === group.activeTab)?.virtual;
        if (!activeVirtual) return null;
        const VirtualComponent = activeVirtual.component;
        return (
          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <VirtualComponent />
          </Box>
        );
      })()}

      {/* Monaco container wrapper — position:relative so the handles overlay can be absolute inside */}
      <Box
        sx={{
          flexGrow: 1,
          position: 'relative',
          overflow: 'hidden',
          display: group.tabs.find(t => t.path === group.activeTab)?.virtual
            ? 'none'
            : 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Monaco container — always mounted, hidden when virtual tab active */}
        <Box
          ref={containerRef}
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            display: group.tabs.find(t => t.path === group.activeTab)?.virtual
              ? 'none'
              : group.tabs.length > 0 ? 'block' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {group.tabs.length === 0 && (
            <Typography sx={{ color: '#5a5a5a', fontSize: 14, textAlign: 'center', userSelect: 'none' }}>
              Double-click a file to open it
            </Typography>
          )}
        </Box>

        {/* Selection handles rendered in a portal at body level with position:fixed.
            Cursor-only: single handle that the user can drag to create a selection.
            Real selection: two handles at start and end for adjusting bounds. */}
        {selHandles && createPortal(
          <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 99999 }}>
            {/* Start handle (or cursor handle when no selection) */}
            <div
              onPointerDown={(e) => handlePointerDownOnHandle(selHandles.end === null ? 'cursor' : 'start', e)}
              style={{
                position: 'fixed',
                left: selHandles.start.x - 22,
                top: selHandles.start.y,
                width: 44,
                height: Math.max(selHandles.start.lineHeight + 16, 44),
                pointerEvents: 'all',
                touchAction: 'none',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div style={{ width: 2, flexGrow: 1, minHeight: 8, background: '#4fc3f7', borderRadius: '1px 1px 0 0' }} />
              <div style={{
                width: 16, height: 16, flexShrink: 0,
                background: '#4fc3f7',
                borderRadius: selHandles.end === null ? '50%' : '50% 0 50% 50%',
                transform: selHandles.end === null ? 'none' : 'rotate(-135deg)',
              }} />
            </div>
            {/* End handle — only shown when there is a real (non-collapsed) selection */}
            {selHandles.end !== null && (
              <div
                onPointerDown={(e) => handlePointerDownOnHandle('end', e)}
                style={{
                  position: 'fixed',
                  left: selHandles.end.x - 22,
                  top: selHandles.end.y,
                  width: 44,
                  height: Math.max(selHandles.end.lineHeight + 16, 44),
                  pointerEvents: 'all',
                  touchAction: 'none',
                  userSelect: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ width: 2, flexGrow: 1, minHeight: 8, background: '#4fc3f7', borderRadius: '1px 1px 0 0' }} />
                <div style={{
                  width: 16, height: 16, flexShrink: 0,
                  background: '#4fc3f7',
                  borderRadius: '0 50% 50% 50%',
                  transform: 'rotate(-45deg)',
                }} />
              </div>
            )}
          </div>,
          document.body,
        )}
      </Box>
    </Box>
  );
});

/* ── CursorControlStrip (mobile cursor joystick) ── */

interface CursorControlStripProps {
  onMoveCursor: (dChars: number, dLines: number) => void;
  onSingleChar: (dir: -1 | 1) => void;
}

function CursorControlStrip({ onMoveCursor, onSingleChar }: CursorControlStripProps) {
  const [active, setActive] = useState(false);
  // Keep latest callbacks in refs so drag closures never go stale.
  const onMoveCursorRef = useRef(onMoveCursor);
  onMoveCursorRef.current = onMoveCursor;
  const onSingleCharRef = useRef(onSingleChar);
  onSingleCharRef.current = onSingleChar;
  // Accumulate sub-step movement so small drags sum up correctly.
  const accumRef = useRef({ x: 0, y: 0 });

  const CHAR_PX = 9;  // horizontal pixels per one character step
  const LINE_PX = 22; // vertical pixels per one line step

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setActive(true);
    accumRef.current = { x: 0, y: 0 };

    const pointerId = e.pointerId;
    let lastX = e.clientX;
    let lastY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      accumRef.current.x += ev.clientX - lastX;
      accumRef.current.y += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;

      const dChars = Math.trunc(accumRef.current.x / CHAR_PX);
      const dLines = Math.trunc(accumRef.current.y / LINE_PX);
      if (dChars !== 0 || dLines !== 0) {
        accumRef.current.x -= dChars * CHAR_PX;
        accumRef.current.y -= dLines * LINE_PX;
        onMoveCursorRef.current(dChars, dLines);
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      setActive(false);
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btnStyle: React.CSSProperties = {
    all: 'unset' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 36,
    flexShrink: 0,
    cursor: 'pointer',
    touchAction: 'manipulation',
    color: '#bbb',
    fontSize: 18,
    userSelect: 'none',
  };

  return (
    <Box sx={{
      height: 36,
      bgcolor: active ? '#2a2d2e' : '#252526',
      borderTop: '1px solid #3c3c3c',
      display: 'flex',
      alignItems: 'stretch',
      flexShrink: 0,
      userSelect: 'none',
      transition: 'background-color 0.1s',
    }}>
      {/* Single-step left */}
      <button style={btnStyle} onPointerDown={e => { e.stopPropagation(); onSingleCharRef.current(-1); }}>
        ‹
      </button>

      {/* Drag zone */}
      <Box
        onPointerDown={startDrag}
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          touchAction: 'none',
          cursor: active ? 'grabbing' : 'grab',
          borderLeft: '1px solid #3c3c3c',
          borderRight: '1px solid #3c3c3c',
        }}
      >
        <Box sx={{
          width: 28,
          height: 4,
          borderRadius: 2,
          bgcolor: active ? '#4fc3f7' : '#555',
          transition: 'background-color 0.1s',
        }} />
        <Box component="span" sx={{ fontSize: 11, color: active ? '#4fc3f7' : '#666', letterSpacing: 0.5, userSelect: 'none', transition: 'color 0.1s' }}>
          {active ? 'moving' : 'cursor'}
        </Box>
        <Box sx={{
          width: 28,
          height: 4,
          borderRadius: 2,
          bgcolor: active ? '#4fc3f7' : '#555',
          transition: 'background-color 0.1s',
        }} />
      </Box>

      {/* Single-step right */}
      <button style={btnStyle} onPointerDown={e => { e.stopPropagation(); onSingleCharRef.current(1); }}>
        ›
      </button>
    </Box>
  );
}

/* ── Main Component ── */

export function MonacoMultiEditor({
  provider,
  height = '100%',
  readOnly = false,
  providerRegistry,
  onFileSave,
  plugins,
  agentPanel,
  enableTerminal = false,
  terminalWsUrl,
  terminalToken,
  onTerminalConfigRequest,
  projectDeps,
  onDialogAction,
  defaultMountPresets,
  initialPath,
}: MonacoMultiEditorProps) {
  const [groups, setGroups] = useState<EditorGroup[]>(() => [{ id: makeGroupId(), tabs: [], activeTab: null, size: 1 }]);
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0].id);
  const [splitRatio, setSplitRatio] = useState(() => window.innerWidth < 900 ? 0.65 : 0.25);
  const explorerRefreshRef = useRef<(() => void) | null>(null);
  const explorerRevealRef = useRef<((paths: string[]) => Promise<void>) | null>(null);
  // On mobile, start with sidebar closed — 48px activity bar + 65% sidebar + 180px min-editor
  // overflows the viewport (e.g. 482px > 375px) and clips the editor behind overflow:hidden.
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(() =>
    typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || window.innerWidth < 900) ? null : 'explorer'
  );
  const [cursorInfo, setCursorInfo] = useState({ ln: 1, col: 1 });
  const [selectionInfo, setSelectionInfo] = useState<{ startLn: number; startCol: number; endLn: number; endCol: number; chars: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchUseRegex, setSearchUseRegex] = useState(false);
  const [searchDir, setSearchDir] = useState('/');
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  // ── VSCode-like feature toggles ──
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [wordWrap, setWordWrap] = useState<'off' | 'on'>('off');
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);
  const [formatOnSave, setFormatOnSave] = useState(false);
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'vs'>('vs-dark');

  // ── Command Palette ──
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdPaletteQuery, setCmdPaletteQuery] = useState('');

  // ── Go to File ──
  const [goToFileOpen, setGoToFileOpen] = useState(false);
  const [allVfsFiles, setAllVfsFiles] = useState<string[]>([]);
  const [goToFileLoading, setGoToFileLoading] = useState(false);

  // ── Menu anchors ──
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null);

  const isMobile = useIsMobile();
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const agentPanelWidth = 400;
  // Unified bottom panel (terminal + output tabs)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(220);
  const bottomPanelHeightRef = useRef(220);
  const [bottomTabs, setBottomTabs] = useState<BottomTab[]>(
    enableTerminal ? [{ id: 'terminal-1', type: 'terminal', label: 'bash' }] : [],
  );
  const [activeBottomTabId, setActiveBottomTabId] = useState(enableTerminal ? 'terminal-1' : '');
  const currentOutputTabIdRef = useRef<string | null>(null);
  const stopActionRef = useRef<(() => void) | null>(null);
  const mainAreaRef = useRef<HTMLDivElement | null>(null);

  // Menu anchors
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null);
  const [codeMenuAnchor, setCodeMenuAnchor] = useState<null | HTMLElement>(null);
  const [pluginsMenuAnchor, setPluginsMenuAnchor] = useState<null | HTMLElement>(null);

  const modelManagerRef = useRef<ModelManager | null>(null);
  const splitterContainerRef = useRef<HTMLDivElement | null>(null);
  const groupEditorsRef = useRef<Map<string, monaco.editor.IStandaloneCodeEditor>>(new Map());
  const pendingNavRef = useRef<{ path: string; line: number; col: number } | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const activeGroupIdRef = useRef(activeGroupId);
  activeGroupIdRef.current = activeGroupId;

  // Initialize ModelManager once
  if (!modelManagerRef.current) {
    modelManagerRef.current = new ModelManager();
  }

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? groups[0];
  const activeTabObj = activeGroup?.tabs.find(t => t.path === activeGroup.activeTab);
  const activeLang = activeTabObj ? detectLanguage(activeTabObj.path) : '';
  const sidebarOpen = sidebarPanel !== null;

  // Sync Monaco global theme
  useEffect(() => {
    monaco.editor.setTheme(editorTheme);
  }, [editorTheme]);

  const handleToggleMinimap = useCallback(() => setMinimapEnabled(v => !v), []);
  const handleToggleWordWrap = useCallback(() => setWordWrap(v => v === 'off' ? 'on' : 'off'), []);

  // ── Plugin system ──────────────────────────────────────────────────────────

  // Register and activate plugins — re-runs when the set of plugin ids changes
  // (handles HMR / dynamically added plugins without re-registering existing ones)
  const pluginIdsKey = (plugins ?? []).map((p) => p.manifest.id).join(',');
  useEffect(() => {
    if (!plugins?.length) return;
    const disposables = plugins.map((p) => {
      if (globalPluginRegistry.getPlugin(p.manifest.id)) return null; // already registered
      try { return globalPluginRegistry.register(p); }
      catch (e) { console.warn('[MonacoMultiEditor] Plugin register error:', e); return null; }
    });
    globalPluginRegistry.activateAll();
    return () => {
      disposables.forEach((d) => d?.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginIdsKey]);

  // system:editor:modelChanged is now emitted directly from EditorGroupPane
  // when editor.setModel() is called — more reliable than tracking state here.

  // Listen for command palette open request
  useEffect(() => {
    const unsub = globalEventBus.on('system:editor:openCommandPalette', () => {
      setCmdPaletteQuery('');
      setCmdPaletteOpen(true);
    });
    return unsub;
  }, []);

  // "Insert $schema reference…" — opened from the toolbar button (JSON files);
  // the chosen schema is inserted at the cursor as a path relative to the file.
  const [insertSchemaFor, setInsertSchemaFor] = useState<string | null>(null);
  const handleInsertSchema = useCallback((relativePath: string) => {
    const text = `"$schema": "${relativePath}",`;
    const editors = monaco.editor.getEditors();
    const target = editors.find((e) => e.getModel()?.uri.path === insertSchemaFor)
      ?? editors.find((e) => e.hasTextFocus())
      ?? editors[0];
    const sel = target?.getSelection();
    if (!target || !sel) return;
    target.executeEdits('insert-schema', [{ range: sel, text, forceMoveMarkers: true }]);
    target.focus();
  }, [insertSchemaFor]);

  // Listen for plugin requests to open a sidebar panel
  useEffect(() => {
    const unsub = globalEventBus.on<{ panelId: string }>('system:ui:openSidebar', ({ panelId }) => {
      setSidebarPanel(panelId);
    });
    return unsub;
  }, []);

  // Allow plugins to mark a file as modified (e.g. after programmatic model edits)
  useEffect(() => {
    const unsub = globalEventBus.on<{ path: string }>('system:editor:markDirty', ({ path }) => {
      setGroups(prev => prev.map(g => ({
        ...g,
        tabs: g.tabs.map(t => t.path === path ? { ...t, modified: true } : t),
      })));
    });
    return unsub;
  }, []);

  // Complement of markDirty — plugins that persist a file directly to VFS
  // (e.g. MinisLib graph's Save Source button) emit this to tell us their tab
  // should drop its dirty dot. Without it the dot stayed on even after a
  // successful save because the plugin bypassed our normal save() path.
  // Match the path loosely (==, endsWith, or contained-in) since plugins may
  // emit `uri` or `path` with slightly different leading slashes / file://
  // prefixes than the tab's stored `path`.
  useEffect(() => {
    const unsub = globalEventBus.on<{ uri?: string; path?: string }>('system:editor:didSave', (payload) => {
      const target = payload?.path ?? payload?.uri;
      if (!target) return;
      setGroups(prev => prev.map(g => ({
        ...g,
        tabs: g.tabs.map(t => {
          const match =
            t.path === target ||
            t.path.endsWith(target) ||
            target.endsWith(t.path) ||
            (t.uri && (t.uri === target || t.uri.endsWith(target) || target.endsWith(t.uri)));
          return match ? { ...t, modified: false } : t;
        }),
      })));
    });
    return unsub;
  }, []);

  // Listen for plugin requests to open a virtual editor tab
  useEffect(() => {
    const unsub = globalEventBus.on<{
      uri: string;
      title: string;
      component: ComponentType;
      toSide: boolean;
    }>('system:editor:openVirtualTab', ({ uri, title, component, toSide }) => {
      try {
        if (localStorage.getItem('HYDRA_DEBUG') === '1') {
          console.log('[hydra] host: żądanie zakładki wirtualnej', uri, 'obok:', toSide);
        }
      } catch { /* brak localStorage */ }
      const currentGroups = groupsRef.current;
      const currentActiveId = activeGroupIdRef.current;

      // If this virtual tab is already open somewhere, just switch to it
      for (const g of currentGroups) {
        if (g.tabs.some(t => t.path === uri)) {
          setGroups(prev => prev.map(g2 =>
            g2.tabs.some(t => t.path === uri) ? { ...g2, activeTab: uri } : g2,
          ));
          setActiveGroupId(g.id);
          return;
        }
      }

      const virtualTab: TabInfo = {
        path: uri,
        label: title,
        modified: false,
        uri: createDocumentUri(uri),
        virtual: { component },
      };

      if (toSide) {
        const newGroupId = makeGroupId();
        const activeIdx = currentGroups.findIndex(g => g.id === currentActiveId);
        const insertAt = activeIdx >= 0 ? activeIdx + 1 : currentGroups.length;
        setGroups(prev => {
          const updated = [...prev];
          updated.splice(insertAt, 0, {
            id: newGroupId,
            tabs: [virtualTab],
            activeTab: uri,
            size: 1,
          });
          return updated;
        });
        setActiveGroupId(newGroupId);
      } else {
        setGroups(prev => prev.map(g =>
          g.id === currentActiveId
            ? { ...g, tabs: [...g.tabs, virtualTab], activeTab: uri }
            : g,
        ));
      }
    });
    return unsub;
  }, []);

  // Plugin contribution hooks
  const pluginToolbarItems = useToolbarItems();
  const pluginStatusBarItems = useStatusBarPluginItems();
  const pluginSidebarPanels = useSidebarContributions();
  const pluginContextMenuItems = useContextMenuContributions();
  const pluginCommandPaletteItems = useCommandPaletteContributions();
  const pluginInfos = usePlugins(() => globalPluginRegistry.getPlugins());

  // Open a file — always opens in the active group
  const handleFileOpen = useCallback(async (path: string) => {
    const mm = modelManagerRef.current;
    if (!mm) return;

    setGroups(prev => {
      const groupIdx = prev.findIndex(g => g.id === activeGroupId);
      if (groupIdx === -1) return prev;
      const group = prev[groupIdx];

      // Already open in this group
      if (group.tabs.find(t => t.path === path)) {
        const updated = [...prev];
        updated[groupIdx] = { ...group, activeTab: path };
        return updated;
      }

      return prev; // will add after async read
    });

    // Check if tab already exists in active group
    const currentGroups = groups;
    const group = currentGroups.find(g => g.id === activeGroupId);
    if (group?.tabs.find(t => t.path === path)) {
      setGroups(prev => prev.map(g =>
        g.id === activeGroupId ? { ...g, activeTab: path } : g
      ));
      return;
    }

    // Read file and create model
    const data = await provider.readFile(path);
    const content = decodeText(data);
    const language = detectLanguage(path);
    const uri = `file://${path}`;

    // For JSON files: auto-load $schema from VFS and register with Monaco
    if (language === 'json') {
      loadJsonSchemaFromVfs(provider, path, content, uri).catch(() => {/* non-fatal */});
    }

    mm.createModel(content, language, uri);
    const docUri = createDocumentUri(uri);

    const newTab: TabInfo = { path, label: fileLabel(path), modified: false, uri: docUri };

    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroupId) return g;
      if (g.tabs.find(t => t.path === path)) return { ...g, activeTab: path };
      return { ...g, tabs: [...g.tabs, newTab], activeTab: path };
    }));

    // On mobile, close the sidebar when a file is opened so the editor has full width.
    if (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || window.innerWidth < 900)) {
      setSidebarPanel(null);
    }
  }, [provider, groups, activeGroupId]);

  // Open `initialPath` once on mount and again whenever the host changes it.
  // Tracks the last-opened value so re-renders (handleFileOpen identity changes
  // on every group/tab edit) don't reopen the same file repeatedly.
  const lastInitialPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPath) return;
    if (lastInitialPathRef.current === initialPath) return;
    lastInitialPathRef.current = initialPath;
    void handleFileOpen(initialPath);
    // handleFileOpen intentionally omitted — its identity changes on every tab
    // edit, which would defeat the lastInitialPathRef guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  // Go to File — walk VFS to collect files, then show dialog
  const handleGoToFileOpen = useCallback(async () => {
    setGoToFileOpen(true);
    if (allVfsFiles.length > 0) return;
    setGoToFileLoading(true);
    const files: string[] = [];
    async function walk(dir: string) {
      let entries: { name: string; type: FileType }[];
      try { entries = await provider.readDirectory(dir); } catch { return; }
      for (const { name, type: ft } of entries) {
        const full = dir === '/' ? `/${name}` : `${dir}/${name}`;
        if (ft === FileType.Directory) {
          if (!SKIP_DIRS.has(name)) await walk(full);
        } else {
          files.push(full);
        }
      }
    }
    try {
      await walk('/');
      files.sort();
      setAllVfsFiles(files);
    } catch { /* ignore */ } finally {
      setGoToFileLoading(false);
    }
  }, [allVfsFiles.length, provider]);

  const handleGoToFileSelect = useCallback((path: string) => {
    setGoToFileOpen(false);
    handleFileOpen(path);
  }, [handleFileOpen]);

  // Tab switch within a group
  const handleTabSwitch = useCallback((groupId: string, path: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, activeTab: path } : g
    ));
    setActiveGroupId(groupId);
  }, []);

  // Close a tab within a group
  const handleTabClose = useCallback((groupId: string, path: string) => {
    setGroups(prev => {
      const groupIdx = prev.findIndex(g => g.id === groupId);
      if (groupIdx === -1) return prev;
      const group = prev[groupIdx];
      const tabIndex = group.tabs.findIndex(t => t.path === path);
      if (tabIndex === -1) return prev;

      const newTabs = group.tabs.filter(t => t.path !== path);

      // Check if this file is still open in another group
      const tab = group.tabs[tabIndex];
      const stillOpenElsewhere = prev.some((g, i) => i !== groupIdx && g.tabs.some(t => t.path === path));
      if (!stillOpenElsewhere && !tab.virtual) {
        modelManagerRef.current?.disposeModel(tab.uri);
      }

      let newActiveTab = group.activeTab;
      if (group.activeTab === path) {
        if (newTabs.length > 0) {
          const nextIdx = Math.min(tabIndex, newTabs.length - 1);
          newActiveTab = newTabs[nextIdx].path;
        } else {
          newActiveTab = null;
        }
      }

      // If group becomes empty and there's more than 1 group, remove it
      if (newTabs.length === 0 && prev.length > 1) {
        const remaining = prev.filter(g => g.id !== groupId);
        return remaining;
      }

      const updated = [...prev];
      updated[groupIdx] = { ...group, tabs: newTabs, activeTab: newActiveTab };
      return updated;
    });

  }, []);

  // Ensure activeGroupId is valid after groups change
  useEffect(() => {
    if (!groups.find(g => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? '');
    }
  }, [groups, activeGroupId]);

  const closeAllTabs = useCallback(() => {
    const mm = modelManagerRef.current;
    for (const group of groups) {
      for (const tab of group.tabs) {
        mm?.disposeModel(tab.uri);
      }
    }
    const firstId = groups[0]?.id ?? makeGroupId();
    setGroups([{ id: firstId, tabs: [], activeTab: null, size: 1 }]);
    setActiveGroupId(firstId);
  }, [groups]);

  // Focus a group
  const handleGroupFocus = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
  }, []);

  const handleEditorReady = useCallback((groupId: string, editor: monaco.editor.IStandaloneCodeEditor) => {
    groupEditorsRef.current.set(groupId, editor);
    editor.onDidDispose(() => { groupEditorsRef.current.delete(groupId); });
  }, []);

  // Save a specific tab by path — used by plugins that own a virtual tab and
  // need to persist the underlying model. Goes through the same provider /
  // setGroups path as the regular toolbar Save, so modified flag clears
  // synchronously (no fuzzy event match needed).
  const handleSaveByPath = useCallback(async (path: string) => {
    let tabInfo: TabInfo | undefined;
    for (const g of groups) {
      const t = g.tabs.find(x => x.path === path || x.uri === path || x.path.endsWith(path) || path.endsWith(x.path));
      if (t) { tabInfo = t; break; }
    }
    if (!tabInfo) return;
    const mm = modelManagerRef.current;
    const model = mm?.getModel(tabInfo.uri);
    if (!model) return;
    const content = model.getValue();
    const encoded = encodeText(content);
    if (onFileSave) {
      await onFileSave(tabInfo.path, encoded);
    } else if (provider.writeFile) {
      await provider.writeFile(tabInfo.path, encoded, { overwrite: true, create: true });
    }
    setGroups(prev => prev.map(g => ({
      ...g,
      tabs: g.tabs.map(t => t.path === tabInfo!.path ? { ...t, modified: false } : t),
    })));
    globalEventBus.emit('system:editor:didSave', { uri: tabInfo.path });
  }, [groups, onFileSave, provider]);

  // Listen for plugin save requests (MinisLib graph etc). Delegates to the
  // same path-based saver so plugins don't have to know provider details or
  // sync the modified flag themselves.
  useEffect(() => {
    const unsub = globalEventBus.on<{ uri?: string; path?: string }>('system:editor:requestSave', (payload) => {
      const p = payload?.path ?? payload?.uri;
      if (p) void handleSaveByPath(p);
    });
    return unsub;
  }, [handleSaveByPath]);

  // Save in a group
  const handleGroupSave = useCallback(async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group?.activeTab) return;

    const path = group.activeTab;
    const tabInfo = group.tabs.find(t => t.path === path);
    if (!tabInfo) return;

    const mm = modelManagerRef.current;
    const model = mm?.getModel(tabInfo.uri);
    if (!model) return;

    const content = model.getValue();
    const encoded = encodeText(content);

    if (onFileSave) {
      await onFileSave(path, encoded);
    } else if (provider.writeFile) {
      await provider.writeFile(path, encoded, { overwrite: true, create: true });
    }

    setGroups(prev => prev.map(g => ({
      ...g,
      tabs: g.tabs.map(t => t.path === path ? { ...t, modified: false } : t),
    })));

    globalEventBus.emit('system:editor:didSave', { uri: path });
  }, [groups, onFileSave, provider]);

  // Split editor — duplicate active tab into a new group to the right
  const handleSplit = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group?.activeTab) return;

    const activeTabInfo = group.tabs.find(t => t.path === group.activeTab);
    if (!activeTabInfo) return;

    const newGroup: EditorGroup = {
      id: makeGroupId(),
      tabs: [{ ...activeTabInfo }],
      activeTab: activeTabInfo.path,
      size: 1,
    };

    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === groupId);
      const updated = [...prev];
      updated.splice(idx + 1, 0, newGroup);
      return updated;
    });
    setActiveGroupId(newGroup.id);
  }, [groups]);

  // Cursor change from a group
  const handleCursorChange = useCallback((_: string, ln: number, col: number) => {
    setCursorInfo({ ln, col });
  }, []);

  const handleSelectionChange = useCallback((_: string, sel: { startLn: number; startCol: number; endLn: number; endCol: number; chars: number } | null) => {
    setSelectionInfo(sel);
  }, []);

  // Group splitter drag — resize adjacent editor groups (Pointer Events: unified mouse + touch)
  const editorGroupsContainerRef = useRef<HTMLDivElement | null>(null);
  const handleGroupSplitterPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, leftGroupId: string, rightGroupId: string) => {
    e.preventDefault();
    const container = editorGroupsContainerRef.current;
    if (!container) return;

    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    // Snapshot current values from ref (always fresh)
    const snap = groupsRef.current;
    const leftGroup = snap.find(g => g.id === leftGroupId);
    const rightGroup = snap.find(g => g.id === rightGroupId);
    if (!leftGroup || !rightGroup) return;

    const containerWidth = container.getBoundingClientRect().width;
    const splitterCount = snap.length - 1;
    const availableWidth = containerWidth - splitterCount * 5;
    const totalSizeAll = snap.reduce((s, g) => s + g.size, 0);
    const pxPerUnit = availableWidth / totalSizeAll;
    const minUnits = MIN_PANEL_PX / pxPerUnit;

    const startX = e.clientX;
    const leftStart = leftGroup.size;
    const combined = leftGroup.size + rightGroup.size;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = ev.clientX - startX;
      const delta = dx / pxPerUnit;
      let newLeft = leftStart + delta;
      let newRight = combined - newLeft;

      if (newLeft < minUnits) { newLeft = minUnits; newRight = combined - minUnits; }
      if (newRight < minUnits) { newRight = minUnits; newLeft = combined - minUnits; }

      setGroups(prev => prev.map(g => {
        if (g.id === leftGroupId) return { ...g, size: newLeft };
        if (g.id === rightGroupId) return { ...g, size: newRight };
        return g;
      }));
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }, []);

  // Content change → mark tab modified in all groups that have this path open
  const handleContentChange = useCallback((_: string, path: string) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      tabs: g.tabs.map(t => t.path === path ? { ...t, modified: true } : t),
    })));
  }, []);

  // Find in Files — walk VFS and collect matches
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchDone(false);
    setSearchResults([]);
    try {
      let pattern = q;
      if (!searchUseRegex) pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchWholeWord) pattern = `\\b${pattern}\\b`;
      const flags = searchCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      const results: FileSearchResult[] = [];
      const rootDir = searchDir.trim() || '/';
      await walkVfsForSearch(provider, rootDir, regex, results);
      setSearchResults(results);
      setSearchDone(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchDir, searchCaseSensitive, searchWholeWord, searchUseRegex, provider]);

  // Navigate to a match — open file if needed, then navigate to line/col
  const handleGoToMatch = useCallback(async (path: string, line: number, col: number) => {
    pendingNavRef.current = { path, line, col };
    const group = groupsRef.current.find(g => g.id === activeGroupId);
    if (group?.tabs.find(t => t.path === path)) {
      // Already open — switch tab (model-switch effect fires and picks up pendingNavRef)
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, activeTab: path } : g));
    } else {
      await handleFileOpen(path);
    }
  }, [activeGroupId, handleFileOpen]);

  // Toggle a file result collapsed/expanded
  const toggleResultCollapse = useCallback((path: string) => {
    setSearchResults(prev => prev.map(r => r.path === path ? { ...r, collapsed: !r.collapsed } : r));
  }, []);

  // Replace all matches in a single file
  const handleReplaceInFile = useCallback(async (result: FileSearchResult) => {
    const mm = modelManagerRef.current;
    const uri = `file://${result.path}`;
    const docUri = createDocumentUri(uri);
    const model = mm?.getModel(docUri);

    let text: string;
    if (model) {
      text = model.getValue();
    } else {
      text = decodeText(await provider.readFile(result.path));
    }

    const q = searchQuery.trim();
    if (!q) return;
    let pattern = q;
    if (!searchUseRegex) pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (searchWholeWord) pattern = `\\b${pattern}\\b`;
    const flags = searchCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);
    const replaced = text.replace(regex, replaceQuery);

    if (model) {
      model.setValue(replaced);
      setGroups(prev => prev.map(g => ({
        ...g,
        tabs: g.tabs.map(t => t.path === result.path ? { ...t, modified: true } : t),
      })));
    }
    const encoded = encodeText(replaced);
    if (onFileSave) {
      await onFileSave(result.path, encoded);
    } else if (provider.writeFile) {
      await provider.writeFile(result.path, encoded, { overwrite: true, create: true });
    }

    setSearchResults(prev => prev.filter(r => r.path !== result.path));
  }, [searchQuery, replaceQuery, searchCaseSensitive, searchWholeWord, searchUseRegex, provider, onFileSave]);

  // Replace all matches across all files
  const handleReplaceAll = useCallback(async () => {
    for (const result of searchResults) {
      await handleReplaceInFile(result);
    }
  }, [searchResults, handleReplaceInFile]);

  // Agent wrote files → reload any open tabs whose content changed + reveal in file explorer
  const handleAgentFileWritten = useCallback(async (paths: string[]) => {
    // Reveal written paths in the VFS explorer (refresh + expand ancestor dirs)
    explorerRevealRef.current?.(paths).catch(() => {});

    const mm = modelManagerRef.current;
    if (!mm) return;
    for (const path of paths) {
      const uri = `file://${path}`;
      const docUri = createDocumentUri(uri);
      const model = mm.getModel(docUri);
      if (!model) continue; // not open in any tab, nothing to reload
      try {
        const data = await provider.readFile(path);
        const content = decodeText(data);
        model.setValue(content);
        // Mark the tab as clean — agent already persisted it to VFS
        setGroups(prev => prev.map(g => ({
          ...g,
          tabs: g.tabs.map(t => t.path === path ? { ...t, modified: false } : t),
        })));
      } catch { /* file deleted or unreadable — leave tab as-is */ }
    }
  }, [provider]);

  // Splitter drag (sidebar) — Pointer Events API: unified mouse + touch, works on iOS Safari 13+
  const handleSplitterPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = splitterContainerRef.current;
    if (!container) return;

    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore if not supported */ }

    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;
    const startClientX = e.clientX;

    const applyDelta = (clientX: number) => {
      const dx = clientX - startClientX;
      const newRatio = startRatio + dx / containerRect.width;
      const minRatio = MIN_PANEL_PX / containerRect.width;
      const maxRatio = 1 - minRatio;
      setSplitRatio(Math.min(maxRatio, Math.max(minRatio, newRatio)));
    };

    const onMove = (ev: PointerEvent) => { ev.preventDefault(); applyDelta(ev.clientX); };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }, [splitRatio]);


  // Bottom panel splitter drag
  const handleBottomSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = mainAreaRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startHeight = bottomPanelHeightRef.current;
    const maxHeight = container.getBoundingClientRect().height * 0.7;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    const onMouseMove = (ev: MouseEvent) => {
      const newH = Math.max(80, Math.min(maxHeight, startHeight + (startY - ev.clientY)));
      bottomPanelHeightRef.current = newH;
      setBottomPanelHeight(newH);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Tab management
  const handleAddTerminal = useCallback(() => {
    const id = `terminal-${Date.now()}`;
    const n = bottomTabs.filter(t => t.type === 'terminal').length + 1;
    setBottomTabs(prev => [...prev, { id, type: 'terminal', label: `bash ${n}` }]);
    setActiveBottomTabId(id);
    setBottomPanelOpen(true);
  }, [bottomTabs]);

  const handleCloseTab = useCallback((id: string) => {
    // If closing a running output tab, abort the underlying process first
    const closedTab = bottomTabs.find(t => t.id === id);
    if (closedTab?.type === 'output' && closedTab.running) {
      stopActionRef.current?.();
    }
    setBottomTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { setBottomPanelOpen(false); return prev; }
      return next;
    });
    setActiveBottomTabId(prev => {
      if (prev !== id) return prev;
      const idx = bottomTabs.findIndex(t => t.id === id);
      const remaining = bottomTabs.filter(t => t.id !== id);
      if (remaining.length === 0) return '';
      return remaining[Math.max(0, idx - 1)].id;
    });
  }, [bottomTabs]);

  // VfsExplorer → bottom panel output callbacks
  const handleOutputLine = useCallback((line: OutputLine) => {
    const tabId = currentOutputTabIdRef.current;
    if (!tabId) return;
    setBottomTabs(prev => prev.map(t =>
      t.id === tabId && t.type === 'output' ? { ...t, lines: [...t.lines, line] } : t,
    ));
  }, []);

  const handleActionRunningChange = useCallback((running: boolean, actionLabel?: string) => {
    if (running) {
      const tabId = `output-${Date.now()}`;
      currentOutputTabIdRef.current = tabId;
      setBottomTabs(prev => [...prev, { id: tabId, type: 'output', label: actionLabel ?? 'Output', lines: [], running: true }]);
      setActiveBottomTabId(tabId);
      setBottomPanelOpen(true);
    } else {
      const tabId = currentOutputTabIdRef.current;
      if (tabId) {
        setBottomTabs(prev => prev.map(t =>
          t.id === tabId && t.type === 'output' ? { ...t, running: false } : t,
        ));
      }
    }
  }, []);

  // Activity bar toggle
  const togglePanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel(prev => prev === panel ? null : panel);
  }, []);

  // Markdown formatting in Monaco text editor
  const applyMarkdownFormat = useCallback((formatType: string) => {
    const editor = groupEditorsRef.current.get(activeGroupIdRef.current);
    if (!editor) return;
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (!model || !sel) return;

    const selectedText = model.getValueInRange(sel);

    // Inline wrapping: **bold**, *italic*, ~~strike~~
    const inlineMarkers: Record<string, string> = {
      bold: '**', italic: '*', strike: '~~',
    };
    if (formatType in inlineMarkers) {
      const marker = inlineMarkers[formatType];
      if (selectedText) {
        const newText = `${marker}${selectedText}${marker}`;
        editor.executeEdits('markdown-toolbar', [{ range: sel, text: newText, forceMoveMarkers: true }]);
      } else {
        // Insert markers and position cursor between them
        editor.executeEdits('markdown-toolbar', [{ range: sel, text: `${marker}${marker}`, forceMoveMarkers: true }]);
        editor.setPosition({ lineNumber: sel.startLineNumber, column: sel.startColumn + marker.length });
      }
      editor.focus();
      return;
    }

    // Block prefixes: headings, lists, blockquote
    const blockPrefixes: Record<string, string> = {
      h1: '# ', h2: '## ', h3: '### ',
      bulletList: '- ', orderedList: '1. ', blockquote: '> ',
    };
    if (formatType in blockPrefixes) {
      const prefix = blockPrefixes[formatType];
      const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
      for (let ln = sel.startLineNumber; ln <= sel.endLineNumber; ln++) {
        const line = model.getLineContent(ln);
        const lineRange: monaco.IRange = { startLineNumber: ln, startColumn: 1, endLineNumber: ln, endColumn: line.length + 1 };
        // Toggle: remove prefix if already present, otherwise add it
        edits.push({ range: lineRange, text: line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line });
      }
      editor.executeEdits('markdown-toolbar', edits);
      editor.focus();
    }
  }, []);

  // Get the active group's Monaco editor instance and call trigger()
  const triggerActiveEditor = useCallback((actionId: string) => {
    const editor = groupEditorsRef.current.get(activeGroupIdRef.current);
    if (editor) editor.trigger('toolbar', actionId, null);
  }, []);

  const triggerUndo = useCallback(() => triggerActiveEditor('undo'), [triggerActiveEditor]);
  const triggerRedo = useCallback(() => triggerActiveEditor('redo'), [triggerActiveEditor]);

  // ── FROM / TO selection helpers (touch/mobile) ──────────────────────────────
  // selAnchor stores the "FROM" position so the user can tap FROM, move cursor, tap TO.
  const [selAnchor, setSelAnchor] = useState<{ lineNumber: number; column: number } | null>(null);
  // Incrementing this forces EditorGroupPane to recompute handle positions immediately,
  // bypassing any event-delivery delays (needed for programmatic setSelection on mobile).
  const [forceHandleUpdate, setForceHandleUpdate] = useState(0);

  const triggerSelFrom = useCallback(() => {
    const editor = groupEditorsRef.current.get(activeGroupIdRef.current);
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    setSelAnchor({ lineNumber: pos.lineNumber, column: pos.column });
    // No editor.focus() needed — onPointerDown preventDefault keeps editor focused.
  }, []);

  const triggerSelTo = useCallback(() => {
    const editor = groupEditorsRef.current.get(activeGroupIdRef.current);
    if (!editor || !selAnchor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    // No editor.focus() — onPointerDown preventDefault keeps editor focused already.
    // Build selection: anchor → current position (handles both directions)
    const anchorBefore =
      pos.lineNumber > selAnchor.lineNumber ||
      (pos.lineNumber === selAnchor.lineNumber && pos.column >= selAnchor.column);
    const range = anchorBefore
      ? { startLineNumber: selAnchor.lineNumber, startColumn: selAnchor.column, endLineNumber: pos.lineNumber, endColumn: pos.column }
      : { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: selAnchor.lineNumber, endColumn: selAnchor.column };
    editor.setSelection(range);
    // Scroll to reveal both ends of the selection so getScrolledVisiblePosition() returns
    // non-null for both handles (it returns null for off-screen positions).
    editor.revealRange(range);
    setSelAnchor(null);
    // Force EditorGroupPane to recompute handle positions after revealRange scroll settles.
    setForceHandleUpdate(n => n + 1);
  }, [selAnchor]);

  // Clipboard helpers — do NOT use Monaco's clipboard actions because focus leaves the editor
  // when the toolbar button is clicked, breaking the clipboard user-gesture requirement.
  // Instead we read/write the editor model directly and use navigator.clipboard ourselves.
  const getActiveEditorRef = useCallback(() => {
    return groupEditorsRef.current.get(activeGroupIdRef.current) ?? null;
  }, []);

  // Paste dialog state — used on mobile where navigator.clipboard.readText() is unreliable
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteDialogText, setPasteDialogText] = useState('');
  const pendingPasteEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Tracks text last copied via the toolbar Copy/Cut button so the paste dialog can pre-fill it.
  // This works even when the OS clipboard API is blocked — no permission needed.
  const lastToolbarCopiedRef = useRef<string>('');

  const insertPasteText = useCallback((editor: monaco.editor.IStandaloneCodeEditor, text: string) => {
    const sel = editor.getSelection();
    if (sel) {
      editor.executeEdits('toolbar-paste', [{ range: sel, text, forceMoveMarkers: true }]);
      editor.focus();
    }
  }, []);

  /** Copy `text` to clipboard: execCommand (synchronous, no permission needed) + clipboard API. */
  const copyToClipboard = useCallback((text: string) => {
    lastToolbarCopiedRef.current = text;
    // execCommand must run synchronously within the user-gesture context (before any await)
    // so that iOS/Android honour it without requiring clipboard-write permission.
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', width: '1px', height: '1px', pointerEvents: 'none' });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    // Also write via modern clipboard API (overrides execCommand on supporting browsers)
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // Clear the toolbar-copy cache when the user switches away from this page (e.g. to copy
  // from another app). This prevents stale editor text from being pasted on return.
  useEffect(() => {
    const onHide = () => { if (document.hidden) lastToolbarCopiedRef.current = ''; };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const triggerCopy = useCallback(() => {
    const editor = getActiveEditorRef();
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    const text = sel.isEmpty()
      ? (editor.getModel()?.getLineContent(sel.startLineNumber) ?? '') + '\n'
      : (editor.getModel()?.getValueInRange(sel) ?? '');
    if (text) copyToClipboard(text);
  }, [getActiveEditorRef, copyToClipboard]);

  const triggerCut = useCallback(() => {
    const editor = getActiveEditorRef();
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    const isEmpty = sel.isEmpty();
    const lineNumber = sel.startLineNumber;
    const text = isEmpty
      ? (editor.getModel()?.getLineContent(lineNumber) ?? '') + '\n'
      : (editor.getModel()?.getValueInRange(sel) ?? '');
    if (text) copyToClipboard(text);
    if (isEmpty) {
      // Delete whole line (keep cursor on same line number)
      triggerActiveEditor('editor.action.deleteLines');
    } else {
      editor.executeEdits('toolbar-cut', [{ range: sel, text: '', forceMoveMarkers: true }]);
    }
    editor.focus();
  }, [getActiveEditorRef, triggerActiveEditor, copyToClipboard]);

  const triggerPaste = useCallback(async () => {
    const editor = getActiveEditorRef();
    if (!editor) return;

    // Try clipboard API first — works on desktop and Chrome Android over HTTPS/localhost.
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        insertPasteText(editor, text);
        return;
      }
    } catch {}

    // Clipboard API unavailable (HTTP on Android, iOS Safari, permission denied).
    // If the user copied from the toolbar moments ago, paste it directly — no dialog.
    // The ref is cleared on visibilitychange so it won't contain stale editor text
    // when the user copied from a different app in the meantime.
    if (lastToolbarCopiedRef.current) {
      insertPasteText(editor, lastToolbarCopiedRef.current);
      return;
    }

    // Nothing in the toolbar cache → user wants to paste from an external source.
    // Show a textarea so they can long-press → Paste from the Android context menu;
    // onPaste on that textarea inserts the text and closes the dialog automatically.
    pendingPasteEditorRef.current = editor;
    setPasteDialogText('');
    setPasteDialogOpen(true);
  }, [getActiveEditorRef, insertPasteText]);

  const confirmPasteDialog = useCallback(() => {
    const editor = pendingPasteEditorRef.current;
    if (editor && pasteDialogText) {
      insertPasteText(editor, pasteDialogText);
    }
    setPasteDialogOpen(false);
    setPasteDialogText('');
    pendingPasteEditorRef.current = null;
  }, [pasteDialogText, insertPasteText]);

  const triggerDeleteLine = useCallback(() => triggerActiveEditor('editor.action.deleteLines'), [triggerActiveEditor]);

  // Delete selection (or single char left if nothing selected) — equivalent to Backspace key
  const triggerDelete = useCallback(() => {
    const editor = groupEditorsRef.current.get(activeGroupIdRef.current);
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    if (!sel.isEmpty()) {
      editor.executeEdits('toolbar-delete', [{ range: sel, text: '', forceMoveMarkers: true }]);
    } else {
      // Nothing selected: delete one character to the left (backspace behaviour)
      editor.trigger('toolbar', 'deleteLeft', null);
    }
    editor.focus();
  }, []);

  const triggerFind = useCallback(() => triggerActiveEditor('actions.find'), [triggerActiveEditor]);
  const triggerReplace = useCallback(() => triggerActiveEditor('editor.action.startFindReplaceAction'), [triggerActiveEditor]);
  const triggerFormatDocument = useCallback(() => triggerActiveEditor('editor.action.formatDocument'), [triggerActiveEditor]);
  const triggerSuggestions = useCallback(() => triggerActiveEditor('editor.action.triggerSuggest'), [triggerActiveEditor]);

  /* ── Menu item style ── */
  const menuItemSx = {
    fontSize: 13,
    py: 0.5,
    px: 2,
    minHeight: 28,
    '&.Mui-disabled': { opacity: 0.4 },
  } as const;

  // Filtered command palette items
  const filteredCmdItems = cmdPaletteQuery.trim()
    ? pluginCommandPaletteItems.filter(item => {
        const q = cmdPaletteQuery.toLowerCase();
        const label = (item.category ? `${item.category}: ${item.title}` : item.title).toLowerCase();
        return label.includes(q);
      })
    : pluginCommandPaletteItems;

  // ── Mobile cursor control (stable callbacks, always use current refs) ────
  const handleCursorControlMove = useCallback((dChars: number, dLines: number) => {
    // Try active group first; fall back to any editor that has a model
    let me = groupEditorsRef.current.get(activeGroupIdRef.current) ?? null;
    if (!me) {
      for (const e of groupEditorsRef.current.values()) { me = e; break; }
    }
    if (!me) return;
    const model = me.getModel();
    const pos   = me.getPosition();
    if (!model || !pos) return;
    const lineNumber = Math.max(1, Math.min(model.getLineCount(), pos.lineNumber + dLines));
    const lineLen    = model.getLineContent(lineNumber).length + 1;
    const column     = Math.max(1, Math.min(lineLen, pos.column + dChars));
    me.setPosition({ lineNumber, column });
    me.revealPositionInCenterIfOutsideViewport({ lineNumber, column });
  }, []); // refs-only — never stale

  const handleCursorControlSingle = useCallback((dir: -1 | 1) => {
    handleCursorControlMove(dir, 0);
  }, [handleCursorControlMove]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, overflow: 'hidden', bgcolor: '#1e1e1e', position: 'relative' }}>

      {/* ── Command Palette Overlay ── */}
      {cmdPaletteOpen && (
        <Box
          onClick={() => setCmdPaletteOpen(false)}
          sx={{
            position: 'absolute', inset: 0, zIndex: 9999,
            bgcolor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            ...(isMobile
              ? { alignItems: 'flex-end', justifyContent: 'center' }
              : { justifyContent: 'center', alignItems: 'flex-start' }),
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              bgcolor: '#252526',
              border: '1px solid #454545',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              ...(isMobile
                ? { borderRadius: '12px 12px 0 0', maxHeight: '70vh', width: '100%' }
                : { borderRadius: 1, width: 560, maxWidth: '90vw', maxHeight: '60vh' }),
            }}
          >
            {/* On mobile: no text input (prevents keyboard → viewport shrink → scroll reset).
                On desktop: standard searchable text field. */}
            {isMobile ? (
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #454545', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 13, color: '#858585' }}>Commands</Typography>
                <Box
                  component="button"
                  onClick={() => setCmdPaletteOpen(false)}
                  sx={{ background: 'none', border: 'none', color: '#858585', fontSize: 20, cursor: 'pointer', lineHeight: 1, p: 0, touchAction: 'manipulation' }}
                >×</Box>
              </Box>
            ) : (
              <TextField
                autoFocus
                fullWidth
                placeholder="Type a command…"
                value={cmdPaletteQuery}
                onChange={(e) => setCmdPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCmdPaletteOpen(false);
                  if (e.key === 'Enter' && filteredCmdItems.length > 0) {
                    globalCommandRegistry.execute(filteredCmdItems[0].command).catch(console.error);
                    setCmdPaletteOpen(false);
                  }
                }}
                slotProps={{
                  input: {
                    sx: {
                      color: '#ccc', fontSize: 14, px: 1.5, py: 1,
                      '& input': { p: 0 },
                    },
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  borderBottom: '1px solid #454545',
                }}
              />
            )}
            <Box sx={{ overflowY: 'auto' }}>
              {filteredCmdItems.length === 0 ? (
                <Box sx={{ px: 2, py: 1.5, color: '#858585', fontSize: 13 }}>No commands found</Box>
              ) : (
                filteredCmdItems.map((item) => {
                  const label = item.category ? `${item.category}: ${item.title}` : item.title;
                  return (
                    <Box
                      key={item.command}
                      onClick={() => {
                        globalCommandRegistry.execute(item.command).catch(console.error);
                        setCmdPaletteOpen(false);
                      }}
                      sx={{
                        px: 2, py: isMobile ? 1.5 : 1, fontSize: 13, color: '#ccc', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                      }}
                    >
                      <Typography sx={{ fontSize: isMobile ? 15 : 13 }}>{label}</Typography>
                      {item.keybinding && !isMobile && (
                        <Typography sx={{ fontSize: 11, color: '#858585', ml: 2, flexShrink: 0 }}>
                          {item.keybinding}
                        </Typography>
                      )}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Menu Bar ── */}
      <Box sx={{
        height: MENU_BAR_H,
        bgcolor: '#333333',
        display: 'flex',
        alignItems: 'center',
        px: 0.5,
        flexShrink: 0,
        borderBottom: '1px solid #2b2b2b',
        userSelect: 'none',
      }}>
        {/* File menu */}
        <Box
          onClick={(e) => setFileMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          File
        </Box>
        <Menu
          anchorEl={fileMenuAnchor}
          open={Boolean(fileMenuAnchor)}
          onClose={() => setFileMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 220 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { handleGroupSave(activeGroupId); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Save</ListItemText><Kbd>{`${mod}S`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { handleSplit(activeGroupId); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Split Editor Right</ListItemText><Kbd>{`${mod}\\`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { if (activeGroup?.activeTab) handleTabClose(activeGroupId, activeGroup.activeTab); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Close Editor</ListItemText><Kbd>{`${mod}W`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { closeAllTabs(); setFileMenuAnchor(null); }} disabled={groups.every(g => g.tabs.length === 0)}>
            <ListItemText>Close All Editors</ListItemText>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { handleGoToFileOpen(); setFileMenuAnchor(null); }}>
            <ListItemText>Go to File...</ListItemText><Kbd>{`${mod}P`}</Kbd>
          </MenuItem>
        </Menu>

        {/* Edit menu */}
        <Box
          onClick={(e) => setEditMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Edit
        </Box>
        <Menu
          anchorEl={editMenuAnchor}
          open={Boolean(editMenuAnchor)}
          onClose={() => setEditMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 220 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { triggerUndo(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Undo</ListItemText><Kbd>{`${mod}Z`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerRedo(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Redo</ListItemText><Kbd>{`${mod}${isMac ? '\u21E7Z' : 'Y'}`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { triggerCut(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Cut</ListItemText><Kbd>{`${mod}X`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerCopy(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Copy</ListItemText><Kbd>{`${mod}C`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerPaste(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Paste</ListItemText><Kbd>{`${mod}V`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerDelete(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Delete</ListItemText><Kbd>Backspace</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerDeleteLine(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Delete Line</ListItemText><Kbd>{`${mod}Shift+K`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { triggerFind(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Find</ListItemText><Kbd>{`${mod}F`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerReplace(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Replace</ListItemText><Kbd>{`${mod}H`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { togglePanel('search'); setShowReplace(false); setEditMenuAnchor(null); }}>
            <ListItemText>Find in Files</ListItemText><Kbd>{`${mod}Shift+F`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { togglePanel('search'); setShowReplace(true); setEditMenuAnchor(null); }}>
            <ListItemText>Replace in Files</ListItemText><Kbd>{`${mod}Shift+H`}</Kbd>
          </MenuItem>
        </Menu>

        {/* Code menu */}
        <Box
          onClick={(e) => setCodeMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Code
        </Box>
        <Menu
          anchorEl={codeMenuAnchor}
          open={Boolean(codeMenuAnchor)}
          onClose={() => setCodeMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 240 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { triggerFormatDocument(); setCodeMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Format Document</ListItemText><Kbd>Shift+Alt+F</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { triggerSuggestions(); setCodeMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Trigger Suggestions</ListItemText><Kbd>{`${mod}Space`}</Kbd>
          </MenuItem>
        </Menu>

        {/* Plugins menu — shown only when plugins contribute toolbar items */}
        {pluginToolbarItems.length > 0 && (() => {
          // Group items by their `group` field to insert dividers between groups
          const groups: ToolbarContribution[][] = [];
          let lastGroup: string | undefined = undefined;
          const sorted = [...pluginToolbarItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          for (const item of sorted) {
            if (item.group !== lastGroup) {
              groups.push([]);
              lastGroup = item.group;
            }
            groups[groups.length - 1].push(item);
          }
          return (
            <>
              <Box
                onClick={(e) => setPluginsMenuAnchor(e.currentTarget)}
                sx={{
                  px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Plugins
              </Box>
              <Menu
                anchorEl={pluginsMenuAnchor}
                open={Boolean(pluginsMenuAnchor)}
                onClose={() => setPluginsMenuAnchor(null)}
                slotProps={{
                  paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 240 } },
                }}
              >
                {groups.map((grp, gi) => (
                  <Box key={gi}>
                    {gi > 0 && <Divider sx={{ borderColor: '#454545', my: 0.5 }} />}
                    {grp.map(item => (
                      <MenuItem
                        key={item.id}
                        sx={menuItemSx}
                        onClick={() => {
                          globalCommandRegistry.execute(item.command).catch(console.error);
                          setPluginsMenuAnchor(null);
                        }}
                      >
                        {item.icon.startsWith('<svg') ? (
                          <Box
                            component="span"
                            sx={{ width: 16, height: 16, mr: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center', color: '#ccc' }}
                            dangerouslySetInnerHTML={{ __html: item.icon }}
                          />
                        ) : (
                          <Typography component="span" sx={{ fontSize: 13, mr: 1.5, flexShrink: 0 }}>{item.icon}</Typography>
                        )}
                        <ListItemText>{item.label}</ListItemText>
                      </MenuItem>
                    ))}
                  </Box>
                ))}
              </Menu>
            </>
          );
        })()}

        {/* View menu */}
        <Box
          onClick={(e) => setViewMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          View
        </Box>
        <Menu
          anchorEl={viewMenuAnchor}
          open={Boolean(viewMenuAnchor)}
          onClose={() => setViewMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 240 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { handleToggleMinimap(); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Minimap</ListItemText>
            <Typography sx={{ fontSize: 12, color: minimapEnabled ? '#4fc3f7' : '#858585', ml: 2 }}>{minimapEnabled ? '✓' : ''}</Typography>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { handleToggleWordWrap(); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Word Wrap</ListItemText>
            <Kbd>{`Alt+Z`}</Kbd>
            <Typography sx={{ fontSize: 12, color: wordWrap === 'on' ? '#4fc3f7' : '#858585', ml: 1 }}>{wordWrap === 'on' ? '✓' : ''}</Typography>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { setShowBreadcrumbs(v => !v); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Breadcrumbs</ListItemText>
            <Typography sx={{ fontSize: 12, color: showBreadcrumbs ? '#4fc3f7' : '#858585', ml: 2 }}>{showBreadcrumbs ? '✓' : ''}</Typography>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { setEditorTheme(v => v === 'vs-dark' ? 'vs' : 'vs-dark'); setViewMenuAnchor(null); }}>
            <ListItemText>{editorTheme === 'vs-dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</ListItemText>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { setFormatOnSave(v => !v); setViewMenuAnchor(null); }}>
            <ListItemText>Format on Save</ListItemText>
            <Typography sx={{ fontSize: 12, color: formatOnSave ? '#4fc3f7' : '#858585', ml: 2 }}>{formatOnSave ? '✓' : ''}</Typography>
          </MenuItem>
        </Menu>

        {/* Command Palette — direct menu bar item */}
        <Box sx={{ width: '1px', height: 14, bgcolor: '#555', mx: 0.5, flexShrink: 0 }} />
        <Box
          onClick={() => globalEventBus.emit('system:editor:openCommandPalette', {})}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Command Palette
        </Box>

      </Box>

      {/* ── Toolbar (below menu bar) ── */}
      <Box sx={{
        bgcolor: '#2d2d2d',
        borderBottom: '1px solid #2b2b2b',
        px: 0.5,
        display: 'flex',
        alignItems: 'center',
        height: 32,
        flexShrink: 0,
        gap: 0.25,
      }}>
        {/* Save */}
        <Tooltip title={`Save (${mod}S)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || readOnly}
              onClick={() => handleGroupSave(activeGroupId)}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgSave />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* Undo */}
        <Tooltip title={`Undo (${mod}Z)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerUndo}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgUndo />
            </IconButton>
          </span>
        </Tooltip>
        {/* Redo */}
        <Tooltip title={`Redo (${mod}${isMac ? '⇧Z' : 'Y'})`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerRedo}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgRedo />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* Cut */}
        <Tooltip title={`Cut (${mod}X)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || readOnly}
              onClick={triggerCut}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgCut />
            </IconButton>
          </span>
        </Tooltip>
        {/* Copy */}
        <Tooltip title={`Copy (${mod}C)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerCopy}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgCopy />
            </IconButton>
          </span>
        </Tooltip>
        {/* Paste */}
        <Tooltip title={`Paste (${mod}V)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || readOnly}
              onClick={triggerPaste}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgPaste />
            </IconButton>
          </span>
        </Tooltip>
        {/* Delete selection / backspace */}
        <Tooltip title="Delete selection (Backspace)">
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || readOnly}
              onClick={triggerDelete}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgDeleteSel />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* FROM / TO — touch-friendly selection anchors (mobile).
            IMPORTANT: onPointerDown + preventDefault prevents the editor from losing focus
            when these buttons are tapped. Without this, the editor blurs → setSelection()
            fails on mobile (blurred Monaco editors don't maintain programmatic selections). */}
        <Tooltip title="Set selection start (FROM)">
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onPointerDown={(e) => { e.preventDefault(); if (activeGroup?.activeTab) triggerSelFrom(); }}
              sx={{
                color: selAnchor ? '#4fc3f7' : '#ccc',
                borderRadius: 0.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                '&.Mui-disabled': { color: '#555' },
              }}>
              <SvgSelFrom />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={selAnchor ? 'Set selection end (TO)' : 'Set selection end — tap FROM first'}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || !selAnchor}
              onPointerDown={(e) => { e.preventDefault(); if (activeGroup?.activeTab && selAnchor) triggerSelTo(); }}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgSelTo />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* Find */}
        <Tooltip title={`Find (${mod}F)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerFind}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgSearch />
            </IconButton>
          </span>
        </Tooltip>
        {/* Replace */}
        <Tooltip title={`Replace (${mod}H)`}>
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerReplace}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgFindReplace />
            </IconButton>
          </span>
        </Tooltip>
        {/* Find in Files */}
        <Tooltip title={`Find in Files (${mod}Shift+F)`}>
          <span>
            <IconButton size="small"
              onClick={() => { togglePanel('search'); setShowReplace(false); }}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
              <SvgFolderSearch />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* Format Document */}
        <Tooltip title="Format Document (Shift+Alt+F)">
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab || readOnly}
              onClick={triggerFormatDocument}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgFormat />
            </IconButton>
          </span>
        </Tooltip>
        {/* Trigger Suggestions */}
        <Tooltip title="Trigger Suggestions (Ctrl+Space)">
          <span>
            <IconButton size="small" disabled={!activeGroup?.activeTab}
              onClick={triggerSuggestions}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgSuggest />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />

        {/* Insert $schema (JSON files only) */}
        <Tooltip title="Insert $schema reference…">
          <span>
            <IconButton size="small"
              disabled={readOnly || !(activeGroup?.activeTab && /\.json$/i.test(activeGroup.activeTab))}
              onClick={() => { if (activeGroup?.activeTab) setInsertSchemaFor(activeGroup.activeTab); }}
              sx={{ color: '#ccc', borderRadius: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: '#555' } }}>
              <SvgSchema />
            </IconButton>
          </span>
        </Tooltip>

        {/* Plugin toolbar items — excluding 'markdown' group (shown in dedicated markdown toolbar) */}
        {pluginToolbarItems.filter(i => i.group !== 'markdown').length > 0 && (
          <>
            <Box sx={{ width: '1px', height: 16, bgcolor: '#454545', mx: 0.25, flexShrink: 0 }} />
            {pluginToolbarItems.filter(i => i.group !== 'markdown').map((item) => (
              <Tooltip key={item.id} title={item.label}>
                <Box
                  onClick={() => globalCommandRegistry.execute(item.command).catch(console.error)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 0.5, cursor: 'pointer',
                    color: '#ccc', userSelect: 'none', flexShrink: 0,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  {item.icon.startsWith('<svg') ? (
                    <Box component="span" sx={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      dangerouslySetInnerHTML={{ __html: item.icon }} />
                  ) : (
                    <Typography sx={{ fontSize: 13 }}>{item.icon}</Typography>
                  )}
                </Box>
              </Tooltip>
            ))}
          </>
        )}

        {/* Cursor / selection info — right-aligned in toolbar, always visible */}
        {activeGroup?.activeTab && (
          <>
            <Box sx={{ flexGrow: 1 }} />
            <Typography sx={{
              fontSize: 11, color: '#999', fontFamily: 'monospace',
              px: 1, flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {selectionInfo
                ? selectionInfo.startLn === selectionInfo.endLn
                  ? `${selectionInfo.startLn}:${selectionInfo.startCol}–${selectionInfo.endCol} (${selectionInfo.chars})`
                  : `${selectionInfo.startLn}:${selectionInfo.startCol} → ${selectionInfo.endLn}:${selectionInfo.endCol} (${selectionInfo.chars})`
                : `${cursorInfo.ln}:${cursorInfo.col}`}
            </Typography>
          </>
        )}
      </Box>

      {/* ── Markdown toolbar — shown when active Monaco tab is a .md file ── */}
      {(() => {
        const mdItems = [...pluginToolbarItems.filter(i => i.group === 'markdown')].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const isMarkdownActive = /\.(md|mdx|markdown)$/i.test(activeGroup?.activeTab ?? '');
        if (mdItems.length === 0 || !isMarkdownActive) return null;

        // Map item id suffix to applyMarkdownFormat type
        const FORMAT_MAP: Record<string, string> = {
          'mde.bold': 'bold', 'mde.italic': 'italic', 'mde.strike': 'strike',
          'mde.h1': 'h1', 'mde.h2': 'h2', 'mde.h3': 'h3',
          'mde.bullet': 'bulletList', 'mde.ordered': 'orderedList', 'mde.quote': 'blockquote',
        };

        return (
          <Box sx={{
            display: 'flex', alignItems: 'center', flexShrink: 0,
            px: 0.75, height: 32,
            bgcolor: '#1e2a1e', borderBottom: '1px solid #2d3f2d',
            overflowX: 'auto', gap: 0.25,
          }}>
            <Typography sx={{ fontSize: 10, color: '#7ca87c', mr: 0.75, flexShrink: 0, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
              Markdown
            </Typography>
            {mdItems.map((item, idx) => {
              const prevOrder = idx > 0 ? (mdItems[idx - 1].order ?? 0) : 0;
              const curOrder = item.order ?? 0;
              const showDivider = idx > 0 && Math.floor(curOrder / 10) !== Math.floor(prevOrder / 10);
              const formatType = FORMAT_MAP[item.id];
              return (
                <>
                  {showDivider && <Box key={`div-${idx}`} sx={{ width: '1px', height: 14, bgcolor: '#2d3f2d', mx: 0.25, flexShrink: 0 }} />}
                  <Tooltip key={item.id} title={item.label}>
                    <Box
                      onClick={() => formatType ? applyMarkdownFormat(formatType) : globalCommandRegistry.execute(item.command).catch(console.error)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 26, borderRadius: 0.5, cursor: 'pointer',
                        color: '#a8cca8', userSelect: 'none', flexShrink: 0,
                        '&:hover': { bgcolor: 'rgba(120,200,120,0.12)', color: '#c8e8c8' },
                      }}
                    >
                      {item.icon.startsWith('<svg') ? (
                        <Box component="span" sx={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          dangerouslySetInnerHTML={{ __html: item.icon }} />
                      ) : (
                        <Typography sx={{ fontSize: 13 }}>{item.icon}</Typography>
                      )}
                    </Box>
                  </Tooltip>
                </>
              );
            })}
          </Box>
        );
      })()}

      {/* ── Main area wrapper (editors + terminal) ── */}
      <Box ref={mainAreaRef} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>

      {/* ── Editors area: Activity Bar + Sidebar + Splitter + Editor Groups ── */}
      <Box ref={splitterContainerRef} sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Activity Bar */}
        <Box sx={{
          width: ACTIVITY_BAR_W,
          bgcolor: isMobile ? '#3d3d3d' : '#333333',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 0.5,
          flexShrink: 0,
          borderRight: '1px solid #2b2b2b',
        }}>
          {([
            ['explorer', ExplorerIcon, 'Explorer'],
            ['search', SearchIcon, 'Search'],
            ['extensions', ExtensionsIcon, 'Extensions'],
          ] as const).map(([panel, Icon, title]) => (
            <Box
              key={panel}
              onClick={() => togglePanel(panel)}
              title={title}
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderLeft: sidebarPanel === panel ? '2px solid #fff' : '2px solid transparent',
                opacity: sidebarPanel === panel ? 1 : (isMobile ? 0.85 : 0.6),
                '&:hover': { opacity: 1 },
              }}
            >
              <Icon active={sidebarPanel === panel} />
            </Box>
          ))}

          {/* Plugin sidebar contributions */}
          {pluginSidebarPanels.map((panel) => (
            <Box
              key={panel.id}
              onClick={() => togglePanel(panel.id)}
              title={panel.title}
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderLeft: sidebarPanel === panel.id ? '2px solid #fff' : '2px solid transparent',
                opacity: sidebarPanel === panel.id ? 1 : (isMobile ? 0.85 : 0.6),
                '&:hover': { opacity: 1 },
                userSelect: 'none',
                color: sidebarPanel === panel.id ? '#fff' : (isMobile ? '#aaaaaa' : '#858585'),
                '& svg': { width: 24, height: 24, stroke: 'currentColor' },
              }}
            >
              {panel.icon.trimStart().startsWith('<svg') ? (
                <Box
                  dangerouslySetInnerHTML={{ __html: panel.icon }}
                  sx={{ display: 'flex', alignItems: 'center' }}
                />
              ) : (
                <Box sx={{ fontSize: 13, fontWeight: 700 }}>{panel.icon}</Box>
              )}
            </Box>
          ))}
        </Box>

        {/* Mobile backdrop — tap outside sidebar to close it */}
        {isMobile && sidebarOpen && (
          <Box
            onClick={() => setSidebarPanel(null)}
            sx={{ position: 'absolute', inset: 0, zIndex: 99, bgcolor: 'rgba(0,0,0,0.4)' }}
          />
        )}

        {/* Sidebar panel — always mounted to preserve VfsExplorer selection/expansion state */}
        {/* On mobile: absolute overlay so it doesn't push editor groups out of viewport */}
        <Box sx={{
          ...(isMobile ? {
            position: 'absolute',
            left: ACTIVITY_BAR_W,
            top: 0,
            bottom: 0,
            width: sidebarOpen ? `min(300px, calc(100% - ${ACTIVITY_BAR_W}px))` : 0,
            zIndex: 100,
          } : {
            width: sidebarOpen ? `${splitRatio * 100}%` : 0,
            flexShrink: 0,
            minWidth: sidebarOpen ? MIN_PANEL_PX : 0,
          }),
          overflow: 'hidden',
          display: sidebarOpen ? 'flex' : 'none',
          flexDirection: 'column',
          // On mobile the sidebar is a floating overlay — non-explorer panels get a lighter
          // background so Search/Extensions/Plugins text is readable against the overlay.
          bgcolor: (isMobile && sidebarPanel !== 'explorer') ? '#464646' : '#252526',
        }}>
            {/* Sidebar header */}
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: `1px solid ${(isMobile && sidebarPanel !== 'explorer') ? '#5a5a5a' : '#3c3c3c'}`, display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb', flex: 1 }}>
                {sidebarPanel === 'explorer' && 'Explorer'}
                {sidebarPanel === 'search' && 'Search'}
                {sidebarPanel === 'extensions' && 'Extensions'}
                {sidebarPanel !== 'explorer' && sidebarPanel !== 'search' && sidebarPanel !== 'extensions' && (
                  pluginSidebarPanels.find(p => p.id === sidebarPanel)?.title ?? sidebarPanel
                )}
              </Typography>
              {sidebarPanel === 'explorer' && (
                <Box
                  component="button"
                  onClick={() => explorerRefreshRef.current?.()}
                  title="Refresh Explorer"
                  sx={{
                    all: 'unset', cursor: 'pointer', color: '#858585', p: 0.25, borderRadius: 0.5, lineHeight: 0,
                    '&:hover': { color: '#ccc', bgcolor: 'rgba(255,255,255,0.06)' },
                    touchAction: 'manipulation',
                  }}
                >
                  {/* Refresh icon */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.6 0 3 .67 4 1.74" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M12 1v3.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Box>
              )}
              {/* Close button — visible only on mobile where there is no splitter */}
              {isMobile && (
                <Box
                  component="button"
                  onClick={() => setSidebarPanel(null)}
                  title="Close"
                  sx={{
                    all: 'unset', cursor: 'pointer', color: '#858585', p: 0.25, ml: 0.5, borderRadius: 0.5, lineHeight: 0,
                    '&:hover': { color: '#ccc', bgcolor: 'rgba(255,255,255,0.06)' },
                    touchAction: 'manipulation',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </Box>
              )}
            </Box>

            {/* Sidebar content */}
            <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: sidebarPanel === 'explorer' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <VfsExplorer
                  provider={provider}
                  rootPath="/"
                  style={{ flex: 1, minHeight: 0, height: 'auto' }}
                  onFileOpen={handleFileOpen}
                  readOnly={readOnly}
                  showBreadcrumbs={false}
                  providerRegistry={providerRegistry}
                  defaultMountPresets={defaultMountPresets}
                  refreshRef={explorerRefreshRef}
                  revealPathsRef={explorerRevealRef}
                  selectedPath={vfsPathOfTab(activeGroup.activeTab)}
                  projectDeps={projectDeps}
                  onDialogAction={onDialogAction}
                  onOutputLine={handleOutputLine}
                  onActionRunningChange={handleActionRunningChange}
                  stopActionRef={stopActionRef}
                  hideOutput
                />
              </Box>

              {sidebarPanel === 'search' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {/* Search inputs */}
                  <Box sx={{ p: 1, flexShrink: 0 }}>
                    {/* Search row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      {/* Toggle replace */}
                      <Box
                        onClick={() => setShowReplace(v => !v)}
                        title={showReplace ? 'Collapse Replace' : 'Expand Replace'}
                        sx={{ color: '#858585', cursor: 'pointer', fontSize: 14, lineHeight: 1, px: 0.25, '&:hover': { color: '#ccc' } }}
                      >
                        {showReplace ? '▾' : '▸'}
                      </Box>

                      <TextField
                        size="small"
                        placeholder="Search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        fullWidth
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchInputIcon />
                              </InputAdornment>
                            ),
                            endAdornment: (
                              <InputAdornment position="end">
                                <Box sx={{ display: 'flex', gap: 0.25 }}>
                                  <Tooltip title="Match Case">
                                    <Box
                                      onClick={() => setSearchCaseSensitive(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchCaseSensitive ? '#fff' : '#858585',
                                        bgcolor: searchCaseSensitive ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchCaseSensitive ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >Aa</Box>
                                  </Tooltip>
                                  <Tooltip title="Match Whole Word">
                                    <Box
                                      onClick={() => setSearchWholeWord(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchWholeWord ? '#fff' : '#858585',
                                        bgcolor: searchWholeWord ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchWholeWord ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >ab</Box>
                                  </Tooltip>
                                  <Tooltip title="Use Regular Expression">
                                    <Box
                                      onClick={() => setSearchUseRegex(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchUseRegex ? '#fff' : '#858585',
                                        bgcolor: searchUseRegex ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchUseRegex ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >.*</Box>
                                  </Tooltip>
                                </Box>
                              </InputAdornment>
                            ),
                            sx: {
                              fontSize: 13, bgcolor: isMobile ? '#4a4a4a' : '#3c3c3c', color: '#ccc',
                              '& fieldset': { border: 'none' }, borderRadius: 0.5,
                            },
                          },
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                      />
                    </Box>

                    {/* Replace row */}
                    <Collapse in={showReplace}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Box sx={{ width: 18 }} /> {/* indent to align with search input */}
                        <TextField
                          size="small"
                          placeholder="Replace"
                          value={replaceQuery}
                          onChange={(e) => setReplaceQuery(e.target.value)}
                          fullWidth
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: 13, bgcolor: isMobile ? '#4a4a4a' : '#3c3c3c', color: '#ccc',
                                '& fieldset': { border: 'none' }, borderRadius: 0.5,
                              },
                            },
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        />
                      </Box>
                    </Collapse>

                    {/* Directory filter */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ width: 18 }} />
                      <TextField
                        size="small"
                        placeholder="Search in folder (default: /)"
                        value={searchDir}
                        onChange={(e) => setSearchDir(e.target.value)}
                        fullWidth
                        slotProps={{
                          input: {
                            sx: {
                              fontSize: 12, bgcolor: isMobile ? '#4a4a4a' : '#3c3c3c', color: '#ccc',
                              '& fieldset': { border: 'none' }, borderRadius: 0.5,
                            },
                          },
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                      />
                    </Box>

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, ml: '22px' }}>
                      <Box
                        onClick={handleSearch}
                        sx={{
                          px: 1, py: 0.375, borderRadius: 0.5, cursor: 'pointer', fontSize: 12,
                          bgcolor: '#007acc', color: '#fff', userSelect: 'none',
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          '&:hover': { bgcolor: '#005f9e' },
                          opacity: searchLoading ? 0.6 : 1,
                          pointerEvents: searchLoading ? 'none' : undefined,
                        }}
                      >
                        {searchLoading && <CircularProgress size={10} sx={{ color: '#fff' }} />}
                        Find All
                      </Box>
                      {showReplace && (
                        <Box
                          onClick={handleReplaceAll}
                          sx={{
                            px: 1, py: 0.375, borderRadius: 0.5, cursor: 'pointer', fontSize: 12,
                            bgcolor: isMobile ? '#4a4a4a' : '#3c3c3c', color: '#ccc', userSelect: 'none',
                            border: '1px solid #555',
                            '&:hover': { bgcolor: '#4c4c4c' },
                            opacity: searchResults.length === 0 ? 0.4 : 1,
                            pointerEvents: searchResults.length === 0 ? 'none' : undefined,
                          }}
                        >
                          Replace All
                        </Box>
                      )}
                    </Box>

                    {/* Status */}
                    {searchError && (
                      <Typography sx={{ color: '#f48771', fontSize: 11, mt: 0.5, ml: '22px' }}>
                        {searchError}
                      </Typography>
                    )}
                    {searchDone && !searchLoading && (
                      <Typography sx={{ color: '#858585', fontSize: 11, mt: 0.5, ml: '22px' }}>
                        {searchResults.length === 0
                          ? 'No results found.'
                          : `${searchResults.reduce((n, r) => n + r.matches.length, 0)} results in ${searchResults.length} file${searchResults.length !== 1 ? 's' : ''}`}
                      </Typography>
                    )}
                  </Box>

                  {/* Results list */}
                  <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    {searchResults.map((result) => (
                      <Box key={result.path}>
                        {/* File header */}
                        <Box
                          onClick={() => toggleResultCollapse(result.path)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            px: 1, py: 0.5, cursor: 'pointer',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                            borderTop: '1px solid #2d2d2d',
                          }}
                        >
                          <Typography sx={{ fontSize: 11, color: '#ccc', mr: 0.25 }}>
                            {result.collapsed ? '▸' : '▾'}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: '#ccc', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.path}>
                            {result.path.split('/').pop()}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: '#858585', flexShrink: 0 }}>
                            {result.matches.length}
                          </Typography>
                          {showReplace && (
                            <Tooltip title="Replace in this file">
                              <Box
                                onClick={(e) => { e.stopPropagation(); handleReplaceInFile(result); }}
                                sx={{
                                  ml: 0.5, px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                  color: '#858585', '&:hover': { color: '#ccc', bgcolor: 'rgba(255,255,255,0.1)' },
                                  userSelect: 'none',
                                }}
                              >↺</Box>
                            </Tooltip>
                          )}
                        </Box>
                        <Typography
                          sx={{ fontSize: 10, color: isMobile ? '#888888' : '#606060', px: 1, pb: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: result.collapsed ? 'none' : 'block' }}
                          title={result.path}
                        >
                          {result.path}
                        </Typography>

                        {/* Match lines */}
                        <Collapse in={!result.collapsed}>
                          {result.matches.map((match, mi) => (
                            <Box
                              key={mi}
                              onClick={() => handleGoToMatch(result.path, match.line, match.col)}
                              sx={{
                                pl: 2.5, pr: 1, py: 0.25, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 0.75,
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                              }}
                            >
                              <Typography sx={{ fontSize: 10, color: isMobile ? '#888888' : '#606060', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                                {match.line}
                              </Typography>
                              <Typography
                                sx={{ fontSize: 12, color: '#ccc', overflow: 'hidden', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
                                component="span"
                              >
                                {match.lineText.slice(0, match.matchStart)}
                                <Box
                                  component="span"
                                  sx={{ bgcolor: 'rgba(234,92,0,0.5)', borderRadius: '2px', color: '#fff' }}
                                >
                                  {match.lineText.slice(match.matchStart, match.matchEnd)}
                                </Box>
                                {match.lineText.slice(match.matchEnd)}
                              </Typography>
                            </Box>
                          ))}
                        </Collapse>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {sidebarPanel === 'extensions' && (
                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {pluginInfos.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography sx={{ color: '#858585', fontSize: 13 }}>No plugins installed.</Typography>
                    </Box>
                  ) : (
                    pluginInfos.map((info) => (
                      <Box
                        key={info.manifest.id}
                        sx={{
                          px: 1.5, py: 1,
                          borderBottom: '1px solid #2d2d2d',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 13, color: '#ccc', flexGrow: 1 }}>
                            {info.manifest.name}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: isMobile ? '#888888' : '#606060' }}>
                            v{info.manifest.version}
                          </Typography>
                          <Box
                            onClick={() => {
                              if (info.state === 'active') {
                                globalPluginRegistry.deactivate(info.manifest.id);
                              } else if (info.state === 'inactive') {
                                globalPluginRegistry.activate(info.manifest.id);
                              }
                            }}
                            sx={{
                              px: 0.75, py: 0.25, borderRadius: 0.5,
                              cursor: info.state === 'activating' || info.state === 'deactivating' ? 'default' : 'pointer',
                              fontSize: 11,
                              color: info.state === 'active' ? '#4fc3f7' : info.state === 'error' ? '#f48771' : '#858585',
                              border: '1px solid',
                              borderColor: info.state === 'active' ? '#4fc3f7' : info.state === 'error' ? '#f48771' : '#555',
                              userSelect: 'none',
                              '&:hover': { opacity: 0.8 },
                            }}
                          >
                            {info.state === 'active' ? 'Disable' : info.state === 'error' ? 'Error' : info.state === 'activating' ? '...' : 'Enable'}
                          </Box>
                        </Box>
                        {info.manifest.description && (
                          <Typography sx={{ fontSize: 11, color: isMobile ? '#888888' : '#606060', mt: 0.25 }}>
                            {info.manifest.description}
                          </Typography>
                        )}
                        {info.error && (
                          <Typography sx={{ fontSize: 11, color: '#f48771', mt: 0.25 }}>
                            {info.error.message}
                          </Typography>
                        )}
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {/* Plugin sidebar panels */}
              {pluginSidebarPanels.map((panel) => (
                sidebarPanel === panel.id && (
                  <Box key={panel.id} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <panel.component />
                  </Box>
                )
              ))}
            </Box>
          </Box>

        {/* Sidebar splitter — hidden on mobile (sidebar is an overlay there) */}
        {sidebarOpen && !isMobile && (
          <Box
            onPointerDown={handleSplitterPointerDown}
            sx={{
              width: 5,
              cursor: 'col-resize',
              bgcolor: '#2d2d2d',
              flexShrink: 0,
              touchAction: 'none',
              '&:hover': { bgcolor: '#007acc' },
              '&:active': { bgcolor: '#007acc' },
              transition: 'background-color 0.15s',
            }}
          />
        )}

        {/* Editor groups area — no minWidth on mobile (sidebar is an overlay there) */}
        <Box ref={editorGroupsContainerRef} sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', minWidth: isMobile ? 0 : MIN_PANEL_PX }}>
          {groups.map((group, idx) => (
            <Box key={group.id} sx={{ display: 'contents' }}>
              {/* Group splitter (between groups) */}
              {idx > 0 && (
                <Box
                  onPointerDown={(e) => handleGroupSplitterPointerDown(e, groups[idx - 1].id, group.id)}
                  sx={{
                    width: 5,
                    cursor: 'col-resize',
                    bgcolor: '#2d2d2d',
                    flexShrink: 0,
                    touchAction: 'none',
                    '&:hover': { bgcolor: '#007acc' },
                    transition: 'background-color 0.15s',
                  }}
                />
              )}
              <EditorGroupPane
                group={group}
                isActive={group.id === activeGroupId}
                modelManager={modelManagerRef.current!}
                readOnly={readOnly}
                onTabSwitch={handleTabSwitch}
                onTabClose={handleTabClose}
                onFocus={handleGroupFocus}
                onSave={handleGroupSave}
                onSplit={handleSplit}
                onCursorChange={handleCursorChange}
                onSelectionChange={handleSelectionChange}
                onContentChange={handleContentChange}
                navPendingRef={group.id === activeGroupId ? pendingNavRef : undefined}
                minimapEnabled={minimapEnabled}
                wordWrap={wordWrap}
                showBreadcrumbs={showBreadcrumbs}
                formatOnSave={formatOnSave}
                onGoToFile={handleGoToFileOpen}
                onToggleMinimap={handleToggleMinimap}
                onToggleWordWrap={handleToggleWordWrap}
                onEditorReady={handleEditorReady}
                pluginContextMenuItems={pluginContextMenuItems}
                pluginCommandPaletteItems={pluginCommandPaletteItems}
                forceHandleUpdate={group.id === activeGroupId ? forceHandleUpdate : undefined}
              />
            </Box>
          ))}
        </Box>

        {/* Pasek kursora nad klawiaturą — klawiatury ekranowe nie mają strzałek,
            a palcem trudno trafić w konkretny znak. */}
        <MobileCursorBar
          enabled={isMobile}
          getEditor={() => groupEditorsRef.current.get(activeGroupIdRef.current)}
        />

        {/* Agent panel — overlay (all screen sizes) */}
        {agentPanel && agentPanelOpen && (
          <>
            {/* Backdrop */}
            <Box
              onClick={() => setAgentPanelOpen(false)}
              sx={{
                position: 'absolute', top: 0, bottom: 0, left: 0,
                right: ACTIVITY_BAR_W,
                zIndex: 99,
                bgcolor: 'rgba(0,0,0,0.4)',
              }}
            />
            {/* Panel */}
            <Box sx={{
              position: 'absolute',
              top: 0, bottom: 0,
              right: ACTIVITY_BAR_W,
              width: `min(${agentPanelWidth}px, calc(100% - ${ACTIVITY_BAR_W}px))`,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: '#1e1e1e',
              borderLeft: '1px solid #3c3c3c',
            }}>
              {/* Header */}
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 2, height: 36, flexShrink: 0,
                bgcolor: '#252526', borderBottom: '1px solid #3c3c3c',
              }}>
                <Typography sx={{ color: '#ccc', fontSize: 13, fontWeight: 500 }}>AI Agent</Typography>
                <Box
                  component="button"
                  onClick={() => setAgentPanelOpen(false)}
                  title="Close"
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, p: 0, border: 'none', borderRadius: 0.5,
                    bgcolor: 'transparent', color: '#aaa', cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </Box>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {agentPanel?.({ onFileOpen: handleFileOpen, onFileWritten: handleAgentFileWritten })}
              </Box>
            </Box>
          </>
        )}

        {/* Right Activity Bar (Agent) */}
        {agentPanel && (
          <Box sx={{
            width: ACTIVITY_BAR_W,
            bgcolor: '#333333',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 0.5,
            flexShrink: 0,
            borderLeft: '1px solid #2b2b2b',
            position: 'relative',
            zIndex: 101,
          }}>
            <Box
              onClick={() => setAgentPanelOpen(p => !p)}
              title="AI Agent (Ctrl+Shift+I)"
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRight: agentPanelOpen ? '2px solid #fff' : '2px solid transparent',
                opacity: agentPanelOpen ? 1 : 0.6,
                '&:hover': { opacity: 1 },
              }}
            >
              <AgentIcon active={agentPanelOpen} />
            </Box>
          </Box>
        )}
      </Box>

      {/* ── Bottom panel (terminal + output tabs) ── */}
      {bottomPanelOpen && (
        <>
          <Box
            onMouseDown={handleBottomSplitterMouseDown}
            sx={{ height: 5, cursor: 'row-resize', bgcolor: '#2d2d2d', flexShrink: 0, '&:hover': { bgcolor: '#007acc' }, transition: 'background-color 0.15s' }}
          />
          <Box sx={{ height: bottomPanelHeight, flexShrink: 0, overflow: 'hidden', borderTop: '1px solid #3c3c3c' }}>
            <BottomPanel
              tabs={bottomTabs}
              activeTabId={activeBottomTabId}
              onTabChange={setActiveBottomTabId}
              onAddTerminal={handleAddTerminal}
              onCloseTab={handleCloseTab}
              wsUrl={terminalWsUrl}
              token={terminalToken}
              onConfigRequest={onTerminalConfigRequest}
              enableTerminal={enableTerminal}
            />
          </Box>
        </>
      )}

      </Box>

      {/* ── Mobile cursor control strip ── */}
      {isMobile && (
        <CursorControlStrip
          onMoveCursor={handleCursorControlMove}
          onSingleChar={handleCursorControlSingle}
        />
      )}

      {/* ── Status Bar ── */}
      <Box sx={{
        height: STATUS_BAR_H,
        bgcolor: '#007acc',
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        flexShrink: 0,
        gap: 2,
        userSelect: 'none',
      }}>
        <Box
          onClick={() => setBottomPanelOpen(p => !p)}
          title="Toggle Output Panel"
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
            px: 0.5, borderRadius: 0.5,
            opacity: bottomPanelOpen ? 1 : 0.7,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', opacity: 1 },
          }}
        >
          <TerminalIcon active />
          <Typography sx={{ fontSize: 11, color: '#fff' }}>{enableTerminal ? 'Terminal' : 'Output'}</Typography>
        </Box>
        {activeGroup?.activeTab ? (
          <>
            <Typography sx={{ fontSize: 12, color: '#fff' }}>
              {selectionInfo
                ? selectionInfo.startLn === selectionInfo.endLn
                  ? `Ln ${selectionInfo.startLn}, Col ${selectionInfo.startCol}–${selectionInfo.endCol} (${selectionInfo.chars})`
                  : `Ln ${selectionInfo.startLn}–${selectionInfo.endLn} (${selectionInfo.chars})`
                : `Ln ${cursorInfo.ln}, Col ${cursorInfo.col}`}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#fff' }}>UTF-8</Typography>
            <Typography sx={{ fontSize: 12, color: '#fff', textTransform: 'capitalize' }}>{activeLang}</Typography>
            {groups.length > 1 && (
              <Typography sx={{ fontSize: 12, color: '#fff', opacity: 0.7 }}>
                Group {groups.findIndex(g => g.id === activeGroupId) + 1}/{groups.length}
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: '#fff', opacity: 0.7 }}>Ready</Typography>
        )}

        {/* Plugin statusbar items — left-aligned */}
        {pluginStatusBarItems
          .filter(item => item.alignment !== 'right')
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .map((item) => (
            <Tooltip key={item.id} title={item.tooltip ?? ''}>
              <Typography
                onClick={item.command ? () => globalCommandRegistry.execute(item.command!).catch(console.error) : undefined}
                sx={{
                  fontSize: 12, color: '#fff', cursor: item.command ? 'pointer' : 'default',
                  '&:hover': item.command ? { opacity: 0.8 } : undefined,
                }}
              >
                {item.text}
              </Typography>
            </Tooltip>
          ))
        }

        <Box sx={{ flexGrow: 1 }} />

        {/* Plugin statusbar items — right-aligned */}
        {pluginStatusBarItems
          .filter(item => item.alignment === 'right')
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .map((item) => (
            <Tooltip key={item.id} title={item.tooltip ?? ''}>
              <Typography
                onClick={item.command ? () => globalCommandRegistry.execute(item.command!).catch(console.error) : undefined}
                sx={{
                  fontSize: 12, color: '#fff', cursor: item.command ? 'pointer' : 'default',
                  '&:hover': item.command ? { opacity: 0.8 } : undefined,
                }}
              >
                {item.text}
              </Typography>
            </Tooltip>
          ))
        }

        {activeTabObj?.modified && (
          <Typography sx={{ fontSize: 12, color: '#fff' }}>Modified</Typography>
        )}
      </Box>

      {/* ── Go to File Dialog ── */}
      <GoToFileDialog
        open={goToFileOpen}
        files={allVfsFiles}
        loading={goToFileLoading}
        onClose={() => setGoToFileOpen(false)}
        onSelect={handleGoToFileSelect}
      />

      {/* ── Paste Dialog ── */}
      {/* When clipboard API is blocked (HTTP on Android, iOS Safari), we show a bottom-sheet
          with a focused textarea. The onPaste handler captures clipboardData immediately when
          the user long-presses → Paste from the Android context menu — no "Insert" tap needed.
          The "Insert" button serves as fallback for the pre-filled toolbar copy→paste case. */}
      <Dialog
        open={pasteDialogOpen}
        onClose={() => { setPasteDialogOpen(false); setPasteDialogText(''); }}
        maxWidth="xs"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            position: 'fixed',
            bottom: 0,
            m: 0,
            borderRadius: '12px 12px 0 0',
            width: '100%',
            maxWidth: '100%',
          },
        }}
      >
        <DialogTitle sx={{ pb: 0.5, fontSize: 15 }}>Paste</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Long-press the field and tap <strong>Paste</strong> — text inserts automatically.
          </Typography>
          <textarea
            autoFocus
            value={pasteDialogText}
            onChange={e => setPasteDialogText(e.target.value)}
            onPaste={e => {
              const text = e.clipboardData.getData('text');
              if (!text) return;
              e.preventDefault();
              const editor = pendingPasteEditorRef.current;
              if (editor) insertPasteText(editor, text);
              setPasteDialogOpen(false);
              setPasteDialogText('');
              pendingPasteEditorRef.current = null;
            }}
            rows={pasteDialogText ? 4 : 2}
            style={{
              width: '100%',
              resize: 'none',
              fontFamily: 'monospace',
              fontSize: 13,
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              border: '1px solid #007acc',
              borderRadius: 4,
              padding: 8,
              boxSizing: 'border-box',
              outline: 'none',
            }}
            placeholder="Long-press here to paste…"
          />
        </DialogContent>
        {pasteDialogText && (
          <DialogActions>
            <Button onClick={() => { setPasteDialogOpen(false); setPasteDialogText(''); }}>Cancel</Button>
            <Button variant="contained" onClick={confirmPasteDialog}>Insert</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* ── Insert $schema reference (JSON) ── */}
      <InsertSchemaDialog
        open={insertSchemaFor !== null}
        provider={provider}
        currentFilePath={insertSchemaFor ?? ''}
        onClose={() => setInsertSchemaFor(null)}
        onInsert={handleInsertSchema}
      />
    </Box>
  );
}

