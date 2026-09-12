import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext } from './types';
import { circumcircle } from './Circle3PointTool';

const TWO_PI = Math.PI * 2;
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

/**
 * An arc through 3 points (FreeCAD-style): start, end, then a point on the arc.
 * The direction is chosen so that the arc passes through that third point.
 */
export class Arc3PointTool implements Tool {
  name = 'arc3p' as const;
  private start: Point2D | null = null;
  private end: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };

  /** The parameters of the arc from start to end that passes through `mid`. */
  private arcThrough(start: Point2D, end: Point2D, mid: Point2D):
    { cx: number; cy: number; r: number; startAngle: number; endAngle: number } | null {
    const c = circumcircle(start, end, mid);
    if (!c) return null;
    const a1 = Math.atan2(start.y - c.cy, start.x - c.cx);
    const a2 = Math.atan2(end.y - c.cy, end.x - c.cx);
    const am = Math.atan2(mid.y - c.cy, mid.x - c.cx);
    // Does going counter-clockwise from a1 to a2 cover the middle point's angle?
    const ccwPassesMid = norm(am - a1) < norm(a2 - a1);
    return ccwPassesMid
      ? { ...c, startAngle: a1, endAngle: a1 + norm(a2 - a1) }
      : { ...c, startAngle: a2, endAngle: a2 + norm(a1 - a2) };
  }

  getPreview(): PreviewGeometry | null {
    if (this.start && !this.end) {
      return { type: 'line', points: [this.start, this.cursor] };
    }
    if (this.start && this.end) {
      const a = this.arcThrough(this.start, this.end, this.cursor);
      if (!a) return { type: 'line', points: [this.start, this.end] };
      return {
        type: 'arc', points: [{ x: a.cx, y: a.cy }], radius: a.r,
        startAngle: a.startAngle, endAngle: a.endAngle,
      };
    }
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.start) { this.start = point; this.cursor = point; }
    else if (!this.end) { this.end = point; this.cursor = point; }
    else {
      const a = this.arcThrough(this.start, this.end, point);
      if (a && a.r > 0.01) {
        ctx.project.addEntity({
          type: 'arc', cx: a.cx, cy: a.cy, radius: a.r,
          startAngle: a.startAngle, endAngle: a.endAngle,
          layerId: ctx.project.layerSystem.getActiveId(),
          color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
          visible: true, locked: false, extrudeHeight: 0,
        });
      }
      this.reset();
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void { this.cursor = point; }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void { if (key === 'Escape') this.reset(); }

  reset(): void { this.start = null; this.end = null; this.cursor = { x: 0, y: 0 }; }
}
