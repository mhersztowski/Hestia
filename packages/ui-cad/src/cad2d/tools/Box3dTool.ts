import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext, ToolName } from './types';

const DEFAULT_HEIGHT = 20;

export class Box3dTool implements Tool {
  name: ToolName = 'box3d';
  private firstCorner: Point2D | null = null;
  private currentCorner: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (!this.firstCorner || !this.currentCorner) return null;
    return { type: 'rect', points: [this.firstCorner, this.currentCorner] };
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.firstCorner) {
      this.firstCorner = point;
    } else {
      this._commit(point, ctx);
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    if (this.firstCorner) this.currentCorner = point;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.firstCorner = null;
    this.currentCorner = null;
  }

  private _commit(corner: Point2D, ctx: ToolContext): void {
    const a = this.firstCorner!;
    const b = corner;
    const width = Math.abs(b.x - a.x);
    const depth = Math.abs(b.y - a.y);
    if (width < 0.1 || depth < 0.1) { this.reset(); return; }

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const layer = ctx.project.layerSystem.getActive();
    ctx.project.addEntity({
      type: 'box3d',
      cx, cy, width, depth,
      height: DEFAULT_HEIGHT,
      layerId: layer.id,
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: DEFAULT_HEIGHT,
    });
    this.firstCorner = corner;
    this.currentCorner = null;
  }
}
