import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

function dist(a: Point2D, b: Point2D) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export class CircleTool implements Tool {
  name = 'circle' as const;
  private center: Point2D | null = null;
  private current: Point2D | null = null;
  private lockR: number | null = null; // the typed radius

  private effRadius(): number {
    if (this.lockR != null) return this.lockR;
    return this.center && this.current ? dist(this.center, this.current) : 0;
  }

  getPreview(): PreviewGeometry | null {
    if (!this.center || !this.current) return null;
    return { type: 'circle', points: [this.center, this.current], radius: this.effRadius() };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center || !this.current) return [];
    const r = this.effRadius();
    if (r < 0.01) return [];
    const angle = Math.atan2(this.current.y - this.center.y, this.current.x - this.center.x);
    const midX = this.center.x + Math.cos(angle) * r * 0.6;
    const midY = this.center.y + Math.sin(angle) * r * 0.6;
    return [
      {
        id: 'radius',
        worldX: midX,
        worldY: midY,
        text: `R: ${r.toFixed(2)}`,
        offsetY: -14,
        variant: 'primary',
        editable: true,
        onEdit: (newR: number) => {
          this.lockR = newR;
        }, // hold the radius, do not commit yet
      },
    ];
  }

  private commitCircle(radius: number, ctx: ToolContext): void {
    if (!this.center || radius <= 0) {
      this.reset();
      return;
    }
    ctx.project.addEntity({
      type: 'circle',
      layerId: ctx.project.layerSystem.getActiveId(),
      cx: this.center.x,
      cy: this.center.y,
      radius,
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
    });
    this.reset();
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.center) {
      this.center = point;
      this.current = point;
    } else {
      this.commitCircle(this.lockR ?? dist(this.center, point), ctx);
    }
  }

  commitDraft(ctx: ToolContext): boolean {
    if (!this.center) return false;
    const r = this.effRadius();
    if (r <= 0) return false;
    this.commitCircle(r, ctx);
    return true;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.center = null;
    this.current = null;
    this.lockR = null;
  }
}
