/** Notes data model + canvas page renderer (read-only port from cad-app).
 *  Renders strokes, text, images, shapes (rect/diamond/circle/line/arrow) and
 *  honours group rotation. Roughness/hatch styling is flattened to smooth/solid. */

export interface NotePoint { x: number; y: number; p: number }
export type ShapeKind = 'rect' | 'diamond' | 'circle' | 'line' | 'arrow';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowHeads = 'none' | 'end' | 'start' | 'both';

export interface NoteStroke {
  id: string; kind: 'stroke'; tool: 'pencil' | 'marker';
  color: string; width: number; points: NotePoint[]; opacity?: number; groupId?: string;
}
export interface NoteText {
  id: string; kind: 'text'; x: number; y: number; text: string; fontSize: number; color: string;
  align?: 'left' | 'center' | 'right'; rotation?: number; opacity?: number; groupId?: string;
}
export interface NoteImage {
  id: string; kind: 'image'; x: number; y: number; w: number; h: number; src: string;
  rotation?: number; opacity?: number; rounded?: boolean; groupId?: string;
}
export interface NoteShape {
  id: string; kind: 'shape'; shape: ShapeKind;
  x1: number; y1: number; x2: number; y2: number;
  color: string; width: number;
  opacity?: number; fill?: string; fillColor?: string; strokeStyle?: StrokeStyle;
  rounded?: boolean; arrowHeads?: ArrowHeads; points?: { x: number; y: number }[];
  rotation?: number; groupId?: string;
}
export interface NoteGroup {
  id: string; kind: 'group'; name?: string; cx?: number; cy?: number; rotation?: number;
}
export type NoteElement = NoteStroke | NoteText | NoteImage | NoteShape | NoteGroup;
export interface NotePage { id: string; elements: NoteElement[]; bgColor?: string }

export const CANVAS_W = 1400;
export const CANVAS_H = 900;
export const DEFAULT_BG = '#1a1a1a';
const TRANSPARENT = 'transparent';
const LINEAR = new Set<ShapeKind>(['line', 'arrow']);

function dashFor(style: StrokeStyle | undefined, lw: number): number[] {
  if (style === 'dashed') return [lw * 3, lw * 2];
  if (style === 'dotted') return [lw * 0.1, lw * 1.8];
  return [];
}

function shapePoints(s: NoteShape): { x: number; y: number }[] {
  return s.points && s.points.length >= 2 ? s.points : [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, tip: { x: number; y: number }, len: number) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const a = Math.PI / 7;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - len * Math.cos(ang + s * a), tip.y - len * Math.sin(ang + s * a));
    ctx.stroke();
  }
}

function renderShape(ctx: CanvasRenderingContext2D, s: NoteShape): void {
  const x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const alpha = s.opacity != null ? s.opacity : 1;
  const lw = Math.max(0.5, s.width);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (LINEAR.has(s.shape)) {
    // line / arrow — polyline through points, optional heads.
    const pts = shapePoints(s);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lw;
    ctx.setLineDash(dashFor(s.strokeStyle, lw));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.shape === 'arrow') {
      const heads = s.arrowHeads ?? 'end';
      const headLen = Math.max(10, lw * 3);
      if (heads === 'end' || heads === 'both') drawArrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], headLen);
      if (heads === 'start' || heads === 'both') drawArrowHead(ctx, pts[1], pts[0], headLen);
    }
    ctx.restore();
    return;
  }

  // Rotation around bbox centre for closed shapes.
  if (s.rotation) {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.translate(cx, cy); ctx.rotate(s.rotation); ctx.translate(-cx, -cy);
  }
  const path = new Path2D();
  if (s.shape === 'rect') {
    const r = s.rounded ? Math.min(w, h) * 0.18 : 0;
    if (r > 0 && typeof (path as Path2D & { roundRect?: unknown }).roundRect === 'function') {
      (path as Path2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, r);
    } else path.rect(x, y, w, h);
  } else if (s.shape === 'circle') {
    path.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
  } else if (s.shape === 'diamond') {
    path.moveTo(x + w / 2, y); path.lineTo(x + w, y + h / 2);
    path.lineTo(x + w / 2, y + h); path.lineTo(x, y + h / 2); path.closePath();
  }
  const fillCol = s.fillColor ?? s.color;
  if (s.fill && s.fill !== 'none' && fillCol !== TRANSPARENT) {
    ctx.fillStyle = fillCol;
    ctx.fill(path);
  }
  if (s.color !== TRANSPARENT) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lw;
    ctx.setLineDash(dashFor(s.strokeStyle, lw));
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: NotePage,
  imgCache: Map<string, HTMLImageElement>,
  onImgLoad: () => void,
): void {
  ctx.fillStyle = page.bgColor ?? DEFAULT_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Group transforms (rotation around group centre) applied to member elements.
  const groups = new Map<string, NoteGroup>();
  for (const el of page.elements) if (el.kind === 'group') groups.set(el.id, el);

  for (const el of page.elements) {
    if (el.kind === 'group') continue; // container only

    ctx.save();
    const g = el.groupId ? groups.get(el.groupId) : undefined;
    if (g && g.rotation && g.cx != null && g.cy != null) {
      ctx.translate(g.cx, g.cy); ctx.rotate(g.rotation); ctx.translate(-g.cx, -g.cy);
    }

    if (el.kind === 'image') {
      let img = imgCache.get(el.src);
      if (!img) {
        img = new Image();
        img.onload = onImgLoad;
        img.src = el.src;
        imgCache.set(el.src, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.globalAlpha = el.opacity != null ? el.opacity : 1;
        if (el.rotation) { const cx = el.x + el.w / 2, cy = el.y + el.h / 2; ctx.translate(cx, cy); ctx.rotate(el.rotation); ctx.translate(-cx, -cy); }
        ctx.drawImage(img, el.x, el.y, el.w, el.h);
      }
    } else if (el.kind === 'text') {
      ctx.globalAlpha = el.opacity != null ? el.opacity : 1;
      if (el.rotation) { ctx.translate(el.x, el.y); ctx.rotate(el.rotation); ctx.translate(-el.x, -el.y); }
      ctx.font = `${el.fontSize}px sans-serif`;
      ctx.fillStyle = el.color;
      ctx.textAlign = (el.align as CanvasTextAlign) || 'left';
      const lines = String(el.text).split('\n');
      lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.fontSize * 1.2));
      ctx.textAlign = 'left';
    } else if (el.kind === 'shape') {
      renderShape(ctx, el);
    } else {
      // stroke
      const pts = el.points;
      if (pts.length >= 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (el.tool === 'marker') {
          ctx.globalAlpha = (el.opacity != null ? el.opacity : 1) * 0.4;
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.width;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        } else {
          ctx.globalAlpha = el.opacity != null ? el.opacity : 1;
          ctx.strokeStyle = el.color;
          for (let i = 1; i < pts.length; i++) {
            const pr = pts[i].p || 0.5;
            ctx.lineWidth = Math.max(0.5, el.width * pr * 2);
            ctx.beginPath();
            ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
            ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }
}
