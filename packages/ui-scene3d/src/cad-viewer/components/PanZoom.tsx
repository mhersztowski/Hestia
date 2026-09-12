/**
 * PanZoom — a lightweight pan + zoom container for the 2D viewers (CAD SVG,
 * Notes canvas). Mouse drag pans, wheel zooms toward the cursor, and a small
 * corner toolbar offers zoom in/out and fit-to-view. Optional content size lets
 * it fit fixed-size content (e.g. a 1400×900 notes canvas) on mount/reset.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';

interface PanZoomProps {
  children: ReactNode;
  /** Natural content size — enables fit-to-view centering on mount/reset. */
  contentWidth?: number;
  contentHeight?: number;
  minScale?: number;
  maxScale?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function PanZoom({ children, contentWidth, contentHeight, minScale = 0.05, maxScale = 40 }: PanZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ scale: 1, tx: 0, ty: 0 });
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const didFit = useRef(false);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    if (contentWidth && contentHeight) {
      const scale = clamp(Math.min(cw / contentWidth, ch / contentHeight) * 0.95, minScale, maxScale);
      setT({ scale, tx: (cw - contentWidth * scale) / 2, ty: (ch - contentHeight * scale) / 2 });
    } else {
      setT({ scale: 1, tx: 0, ty: 0 });
    }
  }, [contentWidth, contentHeight, minScale, maxScale]);

  // Fit once when the container first has a real size (after layout / becoming visible).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!didFit.current && el.clientWidth && el.clientHeight) { didFit.current = true; fit(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Native listeners: wheel (preventDefault) + pointer drag. Drag uses window
  // move/up so panning continues even when the cursor leaves the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      setT((cur) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = clamp(cur.scale * factor, minScale, maxScale);
        const k = ns / cur.scale;
        return { scale: ns, tx: px - (px - cur.tx) * k, ty: py - (py - cur.ty) * k };
      });
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setT((cur) => ({ ...cur, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
    };
    const onUp = () => { drag.current = null; setDragging(false); };
    const onDown = (e: PointerEvent) => {
      // Ignore clicks on the toolbar buttons (they stopPropagation, but guard anyway).
      if ((e.target as HTMLElement).closest('button')) return;
      drag.current = { x: e.clientX, y: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty };
      setDragging(true);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [minScale, maxScale]);

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    const cx = (el?.clientWidth ?? 0) / 2, cy = (el?.clientHeight ?? 0) / 2;
    setT((cur) => {
      const ns = clamp(cur.scale * factor, minScale, maxScale);
      const k = ns / cur.scale;
      return { scale: ns, tx: cx - (cx - cur.tx) * k, ty: cy - (cy - cur.ty) * k };
    });
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
      }}
    >
      <Box
        sx={{
          position: 'absolute', top: 0, left: 0, transformOrigin: '0 0',
          width: contentWidth ? `${contentWidth}px` : '100%',
          height: contentHeight ? `${contentHeight}px` : '100%',
        }}
        style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})` }}
      >
        {children}
      </Box>

      <Box sx={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 0.5, zIndex: 5 }}>
        {[
          { title: 'Powiększ', icon: <AddIcon sx={{ fontSize: 16 }} />, on: () => zoomBy(1.25) },
          { title: 'Pomniejsz', icon: <RemoveIcon sx={{ fontSize: 16 }} />, on: () => zoomBy(1 / 1.25) },
          { title: 'Dopasuj', icon: <CenterFocusStrongIcon sx={{ fontSize: 16 }} />, on: fit },
        ].map((b) => (
          <Tooltip key={b.title} title={b.title} placement="left">
            <IconButton size="small" onPointerDown={(e) => e.stopPropagation()} onClick={b.on}
              sx={{ bgcolor: 'rgba(40,40,40,0.85)', color: '#ddd', '&:hover': { bgcolor: 'rgba(60,60,60,0.95)' } }}>
              {b.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

export default PanZoom;
