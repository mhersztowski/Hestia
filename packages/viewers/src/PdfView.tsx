/**
 * PdfView — one page of a PDF, rendered to a canvas.
 *
 * Moved over from MyCastle (`app/mycastle-web/src/pages/drive/PdfView.tsx`),
 * where it drew a page inside a `*.dash.json` scene. The rendering, the region
 * mode (pan and zoom within a block) and the navigation bar are as they were;
 * what changed is where the bytes come from.
 *
 * **The file arrives as bytes, not as a path.** There it fetched from MyCastle's
 * REST VFS with a token out of `localStorage`, which tied the viewer to one
 * backend; here the caller reads the file and hands it over, so the same viewer
 * serves a drive, a dashboard, or a file dropped onto the page.
 *
 * One document may be shown by several views at once (a page each), so a loaded
 * document is cached by key and shared.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography, IconButton, InputBase, Tooltip } from '@mui/material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import * as pdfjsLib from 'pdfjs-dist';
// The worker goes through Vite's `?worker` — dependable in development and in a
// build. With `?url` the module worker sometimes failed to load ("Setting up
// fake worker failed"), and one shared worker serves many documents anyway,
// because pdf.js multiplexes them by document id.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/** Reads the file. The viewer calls it once per key and remembers the result. */
export type FileBytes = () => Promise<Uint8Array>;

// Loaded documents, shared between every view of the same file. The key is the
// caller's: it knows what makes two requests the same file (a path, a revision,
// an address) and the viewer does not.
const pdfCache = new Map<string, Promise<PdfDoc>>();

export function loadPdfDocument(key: string, read: FileBytes): Promise<PdfDoc> {
  let p = pdfCache.get(key);
  if (!p) {
    p = (async () => pdfjsLib.getDocument({ data: await read() }).promise)();
    pdfCache.set(key, p);
    // A rejected promise is not kept: after a failure the next attempt should
    // really try again rather than hand back the same error for ever.
    p.catch(() => pdfCache.delete(key));
  }
  return p;
}

/** Forgets a document — after the file behind it has been replaced. */
export function invalidatePdfCache(key: string): void {
  pdfCache.delete(key);
}

/** How many pages the document has; `null` while it loads, and when it cannot be read. */
export function usePdfNumPages(key: string, read: FileBytes): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    if (!key) return;
    loadPdfDocument(key, read).then((doc) => { if (alive) setN(doc.numPages); }).catch(() => { if (alive) setN(null); });
    return () => { alive = false; };
    // `read` is deliberately not a dependency: written inline by the caller, as
    // it usually is, it would reload the document on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return n;
}

/** A remembered view of the document: the offset as a fraction of the page, and the zoom. */
export interface DocView { x: number; y: number; zoom: number }

// ── One page, rendered to the canvas and fitted to the container ──────────────
export const PdfViewContent: React.FC<{
  /** What makes this file this file — the document cache is keyed by it. */
  fileKey: string;
  /** Reads the bytes. Called once per key. */
  read: FileBytes;
  page: number;
  showNavigation?: boolean;
  region?: boolean;                 // region mode: pan and zoom the view inside the block
  view?: DocView;                   // the remembered view (x and y as fractions, zoom)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);
  const offRef = useRef({ x: view?.x ?? 0, y: view?.y ?? 0 }); // the view offset, as fractions
  const dimsRef = useRef({ rw: 0, rh: 0 });                    // the rendered size, in CSS pixels

  // The container's width, which is what a whole page is fitted to.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth); setHeight(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The remembered view changed from outside — another block, a reloaded scene.
  useEffect(() => {
    setVzoom(view?.zoom ?? 1);
    offRef.current = { x: view?.x ?? 0, y: view?.y ?? 0 };
    applyPan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.x, view?.y, view?.zoom]);

  // Place the canvas by the remembered offset (region mode only).
  const applyPan = useCallback(() => {
    const canvas = canvasRef.current, el = wrapRef.current;
    if (!canvas || !el) return;
    if (!region) { canvas.style.position = ''; canvas.style.left = ''; canvas.style.top = ''; return; }
    const { rw, rh } = dimsRef.current;
    if (rw <= 0 || rh <= 0) return; // nothing rendered yet — do not zero the saved offset
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
      const doc = await loadPdfDocument(fileKey, read);
      setNumPages(doc.numPages);
      onNumPages?.(doc.numPages);
      const clamped = Math.min(Math.max(1, Math.floor(page) || 1), doc.numPages);
      const pdfPage = await doc.getPage(clamped);
      const base = pdfPage.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      // Region: a "cover" scale — the region fills the whole block, so there is
      // something to pan in both axes — times the zoom. Whole page: fit the width.
      const fit = region
        ? Math.max(width / base.width, height > 0 ? height / base.height : width / base.width)
        : width / base.width;
      const scale = fit * (region ? Math.max(0.1, vzoom) : 1);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* ignore */ } }
      const task = pdfPage.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      renderTaskRef.current = task;
      await task.promise;
      dimsRef.current = { rw: Math.floor(viewport.width), rh: Math.floor(viewport.height) };
      applyPan();
      setStatus('ok');
    } catch (e) {
      // RenderingCancelledException comes of flicking through pages; ignore it.
      if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
      setErrMsg((e as Error).message || 'Could not render the PDF');
      setStatus('error');
    }
    // `read` stays out of the dependencies, as in `usePdfNumPages`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, page, width, height, region, vzoom, onNumPages, applyPan]);

  useEffect(() => { void render(); }, [render]);

  const persist = useCallback(() => { onViewChange?.({ x: offRef.current.x, y: offRef.current.y, zoom: vzoom }); }, [onViewChange, vzoom]);

  // Panning by dragging (region mode). The wrapper stops propagation, so a host
  // that moves nodes on drag does not move this one while the view is panned.
  const onPanPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!region || status !== 'ok') return;
    const { rw, rh } = dimsRef.current;
    const el = wrapRef.current; if (!el) return;
    const bw = el.clientWidth, bh = el.clientHeight;
    if (rw <= bw && rh <= bh) return; // it all fits — nothing to pan
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

  // The wheel zooms (region mode). A native listener with passive:false, or
  // preventDefault does nothing and the page scrolls instead.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !region) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setVzoom((z) => Math.min(8, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [region]);
  // Once the zoom has been applied, remember the view.
  useEffect(() => { if (region && status === 'ok') persist(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vzoom]);

  return (
    <Box ref={wrapRef} onPointerDown={onPanPointerDown}
      className={region ? 'nodrag nopan' : undefined}
      sx={{ width: '100%', height: '100%', display: region ? 'block' : 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', bgcolor: '#525659', overflow: 'hidden', cursor: region && status === 'ok' ? 'grab' : 'default', touchAction: region ? 'none' : undefined }}>
      {status === 'loading' && (
        <Box sx={{ position: region ? 'absolute' : 'static', inset: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <CircularProgress size={16} sx={{ color: '#fff' }} />
        </Box>
      )}
      {status === 'error' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
          <Typography sx={{ fontSize: 11, color: '#ff8a80', fontFamily: 'monospace', textAlign: 'center' }}>
            {errMsg || 'Could not load the PDF'}
          </Typography>
        </Box>
      )}
      <canvas ref={canvasRef} style={{ display: status === 'ok' ? 'block' : 'none', maxWidth: region ? 'none' : '100%' }} />
      {status === 'ok' && numPages > 0 && !showNavigation && (
        <Typography sx={{ position: 'absolute', bottom: 2, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(0,0,0,0.4)', px: 0.5, borderRadius: 0.5, pointerEvents: 'none' }}>
          {Math.min(Math.max(1, Math.floor(page) || 1), numPages)} / {numPages}
        </Typography>
      )}
      {/* The navigation bar over the canvas — first / previous / go to / next /
          last. It stops propagation so a click does not reach a host that drags. */}
      {showNavigation && status === 'ok' && numPages > 0 && (() => {
        const cur = Math.min(Math.max(1, Math.floor(page) || 1), numPages);
        const go = (p: number) => onPageChange?.(Math.min(Math.max(1, p), numPages));
        const commitGoto = () => { const n = parseInt(gotoText, 10); if (Number.isFinite(n)) go(n); setGotoText(''); };
        const btn = { p: 0.375, color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } };
        return (
          <Box className="nodrag nopan" onPointerDown={(e) => e.stopPropagation()}
            sx={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.25,
              bgcolor: 'rgba(30,30,34,0.88)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, px: 0.5, py: 0.25,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 6, backdropFilter: 'blur(2px)' }}>
            <Tooltip title="First page" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(1)}><FirstPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Previous" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(cur - 1)}><NavigateBeforeIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <InputBase
              value={gotoText === '' ? String(cur) : gotoText}
              onChange={(e) => setGotoText(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => { setGotoText(''); e.target.select(); }}
              onBlur={() => setGotoText('')}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitGoto(); (e.target as HTMLInputElement).blur(); } }}
              inputProps={{ style: { textAlign: 'center', width: 26, color: '#fff', fontSize: 12, padding: '2px 0' } }}
            />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', px: 0.25, whiteSpace: 'nowrap' }}>/ {numPages}</Typography>
            <Tooltip title="Next" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(cur + 1)}><NavigateNextIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Last page" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(numPages)}><LastPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
          </Box>
        );
      })()}
    </Box>
  );
};

export default PdfViewContent;
