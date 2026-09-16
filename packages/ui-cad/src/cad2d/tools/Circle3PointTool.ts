import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext } from './types';

/** The circle through three points (the circumcircle); null when they are collinear. */
export function circumcircle(
  a: Point2D,
  b: Point2D,
  c: Point2D
): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** Circle by 3 points (FreeCAD-style): three clicks, and the third settles the circle. */
export class Circle3PointTool implements Tool {
  name = 'circle3p' as const;
  private p1: Point2D | null = null;
  private p2: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };

  getPreview(): PreviewGeometry | null {
    if (this.p1 && !this.p2) {
      return { type: 'line', points: [this.p1, this.cursor] };
    }
    if (this.p1 && this.p2) {
      const c = circumcircle(this.p1, this.p2, this.cursor);
      if (!c) return { type: 'polyline', points: [this.p1, this.p2, this.cursor] };
      return { type: 'circle', points: [{ x: c.cx, y: c.cy }, this.cursor], radius: c.r };
    }
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.p1) {
      this.p1 = point;
      this.cursor = point;
    } else if (!this.p2) {
      this.p2 = point;
      this.cursor = point;
    } else {
      const c = circumcircle(this.p1, this.p2, point);
      if (c && c.r > 0.01) {
        ctx.project.addEntity({
          type: 'circle',
          cx: c.cx,
          cy: c.cy,
          radius: c.r,
          layerId: ctx.project.layerSystem.getActiveId(),
          color: 'bylayer',
          lineType: 'bylayer',
          lineWidth: 'bylayer',
          visible: true,
          locked: false,
          extrudeHeight: 0,
        });
      }
      this.reset();
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.p1 = null;
    this.p2 = null;
    this.cursor = { x: 0, y: 0 };
  }
}
