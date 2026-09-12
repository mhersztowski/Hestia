import type { Entity, Point2D } from '../core';
import { buildGhostSegmentsRotated, rotateEntity } from './entityTransform';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type State = 'idle' | 'picking-angle';

export class RotateTool implements Tool {
  name = 'rotate' as const;
  private state: State = 'idle';
  private center: Point2D | null = null;
  private currentAngle = 0;
  private ghostSegments: Array<{ a: Point2D; b: Point2D }> = [];

  getPreview(): PreviewGeometry | null {
    if (this.state !== 'picking-angle' || this.ghostSegments.length === 0) return null;
    return { type: 'ghost', points: [], ghostSegments: this.ghostSegments };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.state !== 'picking-angle' || !this.center) return [];
    let deg = (this.currentAngle * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return [
      {
        worldX: this.center.x,
        worldY: this.center.y,
        text: `∠ ${deg.toFixed(1)}°`,
        offsetX: 24, offsetY: -10,
        variant: 'primary',
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      if (ctx.project.selectionManager.count() === 0) return;
      this.center = point;
      this.currentAngle = 0;
      this.state = 'picking-angle';
      this.ghostSegments = buildGhostSegmentsRotated(ctx.project, point.x, point.y, 0);
    } else if (ctx.pen.pointerType === 'mouse') {
      this.commitRotate(ctx);
    }
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    if (this.state !== 'picking-angle' || !this.center) return;
    this.currentAngle = Math.atan2(point.y - this.center.y, point.x - this.center.x);
    this.ghostSegments = buildGhostSegmentsRotated(ctx.project, this.center.x, this.center.y, this.currentAngle);
  }

  onPointerUp(_point: Point2D, ctx: ToolContext): void {
    if (this.state !== 'picking-angle' || ctx.pen.pointerType === 'mouse') return;
    if (Math.abs(this.currentAngle) > 0.01) this.commitRotate(ctx);
    else this.reset();
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if (key === 'Enter') this.commitRotate(ctx);
  }

  /** Rotate by explicit degrees (called from CommandLine) */
  rotateByDegrees(degrees: number, ctx: ToolContext): void {
    if (this.state !== 'picking-angle' || !this.center) return;
    this.currentAngle = (degrees * Math.PI) / 180;
    this.commitRotate(ctx);
  }

  reset(): void {
    this.state = 'idle';
    this.center = null;
    this.currentAngle = 0;
    this.ghostSegments = [];
  }

  private commitRotate(ctx: ToolContext): void {
    if (!this.center) return;
    const { x: cx, y: cy } = this.center;
    const angle = this.currentAngle;
    const ids = ctx.project.selectionManager.getSelected();
    const updates = ids
      .map(id => ({ id, entity: ctx.project.entityRegistry.get(id) }))
      .filter((x): x is { id: string; entity: Entity } => x.entity !== undefined)
      .map(({ id, entity }) => ({ id, changes: rotateEntity(entity, cx, cy, angle) }));
    ctx.project.batchUpdate(updates, 'Rotate entities');
    this.reset();
  }
}
