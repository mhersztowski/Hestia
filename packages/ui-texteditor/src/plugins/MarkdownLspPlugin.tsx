/**
 * Markdown LSP Plugin (browser-side, Etap 1)
 *
 * Monaco language features for .md files using only the VFS — no backend required:
 *  1. Outline sidebar panel — clickable heading tree, auto-updates, highlights active heading
 *  2. Wiki-link completion  — [[ → lists all .md files in /home workspace
 *  3. Broken-link diagnostics — [[missing]] underlined with a warning marker
 *  4. Hover preview          — hovering [[link]] shows first lines of target file
 *
 * NOTE: Ctrl+Shift+O (Go to Symbol) is captured by Chrome (opens Bookmarks).
 *       The outline is exposed as a sidebar panel instead.
 *
 * Usage (factory — needs access to the composite VFS provider):
 *   const mdLspPlugin = useMemo(() => createMarkdownLspPlugin(cfs), [cfs]);
 *   <MonacoMultiEditor plugins={[..., mdLspPlugin]} />
 */

import { useState, useEffect } from 'react';
import * as monaco from 'monaco-editor';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { FileSystemProvider, DirectoryEntry } from '@hestia/core';
import { FileType } from '@hestia/core';
import type { IStatusBarItemHandle } from '../monaco';
import { defineEditorPlugin, globalEventBus } from '../monaco';

// ── VFS file cache ─────────────────────────────────────────────────────────────

let _provider: FileSystemProvider | null = null;
let _mdFiles: string[] | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 30_000;

async function collectMdFiles(dir: string): Promise<string[]> {
  if (!_provider) return [];
  const result: string[] = [];
  let entries: DirectoryEntry[];
  try {
    entries = await _provider.readDirectory(dir);
  } catch {
    return result;
  }
  for (const { name, type } of entries) {
    const full = `${dir}/${name}`;
    if (type === FileType.Directory) result.push(...(await collectMdFiles(full)));
    else if (/\.(md|mdx|markdown)$/i.test(name)) result.push(full);
  }
  return result;
}

async function getOrRefreshCache(): Promise<string[]> {
  const now = Date.now();
  if (_mdFiles && now - _cacheTs < CACHE_TTL_MS) return _mdFiles;
  _mdFiles = await collectMdFiles('/home');
  _cacheTs = now;
  return _mdFiles;
}

function invalidateCache() {
  _mdFiles = null;
  _cacheTs = 0;
}

// ── Path helpers ───────────────────────────────────────────────────────────────

function dirOf(uri: string): string {
  const idx = uri.lastIndexOf('/');
  return idx > 0 ? uri.slice(0, idx) : '/home';
}
function ensureMdExt(p: string): string {
  return /\.(md|mdx|markdown)$/i.test(p) ? p : `${p}.md`;
}
function resolveCandidates(link: string, currentUri: string): string[] {
  if (link.startsWith('/')) return [ensureMdExt(link)];
  const dir = dirOf(currentUri);
  return [ensureMdExt(`${dir}/${link}`), ensureMdExt(`/home/${link}`)];
}
async function resolveWikiLink(link: string, currentUri: string): Promise<string | null> {
  if (!_provider) return null;
  for (const c of resolveCandidates(link, currentUri)) {
    try {
      await _provider.stat(c);
      return c;
    } catch {
      /* not found */
    }
  }
  return null;
}
function pathToLabel(absPath: string): string {
  return absPath.replace(/^\/home\//, '').replace(/\.(md|mdx|markdown)$/i, '');
}
function isMarkdownUri(uri: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(uri);
}

// ── Wiki-link extraction ───────────────────────────────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]/g;

interface WikiLinkOccurrence {
  link: string;
  line: number;
  startCol: number;
  endCol: number;
}

function extractWikiLinks(text: string): WikiLinkOccurrence[] {
  const result: WikiLinkOccurrence[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    WIKI_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI_LINK_RE.exec(lines[i])) !== null) {
      result.push({
        link: m[1].trim(),
        line: i + 1,
        startCol: m.index + 1,
        endCol: m.index + m[0].length + 1,
      });
    }
  }
  return result;
}

// ── Heading outline state ──────────────────────────────────────────────────────

export interface Heading {
  level: number;
  text: string;
  line: number;
}

let _headings: Heading[] = [];
let _activeHeadingLine = 0; // line of last heading above cursor
const _headingListeners = new Set<() => void>();

function setHeadings(h: Heading[]) {
  _headings = h;
  _headingListeners.forEach((fn) => fn());
}
function setActiveHeadingLine(line: number) {
  if (_activeHeadingLine === line) return;
  _activeHeadingLine = line;
  _headingListeners.forEach((fn) => fn());
}

function parseHeadings(text: string): Heading[] {
  const lines = text.split('\n');
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  }
  return headings;
}

function useOutlineState() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    _headingListeners.add(fn);
    return () => {
      _headingListeners.delete(fn);
    };
  }, []);
  return { headings: _headings, activeLine: _activeHeadingLine };
}

// ── Module-level shared state ──────────────────────────────────────────────────

let _currentUri = '';
let _statusBarHandle: IStatusBarItemHandle | null = null;
let _monacoDisposables: monaco.IDisposable[] = [];
let _vfsUnsub: (() => void) | null = null;
let _diagTimer: ReturnType<typeof setTimeout> | null = null;

// ── Status bar ─────────────────────────────────────────────────────────────────

function updateStatusBar(brokenCount: number, total: number, isMarkdown: boolean) {
  if (!_statusBarHandle) return;
  if (!isMarkdown) {
    _statusBarHandle.update({
      text: 'MD',
      tooltip: 'Markdown LSP',
      color: undefined,
      backgroundColor: undefined,
    });
    return;
  }
  if (total === 0) {
    _statusBarHandle.update({
      text: 'MD',
      tooltip: 'No wiki links',
      color: undefined,
      backgroundColor: undefined,
    });
  } else if (brokenCount === 0) {
    _statusBarHandle.update({
      text: `$(check) ${total} link${total !== 1 ? 's' : ''}`,
      tooltip: `${total} wiki link(s) — all valid`,
      color: '#89dceb',
      backgroundColor: undefined,
    });
  } else {
    _statusBarHandle.update({
      text: `$(warning) ${brokenCount} broken`,
      tooltip: `${brokenCount} of ${total} wiki link(s) not found`,
      color: '#f48771',
      backgroundColor: undefined,
    });
  }
}

// ── Diagnostics ────────────────────────────────────────────────────────────────

function findModel(uri: string): monaco.editor.ITextModel | null {
  const withScheme = uri.startsWith('file://') ? uri : `file://${uri}`;
  return (
    monaco.editor.getModels().find((m) => m.uri.toString() === uri) ??
    monaco.editor.getModels().find((m) => m.uri.toString() === withScheme) ??
    null
  );
}

async function runDiagnostics(model: monaco.editor.ITextModel, uri: string): Promise<void> {
  const text = model.getValue();
  const occurrences = extractWikiLinks(text);
  const markers: monaco.editor.IMarkerData[] = [];
  await Promise.all(
    occurrences.map(async ({ link, line, startCol, endCol }) => {
      const resolved = await resolveWikiLink(link, uri);
      if (!resolved) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Wiki link not found: [[${link}]]`,
          startLineNumber: line,
          startColumn: startCol,
          endLineNumber: line,
          endColumn: endCol,
          source: 'Markdown LSP',
        });
      }
    })
  );
  monaco.editor.setModelMarkers(model, 'markdown-lsp', markers);
  updateStatusBar(markers.length, occurrences.length, true);
}

function scheduleUpdate(uri: string): void {
  if (_diagTimer) {
    clearTimeout(_diagTimer);
    _diagTimer = null;
  }
  _diagTimer = setTimeout(async () => {
    _diagTimer = null;
    if (!uri || !isMarkdownUri(uri)) return;
    const model = findModel(uri);
    if (!model) return;
    const text = model.getValue();
    setHeadings(parseHeadings(text));
    await runDiagnostics(model, uri);
  }, 400);
}

// ── Outline sidebar panel ──────────────────────────────────────────────────────

const HEADING_COLOR: Record<number, string> = {
  1: '#e8e8e8',
  2: '#4fc3f7',
  3: '#a6adc8',
  4: '#6c7086',
  5: '#585b70',
  6: '#45475a',
};
const OUTLINE_PANEL_ID = 'builtin.markdown-lsp.outline';

function OutlinePanel() {
  const { headings, activeLine } = useOutlineState();
  const isMarkdown = isMarkdownUri(_currentUri);

  function scrollTo(heading: Heading) {
    const editors = monaco.editor.getEditors();
    const editor =
      editors.find((e) => {
        const model = e.getModel();
        if (!model) return false;
        const uri = model.uri.path || model.uri.toString();
        return uri === _currentUri || uri === `file://${_currentUri}`;
      }) ?? editors[0];
    if (!editor) return;
    editor.revealLineInCenter(heading.line);
    editor.setPosition({ lineNumber: heading.line, column: 1 });
    editor.focus();
  }

  if (!isMarkdown || !_currentUri) {
    return (
      <Box sx={{ p: 2, color: '#6c7086', fontSize: 12, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 28, mb: 1 }}>≡</Typography>
        <Typography sx={{ fontSize: 11, color: '#585b70' }}>
          Open a <code>.md</code> file to see the heading outline.
        </Typography>
      </Box>
    );
  }

  if (headings.length === 0) {
    return (
      <Box sx={{ p: 2, color: '#45475a', fontSize: 11, textAlign: 'center', pt: 4 }}>
        No headings found.
        <br />
        <Typography sx={{ fontSize: 10, color: '#313244', mt: 0.5 }}>
          Add <code style={{ color: '#cba6f7' }}># Heading</code> to your file.
        </Typography>
      </Box>
    );
  }

  // Find minimum level to use as base indent
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        py: 0.5,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { background: '#313244', borderRadius: 2 },
      }}
    >
      {headings.map((h, i) => {
        const indent = (h.level - minLevel) * 12;
        const isActive = h.line === activeLine;
        const color = HEADING_COLOR[h.level] ?? '#45475a';
        return (
          <Box
            key={i}
            onClick={() => scrollTo(h)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              pl: `${8 + indent}px`,
              pr: 1,
              py: '3px',
              cursor: 'pointer',
              background: isActive ? '#1e1e2e' : 'transparent',
              borderLeft: isActive ? '2px solid #4fc3f7' : '2px solid transparent',
              '&:hover': { background: '#1e1e2e80' },
              transition: 'background 0.1s',
            }}
          >
            <Typography
              sx={{
                fontSize: 9,
                color: '#45475a',
                fontWeight: 600,
                minWidth: 16,
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              {'#'.repeat(h.level)}
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: h.level === 1 ? 600 : 400,
              }}
            >
              {h.text}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function OutlinePanelWithHeader() {
  const { headings } = useOutlineState();
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#181825' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          borderBottom: '1px solid #313244',
          background: '#13131e',
          flexShrink: 0,
        }}
      >
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#cba6f7' }}>
          Outline
        </Typography>
        {headings.length > 0 && (
          <Typography sx={{ fontSize: 9, color: '#45475a' }}>{headings.length} headings</Typography>
        )}
        <Tooltip title="Refresh diagnostics">
          <IconButton
            size="small"
            onClick={() => {
              invalidateCache();
              if (_currentUri) scheduleUpdate(_currentUri);
            }}
            sx={{ p: 0.25, color: '#6c7086', ml: 0.5 }}
          >
            <RefreshIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <OutlinePanel />
      </Box>
    </Box>
  );
}

// ── Monaco providers ───────────────────────────────────────────────────────────

function registerProviders(): void {
  // Document symbol provider — feeds Monaco's built-in Go to Symbol command palette
  _monacoDisposables.push(
    monaco.languages.registerDocumentSymbolProvider('markdown', {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        return lines.flatMap((line, i) => {
          const m = /^(#{1,6})\s+(.+)$/.exec(line);
          if (!m) return [];
          const level = m[1].length;
          const range: monaco.IRange = {
            startLineNumber: i + 1,
            startColumn: 1,
            endLineNumber: i + 1,
            endColumn: line.length + 1,
          };
          return [
            {
              name: m[2].trim(),
              detail: '#'.repeat(level),
              kind: [
                monaco.languages.SymbolKind.File,
                monaco.languages.SymbolKind.Module,
                monaco.languages.SymbolKind.Namespace,
                monaco.languages.SymbolKind.Class,
                monaco.languages.SymbolKind.Field,
                monaco.languages.SymbolKind.Variable,
              ][level - 1],
              tags: [],
              range,
              selectionRange: range,
              children: [],
            } as monaco.languages.DocumentSymbol,
          ];
        });
      },
    })
  );

  // Wiki-link completion — trigger on [
  _monacoDisposables.push(
    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['['],
      async provideCompletionItems(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const beforeCursor = lineText.slice(0, position.column - 1);
        const afterCursor = lineText.slice(position.column - 1);
        const lastOpen = beforeCursor.lastIndexOf('[[');
        if (lastOpen === -1) return { suggestions: [] };
        const between = beforeCursor.slice(lastOpen + 2);
        if (between.includes(']]')) return { suggestions: [] };
        const hasClosing = afterCursor.startsWith(']]');
        // Replace only the typed text (between [[ and cursor).
        // When ]] already exists (Monaco auto-close), leave it — don't extend the range.
        const replaceRange: monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: lastOpen + 3,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        const files = await getOrRefreshCache();
        const currentDir = dirOf(_currentUri);
        return {
          suggestions: files.map((absPath) => {
            const label = pathToLabel(absPath);
            let insertBase = label;
            if (absPath.startsWith(currentDir + '/')) {
              const rel = absPath.slice(currentDir.length + 1).replace(/\.(md|mdx|markdown)$/i, '');
              if (!rel.includes('/')) insertBase = rel;
            }
            return {
              label,
              kind: monaco.languages.CompletionItemKind.File,
              insertText: hasClosing ? insertBase : `${insertBase}]]`,
              range: replaceRange,
              filterText: between + label,
              detail: absPath.replace('/home/', ''),
              sortText: `0${label}`,
            };
          }),
        };
      },
    })
  );

  // Hover provider — [[link]] shows target file preview
  _monacoDisposables.push(
    monaco.languages.registerHoverProvider('markdown', {
      async provideHover(model, position) {
        if (!_provider) return null;
        const line = model.getLineContent(position.lineNumber);
        const col0 = position.column - 1;
        const re = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          if (col0 < m.index || col0 >= m.index + m[0].length) continue;
          const wikiLink = m[1].trim();
          const hoverRange: monaco.IRange = {
            startLineNumber: position.lineNumber,
            startColumn: m.index + 1,
            endLineNumber: position.lineNumber,
            endColumn: m.index + m[0].length + 1,
          };
          const resolved = await resolveWikiLink(wikiLink, _currentUri);
          if (!resolved) {
            return {
              range: hoverRange,
              contents: [
                { value: `**⚠ Not found:** \`[[${wikiLink}]]\`` },
                { value: '_No file matching this path was found in the workspace._' },
              ],
            };
          }
          let preview = '_Could not read file._';
          try {
            const bytes = await _provider.readFile(resolved);
            preview = new TextDecoder().decode(bytes).split('\n').slice(0, 10).join('\n');
          } catch {
            /* leave default */
          }
          return {
            range: hoverRange,
            contents: [
              { value: `**→ ${pathToLabel(resolved)}**` },
              { value: `\`${resolved.replace('/home/', '')}\`` },
              { value: '---' },
              { value: preview },
            ],
          };
        }
        return null;
      },
    })
  );
}

function disposeProviders(): void {
  for (const d of _monacoDisposables) d.dispose();
  _monacoDisposables = [];
  for (const model of monaco.editor.getModels()) {
    if (model.getLanguageId() === 'markdown') {
      monaco.editor.setModelMarkers(model, 'markdown-lsp', []);
    }
  }
}

// ── Plugin factory ─────────────────────────────────────────────────────────────

const PLUGIN_ID = 'builtin.markdown-lsp';

export function createMarkdownLspPlugin(vfsProvider: FileSystemProvider) {
  return defineEditorPlugin(
    {
      id: PLUGIN_ID,
      name: 'Markdown LSP',
      version: '1.1.0',
      description: 'Outline panel, wiki-link completion, broken-link diagnostics, hover preview',
      contributes: ['sidebar', 'statusbar', 'commandpalette'],
    },

    (api) => {
      _provider = vfsProvider;

      _statusBarHandle = api.ui.statusbar.register({
        id: 'markdown-lsp.status',
        text: 'MD',
        tooltip: 'Markdown LSP',
        alignment: 'right',
        priority: 5,
      });

      api.ui.sidebar.register({
        id: OUTLINE_PANEL_ID,
        title: 'Outline',
        icon: '≡',
        component: OutlinePanelWithHeader,
        order: 5,
      });

      registerProviders();

      function handleMdUri(uri: string, text?: string) {
        if (uri.startsWith('virtual://')) return;
        if (!isMarkdownUri(uri)) {
          updateStatusBar(0, 0, false);
          setHeadings([]);
          return;
        }
        _currentUri = uri;
        if (text) setHeadings(parseHeadings(text));
        scheduleUpdate(uri);
      }

      api.editor.onDidOpenDocument((uri, text) => handleMdUri(uri, text));
      api.editor.onDidChangeModel((uri) => handleMdUri(uri));
      api.editor.onDidChangeContent((text) => {
        if (!_currentUri || !isMarkdownUri(_currentUri)) return;
        setHeadings(parseHeadings(text)); // outline updates immediately
        scheduleUpdate(_currentUri); // diagnostics debounced
      });

      // Track cursor → highlight active heading
      api.editor.onDidChangeCursorPosition(({ lineNumber }) => {
        if (!_currentUri || !isMarkdownUri(_currentUri)) return;
        // Find the last heading at or above the cursor line
        let active = 0;
        for (const h of _headings) {
          if (h.line <= lineNumber) active = h.line;
          else break;
        }
        setActiveHeadingLine(active);
      });

      _vfsUnsub = globalEventBus.on<{ path: string }>('system:vfs:fileChanged', ({ path }) => {
        if (/\.(md|mdx|markdown)$/i.test(path)) invalidateCache();
      });

      api.commands.register('refresh', () => {
        invalidateCache();
        if (_currentUri && isMarkdownUri(_currentUri)) scheduleUpdate(_currentUri);
      });
      api.ui.commandpalette.register({
        command: `${PLUGIN_ID}:refresh`,
        title: 'Refresh Wiki Link Cache',
        category: 'Markdown',
      });
      api.ui.commandpalette.register({
        command: `${PLUGIN_ID}:open-outline`,
        title: 'Open Outline Panel',
        category: 'Markdown',
      });
      api.commands.register('open-outline', () => api.ui.openSidebarPanel(OUTLINE_PANEL_ID));

      api.logger.info('Markdown LSP v1.1 activated');
    },

    () => {
      disposeProviders();
      _statusBarHandle = null;
      _vfsUnsub?.();
      _vfsUnsub = null;
      if (_diagTimer) {
        clearTimeout(_diagTimer);
        _diagTimer = null;
      }
      _currentUri = '';
      _provider = null;
      _mdFiles = null;
      setHeadings([]);
    }
  );
}
