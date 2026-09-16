import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

const ARC_SEGS = 24;

/**
 * A straight slot (FreeCAD-style) — a stadium shape: two centres and a radius.
 * First click: centre A. Second: centre B. Then the mouse sets the radius, which
 * is half the width. What is stored is a closed `polyline`: two lines and two
 * semicircles.
 */
export class SlotTool implements Tool {
  name = 'slot' as const;
  private a: Point2D | null = null;
  private b: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };
  private lockR: number | null = null;

  private effR(): number {
    if (this.lockR != null) return this.lockR;
    if (!this.a || !this.b) return 0;
    // The radius is the cursor's distance from the A–B axis.
    const dx = this.b.x - this.a.x,
      dy = this.b.y - this.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    return Math.abs((this.cursor.x - this.a.x) * nx + (this.cursor.y - this.a.y) * ny);
  }

  /** The stadium outline as a closed list of points. */
  private outline(r: number): Point2D[] {
    const a = this.a!,
      b = this.b!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len,
      uy = dy / len; // the axis
    const baseAngle = Math.atan2(uy, ux);
    const pts: Point2D[] = [];
    // The semicircle at B, from +90° to −90° relative to the axis
    for (let i = 0; i <= ARC_SEGS; i++) {
      const ang = baseAngle + Math.PI / 2 - (i / ARC_SEGS) * Math.PI;
      pts.push({ x: b.x + Math.cos(ang) * r, y: b.y + Math.sin(ang) * r });
    }
    // The semicircle at A, from −90° to −270° relative to the axis
    for (let i = 0; i <= ARC_SEGS; i++) {
      const ang = baseAngle - Math.PI / 2 - (i / ARC_SEGS) * Math.PI;
      pts.push({ x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r });
    }
    return pts;
  }

  getPreview(): PreviewGeometry | null {
    if (this.a && !this.b) return { type: 'line', points: [this.a, this.cursor] };
    if (this.a && this.b) {
      const r = this.effR();
      if (r < 0.01) return { type: 'line', points: [this.a, this.b] };
      const o = this.outline(r);
      return { type: 'polyline', points: [...o, o[0]] };
    }
    return null;
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.a || !this.b) return [];
    const r = this.effR();
    if (r < 0.01) return [];
    return [
      {
        id: 'radius',
        worldX: this.cursor.x,
        worldY: this.cursor.y,
        text: `R: ${r.toFixed(2)}`,
        offsetX: 22,
        offsetY: -12,
        variant: 'primary',
        editable: true,
        onEdit: (v: number) => {
          this.lockR = v;
        },
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.a) {
      this.a = point;
      this.cursor = point;
    } else if (!this.b) {
      this.b = point;
      this.cursor = point;
    } else {
      this.cursor = point;
      this.commit(ctx);
    }
  }

  commitDraft(ctx: ToolContext): boolean {
    if (!this.a || !this.b || this.effR() < 0.01) return false;
    this.commit(ctx);
    return true;
  }

  private commit(ctx: ToolContext): void {
    const r = this.effR();
    if (!this.a || !this.b || r < 0.01) {
      this.reset();
      return;
    }
    ctx.project.addEntity({
      type: 'polyline',
      points: this.outline(r),
      closed: true,
      construction: { kind: 'slot', ctrl: [{ ...this.a }, { ...this.b }], radius: r },
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
    });
    this.reset();
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.a = null;
    this.b = null;
    this.cursor = { x: 0, y: 0 };
    this.lockR = null;
  }
}
