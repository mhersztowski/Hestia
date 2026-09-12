import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type ArcState = 'idle' | 'center' | 'start';

/** Normalises an angle in degrees to (−180°, 180°]. */
function toDegNorm(rad: number): number {
  let d = (rad * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * The arc tool, in two phases:
 *  1. 'center', after the first click: the radius and the start angle, previewed
 *     as a full circle with a radius line.
 *  2. 'start', once those are committed: the end angle, previewed as the arc.
 * Zatwierdzenie fazy: klik, Enter lub przycisk ✓.
 */
export class ArcTool implements Tool {
  name = 'arc' as const;
  private state: ArcState = 'idle';
  private center: Point2D | null = null;
  private radius = 0;       // ustalony po fazie 'center'
  private startAngle = 0;   // ustalony po fazie 'center'
  private cursor: Point2D = { x: 0, y: 0 };
  private lockR: number | null = null;      // the typed radius ('center' phase)
  private lockStart: number | null = null;  // the typed start angle, rad ('center' phase)
  private lockEnd: number | null = null;    // the typed end angle, rad ('start' phase)

  /** The cursor's angle about the centre. */
  private cursorAngle(): number {
    if (!this.center) return 0;
    return Math.atan2(this.cursor.y - this.center.y, this.cursor.x - this.center.x);
  }

  /** The radius in the 'center' phase — the typed one, or the cursor's distance. */
  private effRadius(): number {
    if (this.lockR != null) return this.lockR;
    if (!this.center) return 0;
    return Math.hypot(this.cursor.x - this.center.x, this.cursor.y - this.center.y);
  }

  /** The start angle in the 'center' phase — the typed one, or the cursor's direction. */
  private effStart(): number {
    return this.lockStart != null ? this.lockStart : this.cursorAngle();
  }

  /** The end angle in the 'start' phase — the typed one, or the cursor's direction. */
  private effEnd(): number {
    return this.lockEnd != null ? this.lockEnd : this.cursorAngle();
  }

  private ptOnCircle(angle: number, r: number): Point2D {
    return { x: this.center!.x + Math.cos(angle) * r, y: this.center!.y + Math.sin(angle) * r };
  }

  /** A full circle as pairs of points, for the ghost preview. */
  private circleSegments(r: number): Array<{ a: Point2D; b: Point2D }> {
    const segs: Array<{ a: Point2D; b: Point2D }> = [];
    const N = 64;
    let prev = this.ptOnCircle(0, r);
    for (let i = 1; i <= N; i++) {
      const p = this.ptOnCircle((i / N) * Math.PI * 2, r);
      segs.push({ a: prev, b: p });
      prev = p;
    }
    return segs;
  }

  /** The arc from start to end (counter-clockwise) as pairs of points. */
  private arcSegments(sa: number, ea: number, r: number): Array<{ a: Point2D; b: Point2D }> {
    let sweep = ea - sa;
    if (sweep <= 0) sweep += Math.PI * 2;
    const N = Math.max(8, Math.ceil(sweep / (Math.PI / 32)));
    const segs: Array<{ a: Point2D; b: Point2D }> = [];
    let prev = this.ptOnCircle(sa, r);
    for (let i = 1; i <= N; i++) {
      const p = this.ptOnCircle(sa + (i / N) * sweep, r);
      segs.push({ a: prev, b: p });
      prev = p;
    }
    return segs;
  }

  getPreview(): PreviewGeometry | null {
    if (!this.center) return null;

    if (this.state === 'center') {
      // The full circle plus a radius line to the start point — as in FreeCAD.
      const r = this.effRadius();
      if (r < 0.01) return { type: 'ghost', points: [], ghostSegments: [] };
      const startPt = this.ptOnCircle(this.effStart(), r);
      return {
        type: 'ghost',
        points: [],
        ghostSegments: [...this.circleSegments(r), { a: this.center, b: startPt }],
      };
    }

    if (this.state === 'start') {
      // The arc from start to end, with both radius lines.
      const ea = this.effEnd();
      const startPt = this.ptOnCircle(this.startAngle, this.radius);
      const endPt = this.ptOnCircle(ea, this.radius);
      return {
        type: 'ghost',
        points: [],
        ghostSegments: [
          ...this.arcSegments(this.startAngle, ea, this.radius),
          { a: this.center, b: startPt },
          { a: this.center, b: endPt },
        ],
      };
    }

    return null;
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center) return [];

    if (this.state === 'center') {
      const r = this.effRadius();
      if (r < 0.01) return [];
      const startPt = this.ptOnCircle(this.effStart(), r);
      return [
        {
          id: 'radius',
          worldX: startPt.x, worldY: startPt.y, text: `${r.toFixed(2)}`,
          offsetX: 0, offsetY: 18, variant: 'primary',
          editable: true, onEdit: (v: number) => { this.lockR = v; },
        },
        {
          id: 'startAngle',
          worldX: startPt.x, worldY: startPt.y, text: `${toDegNorm(this.effStart()).toFixed(2)} °`,
          offsetX: 74, offsetY: -30, variant: 'secondary',
          editable: true, onEdit: (deg: number) => { this.lockStart = (deg * Math.PI) / 180; },
        },
      ];
    }

    if (this.state === 'start') {
      const ea = this.effEnd();
      const endPt = this.ptOnCircle(ea, this.radius);
      return [
        {
          id: 'endAngle',
          worldX: endPt.x, worldY: endPt.y, text: `${toDegNorm(ea).toFixed(2)} °`,
          offsetX: 40, offsetY: -8, variant: 'primary',
          editable: true, onEdit: (deg: number) => { this.lockEnd = (deg * Math.PI) / 180; },
        },
      ];
    }

    return [];
  }

  /** Commits the 'center' phase: fixes the radius and the start angle, then moves on to 'start'. */
  private confirmCenter(): boolean {
    const r = this.effRadius();
    if (r < 0.1) return false;
    this.radius = r;
    this.startAngle = this.effStart();
    this.lockR = null;
    this.lockStart = null;
    this.state = 'start';
    return true;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      this.center = point;
      this.cursor = point;
      this.state = 'center';
    } else if (this.state === 'center') {
      // A click commits the radius and the start angle, typed values included.
      this.cursor = point;
      this.confirmCenter();
    } else if (this.state === 'start') {
      this.cursor = point;
      this.commitArc(this.effEnd(), ctx);
    }
  }

  private commitArc(endAngle: number, ctx: ToolContext): void {
    if (!this.center) return;
    ctx.project.addEntity({
      type: 'arc',
      cx: this.center.x, cy: this.center.y,
      radius: this.radius, startAngle: this.startAngle, endAngle,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
  }

  /** Enter / ✓ — commits the current phase (center → start), or finishes the arc (start). */
  commitDraft(ctx: ToolContext): boolean {
    if (this.state === 'center') return this.confirmCenter();
    if (this.state === 'start' && this.center) { this.commitArc(this.effEnd(), ctx); return true; }
    return false;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.state = 'idle';
    this.center = null;
    this.radius = 0;
    this.startAngle = 0;
    this.cursor = { x: 0, y: 0 };
    this.lockR = null;
    this.lockStart = null;
    this.lockEnd = null;
  }
}
