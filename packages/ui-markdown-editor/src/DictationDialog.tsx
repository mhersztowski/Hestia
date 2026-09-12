/**
 * DictationDialog — full-screen study/practice dialog.
 *
 * Top section: the source text spoken aloud via the browser's Web Speech API
 * (`speechSynthesis`). The currently-spoken word is highlighted in real time
 * using `SpeechSynthesisUtterance.onboundary` (charIndex → word index lookup).
 *
 * Bottom section: a large hand-writing canvas where the user can practice by
 * writing along with the dictation, using a stylus, finger, or mouse. Supports
 * pinch-to-zoom and two-finger pan. Strokes capture pressure when available
 * (Apple Pencil, S-Pen, Wacom) for variable line width.
 *
 * Why Web Speech and not Anthropic: Anthropic's API has no TTS endpoint, and
 * external TTS (OpenAI/ElevenLabs) returns only audio bytes — there are no
 * word-level timestamps without a Whisper roundtrip on the generated file.
 * `speechSynthesis` is native, free, and emits word boundaries inline.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Dialog, DialogContent, IconButton, Slider, Tooltip, Typography,
  Select, MenuItem, FormControl, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import UndoIcon from '@mui/icons-material/Undo';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import CreateIcon from '@mui/icons-material/Create';
import AutoFixOffIcon from '@mui/icons-material/AutoFixOff';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert Markdown to plain text, suitable for TTS. Drops syntax, keeps content. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')              // fenced code blocks → drop entirely
    .replace(/`([^`]+)`/g, '$1')                 // inline code → bare text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')    // images → alt text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // links → label
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // bold
    .replace(/__([^_]+)__/g, '$1')               // bold (underscore)
    .replace(/\*([^*]+)\*/g, '$1')               // italic
    .replace(/_([^_]+)_/g, '$1')                 // italic (underscore)
    .replace(/~~([^~]+)~~/g, '$1')               // strikethrough
    .replace(/^#{1,6}\s+/gm, '')                 // headings
    .replace(/^>\s?/gm, '')                      // blockquotes
    .replace(/^[-*+]\s+/gm, '')                  // unordered list bullets
    .replace(/^\d+\.\s+/gm, '')                  // ordered list markers
    .replace(/^---+$/gm, '')                     // horizontal rules
    .replace(/\n{3,}/g, '\n\n')                  // collapse blank lines
    .trim();
}

interface WordSpan {
  text: string;
  startChar: number;
  endChar: number;
}

/** Split text into word spans with character offsets — used by onboundary lookup. */
function splitWords(text: string): WordSpan[] {
  const result: WordSpan[] = [];
  const regex = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    result.push({ text: m[0], startChar: m.index, endChar: m.index + m[0].length });
  }
  return result;
}

// ─── Canvas state — held in refs since redraws are imperative ──────────────

interface StrokePoint { x: number; y: number; pressure: number }
interface Stroke { points: StrokePoint[]; color: string; baseWidth: number }

// ─── Component ──────────────────────────────────────────────────────────────

export interface DictationDialogProps {
  open: boolean;
  text: string;             // markdown — gets stripped automatically
  onClose: () => void;
}

const DictationDialog: React.FC<DictationDialogProps> = ({ open, text, onClose }) => {
  const plainText = useMemo(() => stripMarkdown(text), [text]);
  const words = useMemo(() => splitWords(plainText), [plainText]);

  // ─── TTS state ─────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [voiceURI, setVoiceURI] = useState<string>('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load voices — they're loaded asynchronously in some browsers (Chrome).
  useEffect(() => {
    const load = () => {
      const vs = speechSynthesis.getVoices();
      setVoices(vs);
      // Prefer Polish voice when available — falls back to the system default.
      if (!voiceURI && vs.length) {
        const pl = vs.find((v) => v.lang.startsWith('pl')) ?? vs[0];
        setVoiceURI(pl.voiceURI);
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [voiceURI]);

  // Stop any in-flight TTS when dialog closes — otherwise it keeps speaking
  // in the background and the next open doesn't get fresh boundaries.
  useEffect(() => {
    if (!open) {
      speechSynthesis.cancel();
      setPlaying(false);
      setPaused(false);
      setCurrentWordIdx(null);
    }
  }, [open]);

  const handlePlay = useCallback(() => {
    if (!plainText) return;
    if (paused) {
      speechSynthesis.resume();
      setPaused(false);
      return;
    }
    speechSynthesis.cancel();  // wipe any stale utterance
    const u = new SpeechSynthesisUtterance(plainText);
    u.rate = rate;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'pl-PL';
    // onboundary fires per word/sentence with charIndex into the utterance text.
    // Map it to our pre-computed word spans; rare browsers fire only at the
    // sentence boundary, in which case nothing visible breaks — just no
    // word-level highlight (acceptable degradation).
    u.onboundary = (ev) => {
      if (ev.name && ev.name !== 'word') return;
      const idx = words.findIndex((w) => ev.charIndex >= w.startChar && ev.charIndex < w.endChar);
      if (idx >= 0) setCurrentWordIdx(idx);
    };
    u.onend = () => {
      setPlaying(false);
      setPaused(false);
      setCurrentWordIdx(null);
    };
    u.onerror = () => {
      setPlaying(false);
      setPaused(false);
    };
    utteranceRef.current = u;
    speechSynthesis.speak(u);
    setPlaying(true);
    setPaused(false);
  }, [plainText, rate, voiceURI, voices, words, paused]);

  const handlePause = useCallback(() => {
    speechSynthesis.pause();
    setPaused(true);
  }, []);

  const handleStop = useCallback(() => {
    speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setCurrentWordIdx(null);
  }, []);

  // ─── Canvas state ──────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number; pressure: number }>>(new Map());
  // pinch state: snapshot at the moment the second pointer goes down
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    centerStart: { x: number; y: number };
    panStart: { x: number; y: number };
  } | null>(null);
  // We keep pan/zoom in refs (not state) because we redraw imperatively
  // every frame — re-rendering the React tree on each pointermove would
  // tank performance on a high-frequency stylus.
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  // Single-pointer pan snapshot taken when the user starts a drag with the
  // pan tool active. Without this `tool='pan'` was a no-op — only the
  // two-finger pinch handler was actually moving the view.
  const singlePanRef = useRef<{ startX: number; startY: number; panStart: { x: number; y: number } } | null>(null);
  const [tool, setTool] = useState<'pen' | 'pan'>('pen');
  const [strokeColor, setStrokeColor] = useState('#1976d2');
  const [, forceRender] = useState(0);
  const triggerRender = useCallback(() => forceRender((n) => n + 1), []);

  // Convert screen coords → world coords (canvas-local, before zoom/pan).
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - panRef.current.x) / zoomRef.current,
      y: (sy - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Apply pan/zoom transform on top of DPR.
    ctx.setTransform(dpr * zoomRef.current, 0, 0, dpr * zoomRef.current,
                     dpr * panRef.current.x, dpr * panRef.current.y);
    // Faint background grid so the user has a reference while writing.
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1 / zoomRef.current;
    const gridSize = 32;
    const worldW = canvas.width / (dpr * zoomRef.current);
    const worldH = canvas.height / (dpr * zoomRef.current);
    const startX = Math.floor(-panRef.current.x / zoomRef.current / gridSize) * gridSize;
    const startY = Math.floor(-panRef.current.y / zoomRef.current / gridSize) * gridSize;
    for (let x = startX; x < startX + worldW + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + worldH + gridSize);
      ctx.stroke();
    }
    for (let y = startY; y < startY + worldH + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + worldW + gridSize, y);
      ctx.stroke();
    }

    const drawStroke = (s: Stroke) => {
      if (s.points.length < 1) return;
      ctx.strokeStyle = s.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Variable width: blend pressure (0..1) into baseWidth. Mouse always has
      // pressure 0.5, so the line stays consistent on devices without it.
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1];
        const b = s.points[i];
        const pressure = (a.pressure + b.pressure) / 2 || 0.5;
        ctx.lineWidth = s.baseWidth * (0.4 + 1.2 * pressure);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    };

    for (const s of strokesRef.current) drawStroke(s);
    if (currentStrokeRef.current) drawStroke(currentStrokeRef.current);
  }, []);

  // Resize canvas to fill its container, accounting for DPR for crisp lines.
  // We do this in three phases because MUI Dialog animates open with a
  // fade-zoom — until the animation settles, the canvas has its HTML default
  // 300x150 internal resolution while CSS stretches it. Strokes drawn during
  // that window land outside the visible grid (mostly invisible).
  //
  //   1. Immediately on mount — best effort, might catch CSS size already
  //   2. requestAnimationFrame x 2 — after one paint cycle Dialog has settled
  //   3. ResizeObserver — picks up later splitter drags / window resizes
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        redraw();
      }
      return true;
    };

    syncSize();
    // Try a few frames in case Dialog animation hasn't finished.
    const raf1 = requestAnimationFrame(() => {
      if (!syncSize()) requestAnimationFrame(syncSize);
    });
    // Also try after 100ms — defensive; covers slow paints.
    const t = setTimeout(syncSize, 100);
    const t2 = setTimeout(syncSize, 350);

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(t);
      clearTimeout(t2);
      ro.disconnect();
    };
  }, [open, redraw]);

  // ── Pointer handlers ───────────────────────────────────────────────────

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Last-resort sync — if the canvas still has its HTML default 300x150
    // internal size (i.e. ResizeObserver hasn't fired yet because the Dialog
    // animation was mid-flight when the user clicked), bring it up to its
    // real CSS size right now so the first stroke is visible.
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const expectedW = Math.round(rect.width * dpr);
    const expectedH = Math.round(rect.height * dpr);
    if (expectedW > 0 && (canvas.width !== expectedW || canvas.height !== expectedH)) {
      canvas.width = expectedW;
      canvas.height = expectedH;
    }

    canvas.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, {
      x: e.clientX, y: e.clientY, pressure: e.pressure || 0.5,
    });

    const count = activePointersRef.current.size;
    if (count === 1 && tool === 'pen') {
      // Start a new stroke at the touched world position
      const p = screenToWorld(e.clientX, e.clientY);
      currentStrokeRef.current = {
        points: [{ ...p, pressure: e.pressure || 0.5 }],
        color: strokeColor,
        baseWidth: 2.5,
      };
    } else if (count === 1 && tool === 'pan') {
      // Snapshot start position + current pan so move handler can compute delta.
      singlePanRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panStart: { ...panRef.current },
      };
    } else if (count === 2) {
      // Two-finger gesture — cancel any in-progress stroke (the user obviously
      // didn't mean a draw) and snapshot pinch state.
      currentStrokeRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startZoom: zoomRef.current,
        centerStart: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        panStart: { ...panRef.current },
      };
    }
  }, [tool, strokeColor, screenToWorld]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, {
      x: e.clientX, y: e.clientY, pressure: e.pressure || 0.5,
    });

    const count = activePointersRef.current.size;
    if (count === 1 && currentStrokeRef.current) {
      const p = screenToWorld(e.clientX, e.clientY);
      currentStrokeRef.current.points.push({ ...p, pressure: e.pressure || 0.5 });
      redraw();
    } else if (count === 1 && tool === 'pan' && singlePanRef.current) {
      // Drag the view — translate by the delta from where the pointer landed.
      const dx = e.clientX - singlePanRef.current.startX;
      const dy = e.clientY - singlePanRef.current.startY;
      panRef.current = {
        x: singlePanRef.current.panStart.x + dx,
        y: singlePanRef.current.panStart.y + dy,
      };
      redraw();
    } else if (count === 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const newZoom = Math.max(0.2, Math.min(8, pinchRef.current.startZoom * (dist / pinchRef.current.startDist)));
      // Pan = how much the gesture's center moved between down and now
      const dxC = center.x - pinchRef.current.centerStart.x;
      const dyC = center.y - pinchRef.current.centerStart.y;
      zoomRef.current = newZoom;
      panRef.current = {
        x: pinchRef.current.panStart.x + dxC,
        y: pinchRef.current.panStart.y + dyC,
      };
      redraw();
    }
  }, [screenToWorld, redraw]);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      // Commit the stroke. Drop one-point taps so we don't pollute the canvas.
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
        strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      }
      currentStrokeRef.current = null;
      pinchRef.current = null;
      singlePanRef.current = null;
      redraw();
    } else if (activePointersRef.current.size < 2) {
      // Second finger lifted but one remains — finish the pinch but keep tracking.
      pinchRef.current = null;
      singlePanRef.current = null;
    }
  }, [redraw]);

  // Mouse-wheel zoom. Zooms toward the cursor for natural feel.
  const onCanvasWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.2, Math.min(8, zoomRef.current * factor));
    // Keep the world point under the cursor stationary across the zoom.
    panRef.current = {
      x: sx - ((sx - panRef.current.x) / zoomRef.current) * newZoom,
      y: sy - ((sy - panRef.current.y) / zoomRef.current) * newZoom,
    };
    zoomRef.current = newZoom;
    redraw();
  }, [redraw]);

  // ── Toolbar actions ────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    redraw();
  }, [redraw]);

  const handleUndo = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
  }, [redraw]);

  const handleResetView = useCallback(() => {
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    redraw();
    triggerRender();
  }, [redraw, triggerRender]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* ─── Top: transport + text ──────────────────────────────────────── */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          {/* Transport bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, flexWrap: 'wrap' }}>
            <RecordVoiceOverIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>Dyktowanie</Typography>
            <Box sx={{ flex: 1 }} />

            <Tooltip title={playing && !paused ? 'Pauza' : (paused ? 'Wznów' : 'Odtwórz')}>
              <IconButton onClick={playing && !paused ? handlePause : handlePlay} color="primary">
                {playing && !paused ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Stop">
              <span>
                <IconButton onClick={handleStop} disabled={!playing}><StopIcon /></IconButton>
              </span>
            </Tooltip>

            {/* Speed */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 180 }}>
              <Typography variant="caption">Tempo</Typography>
              <Slider
                value={rate}
                min={0.5}
                max={2}
                step={0.1}
                onChange={(_, v) => setRate(v as number)}
                size="small"
                sx={{ width: 100 }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v as number).toFixed(1)}×`}
              />
            </Box>

            {/* Voice picker — show only if multiple voices */}
            {voices.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.85rem' }}
                >
                  {voices.map((v) => (
                    <MenuItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Tooltip title="Zamknij">
              <IconButton onClick={onClose}><CloseIcon /></IconButton>
            </Tooltip>
          </Box>

          {/* Text with highlighted current word */}
          <Box sx={{
            p: 2, maxHeight: '30vh', overflow: 'auto',
            fontSize: '1.05rem', lineHeight: 1.7,
            userSelect: 'text',
          }}>
            {plainText
              ? (
                <span>
                  {words.map((w, i) => {
                    // Render gap between previous word and this one (whitespace, newlines)
                    const prev = i === 0 ? 0 : words[i - 1].endChar;
                    const gap = plainText.slice(prev, w.startChar);
                    const isCurrent = currentWordIdx === i;
                    return (
                      <React.Fragment key={i}>
                        {gap.includes('\n')
                          ? gap.split('').map((c, ci) =>
                              c === '\n' ? <br key={`br-${i}-${ci}`} /> : <span key={`sp-${i}-${ci}`}>{c}</span>)
                          : gap}
                        <span
                          onClick={() => {
                            // Click a word → restart speech from that word.
                            // Browser speech APIs don't support real seek, so
                            // we splice the text from the chosen offset.
                            speechSynthesis.cancel();
                            const startText = plainText.slice(w.startChar);
                            const u = new SpeechSynthesisUtterance(startText);
                            u.rate = rate;
                            const voice = voices.find((v) => v.voiceURI === voiceURI);
                            if (voice) u.voice = voice;
                            u.lang = voice?.lang ?? 'pl-PL';
                            const offset = w.startChar;
                            u.onboundary = (ev) => {
                              if (ev.name && ev.name !== 'word') return;
                              const absChar = ev.charIndex + offset;
                              const idx = words.findIndex((ww) => absChar >= ww.startChar && absChar < ww.endChar);
                              if (idx >= 0) setCurrentWordIdx(idx);
                            };
                            u.onend = () => { setPlaying(false); setPaused(false); setCurrentWordIdx(null); };
                            speechSynthesis.speak(u);
                            setPlaying(true);
                            setPaused(false);
                          }}
                          style={{
                            cursor: 'pointer',
                            padding: isCurrent ? '2px 4px' : '0',
                            margin: isCurrent ? '0 -4px' : '0',
                            borderRadius: 4,
                            backgroundColor: isCurrent ? 'rgba(255, 235, 59, 0.65)' : 'transparent',
                            fontWeight: isCurrent ? 600 : 400,
                            transition: 'background-color 0.15s',
                          }}
                        >
                          {w.text}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </span>
              )
              : <Typography color="text.secondary">Brak tekstu do dyktowania — zaznacz fragment w edytorze lub anuluj.</Typography>
            }
          </Box>
        </Box>

        {/* ─── Bottom: hand-writing canvas ─────────────────────────────────── */}
        <Box sx={{
          position: 'relative', flex: 1, minHeight: 0,
          bgcolor: '#fafafa', overflow: 'hidden',
        }}>
          {/* Canvas toolbar (floating) */}
          <Box sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 0.5, p: 0.5,
            bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1,
          }}>
            <ToggleButtonGroup
              size="small"
              value={tool}
              exclusive
              onChange={(_, v) => v && setTool(v)}
            >
              <ToggleButton value="pen"><CreateIcon fontSize="small" /></ToggleButton>
              <ToggleButton value="pan"><AutoFixOffIcon fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
            {/* Small palette */}
            {['#1976d2', '#222', '#d32f2f', '#388e3c', '#f57c00'].map((c) => (
              <Box
                key={c}
                onClick={() => setStrokeColor(c)}
                sx={{
                  width: 22, height: 22, borderRadius: '50%', bgcolor: c,
                  cursor: 'pointer', border: strokeColor === c ? '2px solid #fff' : '2px solid transparent',
                  boxShadow: strokeColor === c ? '0 0 0 1px #000' : 'none',
                }}
              />
            ))}
            <Tooltip title="Cofnij"><IconButton size="small" onClick={handleUndo}><UndoIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Wyczyść"><IconButton size="small" onClick={handleClear}><DeleteSweepIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Wyśrodkuj widok"><IconButton size="small" onClick={handleResetView}><CenterFocusStrongIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          <Box sx={{
            position: 'absolute', bottom: 8, right: 8, zIndex: 2,
            bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1, px: 1, py: 0.25,
          }}>
            <Typography variant="caption" color="text.secondary">
              Zoom {(zoomRef.current * 100).toFixed(0)}% · stylus + 2-pal. zoom/pan · scroll = zoom
            </Typography>
          </Box>

          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onWheel={onCanvasWheel}
            style={{
              width: '100%', height: '100%', display: 'block',
              // touch-action: none → we own all gestures. Without this, the
              // browser steals two-finger drags for scroll/zoom and we never
              // see them.
              touchAction: 'none',
              cursor: tool === 'pen' ? 'crosshair' : 'grab',
            }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default DictationDialog;
