/**
 * PhotoMap — a Leaflet map with selected photos (Immich / Google Photos) pinned
 * at their locations. Photos with EXIF GPS (Immich) auto-place; any photo can be
 * placed/dragged by hand. Clicking a thumbnail marker opens a fullscreen lightbox.
 *
 * The whole state (pins + map view) is stored as a single JSON `config` attribute
 * and round-trips through markdown as a ```photomap …``` fence (see markdownConverter).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import {
  Box, Typography, IconButton, Tooltip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import RoomIcon from '@mui/icons-material/Room';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── shared events / types ───────────────────────────────────────────────────

export const PHOTOMAP_EDIT_EVENT = 'md-photomap-edit';
export interface PhotoMapEditEventDetail { pos: number; config: string }

export type PhotoProvider = 'immich' | 'gphotos';

/** A single pinned photo. thumb/full are backend-proxied relative URLs so the
 *  block renders without re-loading the album. */
export interface PhotoPin {
  key: string;
  lat: number;
  lng: number;
  thumb: string;
  full: string;
  alt?: string;
}
export interface PhotoMapConfig {
  center: [number, number];
  zoom: number;
  pins: PhotoPin[];
}

const DEFAULT_CONFIG: PhotoMapConfig = { center: [52.2297, 21.0122], zoom: 4, pins: [] };

function parseConfig(raw: string | undefined | null): PhotoMapConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const c = JSON.parse(raw) as Partial<PhotoMapConfig>;
    return {
      center: Array.isArray(c.center) && c.center.length === 2 ? [Number(c.center[0]), Number(c.center[1])] : DEFAULT_CONFIG.center,
      zoom: typeof c.zoom === 'number' ? c.zoom : DEFAULT_CONFIG.zoom,
      pins: Array.isArray(c.pins) ? c.pins.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number') : [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ─── album loading (with GPS for Immich) ─────────────────────────────────────

interface LoadedItem { key: string; thumb: string; full: string; alt?: string; lat?: number; lng?: number }

async function loadAlbum(provider: string, source: string): Promise<LoadedItem[]> {
  const enc = encodeURIComponent(source);
  if (provider === 'gphotos') {
    const r = await fetch(`/api/gphotos/album?shareUrl=${enc}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return (j.images as string[]).map((u, i) => {
      const e = encodeURIComponent(u);
      // Google Photos scraping exposes no GPS — these are always placed by hand.
      return { key: String(i), thumb: `/api/gphotos/image?url=${e}&size=w320-h320`, full: `/api/gphotos/image?url=${e}&size=w1600` };
    });
  }
  const r = await fetch(`/api/immich/album-assets?shareUrl=${enc}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return (j.assets as { id: string; description?: string; lat?: number; lng?: number }[]).map((a) => ({
    key: a.id,
    thumb: `/api/immich/shared-thumbnail?shareUrl=${enc}&assetId=${a.id}&size=thumbnail`,
    full: `/api/immich/shared-thumbnail?shareUrl=${enc}&assetId=${a.id}&size=preview`,
    alt: a.description,
    lat: a.lat,
    lng: a.lng,
  }));
}

// ─── marker styling (one-time CSS injection) ─────────────────────────────────

const MARKER_CSS = `
.md-photomap-marker{background:none;border:none}
.md-photomap-thumb{width:100%;height:100%;background-size:cover;background-position:center;border:2px solid #fff;border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.5);cursor:pointer}
.md-photomap-thumb.dim{opacity:.5}
`;
let markerCssInjected = false;
function ensureMarkerCss() {
  if (markerCssInjected || typeof document === 'undefined') return;
  markerCssInjected = true;
  const el = document.createElement('style');
  el.textContent = MARKER_CSS;
  document.head.appendChild(el);
}

function thumbIcon(url: string, size = 52, dim = false): L.DivIcon {
  const safe = url.replace(/'/g, '%27');
  return L.divIcon({
    className: 'md-photomap-marker',
    html: `<div class="md-photomap-thumb${dim ? ' dim' : ''}" style="background-image:url('${safe}')"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── read-only map (NodeView body) ───────────────────────────────────────────

function FitToPins({ pins, hasStoredView }: { pins: PhotoPin[]; hasStoredView: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (hasStoredView || pins.length === 0) return;
    const b = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b.pad(0.25), { animate: false, maxZoom: 15 });
  }, [pins, map, hasStoredView]);
  return null;
}

// ─── NodeView ────────────────────────────────────────────────────────────────

const PhotoMapNodeView: React.FC<NodeViewProps> = ({ node, editor, getPos, deleteNode }) => {
  const config = useMemo(() => parseConfig(node.attrs.config as string), [node.attrs.config]);
  const pins = config.pins;
  const [collapsed, setCollapsed] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => { ensureMarkerCss(); }, []);

  const go = useCallback((delta: number) => {
    setLightboxIdx((idx) => {
      const n = pins.length;
      if (idx === null || n === 0) return idx;
      return (idx + delta + n) % n;
    });
  }, [pins.length]);

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
    window.dispatchEvent(new CustomEvent<PhotoMapEditEventDetail>(PHOTOMAP_EDIT_EVENT, { detail: { pos, config: JSON.stringify(config) } }));
  }, [getPos, config]);

  return (
    <NodeViewWrapper className="md-photomap" data-drag-handle>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', my: 1 }}>
        <Box contentEditable={false} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, bgcolor: 'action.hover' }}>
          <Tooltip title={collapsed ? 'Rozwiń' : 'Zwiń'}>
            <IconButton size="small" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <MapIcon fontSize="small" color="primary" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Mapa zdjęć</Typography>
          <Typography variant="caption" color="text.secondary">· {pins.length} zdjęć</Typography>
          <Box sx={{ flex: 1 }} />
          {editor.isEditable && (
            <>
              <Tooltip title="Edytuj mapę zdjęć"><IconButton size="small" onClick={handleEdit}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              <Tooltip title="Usuń"><IconButton size="small" onClick={() => deleteNode()}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
            </>
          )}
        </Box>

        {!collapsed && (
          <Box contentEditable={false} sx={{ height: 360, position: 'relative' }}>
            {pins.length === 0 ? (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                <Typography variant="body2" color="text.secondary"><em>Brak przypiętych zdjęć — kliknij „Edytuj", aby dodać.</em></Typography>
              </Box>
            ) : (
              <MapContainer
                center={config.center}
                zoom={config.zoom}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <FitToPins pins={pins} hasStoredView={config.zoom !== DEFAULT_CONFIG.zoom} />
                {pins.map((p, i) => (
                  <Marker
                    key={p.key}
                    position={[p.lat, p.lng]}
                    icon={thumbIcon(p.thumb)}
                    eventHandlers={{ click: () => setLightboxIdx(i) }}
                  />
                ))}
              </MapContainer>
            )}
          </Box>
        )}
      </Box>

      {lightboxIdx !== null && pins[lightboxIdx] && createPortal(
        <Box className="md-gallery-lightbox" onClick={() => setLightboxIdx(null)}>
          <IconButton className="md-gallery-lightbox-close" onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}><CloseIcon /></IconButton>
          {pins.length > 1 && (
            <IconButton className="md-gallery-lightbox-nav md-gallery-lightbox-prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Poprzednie">
              <ChevronLeftIcon sx={{ fontSize: 40 }} />
            </IconButton>
          )}
          <img
            src={pins[lightboxIdx].full} alt={pins[lightboxIdx].alt || ''}
            className="md-gallery-lightbox-img"
            title="Kliknij, aby przejść do następnego"
            onClick={(e) => { e.stopPropagation(); go(1); }}
          />
          {pins.length > 1 && (
            <IconButton className="md-gallery-lightbox-nav md-gallery-lightbox-next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Następne">
              <ChevronRightIcon sx={{ fontSize: 40 }} />
            </IconButton>
          )}
          {pins.length > 1 && (
            <Box className="md-gallery-lightbox-counter" onClick={(e) => e.stopPropagation()}>{lightboxIdx + 1} / {pins.length}</Box>
          )}
        </Box>,
        document.body,
      )}
    </NodeViewWrapper>
  );
};

// ─── edit dialog ─────────────────────────────────────────────────────────────

// Working pin during editing (carries its source item metadata + coords).
interface DraftPin extends PhotoPin { placed: boolean }

function MapClickCatcher({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export const PhotoMapDialog: React.FC<{
  open: boolean;
  initial?: { config: string };
  onClose: () => void;
  onSubmit: (config: string) => void;
}> = ({ open, initial, onClose, onSubmit }) => {
  const [provider, setProvider] = useState<PhotoProvider>('immich');
  const [source, setSource] = useState('');
  const [items, setItems] = useState<LoadedItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // key → draft pin (placed on map or waiting in the tray)
  const [drafts, setDrafts] = useState<Record<string, DraftPin>>({});
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!open) return;
    ensureMarkerCss();
    setProvider('immich'); setSource(''); setItems(null); setError(null); setArmedKey(null);
    // Restore existing pins as already-placed drafts (they render on the map).
    const cfg = parseConfig(initial?.config);
    const d: Record<string, DraftPin> = {};
    for (const p of cfg.pins) d[p.key] = { ...p, placed: true };
    setDrafts(d);
  }, [open, initial]);

  const load = useCallback(async () => {
    const s = source.trim();
    if (!s) return;
    setLoading(true); setError(null);
    try { setItems(await loadAlbum(provider, s)); }
    catch (e) { setError((e as Error).message || 'Nie udało się wczytać albumu.'); setItems(null); }
    finally { setLoading(false); }
  }, [provider, source]);

  // Toggle a photo in/out of the selection. Auto-places when the photo has GPS.
  const toggleItem = useCallback((it: LoadedItem) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (next[it.key]) { delete next[it.key]; return next; }
      const hasGps = typeof it.lat === 'number' && typeof it.lng === 'number';
      next[it.key] = {
        key: it.key, thumb: it.thumb, full: it.full, alt: it.alt,
        lat: hasGps ? it.lat! : 0, lng: hasGps ? it.lng! : 0, placed: hasGps,
      };
      return next;
    });
  }, []);

  const placeArmed = useCallback((lat: number, lng: number) => {
    if (!armedKey) return;
    setDrafts((prev) => prev[armedKey] ? { ...prev, [armedKey]: { ...prev[armedKey], lat, lng, placed: true } } : prev);
    setArmedKey(null);
  }, [armedKey]);

  const moveDraft = useCallback((key: string, lat: number, lng: number) => {
    setDrafts((prev) => prev[key] ? { ...prev, [key]: { ...prev[key], lat, lng } } : prev);
  }, []);

  const placedDrafts = useMemo(() => Object.values(drafts).filter((d) => d.placed), [drafts]);
  const unplacedDrafts = useMemo(() => Object.values(drafts).filter((d) => !d.placed), [drafts]);

  const submit = () => {
    const pins: PhotoPin[] = placedDrafts.map(({ placed: _p, ...pin }) => pin);
    let center: [number, number] = DEFAULT_CONFIG.center;
    let zoom = DEFAULT_CONFIG.zoom;
    if (mapRef.current) { const c = mapRef.current.getCenter(); center = [c.lat, c.lng]; zoom = mapRef.current.getZoom(); }
    onSubmit(JSON.stringify({ center, zoom, pins }));
  };

  const selectedKeys = new Set(Object.keys(drafts));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MapIcon color="primary" /> Mapa zdjęć
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* ── left: album + selection ── */}
          <Box sx={{ flex: '1 1 320px', minWidth: 300 }}>
            <ToggleButtonGroup exclusive size="small" value={provider}
              onChange={(_, v) => { if (v) { setProvider(v); setItems(null); } }} sx={{ mb: 1 }}>
              <ToggleButton value="immich">Immich</ToggleButton>
              <ToggleButton value="gphotos">Google Photos</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField fullWidth size="small" label="Publiczny link do albumu" value={source}
                onChange={(e) => { setSource(e.target.value); setItems(null); }}
                placeholder={provider === 'immich' ? 'https://immich.example.com/share/…' : 'https://photos.app.goo.gl/…'} />
              <Button variant="outlined" onClick={() => void load()} disabled={!source.trim() || loading} sx={{ flexShrink: 0 }}>
                Wczytaj
              </Button>
            </Box>
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>}
            {error && <Typography variant="body2" color="error" sx={{ mt: 1 }}>{error}</Typography>}
            {items && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Zaznacz zdjęcia ({selectedKeys.size}). Ze współrzędnymi GPS trafią od razu na mapę; pozostałe — z tacki poniżej.
                </Typography>
                <Box sx={{ mt: 0.5, maxHeight: 300, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 0.5 }}>
                  {items.map((it) => {
                    const sel = selectedKeys.has(it.key);
                    const gps = typeof it.lat === 'number' && typeof it.lng === 'number';
                    return (
                      <Box key={it.key} onClick={() => toggleItem(it)}
                        sx={{ position: 'relative', cursor: 'pointer', borderRadius: 1, overflow: 'hidden',
                          outline: sel ? '3px solid' : '1px solid', outlineColor: sel ? 'primary.main' : 'divider', opacity: sel ? 1 : 0.75 }}>
                        <img src={it.thumb} alt={it.alt || ''} loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                        {gps && <RoomIcon sx={{ position: 'absolute', bottom: 1, right: 1, fontSize: 15, color: '#fff', filter: 'drop-shadow(0 0 2px #000)' }} />}
                      </Box>
                    );
                  })}
                </Box>
              </>
            )}
          </Box>

          {/* ── right: map + placement ── */}
          <Box sx={{ flex: '1 1 420px', minWidth: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="caption" color="text.secondary">
              {armedKey ? 'Kliknij mapę, aby umieścić wybrane zdjęcie.' : 'Przeciągaj pinezki, aby poprawić pozycję. Zdjęcia bez GPS umieść z tacki poniżej.'}
            </Typography>
            <Box sx={{ height: 340, mt: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <MapContainer
                center={placedDrafts.length ? [placedDrafts[0].lat, placedDrafts[0].lng] : DEFAULT_CONFIG.center}
                zoom={placedDrafts.length ? 8 : DEFAULT_CONFIG.zoom}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom
                ref={mapRef}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap' />
                <MapClickCatcher onClick={placeArmed} />
                {placedDrafts.map((d) => (
                  <Marker key={d.key} position={[d.lat, d.lng]} icon={thumbIcon(d.thumb)} draggable
                    eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); moveDraft(d.key, ll.lat, ll.lng); } }} />
                ))}
              </MapContainer>
            </Box>
            {unplacedDrafts.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Do umieszczenia ({unplacedDrafts.length}) — kliknij, potem kliknij mapę:</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5 }}>
                  {unplacedDrafts.map((d) => (
                    <img key={d.key} src={d.thumb} alt={d.alt || ''} onClick={() => setArmedKey((k) => k === d.key ? null : d.key)}
                      style={{ width: 48, height: 48, objectFit: 'cover', flexShrink: 0, borderRadius: 4, cursor: 'pointer',
                        outline: armedKey === d.key ? '3px solid #4fc3f7' : '1px solid rgba(0,0,0,0.2)' }} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={submit} disabled={placedDrafts.length === 0}>
          Wstaw ({placedDrafts.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Node definition ─────────────────────────────────────────────────────────

export const PhotoMap = Node.create({
  name: 'photoMap',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      config: {
        default: '',
        parseHTML: (el) => {
          const raw = el.getAttribute('data-config') || '';
          try { return decodeURIComponent(raw); } catch { return raw; }
        },
        renderHTML: (a) => (a.config ? { 'data-config': encodeURIComponent(a.config as string) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="photo-map"]' }]; },

  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'photo-map' })]; },

  addNodeView() { return ReactNodeViewRenderer(PhotoMapNodeView); },
});

export default PhotoMap;
