import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext } from './types';

export class SelectTool implements Tool {
  name = 'select' as const;
  private boxStart: Point2D | null = null;
  private boxEnd: Point2D | null = null;
  private dragging = false;

  getPreview(): PreviewGeometry | null {
    if (!this.boxStart || !this.boxEnd || !this.dragging) return null;
    return { type: 'rect', points: [this.boxStart, this.boxEnd] };
  }

  onPointerDown(point: Point2D, _ctx: ToolContext): void {
    this.boxStart = point;
    this.boxEnd = point;
    this.dragging = false;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    if (!this.boxStart) return;
    this.boxEnd = point;
    const dx = Math.abs(point.x - this.boxStart.x);
    const dy = Math.abs(point.y - this.boxStart.y);
    if (dx > 2 || dy > 2) this.dragging = true;
  }

  onPointerUp(point: Point2D, ctx: ToolContext): void {
    if (this.dragging && this.boxStart) {
      // Box selection
      const minX = Math.min(this.boxStart.x, point.x);
      const minY = Math.min(this.boxStart.y, point.y);
      const maxX = Math.max(this.boxStart.x, point.x);
      const maxY = Math.max(this.boxStart.y, point.y);
      ctx.project.selectionManager.selectInBox({ minX, minY, maxX, maxY });
      ctx.project.eventBus.emit('selection:changed', ctx.project.selectionManager.getSelected());
    }
    this.reset();
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') {
      ctx.project.selectionManager.clear();
      ctx.project.eventBus.emit('selection:changed', []);
      this.reset();
    } else if (key === 'Delete' || key === 'Backspace') {
      ctx.project.removeSelected();
    }
  }

  reset(): void {
    this.boxStart = null;
    this.boxEnd = null;
    this.dragging = false;
  }
}
