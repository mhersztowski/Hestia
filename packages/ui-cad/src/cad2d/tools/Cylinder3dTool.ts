import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext, ToolName } from './types';

const DEFAULT_HEIGHT = 20;

export class Cylinder3dTool implements Tool {
  name: ToolName = 'cylinder3d';
  private center: Point2D | null = null;
  private radius = 0;

  getPreview(): PreviewGeometry | null {
    if (!this.center || this.radius <= 0) return null;
    return { type: 'circle', points: [this.center], radius: this.radius };
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.center) {
      this.center = point;
    } else {
      this._commit(point, ctx);
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    if (this.center) {
      this.radius = Math.sqrt((point.x - this.center.x) ** 2 + (point.y - this.center.y) ** 2);
    }
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.center = null;
    this.radius = 0;
  }

  private _commit(edge: Point2D, ctx: ToolContext): void {
    const r = Math.sqrt((edge.x - this.center!.x) ** 2 + (edge.y - this.center!.y) ** 2);
    if (r < 0.1) { this.reset(); return; }
    const layer = ctx.project.layerSystem.getActive();
    ctx.project.addEntity({
      type: 'cylinder3d',
      cx: this.center!.x,
      cy: this.center!.y,
      radius: r,
      height: DEFAULT_HEIGHT,
      layerId: layer.id,
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: DEFAULT_HEIGHT,
    });
    this.reset();
  }
}
