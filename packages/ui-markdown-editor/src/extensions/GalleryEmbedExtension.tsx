/**
 * GalleryEmbed — embeds a photo gallery from a PUBLIC shared album.
 *   • Immich:        `@[gallery:immich:<shareUrl>]`
 *   • Google Photos: `@[gallery:gphotos:<shareUrl>]`
 *
 * The backend proxies/scrapes the public album (no login), returning image URLs;
 * the NodeView renders a responsive thumbnail grid with a lightbox. Round-trips
 * through markdown as `@[gallery:provider:source]` (see markdownConverter).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useMdViewSettings } from '../mdViewSettings';
import {
  Box, Typography, IconButton, Tooltip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import CollectionsIcon from '@mui/icons-material/Collections';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export const GALLERY_EDIT_EVENT = 'md-gallery-edit';
export interface GalleryEditEventDetail { pos: number; provider: string; source: string; selected: string; }

export type GalleryProvider = 'immich' | 'gphotos';
const PROVIDER_LABEL: Record<string, string> = { immich: 'Immich', gphotos: 'Google Photos' };

// `key` is a stable per-image id used for "selected photos" (Immich: assetId,
// Google Photos: position index — GP images have no stable id).
interface GalleryItem { key: string; thumb: string; full: string; alt?: string }

async function loadGallery(provider: string, source: string): Promise<GalleryItem[]> {
  const enc = encodeURIComponent(source);
  if (provider === 'gphotos') {
    const r = await fetch(`/api/gphotos/album?shareUrl=${enc}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    // Proxy through the backend — direct lh3.googleusercontent.com hotlinks are
    // blocked by Google's referer checks (blank thumbnails / lightbox).
    return (j.images as string[]).map((u, i) => {
      const e = encodeURIComponent(u);
      return { key: String(i), thumb: `/api/gphotos/image?url=${e}&size=w320-h320`, full: `/api/gphotos/image?url=${e}&size=w1600` };
    });
  }
  // immich (default)
  const r = await fetch(`/api/immich/album-assets?shareUrl=${enc}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return (j.assets as { id: string; description?: string }[]).map((a) => ({
    key: a.id,
    thumb: `/api/immich/shared-thumbnail?shareUrl=${enc}&assetId=${a.id}&size=thumbnail`,
    full: `/api/immich/shared-thumbnail?shareUrl=${enc}&assetId=${a.id}&size=preview`,
    alt: a.description,
  }));
}

// ─── Insert / edit dialog ────────────────────────────────────────────────────

export const GalleryDialog: React.FC<{
  open: boolean;
  initial?: { provider: string; source: string; selected?: string };
  onClose: () => void;
  onSubmit: (v: { provider: GalleryProvider; source: string; selected: string }) => void;
}> = ({ open, initial, onClose, onSubmit }) => {
  const [provider, setProvider] = useState<GalleryProvider>('immich');
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider((initial?.provider as GalleryProvider) || 'immich');
    setSource(initial?.source || '');
    const initSel = (initial?.selected || '').split(',').filter(Boolean);
    setMode(initSel.length ? 'selected' : 'all');
    setSelectedKeys(new Set(initSel));
    setItems(null); setError(null);
  }, [open, initial]);

  const load = useCallback(async () => {
    const s = source.trim();
    if (!s) return;
    setLoading(true); setError(null);
    try {
      setItems(await loadGallery(provider, s));
    } catch (e) {
      setError((e as Error).message || 'Nie udało się wczytać albumu.');
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, [provider, source]);

  const toggleKey = (k: string) => setSelectedKeys((prev) => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  const submit = () => {
    const s = source.trim();
    if (!s) return;
    const selected = mode === 'selected' ? Array.from(selectedKeys).join(',') : '';
    onSubmit({ provider, source: s, selected });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CollectionsIcon color="primary" /> Galeria zdjęć
      </DialogTitle>
      <DialogContent dividers>
        <ToggleButtonGroup
          exclusive size="small" value={provider}
          onChange={(_, v) => { if (v) { setProvider(v); setItems(null); } }}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="immich">Immich</ToggleButton>
          <ToggleButton value="gphotos">Google Photos</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth autoFocus label="Publiczny link do albumu" value={source}
            onChange={(e) => { setSource(e.target.value); setItems(null); }}
            placeholder={provider === 'immich' ? 'https://immich.example.com/share/…' : 'https://photos.app.goo.gl/…'}
            helperText={provider === 'immich'
              ? 'Wklej link „Udostępnij album" z Immich (publiczny share).'
              : 'Wklej publiczny link do albumu Google Photos (musi być publiczny).'}
          />
        </Box>

        <ToggleButtonGroup
          exclusive size="small" value={mode} sx={{ mt: 1.5 }}
          onChange={(_, v) => { if (v) { setMode(v); if (v === 'selected' && !items) void load(); } }}
        >
          <ToggleButton value="all">Cały album</ToggleButton>
          <ToggleButton value="selected">Wybrane zdjęcia</ToggleButton>
        </ToggleButtonGroup>

        {mode === 'selected' && (
          <Box sx={{ mt: 1.5 }}>
            {!items && !loading && (
              <Button size="small" variant="outlined" onClick={() => void load()} disabled={!source.trim()}>
                Wczytaj album
              </Button>
            )}
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>}
            {error && <Typography variant="body2" color="error">{error}</Typography>}
            {items && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Zaznacz zdjęcia ({selectedKeys.size}/{items.length})
                </Typography>
                <Box sx={{
                  mt: 0.5, maxHeight: 320, overflow: 'auto',
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 0.5,
                }}>
                  {items.map((it) => {
                    const sel = selectedKeys.has(it.key);
                    return (
                      <Box key={it.key} onClick={() => toggleKey(it.key)}
                        sx={{
                          position: 'relative', cursor: 'pointer', borderRadius: 1, overflow: 'hidden',
                          outline: sel ? '3px solid' : '1px solid', outlineColor: sel ? 'primary.main' : 'divider',
                          opacity: sel ? 1 : 0.7,
                        }}>
                        <img src={it.thumb} alt={it.alt || ''} loading="lazy"
                          style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                        {sel && (
                          <CheckCircleIcon sx={{ position: 'absolute', top: 2, right: 2, fontSize: 20, color: 'primary.main', bgcolor: '#fff', borderRadius: '50%' }} />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={submit}
          disabled={!source.trim() || (mode === 'selected' && selectedKeys.size === 0)}>
          Wstaw
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── React NodeView ──────────────────────────────────────────────────────────

const GalleryNodeView: React.FC<NodeViewProps> = ({ node, editor, getPos, deleteNode }) => {
  const { minimalView } = useMdViewSettings();
  const provider = (node.attrs.provider as string) || 'immich';
  const source = (node.attrs.source as string) || '';
  const selected = (node.attrs.selected as string) || '';
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Lightbox holds the INDEX of the shown image, so prev/next can navigate.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Step through the gallery (wraps around). Functional update keeps it valid
  // regardless of the closure's snapshot.
  const go = useCallback((delta: number) => {
    setLightboxIdx((idx) => {
      const n = items?.length ?? 0;
      if (idx === null || n === 0) return idx;
      return (idx + delta + n) % n;
    });
  }, [items]);

  useEffect(() => {
    let alive = true;
    if (!source) { setItems([]); return; }
    setLoading(true); setError(null);
    loadGallery(provider, source)
      .then((all) => {
        if (!alive) return;
        // Filter to the chosen photos when a selection is stored; empty = whole album.
        const keys = selected ? new Set(selected.split(',').filter(Boolean)) : null;
        setItems(keys ? all.filter((it) => keys.has(it.key)) : all);
      })
      .catch((e) => { if (alive) setError((e as Error).message || 'Nie udało się wczytać galerii.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [provider, source, selected]);

  // Keyboard navigation while the lightbox is open.
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, go]);

  const handleEdit = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number' || pos < 0) return;
    window.dispatchEvent(new CustomEvent<GalleryEditEventDetail>(GALLERY_EDIT_EVENT, { detail: { pos, provider, source, selected } }));
  }, [getPos, provider, source, selected]);

  return (
    <NodeViewWrapper className="md-gallery" data-drag-handle>
      {/* Widok minimalny: bez ramki/tła/marginesów karty i bez nagłówka. */}
      <Box className="md-gallery-card" sx={minimalView ? { border: 'none !important', borderRadius: '0 !important', background: 'transparent !important', boxShadow: 'none !important', p: '0 !important', m: '0 !important' } : undefined}>
        {!minimalView && (
        <Box className="md-gallery-header" contentEditable={false}>
          <Tooltip title={collapsed ? 'Rozwiń' : 'Zwiń'}>
            <IconButton size="small" className="md-gallery-fold" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <CollectionsIcon fontSize="small" className="md-gallery-icon" />
          <span className="md-gallery-title">{PROVIDER_LABEL[provider] ?? provider}</span>
          {items && <span className="md-gallery-count">· {items.length} zdjęć</span>}
          <Box sx={{ flex: 1 }} />
          {editor.isEditable && (
            <>
              <Tooltip title="Zmień album"><IconButton size="small" onClick={handleEdit}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              <Tooltip title="Usuń galerię"><IconButton size="small" onClick={() => deleteNode()}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
            </>
          )}
        </Box>
        )}

        {!collapsed && (
          <Box className="md-gallery-body" contentEditable={false}>
            {loading && items === null ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
            ) : error ? (
              <Typography variant="body2" color="error" sx={{ p: 1 }}>{error}</Typography>
            ) : items && items.length ? (
              <Box className="md-gallery-grid">
                {items.map((it, i) => (
                  <img
                    key={i} src={it.thumb} alt={it.alt || ''} loading="lazy"
                    className="md-gallery-thumb" onClick={() => setLightboxIdx(i)}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}><em>Brak zdjęć (sprawdź czy link jest publiczny).</em></Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Rendered in a portal to document.body so `position: fixed` is relative to
          the viewport (a transformed ancestor would otherwise clip the image). */}
      {lightboxIdx !== null && items && items[lightboxIdx] && createPortal(
        <Box className="md-gallery-lightbox" onClick={() => setLightboxIdx(null)}>
          <IconButton className="md-gallery-lightbox-close" onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}><CloseIcon /></IconButton>
          {items.length > 1 && (
            <IconButton
              className="md-gallery-lightbox-nav md-gallery-lightbox-prev"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Poprzednie"
            ><ChevronLeftIcon sx={{ fontSize: 40 }} /></IconButton>
          )}
          <img
            src={items[lightboxIdx].full} alt={items[lightboxIdx].alt || ''}
            className="md-gallery-lightbox-img"
            title="Kliknij, aby przejść do następnego"
            onClick={(e) => { e.stopPropagation(); go(1); }}
          />
          {items.length > 1 && (
            <IconButton
              className="md-gallery-lightbox-nav md-gallery-lightbox-next"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Następne"
            ><ChevronRightIcon sx={{ fontSize: 40 }} /></IconButton>
          )}
          {items.length > 1 && (
            <Box className="md-gallery-lightbox-counter" onClick={(e) => e.stopPropagation()}>
              {lightboxIdx + 1} / {items.length}
            </Box>
          )}
        </Box>,
        document.body,
      )}
    </NodeViewWrapper>
  );
};

// ─── Node definition ─────────────────────────────────────────────────────────

export const GalleryEmbed = Node.create({
  name: 'galleryEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      provider: { default: 'immich', parseHTML: (el) => el.getAttribute('data-provider') || 'immich', renderHTML: (a) => ({ 'data-provider': a.provider }) },
      source: { default: '', parseHTML: (el) => el.getAttribute('data-source') || '', renderHTML: (a) => ({ 'data-source': a.source }) },
      selected: { default: '', parseHTML: (el) => el.getAttribute('data-selected') || '', renderHTML: (a) => (a.selected ? { 'data-selected': a.selected } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="gallery-embed"]' }]; },

  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'gallery-embed' })]; },

  addNodeView() { return ReactNodeViewRenderer(GalleryNodeView); },
});

export default GalleryEmbed;
