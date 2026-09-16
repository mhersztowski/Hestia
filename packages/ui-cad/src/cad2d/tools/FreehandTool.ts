import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext, ToolName } from './types';

function rdp(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return [...points];
  let maxDist = 0,
    maxIdx = 0;
  const first = points[0],
    last = points[points.length - 1];
  const dx = last.x - first.x,
    dy = last.y - first.y;
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  for (let i = 1; i < points.length - 1; i++) {
    const dist =
      lineLen < 1e-10
        ? Math.hypot(points[i].x - first.x, points[i].y - first.y)
        : Math.abs(dx * (first.y - points[i].y) - (first.x - points[i].x) * dy) / lineLen;
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

export class FreehandTool implements Tool {
  name: ToolName = 'freehand';

  strokeWidth = 1;
  smooth = true;
  simplifyEpsilon = 1.0;

  private rawPoints: Point2D[] = [];
  private drawing = false;

  getPreview(): PreviewGeometry | null {
    if (this.rawPoints.length < 2) return null;
    return { type: 'polyline', points: this.rawPoints };
  }

  onPointerDown(point: Point2D, _ctx: ToolContext): void {
    this.rawPoints = [point];
    this.drawing = true;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    if (!this.drawing || this.rawPoints.length === 0) return;
    const last = this.rawPoints[this.rawPoints.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) > 0.05) {
      this.rawPoints.push(point);
    }
  }

  onPointerUp(point: Point2D, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.rawPoints.length < 2) {
      this.rawPoints = [];
      return;
    }

    // Push final point then simplify
    const last = this.rawPoints[this.rawPoints.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) > 0.05) {
      this.rawPoints.push(point);
    }

    const simplified =
      this.simplifyEpsilon > 0 ? rdp(this.rawPoints, this.simplifyEpsilon) : this.rawPoints;

    if (simplified.length < 2) {
      this.rawPoints = [];
      return;
    }

    ctx.project.addEntity({
      type: 'freehand',
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
      points: simplified,
      strokeWidth: this.strokeWidth,
      smooth: this.smooth,
    });

    this.rawPoints = [];
  }

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.rawPoints = [];
    this.drawing = false;
  }
}

export const freehandTool = new FreehandTool();
