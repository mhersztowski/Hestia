import type { Entity, EntityInput, Point2D } from '../core';
import {
  closestPointOnSegment,
  offsetLineCoords,
  signedDistPointToLine,
} from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type OffsetState = 'idle' | 'picked';

function distToEntity(e: Entity, pt: Point2D): number {
  switch (e.type) {
    case 'line': {
      const c = closestPointOnSegment(pt.x, pt.y, e.x1, e.y1, e.x2, e.y2);
      return Math.sqrt((pt.x - c.x) ** 2 + (pt.y - c.y) ** 2);
    }
    case 'circle':
      return Math.abs(Math.sqrt((pt.x - e.cx) ** 2 + (pt.y - e.cy) ** 2) - e.radius);
    case 'arc':
      return Math.abs(Math.sqrt((pt.x - e.cx) ** 2 + (pt.y - e.cy) ** 2) - e.radius);
    case 'rect': {
      // Distance to nearest edge
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
      const dx = Math.max(Math.abs(pt.x - cx) - e.width / 2, 0);
      const dy = Math.max(Math.abs(pt.y - cy) - e.height / 2, 0);
      return Math.sqrt(dx * dx + dy * dy);
    }
    default:
      return Infinity;
  }
}

export function pickNearestEntity(entities: Entity[], point: Point2D, threshold: number): Entity | null {
  let best: Entity | null = null;
  let bestDist = threshold;
  for (const e of entities) {
    const d = distToEntity(e, point);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function buildOffsetGhostSegments(
  entity: Entity,
  cursor: Point2D,
): Array<{ a: Point2D; b: Point2D }> | null {
  if (entity.type === 'line') {
    const side = signedDistPointToLine(cursor.x, cursor.y, entity.x1, entity.y1, entity.x2, entity.y2);
    if (Math.abs(side) < 0.01) return null;
    const off = offsetLineCoords(entity.x1, entity.y1, entity.x2, entity.y2, side);
    return [{ a: { x: off.x1, y: off.y1 }, b: { x: off.x2, y: off.y2 } }];
  }

  if (entity.type === 'circle') {
    // New radius = distance from center to cursor
    const newR = Math.sqrt((cursor.x - entity.cx) ** 2 + (cursor.y - entity.cy) ** 2);
    if (newR < 0.1) return null;
    const segs: Array<{ a: Point2D; b: Point2D }> = [];
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a1 = (i / n) * Math.PI * 2;
      const a2 = ((i + 1) / n) * Math.PI * 2;
      segs.push({
        a: { x: entity.cx + newR * Math.cos(a1), y: entity.cy + newR * Math.sin(a1) },
        b: { x: entity.cx + newR * Math.cos(a2), y: entity.cy + newR * Math.sin(a2) },
      });
    }
    return segs;
  }

  return null;
}

function buildOffsetEntityInput(entity: Entity, cursor: Point2D): EntityInput | null {
  const base = {
    layerId: entity.layerId,
    color: entity.color,
    lineType: entity.lineType,
    lineWidth: entity.lineWidth,
    visible: true,
    locked: false,
    extrudeHeight: 0,
  } as const;

  if (entity.type === 'line') {
    const side = signedDistPointToLine(cursor.x, cursor.y, entity.x1, entity.y1, entity.x2, entity.y2);
    if (Math.abs(side) < 0.01) return null;
    const off = offsetLineCoords(entity.x1, entity.y1, entity.x2, entity.y2, side);
    return { type: 'line', ...off, ...base } satisfies EntityInput;
  }

  if (entity.type === 'circle') {
    const newR = Math.sqrt((cursor.x - entity.cx) ** 2 + (cursor.y - entity.cy) ** 2);
    if (newR < 0.1) return null;
    return { type: 'circle', cx: entity.cx, cy: entity.cy, radius: newR, ...base } satisfies EntityInput;
  }

  return null;
}

/**
 * Offset tool: click entity → move cursor to define offset distance & side → click to commit.
 * Works for lines (parallel offset) and circles (concentric).
 */
export class OffsetTool implements Tool {
  name = 'offset' as const;
  private state: OffsetState = 'idle';
  private entity: Entity | null = null;
  private cursor: Point2D = { x: 0, y: 0 };

  getPreview(): PreviewGeometry | null {
    if (this.state !== 'picked' || !this.entity) return null;
    const segs = buildOffsetGhostSegments(this.entity, this.cursor);
    if (!segs) return null;
    return { type: 'ghost', points: [], ghostSegments: segs };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.state !== 'picked' || !this.entity) return [];
    let dist = 0;
    if (this.entity.type === 'line') {
      dist = Math.abs(signedDistPointToLine(this.cursor.x, this.cursor.y, this.entity.x1, this.entity.y1, this.entity.x2, this.entity.y2));
    } else if (this.entity.type === 'circle') {
      const dr = Math.sqrt((this.cursor.x - this.entity.cx) ** 2 + (this.cursor.y - this.entity.cy) ** 2);
      dist = dr; // will show new radius
    }
    if (dist < 0.01) return [];
    return [
      { worldX: this.cursor.x, worldY: this.cursor.y, text: `D: ${dist.toFixed(2)}`, offsetX: 24, offsetY: -10, variant: 'primary' },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      const nearby = ctx.project.entityRegistry.getInBoundingBox({
        minX: point.x - 40, minY: point.y - 40,
        maxX: point.x + 40, maxY: point.y + 40,
      });
      const e = pickNearestEntity(nearby, point, 25);
      if (e && (e.type === 'line' || e.type === 'circle')) {
        this.entity = e;
        this.state = 'picked';
      }
    } else if (this.state === 'picked') {
      const input = buildOffsetEntityInput(this.entity!, point);
      if (input) ctx.project.addEntity(input);
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
    this.state = 'idle';
    this.entity = null;
    this.cursor = { x: 0, y: 0 };
  }
}
