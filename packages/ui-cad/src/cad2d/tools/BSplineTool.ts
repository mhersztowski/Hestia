import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';
import { sampleSpline } from './spline';

/**
 * A B-spline (FreeCAD-style). Click the points one by one; Enter finishes,
 * Escape cancels.
 * Tryb ustawiany z pod-menu:
 *  - interpolating: through the points ("by knots") as against approximating ("by control points"),
 *  - periodic: a closed curve.
 * What is stored is the sampled curve, as a `polyline`.
 */
export class BSplineTool implements Tool {
  name = 'bspline' as const;
  private interpolating = false;  // false = by control points, true = by knots
  private periodic = false;
  private points: Point2D[] = [];
  private cursor: Point2D | null = null;

  setMode(opts: { interpolating: boolean; periodic: boolean }): void {
    this.interpolating = opts.interpolating;
    this.periodic = opts.periodic;
  }

  private previewPts(): Point2D[] {
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    if (pts.length < 2) return pts;
    return sampleSpline(pts, { interpolating: this.interpolating, periodic: this.periodic });
  }

  getPreview(): PreviewGeometry | null {
    if (this.points.length === 0) return null;
    return { type: 'polyline', points: this.previewPts() };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.points.length === 0) return [];
    // Markers for the control points (CadCanvas draws the visible dots for a polyline preview).
    return [];
  }

  onPointerDown(point: Point2D, _ctx: ToolContext): void {
    this.points.push(point);
    this.cursor = point;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void { this.cursor = point; }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  commitDraft(ctx: ToolContext): boolean {
    return this.finish(ctx);
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    else if (key === 'Enter' || key === 'Return') this.finish(ctx);
  }

  private finish(ctx: ToolContext): boolean {
    if (this.points.length < 2) return false;
    const curve = sampleSpline(this.points, { interpolating: this.interpolating, periodic: this.periodic });
    ctx.project.addEntity({
      type: 'polyline', points: curve, closed: this.periodic,
      construction: { kind: 'bspline', ctrl: this.points.map(p => ({ ...p })), interpolating: this.interpolating, periodic: this.periodic },
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
    return true;
  }

  reset(): void { this.points = []; this.cursor = null; }
}
/** A single instance, so the toolbar's submenu can set the mode before the tool starts. */
export const bsplineTool = new BSplineTool();
