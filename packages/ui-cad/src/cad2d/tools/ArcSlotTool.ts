import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

const SEG = 28;
const TWO_PI = Math.PI * 2;
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

type State = 'idle' | 'center' | 'start' | 'width';

/**
 * An arc slot (FreeCAD-style) — a slot that follows an arc.
 * First click: centre C. Second: the start, which sets the axis radius and the
 * opening angle. Third: the end angle. Then the mouse (or Enter) sets the width,
 * which is the radius of the rounded ends. What is stored is a closed `polyline`.
 */
export class ArcSlotTool implements Tool {
  name = 'arcSlot' as const;
  private state: State = 'idle';
  private center: Point2D | null = null;
  private rc = 0;         // the radius of the arc's axis
  private a1 = 0;         // the start angle
  private a2 = 0;         // the end angle
  private cursor: Point2D = { x: 0, y: 0 };
  private lockW: number | null = null;

  private ang(): number {
    if (!this.center) return 0;
    return Math.atan2(this.cursor.y - this.center.y, this.cursor.x - this.center.x);
  }

  private effWidth(): number {
    if (this.lockW != null) return Math.min(this.lockW, this.rc * 0.98);
    if (!this.center) return 0;
    const d = Math.hypot(this.cursor.x - this.center.x, this.cursor.y - this.center.y);
    return Math.min(Math.abs(d - this.rc), this.rc * 0.98);
  }

  private pt(angle: number, r: number): Point2D {
    return { x: this.center!.x + Math.cos(angle) * r, y: this.center!.y + Math.sin(angle) * r };
  }

  private arcPts(from: number, sweep: number, r: number): Point2D[] {
    const n = Math.max(SEG, Math.ceil((Math.abs(sweep) / TWO_PI) * SEG * 4));
    const out: Point2D[] = [];
    for (let i = 0; i <= n; i++) out.push(this.pt(from + (i / n) * sweep, r));
    return out;
  }

  /** The closed outline of an arc slot. */
  private outline(w: number): Point2D[] {
    const sweep = norm(this.a2 - this.a1) || 0.0001;
    const rOut = this.rc + w, rIn = Math.max(0.001, this.rc - w);
    const pts: Point2D[] = [];
    // 1. The outer arc, a1 → a2
    pts.push(...this.arcPts(this.a1, sweep, rOut));
    // 2. The rounded end, centred on the axis at a2
    const eC = this.pt(this.a2, this.rc);
    for (let i = 0; i <= SEG; i++) {
      const ang = this.a2 + (i / SEG) * Math.PI;
      pts.push({ x: eC.x + Math.cos(ang) * w, y: eC.y + Math.sin(ang) * w });
    }
    // 3. The inner arc, a2 → a1
    pts.push(...this.arcPts(this.a2, -sweep, rIn));
    // 4. The rounded start, centred on the axis at a1
    const sC = this.pt(this.a1, this.rc);
    for (let i = 0; i <= SEG; i++) {
      const ang = this.a1 + Math.PI + (i / SEG) * Math.PI;
      pts.push({ x: sC.x + Math.cos(ang) * w, y: sC.y + Math.sin(ang) * w });
    }
    return pts;
  }

  getPreview(): PreviewGeometry | null {
    if (!this.center) return null;
    if (this.state === 'center') return { type: 'line', points: [this.center, this.cursor] };
    if (this.state === 'start') {
      const sweep = norm(this.ang() - this.a1) || 0.0001;
      return { type: 'arc', points: [this.center], radius: this.rc, startAngle: this.a1, endAngle: this.a1 + sweep };
    }
    if (this.state === 'width') {
      const w = this.effWidth();
      if (w < 0.01) return { type: 'arc', points: [this.center], radius: this.rc, startAngle: this.a1, endAngle: this.a2 };
      const o = this.outline(w);
      return { type: 'polyline', points: [...o, o[0]] };
    }
    return null;
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.state !== 'width' || !this.center) return [];
    const w = this.effWidth();
    if (w < 0.01) return [];
    return [{
      id: 'width', worldX: this.cursor.x, worldY: this.cursor.y, text: `W: ${w.toFixed(2)}`,
      offsetX: 22, offsetY: -12, variant: 'primary',
      editable: true, onEdit: (v: number) => { this.lockW = v; },
    }];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    this.cursor = point;
    if (this.state === 'idle') { this.center = point; this.state = 'center'; }
    else if (this.state === 'center') {
      this.rc = Math.hypot(point.x - this.center!.x, point.y - this.center!.y);
      if (this.rc < 0.1) { this.center = null; this.state = 'idle'; return; }
      this.a1 = this.ang(); this.state = 'start';
    } else if (this.state === 'start') {
      this.a2 = this.ang(); this.state = 'width';
    } else if (this.state === 'width') {
      this.commit(ctx);
    }
  }

  commitDraft(ctx: ToolContext): boolean {
    if (this.state === 'start') { this.a2 = this.ang(); this.state = 'width'; return true; }
    if (this.state === 'width' && this.effWidth() >= 0.01) { this.commit(ctx); return true; }
    return false;
  }

  private commit(ctx: ToolContext): void {
    const w = this.effWidth();
    if (!this.center || w < 0.01) { this.reset(); return; }
    const sPt = this.pt(this.a1, this.rc), ePt = this.pt(this.a2, this.rc);
    ctx.project.addEntity({
      type: 'polyline', points: this.outline(w), closed: true,
      construction: { kind: 'arcSlot', ctrl: [{ ...this.center }, sPt, ePt], radius: w },
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void { this.cursor = point; }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void { if (key === 'Escape') this.reset(); }

  reset(): void {
    this.state = 'idle'; this.center = null; this.rc = 0; this.a1 = 0; this.a2 = 0;
    this.cursor = { x: 0, y: 0 }; this.lockW = null;
  }
}
