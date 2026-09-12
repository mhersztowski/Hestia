/**
 * DjvuView — one page of a DjVu document, rendered to a canvas.
 *
 * The same shape as `PdfView`, and moved over the same way: the file arrives as
 * bytes rather than as a path into somebody's backend, and a parsed document is
 * cached by key and shared between the views of it.
 *
 * Decoding runs on the main thread — djvu.js has no worker here. A large scan
 * therefore stops the page for as long as a page takes to decode.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography, IconButton, InputBase, Tooltip } from '@mui/material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DjVuDocument from 'djvujs-dist/library/src/DjVuDocument.js';

/** Reads the file. The viewer calls it once per key and remembers the result. */
export type FileBytes = () => Promise<Uint8Array>;

const djvuCache = new Map<string, Promise<DjVuDocument>>();

export function loadDjvuDocument(key: string, read: FileBytes): Promise<DjVuDocument> {
  let p = djvuCache.get(key);
  if (!p) {
    p = (async () => {
      const bytes = await read();
      const doc = new DjVuDocument();
      // djvu.js wants an ArrayBuffer of its own: a view into a larger buffer
      // would carry whatever else is in it.
      doc.loadDocument(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      return doc;
    })();
    djvuCache.set(key, p);
    p.catch(() => djvuCache.delete(key));
  }
  return p;
}

/** Forgets a document — after the file behind it has been replaced. */
export function invalidateDjvuCache(key: string): void {
  djvuCache.delete(key);
}

/** How many pages the document has; `null` while it loads, and when it cannot be read. */
export function useDjvuNumPages(key: string, read: FileBytes): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    if (!key) return;
    loadDjvuDocument(key, read).then((doc) => { if (alive) setN(doc.getPagesQuantity()); }).catch(() => { if (alive) setN(null); });
    return () => { alive = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return n;
}

/** A remembered view of the document: the offset as a fraction of the page, and the zoom. */
export interface DocView { x: number; y: number; zoom: number }

export const DjvuViewContent: React.FC<{
  /** What makes this file this file — the document cache is keyed by it. */
  fileKey: string;
  /** Reads the bytes. Called once per key. */
  read: FileBytes;
  page: number;
  showNavigation?: boolean;
  region?: boolean;
  view?: DocView;
  onViewChange?: (v: DocView) => void;
  onPageChange?: (p: number) => void;
  onNumPages?: (n: number) => void;
}> = ({ fileKey, read, page, showNavigation, region, view, onViewChange, onPageChange, onNumPages }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [gotoText, setGotoText] = useState('');
  const [vzoom, setVzoom] = useState(view?.zoom ?? 1);
  const offRef = useRef({ x: view?.x ?? 0, y: view?.y ?? 0 });
  const dimsRef = useRef({ rw: 0, rh: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth); setHeight(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setVzoom(view?.zoom ?? 1);
    offRef.current = { x: view?.x ?? 0, y: view?.y ?? 0 };
    applyPan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.x, view?.y, view?.zoom]);

  const applyPan = useCallback(() => {
    const canvas = canvasRef.current, el = wrapRef.current;
    if (!canvas || !el) return;
    if (!region) { canvas.style.position = ''; canvas.style.left = ''; canvas.style.top = ''; return; }
    const { rw, rh } = dimsRef.current;
    if (rw <= 0 || rh <= 0) return; // jeszcze nie wyrenderowano — nie zeruj zapisanego offsetu
    const bw = el.clientWidth, bh = el.clientHeight;
    const maxX = Math.max(0, rw - bw), maxY = Math.max(0, rh - bh);
    let offX = (offRef.current.x || 0) * rw, offY = (offRef.current.y || 0) * rh;
    offX = Math.min(Math.max(0, offX), maxX); offY = Math.min(Math.max(0, offY), maxY);
    offRef.current = { x: rw > 0 ? offX / rw : 0, y: rh > 0 ? offY / rh : 0 };
    canvas.style.position = 'absolute';
    canvas.style.left = `${-offX}px`;
    canvas.style.top = `${-offY}px`;
  }, [region]);

  const render = useCallback(async () => {
    if (!fileKey || width <= 0) return;
    setStatus('loading');
    try {
      const doc = await loadDjvuDocument(fileKey, read);
      const total = doc.getPagesQuantity();
      setNumPages(total);
      onNumPages?.(total);
      const clamped = Math.min(Math.max(1, Math.floor(page) || 1), total);
      const pg = await doc.getPage(clamped);
      const imageData = pg.getImageData();
      // The ImageData comes at the page's own resolution — scaled here to the block's width times the zoom.
      const off = document.createElement('canvas');
      off.width = imageData.width; off.height = imageData.height;
      off.getContext('2d')?.putImageData(imageData, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      // Region: a "cover" scale times the zoom, as in PdfView.
      const fit = region
        ? Math.max(width / imageData.width, height > 0 ? height / imageData.height : width / imageData.width)
        : width / imageData.width;
      const scale = fit * (region ? Math.max(0.1, vzoom) : 1);
      const targetW = Math.floor(imageData.width * scale);
      const targetH = Math.floor(imageData.height * scale);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(targetW * dpr);
      canvas.height = Math.floor(targetH * dpr);
      canvas.style.width = `${targetW}px`;
      canvas.style.height = `${targetH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(off, 0, 0, targetW, targetH);
      dimsRef.current = { rw: targetW, rh: targetH };
      applyPan();
      setStatus('ok');
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not render the DjVu');
      setStatus('error');
    }
  }, [fileKey, page, width, height, region, vzoom, onNumPages, applyPan]);

  useEffect(() => { void render(); }, [render]);

  const persist = useCallback(() => { onViewChange?.({ x: offRef.current.x, y: offRef.current.y, zoom: vzoom }); }, [onViewChange, vzoom]);

  const onPanPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!region || status !== 'ok') return;
    const { rw, rh } = dimsRef.current;
    const el = wrapRef.current; if (!el) return;
    const bw = el.clientWidth, bh = el.clientHeight;
    if (rw <= bw && rh <= bh) return;
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startOffX = offRef.current.x * rw, startOffY = offRef.current.y * rh;
    const maxX = Math.max(0, rw - bw), maxY = Math.max(0, rh - bh);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (me: PointerEvent) => {
      let offX = startOffX - (me.clientX - startX), offY = startOffY - (me.clientY - startY);
      offX = Math.min(Math.max(0, offX), maxX); offY = Math.min(Math.max(0, offY), maxY);
      offRef.current = { x: rw > 0 ? offX / rw : 0, y: rh > 0 ? offY / rh : 0 };
      const canvas = canvasRef.current; if (canvas) { canvas.style.left = `${-offX}px`; canvas.style.top = `${-offY}px`; }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); persist(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [region, status, persist]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !region) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setVzoom((z) => Math.min(8, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [region]);
  useEffect(() => { if (region && status === 'ok') persist(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vzoom]);

  return (
    <Box ref={wrapRef} onPointerDown={onPanPointerDown}
      className={region ? 'nodrag nopan' : undefined}
      sx={{ width: '100%', height: '100%', display: region ? 'block' : 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', bgcolor: '#525659', overflow: 'hidden', cursor: region && status === 'ok' ? 'grab' : 'default', touchAction: region ? 'none' : undefined }}>
      {status === 'loading' && (
        <Box sx={{ position: region ? 'absolute' : 'static', inset: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={16} sx={{ color: '#fff' }} />
        </Box>
      )}
      {status === 'error' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
          <Typography sx={{ fontSize: 11, color: '#ff8a80', fontFamily: 'monospace', textAlign: 'center' }}>
            {errMsg || 'Could not load the DjVu'}
          </Typography>
        </Box>
      )}
      <canvas ref={canvasRef} style={{ display: status === 'ok' ? 'block' : 'none', maxWidth: region ? 'none' : '100%' }} />
      {status === 'ok' && numPages > 0 && !showNavigation && (
        <Typography sx={{ position: 'absolute', bottom: 2, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(0,0,0,0.4)', px: 0.5, borderRadius: 0.5, pointerEvents: 'none' }}>
          {Math.min(Math.max(1, Math.floor(page) || 1), numPages)} / {numPages}
        </Typography>
      )}
      {showNavigation && status === 'ok' && numPages > 0 && (() => {
        const cur = Math.min(Math.max(1, Math.floor(page) || 1), numPages);
        const go = (p: number) => onPageChange?.(Math.min(Math.max(1, p), numPages));
        const commitGoto = () => { const n = parseInt(gotoText, 10); if (Number.isFinite(n)) go(n); setGotoText(''); };
        const btn = { p: 0.375, color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } };
        return (
          <Box className="nodrag nopan" onPointerDown={(e) => e.stopPropagation()}
            sx={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.25,
              bgcolor: 'rgba(30,30,34,0.88)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, px: 0.5, py: 0.25, boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 6 }}>
            <Tooltip title="First page" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(1)}><FirstPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Previous" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(cur - 1)}><NavigateBeforeIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <InputBase value={gotoText === '' ? String(cur) : gotoText}
              onChange={(e) => setGotoText(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => { setGotoText(''); e.target.select(); }}
              onBlur={() => setGotoText('')}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitGoto(); (e.target as HTMLInputElement).blur(); } }}
              inputProps={{ style: { textAlign: 'center', width: 26, color: '#fff', fontSize: 12, padding: '2px 0' } }} />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', px: 0.25, whiteSpace: 'nowrap' }}>/ {numPages}</Typography>
            <Tooltip title="Next" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(cur + 1)}><NavigateNextIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Last page" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(numPages)}><LastPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
          </Box>
        );
      })()}
    </Box>
  );
};

export default DjvuViewContent;
