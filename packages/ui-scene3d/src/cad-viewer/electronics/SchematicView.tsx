import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID, rotationOffset, type ElectronicsSchema, type PartDef, type SymShape } from './types';
import { getPartDef, registerEmbeddedPart } from './partLibrary';

// ── component body renderer (ported read-only from BreadboardCanvas) ────────────

/** Rysuje prymityw osadzonego symbolu (współrzędne w komórkach → px). */
function renderSymShape(s: SymShape, i: number) {
  const p = (v: number) => v * GRID;
  const sw = (v: number | undefined) => Math.max(1, (v || 0.08) * GRID);
  if (s.k === 'poly') {
    const pts = s.pts.map((q) => `${p(q.x)},${p(q.y)}`).join(' ');
    return s.closed
      ? <polygon key={i} points={pts} fill={s.fill || 'none'} stroke={s.color || '#333'} strokeWidth={sw(s.width)} strokeLinejoin="round" strokeLinecap="round" />
      : <polyline key={i} points={pts} fill={s.fill || 'none'} stroke={s.color || '#333'} strokeWidth={sw(s.width)} strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (s.k === 'lead') {
    const pts = s.pts.map((q) => `${p(q.x)},${p(q.y)}`).join(' ');
    return <polyline key={i} points={pts} fill="none" stroke={s.color || '#4fc3f7'} strokeWidth={1.4} strokeDasharray="3 2" strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (s.k === 'rect') return <rect key={i} x={p(s.x)} y={p(s.y)} width={p(s.w)} height={p(s.h)} fill={s.fill || 'none'} stroke={s.color || '#333'} strokeWidth={sw(s.width)} />;
  if (s.k === 'ellipse') return <ellipse key={i} cx={p(s.cx)} cy={p(s.cy)} rx={p(s.rx)} ry={p(s.ry)} fill={s.fill || 'none'} stroke={s.color || '#333'} strokeWidth={sw(s.width)} />;
  if (s.k === 'text') return <text key={i} x={p(s.x)} y={p(s.y)} fontSize={p(s.size)} fill={s.color || '#1c4fd6'} textAnchor={s.anchor || 'start'} fontFamily="sans-serif">{s.text}</text>;
  return null;
}

function PartBody({ part, w, h }: { part: PartDef; w: number; h: number }) {
  const px = (v: number) => v * GRID;
  const strokeColor = '#555';
  const strokeWidth = 1;

  // Osadzony symbol schematyczny — jego własna geometria.
  if (part.bodyShape === 'symbol' && part.symbolShapes) {
    return <g>{part.symbolShapes.map((s, i) => renderSymShape(s, i))}</g>;
  }

  if (part.bodyShape === 'breadboard') {
    const cols = 63, railH = 2, mainH = 5, gapH = 1;
    const oX = 1, oTop = 0, oMain = 3, oBot = oMain + mainH + gapH + mainH + gapH;
    return (
      <g>
        <rect x={0} y={0} width={px(w)} height={px(h)} rx={4} fill="#e8e0d0" stroke={strokeColor} strokeWidth={strokeWidth} />
        <rect x={px(oX)} y={px(oTop)} width={px(cols)} height={px(railH)} rx={2} fill="#fce4e4" stroke="#e57373" strokeWidth={0.5} />
        <line x1={px(oX)} y1={px(oTop + 0.5)} x2={px(oX + cols)} y2={px(oTop + 0.5)} stroke="#e53935" strokeWidth={1} opacity={0.6} />
        <line x1={px(oX)} y1={px(oTop + 1.5)} x2={px(oX + cols)} y2={px(oTop + 1.5)} stroke="#1565c0" strokeWidth={1} opacity={0.6} />
        <rect x={px(oX)} y={px(oBot)} width={px(cols)} height={px(railH)} rx={2} fill="#fce4e4" stroke="#e57373" strokeWidth={0.5} />
        <line x1={px(oX)} y1={px(oBot + 0.5)} x2={px(oX + cols)} y2={px(oBot + 0.5)} stroke="#e53935" strokeWidth={1} opacity={0.6} />
        <line x1={px(oX)} y1={px(oBot + 1.5)} x2={px(oX + cols)} y2={px(oBot + 1.5)} stroke="#1565c0" strokeWidth={1} opacity={0.6} />
        <rect x={px(oX)} y={px(oMain)} width={px(cols)} height={px(mainH)} rx={1} fill="#ede8da" stroke="#bbb" strokeWidth={0.5} />
        <rect x={px(oX)} y={px(oMain + mainH + gapH)} width={px(cols)} height={px(mainH)} rx={1} fill="#ede8da" stroke="#bbb" strokeWidth={0.5} />
        <defs>
          <pattern id="holes" x={px(oX)} y={px(oTop)} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={GRID / 2} cy={GRID / 2} r={3} fill="#bbb" />
            <circle cx={GRID / 2} cy={GRID / 2} r={1.5} fill="#888" />
          </pattern>
        </defs>
        <rect x={px(oX)} y={px(oTop)} width={px(cols)} height={px(railH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oMain)} width={px(cols)} height={px(mainH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oMain + mainH + gapH)} width={px(cols)} height={px(mainH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oBot)} width={px(cols)} height={px(railH)} fill="url(#holes)" opacity={0.7} />
        {['a', 'b', 'c', 'd', 'e'].map((l, i) => (
          <text key={l} x={px(oX) - 6} y={px(oMain + i) + GRID / 2 + 4} textAnchor="middle" fontSize={9} fill="#888">{l}</text>
        ))}
        {['f', 'g', 'h', 'i', 'j'].map((l, i) => (
          <text key={l} x={px(oX) - 6} y={px(oMain + mainH + gapH + i) + GRID / 2 + 4} textAnchor="middle" fontSize={9} fill="#888">{l}</text>
        ))}
      </g>
    );
  }

  if (part.bodyShape === 'dip') {
    const bodyX = px(0.5), bodyW = px(w) - px(1);
    return (
      <g>
        <rect x={bodyX} y={0} width={bodyW} height={px(h)} rx={3} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        <ellipse cx={bodyX + bodyW / 2} cy={0} rx={px(0.4)} ry={px(0.2)} fill="#111" />
        {part.pins.filter(p => p.x === 0).map(p => (
          <rect key={p.id} x={0} y={px(p.y) + GRID / 2 - 3} width={px(0.5)} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {part.pins.filter(p => p.x === w - 1).map(p => (
          <rect key={p.id} x={bodyX + bodyW} y={px(p.y) + GRID / 2 - 3} width={px(0.5)} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {part.label && (
          <text x={px(w) / 2} y={px(h) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontFamily="monospace" fill="white" style={{ whiteSpace: 'pre' }}>
            {part.label.split('\n').map((line, i, arr) => (
              <tspan key={i} x={px(w) / 2} dy={i === 0 ? -(arr.length - 1) * 6 : 12}>{line}</tspan>
            ))}
          </text>
        )}
      </g>
    );
  }

  if (part.bodyShape === 'resistor') {
    const leads = 1.5 * GRID;
    const bodyX = leads, bodyW = px(w) - leads * 2;
    return (
      <g>
        <line x1={GRID / 2} y1={GRID / 2} x2={leads} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads + bodyW} y1={GRID / 2} x2={px(w) - GRID / 2} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <rect x={bodyX} y={GRID / 2 - 6} width={bodyW} height={12} rx={4} fill={part.bodyColor} stroke="#8d6e63" strokeWidth={1} />
        <rect x={bodyX + 8} y={GRID / 2 - 6} width={4} height={12} fill="#333" opacity={0.8} />
        <rect x={bodyX + 14} y={GRID / 2 - 6} width={4} height={12} fill="#e53935" opacity={0.8} />
        <rect x={bodyX + 20} y={GRID / 2 - 6} width={4} height={12} fill="#e53935" opacity={0.8} />
        <rect x={bodyX + bodyW - 10} y={GRID / 2 - 6} width={4} height={12} fill="#ffd600" opacity={0.8} />
      </g>
    );
  }

  if (part.bodyShape === 'led') {
    const leads = 1 * GRID;
    const domeR = 10, bodyX = leads;
    const color = part.indicatorColor ?? part.bodyColor;
    return (
      <g>
        <line x1={GRID / 2} y1={GRID / 2} x2={leads} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads + domeR * 1.5} y1={GRID / 2} x2={px(w) - GRID / 2} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <polygon points={`${bodyX},${GRID / 2 - 10} ${bodyX},${GRID / 2 + 10} ${bodyX + domeR},${GRID / 2}`} fill={color} stroke={part.bodyColor} strokeWidth={1} />
        <circle cx={bodyX + domeR} cy={GRID / 2} r={domeR} fill={color} stroke={part.bodyColor} strokeWidth={1} />
        <ellipse cx={bodyX + domeR - 3} cy={GRID / 2 - 4} rx={3} ry={5} fill="white" opacity={0.35} />
      </g>
    );
  }

  if (part.bodyShape === 'button') {
    return (
      <g>
        <rect x={px(0.5)} y={px(0.5)} width={px(w) - px(1)} height={px(h) - px(1)} rx={2} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        {part.pins.map(p => (
          <rect key={p.id} x={px(p.x) + GRID / 2 - 3} y={px(p.y) + GRID / 2 - 3} width={6} height={6} rx={1} fill="#c0c0c0" />
        ))}
        <circle cx={px(w) / 2} cy={px(h) / 2} r={GRID * 0.4} fill="#78909c" stroke="#546e7a" strokeWidth={1} />
        <circle cx={px(w) / 2} cy={px(h) / 2} r={GRID * 0.28} fill="#90a4ae" />
      </g>
    );
  }

  if (part.bodyShape === 'capacitor') {
    const leads = 1 * GRID;
    const bodyX = leads, bodyW = GRID * 1.2;
    return (
      <g>
        <line x1={GRID / 2} y1={GRID / 2} x2={leads} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads + bodyW} y1={GRID / 2} x2={px(w) - GRID / 2} y2={GRID / 2} stroke="#bbb" strokeWidth={2} />
        <rect x={bodyX} y={GRID / 2 - 9} width={bodyW} height={18} rx={3} fill={part.bodyColor} stroke="#f57f17" strokeWidth={1} />
      </g>
    );
  }

  if (part.bodyShape === 'transistor') {
    const bodyR = GRID * 0.7;
    const cx = px(w) / 2, cy = GRID * 0.5;
    return (
      <g>
        <path d={`M ${cx} ${cy - bodyR} A ${bodyR} ${bodyR} 0 1 1 ${cx} ${cy + bodyR} L ${cx} ${cy - bodyR} Z`} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        <line x1={cx} y1={cy - bodyR} x2={cx} y2={cy + bodyR} stroke={strokeColor} strokeWidth={strokeWidth} />
        {part.pins.map(p => (
          <line key={p.id} x1={px(p.x) + GRID / 2} y1={px(p.y) + GRID / 2} x2={px(p.x) + GRID / 2} y2={cy + bodyR} stroke="#bbb" strokeWidth={2} />
        ))}
        <text x={cx - 4} y={cy + 4} fontSize={7} fontFamily="monospace" fill="white">{part.label}</text>
      </g>
    );
  }

  if (part.bodyShape === 'buzzer') {
    const cx = px(w) / 2;
    const bodyAreaH = px(h - 1);
    const cy = bodyAreaH / 2;
    const bodyR = Math.min(px(w), bodyAreaH) / 2 - 2;
    return (
      <g>
        <circle cx={cx} cy={cy} r={bodyR} fill={part.bodyColor} stroke="#212121" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={bodyR - 3} fill="none" stroke="#616161" strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={2.5} fill="#212121" />
        <text x={cx + bodyR * 0.55} y={cy - bodyR * 0.45} fontSize={8} fontFamily="monospace" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">+</text>
        {part.pins.map(p => {
          const lx = px(p.x) + GRID / 2;
          const ly = px(p.y) + GRID / 2;
          const dx = lx - cx;
          const inside = dx * dx <= bodyR * bodyR;
          const y0 = inside ? cy + Math.sqrt(bodyR * bodyR - dx * dx) : cy + bodyR;
          return <line key={p.id} x1={lx} y1={y0} x2={lx} y2={ly} stroke="#bbb" strokeWidth={2} />;
        })}
      </g>
    );
  }

  if (part.bodyShape === 'joystick') {
    const cx = px(w) / 2;
    const stickR = Math.min(px(w), px(h - 1)) / 2 - 6;
    const cy = stickR + 6;
    return (
      <g>
        <rect x={2} y={2} width={px(w) - 4} height={px(h) - 4} rx={3} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        <circle cx={cx} cy={cy} r={stickR} fill="#37474f" stroke="#000" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={stickR * 0.78} fill="#455a64" stroke="#263238" strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={stickR * 0.55} fill="#212121" stroke="#000" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={stickR * 0.45} fill="#37474f" />
        <line x1={cx - stickR * 0.32} y1={cy} x2={cx + stickR * 0.32} y2={cy} stroke="#90a4ae" strokeWidth={0.6} opacity={0.7} />
        <line x1={cx} y1={cy - stickR * 0.32} x2={cx} y2={cy + stickR * 0.32} stroke="#90a4ae" strokeWidth={0.6} opacity={0.7} />
        {part.pins.filter(p => p.y === h - 1).map(p => (
          <rect key={p.id} x={px(p.x) + GRID / 2 - 3} y={px(h) - 6} width={6} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {part.label && (
          <text x={cx} y={px(h - 1) - 4} textAnchor="middle" dominantBaseline="alphabetic" fontSize={8} fontFamily="monospace" fill="white" opacity={0.85}>{part.label}</text>
        )}
      </g>
    );
  }

  // Generic IC fallback
  return (
    <g>
      <rect x={2} y={2} width={px(w) - 4} height={px(h) - 4} rx={3} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
      {part.pins.filter(p => p.x === 0).map(p => (
        <line key={p.id} x1={0} y1={px(p.y) + GRID / 2} x2={2} y2={px(p.y) + GRID / 2} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {part.pins.filter(p => p.x === w - 1 || p.x === w).map(p => (
        <line key={p.id} x1={px(w) - 2} y1={px(p.y) + GRID / 2} x2={px(w)} y2={px(p.y) + GRID / 2} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {part.pins.filter(p => (p.y === h - 1 || p.y === h) && p.x !== 0 && p.x !== w - 1 && p.x !== w).map(p => (
        <line key={p.id} x1={px(p.x) + GRID / 2} y1={px(h) - 2} x2={px(p.x) + GRID / 2} y2={px(h)} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {part.pins.filter(p => p.x !== 0 && p.x !== w - 1 && p.x !== w && p.y !== 0 && p.y !== h - 1 && p.y !== h).map(p => (
        <rect key={p.id} x={px(p.x) + GRID / 2 - 3} y={px(p.y) + GRID / 2 - 3} width={6} height={6} rx={1} fill="#c0c0c0" />
      ))}
      {part.label && (
        <text x={px(w) / 2} y={px(h) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontFamily="monospace" fill="white">
          {part.label.split('\n').map((line, i, arr) => (
            <tspan key={i} x={px(w) / 2} dy={i === 0 ? -(arr.length - 1) * 6 : 12}>{line}</tspan>
          ))}
        </text>
      )}
    </g>
  );
}

function PinLabels({ part }: { part: PartDef }) {
  const LABEL_INSET = 12;
  const w = part.width, h = part.height;
  return (
    <>
      {part.pins.filter(p => p.label).map(p => {
        const cx = p.x * GRID + GRID / 2;
        const cy = p.y * GRID + GRID / 2;
        let ox = 0, oy = 0;
        if (p.x <= 0) ox = LABEL_INSET;
        else if (p.x >= w - 1) ox = -LABEL_INSET;
        else if (p.y <= 0) oy = LABEL_INSET;
        else if (p.y >= h - 1) oy = -LABEL_INSET;
        return (
          <text key={p.id} x={cx + ox} y={cy + oy} textAnchor="middle" dominantBaseline="middle" fontSize={7}
            fontFamily="monospace" fill="#4fc3f7" stroke="#1a1a1a" strokeWidth={2.5} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{p.label}</text>
        );
      })}
    </>
  );
}

function ComponentLabel({ part, text, rotation }: { part: PartDef; text: string; rotation: number }) {
  const cx = (part.width * GRID) / 2;
  const cy = -6;
  return (
    <text x={cx} y={cy} transform={`rotate(${-rotation} ${cx} ${cy})`} textAnchor="middle" dominantBaseline="alphabetic"
      fontSize={10} fontFamily="monospace" fontWeight={600} fill="#fff" stroke="#1a1a1a" strokeWidth={3} paintOrder="stroke"
      style={{ pointerEvents: 'none', userSelect: 'none' }}>{text}</text>
  );
}

// ── read-only schematic view (pan / zoom only) ──────────────────────────────────

function contentBoundsPx(schema: ElectronicsSchema) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const c of schema.components ?? []) {
    const part = getPartDef(c.partId);
    if (!part) continue;
    any = true;
    const ext = Math.max(part.width, part.height);
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + ext); maxY = Math.max(maxY, c.y + ext);
  }
  for (const wire of schema.wires ?? []) {
    for (const p of wire.points) {
      any = true;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }
  if (!any) return null;
  return { minX: minX * GRID, minY: minY * GRID, maxX: maxX * GRID, maxY: maxY * GRID };
}

export function SchematicView({ schema }: { schema: ElectronicsSchema }) {
  // Rejestruj osadzone symbole zanim getPartDef zostanie użyte w tym renderze.
  useMemo(() => { (schema.embeddedParts ?? []).forEach(registerEmbeddedPart); }, [schema]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const fittedRef = useRef(false);

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit to content once we know the size.
  useEffect(() => {
    if (fittedRef.current || size.w === 0) return;
    const b = contentBoundsPx(schema);
    if (!b) return;
    const cw = b.maxX - b.minX || 1;
    const ch = b.maxY - b.minY || 1;
    const z = Math.min(size.w / (cw + 80), size.h / (ch + 80), 3);
    const fz = Math.max(0.2, z);
    setZoom(fz);
    setPan({
      x: (size.w - cw * fz) / 2 - b.minX * fz,
      y: (size.h - ch * fz) / 2 - b.minY * fz,
    });
    fittedRef.current = true;
  }, [schema, size]);

  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nz = Math.max(0.2, Math.min(6, zoom * factor));
    // keep the point under the cursor stable
    setPan({ x: lx - (lx - pan.x) * (nz / zoom), y: ly - (ly - pan.y) * (nz / zoom) });
    setZoom(nz);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchRef.current = { dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1, zoom };
      dragRef.current = null;
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      setZoom(Math.max(0.2, Math.min(6, pinchRef.current.zoom * (dist / pinchRef.current.dist))));
      return;
    }
    const dr = dragRef.current;
    if (!dr) return;
    setPan({ x: dr.panX + (e.clientX - dr.x), y: dr.panY + (e.clientY - dr.y) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };

  const step = GRID * zoom;
  const transformStr = `translate(${pan.x},${pan.y}) scale(${zoom})`;

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', background: '#1a1a1a' }}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={e => e.preventDefault()}
      >
        <defs>
          <pattern id="dotgrid" x={pan.x % step} y={pan.y % step} width={step} height={step} patternUnits="userSpaceOnUse">
            <circle cx={step / 2} cy={step / 2} r={Math.max(0.5, zoom * 1.2)} fill="#333" />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="#1a1a1a" />
        <rect width={size.w} height={size.h} fill="url(#dotgrid)" />

        <g transform={transformStr}>
          {(schema.components ?? []).map(comp => {
            const part = getPartDef(comp.partId);
            if (!part) return null;
            const off = rotationOffset(part.width, part.height, comp.rotation);
            return (
              <g key={comp.id} transform={`translate(${(comp.x + off.x) * GRID},${(comp.y + off.y) * GRID}) rotate(${comp.rotation})`}>
                <PartBody part={part} w={part.width} h={part.height} />
                {comp.showPinLabels && <PinLabels part={part} />}
                {comp.userLabel && <ComponentLabel part={part} text={comp.userLabel} rotation={comp.rotation} />}
              </g>
            );
          })}
          {(schema.wires ?? []).map(wire => {
            const pts = wire.points.map(p => `${p.x * GRID},${p.y * GRID}`).join(' ');
            return (
              <polyline key={wire.id} points={pts} stroke={wire.color} strokeWidth={3} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
