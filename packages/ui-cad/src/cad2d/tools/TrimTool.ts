import type { Entity, LineEntity, Point2D } from '../core';
import { lineLineIntersection, lineSegmentCircleIntersections } from '../core';
import { pickNearestEntity } from './OffsetTool';
import type { PreviewGeometry, Tool, ToolContext } from './types';

type TrimState = 'idle' | 'boundary';

/**
 * Find all points where a line entity intersects a boundary entity.
 * The target line is treated as an infinite line for boundary testing.
 */
function getLineBoundaryIntersections(
  target: LineEntity,
  boundary: Entity,
): Array<{ x: number; y: number; t: number }> {
  if (boundary.type === 'line') {
    // Extend both lines infinitely for intersection finding
    const r = lineLineIntersection(
      target.x1, target.y1, target.x2, target.y2,
      boundary.x1, boundary.y1, boundary.x2, boundary.y2,
    );
    if (!r) return [];
    // Allow target t outside [0,1] only slightly (intersection near segment)
    // Boundary u must be within its segment
    if (r.u < -0.01 || r.u > 1.01) return [];
    return [{ x: r.x, y: r.y, t: r.t }];
  }

  if (boundary.type === 'circle') {
    return lineSegmentCircleIntersections(
      target.x1, target.y1, target.x2, target.y2,
      boundary.cx, boundary.cy, boundary.radius,
    ).map(h => ({ x: h.point.x, y: h.point.y, t: h.t }));
  }

  return [];
}

/**
 * Trim tool: two-click workflow.
 * 1st click: select boundary entity (the "cutting edge")
 * 2nd click: click the part of a line to remove (nearest to click, between boundary intersections)
 */
export class TrimTool implements Tool {
  name = 'trim' as const;
  private state: TrimState = 'idle';
  private boundaryId: string | null = null;

  getPreview(): PreviewGeometry | null {
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      const nearby = ctx.project.entityRegistry.getInBoundingBox({
        minX: point.x - 40, minY: point.y - 40,
        maxX: point.x + 40, maxY: point.y + 40,
      });
      const e = pickNearestEntity(nearby, point, 25);
      if (e) {
        this.boundaryId = e.id;
        this.state = 'boundary';
      }
    } else {
      this.doTrim(point, ctx);
    }
  }

  private doTrim(clickPoint: Point2D, ctx: ToolContext): void {
    const boundary = ctx.project.entityRegistry.get(this.boundaryId!);
    if (!boundary) { this.reset(); return; }

    const nearby = ctx.project.entityRegistry.getInBoundingBox({
      minX: clickPoint.x - 40, minY: clickPoint.y - 40,
      maxX: clickPoint.x + 40, maxY: clickPoint.y + 40,
    });
    const target = pickNearestEntity(
      nearby.filter(e => e.id !== this.boundaryId),
      clickPoint,
      25,
    );

    if (!target || target.type !== 'line') {
      // Keep boundary selected, wait for valid target
      return;
    }

    this.trimLine(target, boundary, clickPoint, ctx);
    // After trim, stay in 'boundary' state so user can keep trimming with same boundary
  }

  private trimLine(target: LineEntity, boundary: Entity, clickPoint: Point2D, ctx: ToolContext): void {
    const intersections = getLineBoundaryIntersections(target, boundary);
    if (intersections.length === 0) return;

    // Sort intersections by t parameter (position along line)
    intersections.sort((a, b) => a.t - b.t);

    // Determine the click's t parameter on the target line
    const dx = target.x2 - target.x1, dy = target.y2 - target.y1;
    const lenSq = dx * dx + dy * dy;
    const clickT = lenSq < 1e-12 ? 0
      : ((clickPoint.x - target.x1) * dx + (clickPoint.y - target.y1) * dy) / lenSq;

    // Find which segment the click falls in:
    // Segments: [start … t0], [t0 … t1], …, [tn … end]
    // Find the segment interval [segStart, segEnd] that contains clickT
    const ts = [
      { x: target.x1, y: target.y1, t: 0 },
      ...intersections,
      { x: target.x2, y: target.y2, t: 1 },
    ];

    for (let i = 0; i < ts.length - 1; i++) {
      const tLo = ts[i].t, tHi = ts[i + 1].t;
      if (clickT >= tLo - 0.01 && clickT <= tHi + 0.01) {
        // User clicked this segment → remove it by updating the line to exclude this part
        this.commitTrim(target, ts, i, ctx);
        return;
      }
    }
  }

  private commitTrim(
    target: LineEntity,
    tSegments: Array<{ x: number; y: number; t: number }>,
    removedIdx: number,
    ctx: ToolContext,
  ): void {
    // The removed segment is between tSegments[removedIdx] and tSegments[removedIdx + 1]
    // Remaining segments before: [0 … removedIdx]
    // Remaining segments after:  [removedIdx+1 … end]
    const before = tSegments.slice(0, removedIdx + 1);
    const after = tSegments.slice(removedIdx + 1);

    // Wrap in compound so update+add are a single undoable step.
    ctx.project.beginCompound();

    if (before.length >= 2 && after.length >= 2) {
      const p1 = before[0], p2 = before[before.length - 1];
      const p3 = after[0], p4 = after[after.length - 1];
      ctx.project.updateEntity(target.id, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      ctx.project.addEntity({
        type: 'line', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y,
        layerId: target.layerId, color: target.color, lineType: target.lineType,
        lineWidth: target.lineWidth, visible: true, locked: false, extrudeHeight: 0,
      });
    } else if (before.length >= 2) {
      const p1 = before[0], p2 = before[before.length - 1];
      ctx.project.updateEntity(target.id, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    } else if (after.length >= 2) {
      const p3 = after[0], p4 = after[after.length - 1];
      ctx.project.updateEntity(target.id, { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y });
    } else {
      ctx.project.removeEntity(target.id);
    }

    ctx.project.commitCompound('Trim line');
  }

  onPointerMove(_point: Point2D, _ctx: ToolContext): void {}

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if (key === 'Enter') this.reset(); // Enter = done trimming with this boundary
  }

  reset(): void {
    this.state = 'idle';
    this.boundaryId = null;
  }
}
