import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

export class RectTool implements Tool {
  name = 'rect' as const;
  private corner: Point2D | null = null;
  private current: Point2D | null = null;
  // Zablokowane (wpisane z klawiatury) wymiary — mysz steruje tylko niezablokowanym.
  private lockW: number | null = null;
  private lockH: number | null = null;

  /** The far corner, as the held width and height put it. */
  private effEnd(): Point2D | null {
    if (!this.corner || !this.current) return null;
    const signX = this.current.x >= this.corner.x ? 1 : -1;
    const signY = this.current.y >= this.corner.y ? 1 : -1;
    return {
      x: this.lockW != null ? this.corner.x + signX * this.lockW : this.current.x,
      y: this.lockH != null ? this.corner.y + signY * this.lockH : this.current.y,
    };
  }

  getPreview(): PreviewGeometry | null {
    const end = this.effEnd();
    if (!this.corner || !end) return null;
    return { type: 'rect', points: [this.corner, end] };
  }

  getDimensionLabels(): DimensionLabel[] {
    const end = this.effEnd();
    if (!this.corner || !end) return [];
    const w = Math.abs(end.x - this.corner.x);
    const h = Math.abs(end.y - this.corner.y);
    if (w < 0.01 || h < 0.01) return [];
    const x0 = Math.min(this.corner.x, end.x);
    const y0 = Math.min(this.corner.y, end.y);
    return [
      {
        id: 'width',
        worldX: x0 + w / 2, worldY: y0,
        text: `W: ${w.toFixed(2)}`,
        offsetY: 16,
        variant: 'primary',
        editable: true,
        onEdit: (newW: number) => { this.lockW = newW; }, // hold the width, do not commit yet
      },
      {
        id: 'height',
        worldX: x0 + w, worldY: y0 + h / 2,
        text: `H: ${h.toFixed(2)}`,
        offsetX: 8,
        variant: 'secondary',
        editable: true,
        onEdit: (newH: number) => { this.lockH = newH; }, // hold the height, do not commit yet
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.corner) {
      this.corner = point;
      this.current = point;
    } else {
      const end = this.effEnd() ?? point;
      this.commitRect(end, ctx);
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): void {
    if (key === 'Escape') this.reset();
  }

  commitDraft(ctx: ToolContext): boolean {
    const end = this.effEnd();
    if (!this.corner || !end) return false;
    this.commitRect(end, ctx);
    return true;
  }

  private commitRect(end: Point2D, ctx: ToolContext): void {
    if (!this.corner) return;
    const x = Math.min(this.corner.x, end.x);
    const y = Math.min(this.corner.y, end.y);
    const w = Math.abs(end.x - this.corner.x);
    const h = Math.abs(end.y - this.corner.y);
    if (w > 0 && h > 0) {
      ctx.project.addEntity({
        type: 'rect',
        layerId: ctx.project.layerSystem.getActiveId(),
        x, y, width: w, height: h,
        color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
        visible: true, locked: false, extrudeHeight: 0,
      });
    }
    this.reset();
  }

  reset(): void {
    this.corner = null;
    this.current = null;
    this.lockW = null;
    this.lockH = null;
  }
}
