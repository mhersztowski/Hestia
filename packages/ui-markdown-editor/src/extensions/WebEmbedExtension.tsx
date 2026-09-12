/**
 * WebEmbedExtension — osadzenie strony www w dokumencie Markdown.
 *
 * Dwa tryby (ustawiane w dialogu):
 *   - 'url'  → iframe z dowolnym adresem URL,
 *   - 'lit'  → komponent webowy (Lit) wybrany z `drive/public/lit`. Moduł jest
 *              importowany w sandboksowym iframe (srcDoc), który wyszukuje
 *              eksport TAG (string kebab-case) + klasę, rejestruje custom element
 *              i renderuje go.
 *
 * Markdown: `@[web:{mode}:{value}]`
 *   url → @[web:url:https://example.com]
 *   lit → @[web:lit:/public/drive/users/{u}/lit/components/clock.module.js]
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  Box, Typography, IconButton, Tooltip, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, Tabs, Tab, List, ListItemButton, ListItemText,
  CircularProgress,
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import WidgetsIcon from '@mui/icons-material/Widgets';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BlockIcon from '@mui/icons-material/Block';
import { embedDecision, type EmbedCheckResult } from '../utils/embedFraming';
import { useEditorSession } from '../capabilities';

type WebEmbedMode = 'url' | 'lit';
const DEFAULT_HEIGHT = 360;

// ── Lit component rendering (sandboxed iframe srcDoc) ────────────────────────
// `importMap` (optional) maps package names → served node_modules URLs, so the
// embedded component can `import 'pkg'` (after `npm install` in its directory).
function litWrapperHtml(absUrl: string, importMap?: { imports?: Record<string, string> } | null): string {
  const u = JSON.stringify(absUrl);
  const im = importMap && importMap.imports && Object.keys(importMap.imports).length
    ? `<script type="importmap">${JSON.stringify(importMap)}</script>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8">
${im}
<style>html,body{margin:0;padding:8px;font-family:system-ui,sans-serif;color:#222}</style>
<script type="module">
  try {
    const mod = await import(${u});
    let tag = null, cls = null;
    for (const [, v] of Object.entries(mod)) {
      if (typeof v === 'string' && /^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(v)) tag = tag || v;
      else if (typeof v === 'function' && /^[A-Z]/.test(v.name || '')) cls = cls || v;
    }
    if (tag && cls && !customElements.get(tag)) customElements.define(tag, cls);
    if (tag) document.body.appendChild(document.createElement(tag));
    else document.body.textContent = 'Nie znaleziono komponentu (eksport TAG + klasa) w module.';
  } catch (e) {
    document.body.textContent = 'Błąd ładowania komponentu: ' + ((e && e.message) || e);
  }
</script></head><body></body></html>`;
}

// ── Lit picker: list .js/.mjs files under drive/public/lit ───────────────────
async function listLitModules(userName: string, token: string | null): Promise<string[]> {
  const base = `/data/Minis/Users/${userName}/drive/public/lit`;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const out: string[] = [];
  const walk = async (absPath: string): Promise<void> => {
    const url = `/api/users/${encodeURIComponent(userName)}/vfs/readdir?path=${encodeURIComponent(absPath)}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return;
    const j = await r.json() as { entries?: Array<{ name: string; type: number }> };
    for (const e of j.entries ?? []) {
      const child = `${absPath}/${e.name}`;
      if (e.type === 2) await walk(child);           // 2 = directory
      else if (/\.m?js$/i.test(e.name)) out.push(child.replace(`${base}/`, ''));
    }
  };
  await walk(base);
  return out.sort();
}

// ── Settings dialog ──────────────────────────────────────────────────────────
function WebEmbedDialog({ open, initialMode, initialValue, onClose, onConfirm }: {
  open: boolean;
  initialMode: WebEmbedMode;
  initialValue: string;
  onClose: () => void;
  onConfirm: (mode: WebEmbedMode, value: string) => void;
}) {
  const session = useEditorSession();
  const token = session?.token ?? null;
  const userName = session?.userName ?? '';
  const [tab, setTab] = useState<WebEmbedMode>(initialMode);
  const [url, setUrl] = useState(initialMode === 'url' ? initialValue : '');
  const [litList, setLitList] = useState<string[] | null>(null);
  const [litSelected, setLitSelected] = useState(initialMode === 'lit' ? initialValue : '');

  useEffect(() => {
    if (!open) return;
    setTab(initialMode);
    setUrl(initialMode === 'url' ? initialValue : '');
    setLitSelected(initialMode === 'lit' ? initialValue : '');
  }, [open, initialMode, initialValue]);

  // Lazy-load the lit list when the lit tab is first shown.
  useEffect(() => {
    if (!open || tab !== 'lit' || litList !== null || !userName) return;
    setLitList([]);
    listLitModules(userName, token).then(setLitList).catch(() => setLitList([]));
  }, [open, tab, litList, userName, token]);

  const litPublicPath = (rel: string) => `/public/drive/users/${encodeURIComponent(userName)}/lit/${rel}`;

  const canConfirm = tab === 'url' ? !!url.trim() : !!litSelected;
  const handleConfirm = () => {
    if (tab === 'url') onConfirm('url', url.trim());
    else onConfirm('lit', litSelected);
    onClose();
  };

  // The currently-selected lit rel (for highlighting), derived from the stored value.
  const selectedRel = litSelected.replace(new RegExp(`^/public/drive/users/[^/]+/lit/`), '');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Osadź stronę www</DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="url" label="Strona (URL)" />
        <Tab value="lit" label="Komponent (lit)" />
      </Tabs>
      <DialogContent dividers sx={{ minHeight: 280 }}>
        {tab === 'url' && (
          <Box>
            <TextField
              autoFocus fullWidth label="Adres URL" placeholder="https://example.com"
              value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) handleConfirm(); }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Strona zostanie osadzona w iframe. Niektóre serwisy blokują osadzanie (X-Frame-Options).
            </Typography>
          </Box>
        )}
        {tab === 'lit' && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Komponenty Lit z <code>drive/public/lit</code> (eksportują TAG + klasę).
            </Typography>
            {litList === null ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
            ) : litList.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, fontStyle: 'italic' }}>
                Brak modułów w drive/public/lit.
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 220, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {litList.map((rel) => (
                  <ListItemButton
                    key={rel}
                    selected={rel === selectedRel}
                    onClick={() => setLitSelected(litPublicPath(rel))}
                  >
                    <ListItemText primary={rel} primaryTypographyProps={{ fontFamily: 'monospace', fontSize: 13 }} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>Osadź</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── NodeView ─────────────────────────────────────────────────────────────────
function WebEmbedNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const session = useEditorSession();
  const token = session?.token ?? null;
  const currentUser = session?.userName ? { name: session.userName } : null;
  const mode = (node.attrs.mode as WebEmbedMode) || 'url';
  const value: string = node.attrs.value || '';
  const height: number = Number(node.attrs.height) || DEFAULT_HEIGHT;
  const [dialogOpen, setDialogOpen] = useState(!value);

  const label = value
    ? (mode === 'lit' ? decodeURIComponent(value.split('/').pop() ?? value) : value)
    : '';
  const absUrl = value ? new URL(value, window.location.origin).href : '';

  // For lit components: fetch an import map from the component's directory so it
  // can use packages installed there via `npm install` (drive/public/lit/.../node_modules).
  const litDir = useMemo(() => {
    if (mode !== 'lit' || !value) return '';
    const m = value.match(/^\/public\/drive\/users\/[^/]+\/(.+)$/);
    if (!m) return '';
    return `public/${m[1].split('/').slice(0, -1).join('/')}`; // drive-relative dir of the component
  }, [mode, value]);
  const [importMap, setImportMap] = useState<{ imports?: Record<string, string> } | null>(null);
  useEffect(() => {
    if (mode !== 'lit' || !litDir || !currentUser?.name) { setImportMap(null); return; }
    let cancelled = false;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/users/${encodeURIComponent(currentUser.name)}/drive/importmap?dir=${encodeURIComponent(litDir)}`, { headers })
      .then((r) => (r.ok ? r.json() : { imports: {} }))
      .then((m) => { if (!cancelled) setImportMap(m); })
      .catch(() => { if (!cancelled) setImportMap({ imports: {} }); });
    return () => { cancelled = true; };
  }, [mode, litDir, currentUser?.name, token]);

  const handleConfirm = useCallback((m: WebEmbedMode, v: string) => {
    updateAttributes({ mode: m, value: v });
  }, [updateAttributes]);

  // Czy adres w ogóle wolno pokazać w ramce. Serwisy z `X-Frame-Options` /
  // CSP `frame-ancestors` (claude.ai, portale społecznościowe, banki) wyświetlą
  // w ramce systemową stronę błędu przeglądarki — lepiej od razu dać kartę z
  // linkiem. Nagłówki widać tylko z serwera, stąd zapytanie do backendu.
  const [embedCheck, setEmbedCheck] = useState<EmbedCheckResult | null>(null);
  useEffect(() => {
    setEmbedCheck(null);
    if (mode !== 'url' || !absUrl || !/^https?:/i.test(absUrl)) return;
    let cancelled = false;
    fetch(`/api/embed-check?url=${encodeURIComponent(absUrl)}`)
      .then((r) => (r.ok ? r.json() as Promise<EmbedCheckResult> : { error: `HTTP ${r.status}` }))
      .then((result) => { if (!cancelled) setEmbedCheck(result); })
      .catch((e: unknown) => { if (!cancelled) setEmbedCheck({ error: (e as Error).message }); });
    return () => { cancelled = true; };
  }, [mode, absUrl]);

  const decision = useMemo(() => embedDecision(absUrl, embedCheck), [absUrl, embedCheck]);

  return (
    <NodeViewWrapper>
      <Box contentEditable={false} sx={{
        border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', my: 1,
        bgcolor: 'background.paper',
      }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
          bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider',
        }}>
          {mode === 'lit' ? <WidgetsIcon fontSize="small" color="secondary" /> : <LanguageIcon fontSize="small" color="info" />}
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label || <em style={{ opacity: 0.5 }}>Nie wybrano</em>}
          </Typography>
          <Chip label={mode === 'lit' ? 'komponent' : 'strona'} size="small" sx={{ fontSize: 10, height: 18 }} />
          {editor.isEditable && (
            <Tooltip title="Zmień">
              <IconButton size="small" onClick={() => setDialogOpen(true)}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
            </Tooltip>
          )}
          {mode === 'url' && absUrl && (
            <Tooltip title="Otwórz w nowej karcie">
              <IconButton size="small" component="a" href={absUrl} target="_blank" rel="noopener noreferrer">
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {value ? (
          mode === 'lit' ? (
            <Box component="iframe"
              key={`${absUrl}|${importMap ? Object.keys(importMap.imports ?? {}).length : 'x'}`}
              srcDoc={litWrapperHtml(absUrl, importMap)}
              sandbox="allow-scripts allow-popups allow-forms"
              sx={{ display: 'block', width: '100%', height, border: 'none', bgcolor: '#fff' }}
              title={label}
            />
          ) : decision.mode === 'card' ? (
            // Serwis zakazuje osadzania — ramka pokazałaby tylko systemowy błąd
            // („net::ERR_BLOCKED_BY_RESPONSE"), więc dajemy kartę z linkiem.
            <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BlockIcon fontSize="small" color="warning" />
                <Typography variant="body2" fontWeight={600}>
                  {decision.title || 'Ta strona nie pozwala na osadzanie'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                {absUrl}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {decision.reason ?? 'Serwis blokuje wyświetlanie w ramce.'}
                {' '}Otwórz ją w nowej karcie — treść pozostaje dostępna, tylko nie w tym dokumencie.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                href={absUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
              >
                Otwórz w nowej karcie
              </Button>
            </Box>
          ) : (
            <Box component="iframe"
              src={value}
              sx={{ display: 'block', width: '100%', height, border: 'none', bgcolor: '#fff' }}
              title={label}
            />
          )
        ) : (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Kliknij ikonę edycji, by wybrać URL strony albo komponent z drive/public/lit.
            </Typography>
          </Box>
        )}
      </Box>

      <WebEmbedDialog
        open={dialogOpen}
        initialMode={mode}
        initialValue={value}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
      />
    </NodeViewWrapper>
  );
}

// ── TipTap Node ──────────────────────────────────────────────────────────────
export const WebEmbed = Node.create({
  name: 'webEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      mode: { default: 'url' },
      value: { default: '' },
      height: { default: DEFAULT_HEIGHT },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="web-embed"]',
      getAttrs(node) {
        if (typeof node === 'string') return false;
        const el = node as HTMLElement;
        return {
          mode: el.getAttribute('data-mode') || 'url',
          value: el.getAttribute('data-value') || '',
          height: Number(el.getAttribute('data-height')) || DEFAULT_HEIGHT,
        };
      },
    }];
  },

  renderHTML({ node }) {
    return ['div', {
      'data-type': 'web-embed',
      'data-mode': node.attrs.mode,
      'data-value': node.attrs.value,
      'data-height': String(node.attrs.height),
    }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebEmbedNodeView);
  },

  addCommands() {
    return {
      insertWebEmbed: (mode: WebEmbedMode = 'url', value = '') => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { mode, value } }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    webEmbed: {
      insertWebEmbed: (mode?: WebEmbedMode, value?: string) => ReturnType;
    };
  }
}
