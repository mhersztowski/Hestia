import type { Entity, Point2D } from '../core';
import { buildGhostSegmentsTranslated, translateEntity } from './entityTransform';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type State = 'idle' | 'picking-dest';

export class MoveTool implements Tool {
  name = 'move' as const;
  private state: State = 'idle';
  private basePoint: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };
  private ghostSegments: Array<{ a: Point2D; b: Point2D }> = [];

  getPreview(): PreviewGeometry | null {
    if (this.state !== 'picking-dest' || this.ghostSegments.length === 0) return null;
    return { type: 'ghost', points: [], ghostSegments: this.ghostSegments };
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      if (ctx.project.selectionManager.count() === 0) return;
      this.basePoint = point;
      this.state = 'picking-dest';
      this.ghostSegments = buildGhostSegmentsTranslated(ctx.project, 0, 0);
    } else if (ctx.pen.pointerType === 'mouse') {
      this.commitMove(point, ctx);
    }
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.state !== 'picking-dest' || !this.basePoint) return [];
    const dx = this.cursor.x - this.basePoint.x;
    const dy = this.cursor.y - this.basePoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return [];
    return [
      { worldX: this.cursor.x, worldY: this.cursor.y, text: `Δx: ${dx.toFixed(2)}  Δy: ${dy.toFixed(2)}`, offsetY: -18, variant: 'primary' },
      { worldX: this.cursor.x, worldY: this.cursor.y, text: `D: ${dist.toFixed(2)}`, offsetY: -4, variant: 'secondary' },
    ];
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    this.cursor = point;
    if (this.state !== 'picking-dest' || !this.basePoint) return;
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    this.ghostSegments = buildGhostSegmentsTranslated(ctx.project, dx, dy);
  }

  onPointerUp(point: Point2D, ctx: ToolContext): void {
    if (this.state !== 'picking-dest' || !this.basePoint || ctx.pen.pointerType === 'mouse') return;
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > 0.5) this.commitMove(point, ctx);
    else this.reset();
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if (key === 'Delete' || key === 'Backspace') ctx.project.removeSelected();
  }

  reset(): void {
    this.state = 'idle';
    this.basePoint = null;
    this.cursor = { x: 0, y: 0 };
    this.ghostSegments = [];
  }

  private commitMove(dest: Point2D, ctx: ToolContext): void {
    const dx = dest.x - this.basePoint!.x;
    const dy = dest.y - this.basePoint!.y;
    const ids = ctx.project.selectionManager.getSelected();
    const updates = ids
      .map(id => ({ id, entity: ctx.project.entityRegistry.get(id) }))
      .filter((x): x is { id: string; entity: Entity } => x.entity !== undefined)
      .map(({ id, entity }) => ({ id, changes: translateEntity(entity, dx, dy) }));
    ctx.project.batchUpdate(updates, 'Move entities');
    this.reset();
  }
}
