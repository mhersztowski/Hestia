import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

export class PolylineTool implements Tool {
  name = 'polyline' as const;
  private points: Point2D[] = [];
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (this.points.length === 0) return null;
    const pts = this.current ? [...this.points, this.current] : this.points;
    return { type: 'polyline', points: pts };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.points.length === 0 || !this.current) return [];
    const last = this.points[this.points.length - 1];
    const dx = this.current.x - last.x;
    const dy = this.current.y - last.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return [];

    // Segment length near midpoint, total length near cursor
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      const px = this.points[i].x - this.points[i - 1].x;
      const py = this.points[i].y - this.points[i - 1].y;
      total += Math.sqrt(px * px + py * py);
    }
    total += len;

    const midX = (last.x + this.current.x) / 2;
    const midY = (last.y + this.current.y) / 2;
    const labels: DimensionLabel[] = [
      {
        worldX: midX,
        worldY: midY,
        text: `L: ${len.toFixed(2)}`,
        offsetY: -14,
        variant: 'primary',
      },
    ];
    if (this.points.length >= 1) {
      labels.push({
        worldX: this.current.x,
        worldY: this.current.y,
        text: `Σ ${total.toFixed(2)}`,
        offsetX: 26,
        offsetY: 6,
        variant: 'secondary',
      });
    }
    return labels;
  }

  onPointerDown(point: Point2D): void {
    this.points.push(point);
    this.current = point;
  }

  onPointerMove(point: Point2D): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if ((key === 'Enter' || key === 'Return') && this.points.length >= 2) {
      ctx.project.addEntity({
        type: 'polyline',
        layerId: ctx.project.layerSystem.getActiveId(),
        points: [...this.points],
        closed: false,
        color: 'bylayer',
        lineType: 'bylayer',
        lineWidth: 'bylayer',
        visible: true,
        locked: false,
        extrudeHeight: 0,
      });
      this.reset();
    }
    if (key === 'c' && this.points.length >= 3) {
      ctx.project.addEntity({
        type: 'polyline',
        layerId: ctx.project.layerSystem.getActiveId(),
        points: [...this.points],
        closed: true,
        color: 'bylayer',
        lineType: 'bylayer',
        lineWidth: 'bylayer',
        visible: true,
        locked: false,
        extrudeHeight: 0,
      });
      this.reset();
    }
  }

  reset(): void {
    this.points = [];
    this.current = null;
  }
}
