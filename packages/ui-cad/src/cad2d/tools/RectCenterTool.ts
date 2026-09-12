import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

/**
 * A centred rectangle (FreeCAD-style) — a centre and a corner.
 * First click: the centre. Second click (or Enter): the corner. The width and
 * height can be typed instead, as full sizes rather than halves.
 */
export class RectCenterTool implements Tool {
  name = 'rectCenter' as const;
  private center: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };
  private lockW: number | null = null; // the full width
  private lockH: number | null = null; // the full height

  /** Half the sizes — from the mouse, or from what was typed. */
  private half(): { hw: number; hh: number } {
    if (!this.center) return { hw: 0, hh: 0 };
    const hw = this.lockW != null ? this.lockW / 2 : Math.abs(this.cursor.x - this.center.x);
    const hh = this.lockH != null ? this.lockH / 2 : Math.abs(this.cursor.y - this.center.y);
    return { hw, hh };
  }

  getPreview(): PreviewGeometry | null {
    if (!this.center) return null;
    const { hw, hh } = this.half();
    if (hw < 0.005 || hh < 0.005) return null;
    const c = this.center;
    return { type: 'rect', points: [{ x: c.x - hw, y: c.y - hh }, { x: c.x + hw, y: c.y + hh }] };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center) return [];
    const { hw, hh } = this.half();
    if (hw < 0.005 || hh < 0.005) return [];
    const c = this.center;
    return [
      {
        id: 'width', worldX: c.x, worldY: c.y - hh, text: `W: ${(hw * 2).toFixed(2)}`,
        offsetY: 16, variant: 'primary',
        editable: true, onEdit: (v: number) => { this.lockW = v; },
      },
      {
        id: 'height', worldX: c.x + hw, worldY: c.y, text: `H: ${(hh * 2).toFixed(2)}`,
        offsetX: 8, variant: 'secondary',
        editable: true, onEdit: (v: number) => { this.lockH = v; },
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.center) { this.center = point; this.cursor = point; }
    else { this.cursor = point; this.commit(ctx); }
  }

  commitDraft(ctx: ToolContext): boolean {
    if (!this.center) return false;
    const { hw, hh } = this.half();
    if (hw < 0.005 || hh < 0.005) return false;
    this.commit(ctx);
    return true;
  }

  private commit(ctx: ToolContext): void {
    if (!this.center) return;
    const { hw, hh } = this.half();
    if (hw < 0.005 || hh < 0.005) { this.reset(); return; }
    const c = this.center;
    ctx.project.addEntity({
      type: 'rect', x: c.x - hw, y: c.y - hh, width: hw * 2, height: hh * 2,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void { this.cursor = point; }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void { if (key === 'Escape') this.reset(); }

  reset(): void { this.center = null; this.cursor = { x: 0, y: 0 }; this.lockW = null; this.lockH = null; }
}
