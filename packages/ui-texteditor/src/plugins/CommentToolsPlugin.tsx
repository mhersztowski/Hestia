/**
 * CommentTools — editor plugin for the Drive text editor (TextEditorWorkspace).
 *
 * For the file open in the ACTIVE tab it provides, in one sidebar panel:
 *   1. Embed another VFS file's content into the active file, wrapped in
 *      language-aware comment markers that record which file was embedded.
 *   2. A list of embedded blocks with a one-click "remove" for each.
 *   3. Comment scanning — extracts source comments containing configured terms
 *      (defaults: TODO, FIXME), editable in a small form.
 *   4. A results panel listing the matches; click one to jump to that line.
 *
 * It is created as a factory (`createCommentToolsPlugin(provider)`) so it can
 * read other files from the same VFS the workspace browses, and passed to
 * TextEditorWorkspace via `extraPlugins`.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as monaco from 'monaco-editor';
import {
  Box, Stack, Typography, TextField, IconButton, Tooltip, Chip,
  Divider, List, ListItemButton, ListItemText, Breadcrumbs, Link, Alert,
  ThemeProvider, createTheme,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { defineEditorPlugin } from '../monaco';
import type { FileSystemProvider } from '@hestia/core';
import { FileType } from '@hestia/core';

// Self-contained dark theme so the panel matches the (always-dark) editor
// regardless of the host app's light/dark mode, and so MUI text/controls stay
// readable on the dark surface.
const PANEL_THEME = createTheme({
  palette: { mode: 'dark', background: { paper: '#252526', default: '#1e1e1e' } },
});

const PLUGIN_ID = 'mycastle.comment-tools';
const PANEL_ID = 'mycastle.comment-tools.panel';
const TERMS_STORAGE_KEY = 'comment-tools-terms';
const EMBED_TAG = 'CT-EMBED'; // sentinel that survives any comment style

// ─── Active-file store (sidebar component gets no props) ──────────────────────
// Only real (non-virtual) files are tracked, so switching to a preview tab
// keeps showing the last edited source file.
let _snap = { uri: '', text: '', v: 0 };
const _subs = new Set<() => void>();
const _emit = () => { for (const f of _subs) f(); };
const ctSubscribe = (cb: () => void) => { _subs.add(cb); return () => { _subs.delete(cb); }; };
const ctGetSnapshot = () => _snap;
function ctSetActive(uri: string, text: string) {
  if (uri.startsWith('virtual://')) return;
  _snap = { uri, text, v: _snap.v + 1 };
  _emit();
}
function ctSetText(text: string) {
  if (!_snap.uri) return;
  _snap = { uri: _snap.uri, text, v: _snap.v + 1 };
  _emit();
}

// ─── Language-aware comment styles ────────────────────────────────────────────
type CommentStyle = { line?: string; block?: [string, string] };
function commentStyle(path: string): CommentStyle {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp',
    'java', 'go', 'rs', 'cs', 'php', 'swift', 'kt', 'kts', 'scala', 'dart', 'm', 'mm'].includes(ext)) {
    return { line: '//', block: ['/*', '*/'] };
  }
  if (['py', 'rb', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'r', 'pl', 'ps1',
    'conf', 'ini', 'cfg', 'env', 'dockerfile', 'makefile'].includes(ext)) {
    return { line: '#' };
  }
  if (['html', 'htm', 'xml', 'svg', 'vue', 'md', 'markdown'].includes(ext)) {
    return { block: ['<!--', '-->'] };
  }
  if (['css', 'scss', 'less', 'sass'].includes(ext)) return { block: ['/*', '*/'] };
  return { line: '//' };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const uriToPath = (uri: string) => uri.replace(/^file:\/\//, '');

// ─── Embed block ──────────────────────────────────────────────────────────────
function buildEmbedBlock(srcPath: string, id: string, content: string, style: CommentStyle): string {
  const startTag = `${EMBED_TAG}:START id=${id} path=${srcPath}`;
  const endTag = `${EMBED_TAG}:END id=${id}`;
  let startLine: string;
  let endLine: string;
  if (style.line) {
    startLine = `${style.line} ${startTag}`;
    endLine = `${style.line} ${endTag}`;
  } else {
    const [o, c] = style.block!;
    startLine = `${o} ${startTag} ${c}`;
    endLine = `${o} ${endTag} ${c}`;
  }
  const body = content.replace(/\n$/, '');
  return `${startLine}\n${body}\n${endLine}\n`;
}

interface EmbedBlock { id: string; path: string; startLine: number; endLine: number }
function parseEmbeds(text: string): EmbedBlock[] {
  // Split on CRLF or LF — Monaco models may use CRLF, and a trailing `\r`
  // breaks the anchored START regex (`.`/`$` don't cross `\r`).
  const lines = text.split(/\r?\n/);
  const open = new Map<string, { path: string; line: number }>();
  const out: EmbedBlock[] = [];
  lines.forEach((ln, i) => {
    const ms = ln.match(new RegExp(`${EMBED_TAG}:START id=(\\S+) path=(.+?)(?:\\s*(?:-->|\\*/)\\s*)?$`));
    if (ms) { open.set(ms[1], { path: ms[2].trim(), line: i }); return; }
    const me = ln.match(new RegExp(`${EMBED_TAG}:END id=(\\S+)`));
    if (me) {
      const s = open.get(me[1]);
      if (s) { out.push({ id: me[1], path: s.path, startLine: s.line, endLine: i }); open.delete(me[1]); }
    }
  });
  return out;
}

// ─── Comment scanning ─────────────────────────────────────────────────────────
interface Match { line: number; term: string; text: string }
function scanComments(text: string, path: string, terms: string[]): Match[] {
  const active = terms.map(t => t.trim()).filter(Boolean);
  if (!active.length) return [];
  const style = commentStyle(path);
  const termRe = new RegExp(`(${active.map(escapeRegExp).join('|')})`);
  const lines = text.split(/\r?\n/);
  const out: Match[] = [];
  let inBlock = false;
  let blockClose = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes(EMBED_TAG)) continue; // skip our own markers
    let comment = '';
    if (inBlock) {
      const ci = line.indexOf(blockClose);
      if (ci >= 0) { comment += line.slice(0, ci); inBlock = false; line = line.slice(ci + blockClose.length); }
      else { comment += line; }
    }
    if (!inBlock && style.block) {
      const [bo, bc] = style.block;
      let idx = line.indexOf(bo);
      while (idx >= 0) {
        const close = line.indexOf(bc, idx + bo.length);
        if (close >= 0) { comment += ' ' + line.slice(idx + bo.length, close); line = line.slice(close + bc.length); idx = line.indexOf(bo); }
        else { comment += ' ' + line.slice(idx + bo.length); inBlock = true; blockClose = bc; break; }
      }
    }
    if (!inBlock && style.line) {
      const li = line.indexOf(style.line);
      if (li >= 0) comment += ' ' + line.slice(li + style.line.length);
    }
    if (comment) {
      const m = termRe.exec(comment);
      if (m) out.push({ line: i, term: m[1], text: comment.trim() });
    }
  }
  return out;
}

// ─── Monaco helpers ───────────────────────────────────────────────────────────
function editorForUri(uri: string): monaco.editor.ICodeEditor | null {
  return monaco.editor.getEditors().find(e => e.getModel()?.uri.toString() === uri) ?? null;
}
function modelForUri(uri: string): monaco.editor.ITextModel | null {
  try { return monaco.editor.getModel(monaco.Uri.parse(uri)); } catch { return null; }
}
function insertAtCursor(uri: string, text: string): boolean {
  const ed = editorForUri(uri);
  if (ed) {
    const sel = ed.getSelection() ?? new monaco.Range(1, 1, 1, 1);
    ed.executeEdits('comment-tools', [{ range: sel, text, forceMoveMarkers: true }]);
    ed.focus();
  } else {
    const model = modelForUri(uri);
    if (!model) return false;
    const last = model.getLineCount();
    const col = model.getLineMaxColumn(last);
    model.applyEdits([{ range: new monaco.Range(last, col, last, col), text: '\n' + text }]);
  }
  // Sync the store immediately — don't depend on the content-changed event
  // round-tripping back (it may not fire for programmatic edits while focus is
  // on the sidebar), otherwise the Embedded list parses stale text.
  const m = modelForUri(uri);
  if (m) ctSetText(m.getValue());
  return true;
}
function removeLineRange(uri: string, startLine0: number, endLine0: number): void {
  const model = modelForUri(uri);
  if (!model) return;
  const lineCount = model.getLineCount();
  const startLn = startLine0 + 1;
  const endLn = endLine0 + 1;
  let range: monaco.Range;
  if (endLn >= lineCount) {
    const sLn = startLn > 1 ? startLn - 1 : startLn;
    const sCol = startLn > 1 ? model.getLineMaxColumn(startLn - 1) : 1;
    range = new monaco.Range(sLn, sCol, endLn, model.getLineMaxColumn(endLn));
  } else {
    range = new monaco.Range(startLn, 1, endLn + 1, 1);
  }
  model.applyEdits([{ range, text: '' }]);
  ctSetText(model.getValue());
}
function jumpToLine(uri: string, line0: number): void {
  const ed = editorForUri(uri);
  if (!ed) return;
  const ln = line0 + 1;
  ed.revealLineInCenter(ln);
  ed.setPosition({ lineNumber: ln, column: 1 });
  ed.focus();
}

// ─── Sidebar panel ────────────────────────────────────────────────────────────
function CommentToolsPanel({ provider }: { provider: FileSystemProvider }) {
  const snap = useSyncExternalStore(ctSubscribe, ctGetSnapshot);
  const { uri, text } = snap;
  const filePath = uri ? uriToPath(uri) : '';
  const fileName = filePath ? filePath.split('/').pop() : '';

  // Sync the store from the active Monaco editor. Used on mount (the plugin may
  // have activated after the file's open event fired, leaving the store empty
  // or stale) and from the manual Refresh button.
  const refreshFromEditor = useCallback(() => {
    const eds = monaco.editor.getEditors();
    const pick = eds.find(e => e.hasTextFocus() && !(e.getModel()?.uri.toString() ?? 'virtual://').startsWith('virtual://'))
      ?? eds.find(e => { const u = e.getModel()?.uri.toString(); return !!u && !u.startsWith('virtual://'); });
    const model = pick?.getModel();
    if (model) ctSetActive(model.uri.toString(), model.getValue());
  }, []);
  useEffect(() => { refreshFromEditor(); }, [refreshFromEditor]);

  // Search terms (persisted).
  const [terms, setTerms] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TERMS_STORAGE_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
    } catch { /* ignore */ }
    return ['TODO', 'FIXME'];
  });
  const [newTerm, setNewTerm] = useState('');
  useEffect(() => {
    try { localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify(terms)); } catch { /* ignore */ }
  }, [terms]);

  const embeds = useMemo(() => (text ? parseEmbeds(text) : []), [text]);
  const matches = useMemo(() => (text ? scanComments(text, filePath, terms) : []), [text, filePath, terms]);

  // ── Embed file browser ──
  const [dir, setDir] = useState('/');
  const [entries, setEntries] = useState<{ name: string; type: FileType }[]>([]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const loadDir = useCallback(async (path: string) => {
    setBrowserError(null);
    try {
      const list = await provider.readDirectory(path);
      list.sort((a, b) => {
        const ad = a.type === FileType.Directory ? 0 : 1;
        const bd = b.type === FileType.Directory ? 0 : 1;
        return ad !== bd ? ad - bd : a.name.localeCompare(b.name);
      });
      setEntries(list);
    } catch (e) {
      setBrowserError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    }
  }, [provider]);
  useEffect(() => { void loadDir(dir); }, [dir, loadDir]);

  const embedFile = useCallback(async (path: string) => {
    if (!uri) return;
    try {
      const bytes = await provider.readFile(path);
      const content = new TextDecoder().decode(bytes);
      const id = Math.random().toString(36).slice(2, 8);
      const block = buildEmbedBlock(path, id, content, commentStyle(filePath));
      insertAtCursor(uri, block);
    } catch (e) {
      setBrowserError(e instanceof Error ? e.message : String(e));
    }
  }, [uri, provider, filePath]);

  const addTerm = useCallback(() => {
    const t = newTerm.trim();
    if (t && !terms.includes(t)) setTerms(prev => [...prev, t]);
    setNewTerm('');
  }, [newTerm, terms]);

  const dirSegments = dir === '/' ? [] : dir.split('/').filter(Boolean);
  const goUp = () => {
    if (dir === '/') return;
    const segs = dirSegments.slice(0, -1);
    setDir(segs.length ? '/' + segs.join('/') : '/');
  };

  if (!uri) {
    return (
      <ThemeProvider theme={PANEL_THEME}>
        <Box sx={{ p: 2, height: '100%', bgcolor: 'background.paper', color: 'text.primary' }}>
          <Typography variant="body2" color="text.secondary">
            Open a file in the editor to use Comment Tools.
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={PANEL_THEME}>
    <Box sx={{ p: 1.5, height: '100%', overflow: 'auto', bgcolor: 'background.paper', color: 'text.primary' }}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Comment Tools</Typography>
        <Tooltip title="Refresh from editor">
          <IconButton size="small" onClick={refreshFromEditor}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
        {fileName}
      </Typography>

      {/* ── 1. Embed file ───────────────────────────────────────────── */}
      <Divider sx={{ my: 1.5 }}>
        <Chip size="small" icon={<AttachFileIcon fontSize="small" />} label="Embed file" />
      </Divider>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Tooltip title="Up">
          <span>
            <IconButton size="small" onClick={goUp} disabled={dir === '/'}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Breadcrumbs sx={{ flex: 1, fontSize: 12 }} maxItems={3}>
          <Link component="button" underline="hover" onClick={() => setDir('/')} sx={{ fontSize: 12 }}>/</Link>
          {dirSegments.map((seg, i) => (
            <Link key={i} component="button" underline="hover" sx={{ fontSize: 12 }}
              onClick={() => setDir('/' + dirSegments.slice(0, i + 1).join('/'))}>
              {seg}
            </Link>
          ))}
        </Breadcrumbs>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => void loadDir(dir)}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
      {browserError && <Alert severity="error" sx={{ mb: 1, py: 0 }}>{browserError}</Alert>}
      <List dense disablePadding sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        {entries.map((e) => {
          const childPath = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`;
          const isDir = e.type === FileType.Directory;
          return (
            <ListItemButton key={e.name} dense
              onClick={() => isDir ? setDir(childPath) : void embedFile(childPath)}>
              {isDir ? <FolderIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                : <InsertDriveFileIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />}
              <ListItemText primaryTypographyProps={{ fontSize: 12, noWrap: true }} primary={e.name} />
            </ListItemButton>
          );
        })}
        {entries.length === 0 && !browserError && (
          <Box sx={{ p: 1 }}><Typography variant="caption" color="text.secondary">Empty</Typography></Box>
        )}
      </List>
      <Typography variant="caption" color="text.secondary">Click a file to embed it at the cursor.</Typography>

      {/* ── 2. Embedded blocks ──────────────────────────────────────── */}
      <Divider sx={{ my: 1.5 }}>
        <Chip size="small" label={`Embedded (${embeds.length})`} />
      </Divider>
      {embeds.length === 0 ? (
        <Typography variant="caption" color="text.secondary">No embedded files in this document.</Typography>
      ) : (
        <List dense disablePadding>
          {embeds.map((b) => (
            <ListItemButton key={b.id} dense onClick={() => jumpToLine(uri, b.startLine)}>
              <ListItemText
                primaryTypographyProps={{ fontSize: 12, noWrap: true }}
                secondaryTypographyProps={{ fontSize: 11 }}
                primary={b.path.split('/').pop()}
                secondary={`lines ${b.startLine + 1}–${b.endLine + 1}`}
              />
              <Tooltip title="Remove embedded content">
                <IconButton size="small" edge="end"
                  onClick={(ev) => { ev.stopPropagation(); removeLineRange(uri, b.startLine, b.endLine); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          ))}
        </List>
      )}

      {/* ── 3. Comment markers form ─────────────────────────────────── */}
      <Divider sx={{ my: 1.5 }}>
        <Chip size="small" label="Markers" />
      </Divider>
      <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
        <TextField
          size="small" placeholder="Add marker (e.g. HACK)" value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
          fullWidth inputProps={{ style: { fontSize: 12 } }}
        />
        <Tooltip title="Add marker">
          <span>
            <IconButton size="small" onClick={addTerm} disabled={!newTerm.trim()}><AddIcon fontSize="small" /></IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {terms.map((t) => (
          <Chip key={t} size="small" label={t}
            onDelete={() => setTerms(prev => prev.filter(x => x !== t))} />
        ))}
        {terms.length === 0 && <Typography variant="caption" color="text.secondary">No markers — add at least one.</Typography>}
      </Box>

      {/* ── 4. Results ──────────────────────────────────────────────── */}
      <Divider sx={{ my: 1.5 }}>
        <Chip size="small" label={`Found (${matches.length})`} />
      </Divider>
      {matches.length === 0 ? (
        <Typography variant="caption" color="text.secondary">No matching comments.</Typography>
      ) : (
        <List dense disablePadding>
          {matches.map((m, i) => (
            <ListItemButton key={i} dense onClick={() => jumpToLine(uri, m.line)}>
              <Chip size="small" color="warning" variant="outlined" label={m.term}
                sx={{ mr: 1, height: 18, fontSize: 10 }} />
              <ListItemText
                primaryTypographyProps={{ fontSize: 12, noWrap: true }}
                secondaryTypographyProps={{ fontSize: 11 }}
                primary={m.text}
                secondary={`line ${m.line + 1}`}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
    </ThemeProvider>
  );
}

// ─── Plugin factory ───────────────────────────────────────────────────────────
// SVG icon for the sidebar (comment + tag).
const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 11H6V9h2v2zm5 0h-2V9h2v2zm5 0h-2V9h2v2z"/></svg>';

export function createCommentToolsPlugin(provider: FileSystemProvider) {
  const PanelComponent = () => <CommentToolsPanel provider={provider} />;

  return defineEditorPlugin(
    {
      id: PLUGIN_ID,
      name: 'Comment Tools',
      version: '1.0.0',
      description: 'Embed VFS files into the active file and scan source comments for TODO/FIXME-style markers',
      contributes: ['sidebar', 'toolbar', 'commandpalette'],
    },
    (api) => {
      api.ui.sidebar.register({
        id: PANEL_ID,
        title: 'Comment Tools',
        icon: ICON,
        component: PanelComponent,
        order: 30,
      });
      api.ui.toolbar.register({
        id: `${PLUGIN_ID}.open`,
        label: 'Comment Tools',
        icon: ICON,
        command: `${api.pluginId}:open`,
        group: 'right',
        order: 170,
      });
      api.ui.commandpalette.register({
        command: `${api.pluginId}:open`,
        title: 'Open Comment Tools',
        category: 'Comment Tools',
      });
      api.commands.register('open', () => { api.ui.openSidebarPanel(PANEL_ID); });

      // Track the active real file + its live content.
      api.editor.onDidOpenDocument((uri, text) => { ctSetActive(uri, text); });
      api.editor.onDidChangeModel((uri) => {
        if (uri.startsWith('virtual://')) return;
        const model = modelForUri(uri);
        ctSetActive(uri, model ? model.getValue() : '');
      });
      api.editor.onDidChangeContent((text) => { ctSetText(text); });

      api.logger.info('Comment Tools activated');
    },
    () => { /* disposables handled by the registry */ },
  );
}
