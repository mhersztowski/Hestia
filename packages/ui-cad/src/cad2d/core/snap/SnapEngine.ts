import type { Entity } from '../entity/types';
import type { Point2D, SnapMode } from '../types';
import { lineLineIntersection, lineSegmentCircleIntersections } from '../utils/geometry';

export interface SnapResult {
  point: Point2D;
  mode: SnapMode;
  entityId?: string;
}

const SNAP_DISTANCE = 12; // pixels (to be scaled by zoom)

export class SnapEngine {
  private modes = new Set<SnapMode>(['grid', 'endpoint', 'midpoint', 'center', 'intersection']);
  private gridSize = 10;

  setGridSize(size: number): void {
    this.gridSize = size;
  }

  getGridSize(): number {
    return this.gridSize;
  }

  enableMode(mode: SnapMode): void {
    this.modes.add(mode);
  }

  disableMode(mode: SnapMode): void {
    this.modes.delete(mode);
  }

  isEnabled(mode: SnapMode): boolean {
    return this.modes.has(mode);
  }

  getEnabledModes(): SnapMode[] {
    return Array.from(this.modes);
  }

  /**
   * Snap cursor to nearest snap point.
   * @param cursor - cursor position in world space
   * @param entities - nearby entities
   * @param pixelToWorld - scale factor: 1 pixel = ? world units (for distance threshold)
   */
  snap(cursor: Point2D, entities: Entity[], pixelToWorld = 1): SnapResult {
    const threshold = SNAP_DISTANCE * pixelToWorld;
    let best: SnapResult | null = null;
    let bestDist = Infinity;

    const check = (point: Point2D, mode: SnapMode, entityId?: string) => {
      const d = dist(cursor, point);
      if (d < threshold && d < bestDist) {
        bestDist = d;
        best = { point, mode, entityId };
      }
    };

    if (this.modes.has('endpoint') || this.modes.has('midpoint') || this.modes.has('center')) {
      for (const e of entities) {
        if (this.modes.has('endpoint')) {
          for (const pt of getEndpoints(e)) check(pt, 'endpoint', e.id);
        }
        if (this.modes.has('midpoint')) {
          for (const pt of getMidpoints(e)) check(pt, 'midpoint', e.id);
        }
        if (this.modes.has('center')) {
          const pt = getCenter(e);
          if (pt) check(pt, 'center', e.id);
        }
      }
    }

    if (this.modes.has('intersection') && entities.length >= 2) {
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          for (const pt of getIntersections(entities[i], entities[j])) {
            check(pt, 'intersection');
          }
        }
      }
    }

    if (!best && this.modes.has('grid')) {
      const gx = Math.round(cursor.x / this.gridSize) * this.gridSize;
      const gy = Math.round(cursor.y / this.gridSize) * this.gridSize;
      best = { point: { x: gx, y: gy }, mode: 'grid' };
    }

    return best ?? { point: cursor, mode: 'nearest' };
  }
}

function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getEndpoints(e: Entity): Point2D[] {
  switch (e.type) {
    case 'line': return [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }];
    case 'polyline': return e.points.length > 0 ? [e.points[0], e.points[e.points.length - 1]] : [];
    case 'freehand': return e.points.length > 0 ? [e.points[0], e.points[e.points.length - 1]] : [];
    case 'rect': return [{ x: e.x, y: e.y }, { x: e.x + e.width, y: e.y }, { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height }];
    case 'arc': return [
      { x: e.cx + e.radius * Math.cos(e.startAngle), y: e.cy + e.radius * Math.sin(e.startAngle) },
      { x: e.cx + e.radius * Math.cos(e.endAngle), y: e.cy + e.radius * Math.sin(e.endAngle) },
    ];
    default: return [];
  }
}

function getMidpoints(e: Entity): Point2D[] {
  switch (e.type) {
    case 'line': return [{ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }];
    case 'polyline': {
      const mids: Point2D[] = [];
      for (let i = 0; i < e.points.length - 1; i++) {
        mids.push({ x: (e.points[i].x + e.points[i + 1].x) / 2, y: (e.points[i].y + e.points[i + 1].y) / 2 });
      }
      return mids;
    }
    default: return [];
  }
}

/** Returns intersection points between two entities (segment-only, not extended). */
function getIntersections(a: Entity, b: Entity): Point2D[] {
  const pts: Point2D[] = [];

  if (a.type === 'line' && b.type === 'line') {
    const r = lineLineIntersection(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2);
    if (r && r.t >= -0.01 && r.t <= 1.01 && r.u >= -0.01 && r.u <= 1.01) {
      pts.push({ x: r.x, y: r.y });
    }
  } else if (a.type === 'line' && b.type === 'circle') {
    for (const hit of lineSegmentCircleIntersections(a.x1, a.y1, a.x2, a.y2, b.cx, b.cy, b.radius)) {
      pts.push(hit.point);
    }
  } else if (a.type === 'circle' && b.type === 'line') {
    for (const hit of lineSegmentCircleIntersections(b.x1, b.y1, b.x2, b.y2, a.cx, a.cy, a.radius)) {
      pts.push(hit.point);
    }
  }

  return pts;
}

function getCenter(e: Entity): Point2D | null {
  switch (e.type) {
    case 'circle': return { x: e.cx, y: e.cy };
    case 'arc': return { x: e.cx, y: e.cy };
    case 'rect': return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
    default: return null;
  }
}
