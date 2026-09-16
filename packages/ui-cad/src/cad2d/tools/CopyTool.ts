import type { Entity, Point2D } from '../core';
import { buildGhostSegmentsTranslated, cloneEntityAsInput } from './entityTransform';
import type { PreviewGeometry, Tool, ToolContext } from './types';

type State = 'idle' | 'picking-dest';

export class CopyTool implements Tool {
  name = 'copy' as const;
  private state: State = 'idle';
  private basePoint: Point2D | null = null;
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
      this.commitCopy(point, ctx);
    }
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    if (this.state !== 'picking-dest' || !this.basePoint) return;
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    this.ghostSegments = buildGhostSegmentsTranslated(ctx.project, dx, dy);
  }

  onPointerUp(point: Point2D, ctx: ToolContext): void {
    if (this.state !== 'picking-dest' || !this.basePoint || ctx.pen.pointerType === 'mouse') return;
    const dx = point.x - this.basePoint.x;
    const dy = point.y - this.basePoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > 0.5) this.commitCopy(point, ctx);
    else this.reset();
  }

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.state = 'idle';
    this.basePoint = null;
    this.ghostSegments = [];
  }

  private commitCopy(dest: Point2D, ctx: ToolContext): void {
    const dx = dest.x - this.basePoint!.x;
    const dy = dest.y - this.basePoint!.y;
    const ids = ctx.project.selectionManager.getSelected();
    const inputs = ids
      .map((id) => ctx.project.entityRegistry.get(id))
      .filter((e): e is Entity => e !== undefined)
      .map((e) => cloneEntityAsInput(e, dx, dy));
    const newEntities = ctx.project.batchAdd(inputs, 'Copy entities');
    // Select the copies
    ctx.project.selectionManager.clear();
    for (const e of newEntities) ctx.project.selectionManager.select(e.id, true);
    ctx.project.eventBus.emit('selection:changed', ctx.project.selectionManager.getSelected());
    this.reset();
  }
}
