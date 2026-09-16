import type { LineEntity, Point2D } from '../core';
import { dist2d, lineLineIntersection, normalizeAngle } from '../core';
import { pickNearestEntity } from './OffsetTool';
import type { PreviewGeometry, Tool, ToolContext } from './types';

type FilletState = 'idle' | 'first';

/**
 * Fillet tool: rounds the corner between two lines.
 * Click first line → click second line.
 * With radius=0 (default): sharp corner (trim both lines to intersection).
 * With radius>0: trim + insert tangent arc.
 * Type a number before/after clicking to set the radius.
 */
export class FilletTool implements Tool {
  name = 'fillet' as const;
  private state: FilletState = 'idle';
  private firstId: string | null = null;
  radius = 0; // public so CadCanvas can inject it via injectedAngle

  getPreview(): PreviewGeometry | null {
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    const nearby = ctx.project.entityRegistry.getInBoundingBox({
      minX: point.x - 40,
      minY: point.y - 40,
      maxX: point.x + 40,
      maxY: point.y + 40,
    });
    const e = pickNearestEntity(nearby, point, 25);
    if (!e || e.type !== 'line') return;

    if (this.state === 'idle') {
      this.firstId = e.id;
      this.state = 'first';
    } else {
      if (e.id === this.firstId) return;
      const first = ctx.project.entityRegistry.get(this.firstId!);
      if (!first || first.type !== 'line') {
        this.reset();
        return;
      }
      this.doFillet(first, e, ctx);
      this.reset();
    }
  }

  private doFillet(l1: LineEntity, l2: LineEntity, ctx: ToolContext): void {
    const isect = lineLineIntersection(l1.x1, l1.y1, l1.x2, l1.y2, l2.x1, l2.y1, l2.x2, l2.y2);
    if (!isect) return; // parallel lines

    const ip: Point2D = { x: isect.x, y: isect.y };

    if (this.radius <= 0) {
      // Sharp corner: trim the nearest end of each line to the intersection
      ctx.project.batchUpdate(
        [
          { id: l1.id, changes: nearestEndChanges(l1, ip) },
          { id: l2.id, changes: nearestEndChanges(l2, ip) },
        ],
        'Fillet (sharp)'
      );
      return;
    }

    // Arc fillet: find tangent points, trim both lines, insert arc
    const r = this.radius;

    // Unit vectors along each line FROM intersection outward
    const len1 = dist2d({ x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 });
    const len2 = dist2d({ x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 });
    if (len1 < 1e-9 || len2 < 1e-9) return;

    // Determine which "half" of each line is away from the intersection
    const p1far =
      dist2d(ip, { x: l1.x1, y: l1.y1 }) > dist2d(ip, { x: l1.x2, y: l1.y2 })
        ? { x: l1.x1, y: l1.y1 }
        : { x: l1.x2, y: l1.y2 };
    const p2far =
      dist2d(ip, { x: l2.x1, y: l2.y1 }) > dist2d(ip, { x: l2.x2, y: l2.y2 })
        ? { x: l2.x1, y: l2.y1 }
        : { x: l2.x2, y: l2.y2 };

    const u1x = (p1far.x - ip.x) / dist2d(ip, p1far);
    const u1y = (p1far.y - ip.y) / dist2d(ip, p1far);
    const u2x = (p2far.x - ip.x) / dist2d(ip, p2far);
    const u2y = (p2far.y - ip.y) / dist2d(ip, p2far);

    // Half-angle between the two lines (from the intersection)
    const cosHalf = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const halfAngle = Math.acos(cosHalf) / 2;
    if (halfAngle < 1e-4 || halfAngle > Math.PI / 2 - 1e-4) return; // too parallel or too sharp

    // Tangent length along each line from intersection
    const tangentLen = r / Math.tan(halfAngle);
    if (tangentLen <= 0) return;

    // Tangent points
    const t1: Point2D = { x: ip.x + u1x * tangentLen, y: ip.y + u1y * tangentLen };
    const t2: Point2D = { x: ip.x + u2x * tangentLen, y: ip.y + u2y * tangentLen };

    // Arc center: along the angle bisector at distance r / sin(halfAngle)
    const bisLen = r / Math.sin(halfAngle);
    const bisX = u1x + u2x,
      bisY = u1y + u2y;
    const bisLen0 = Math.sqrt(bisX * bisX + bisY * bisY);
    if (bisLen0 < 1e-9) return;
    const arcCx = ip.x + (bisX / bisLen0) * bisLen;
    const arcCy = ip.y + (bisY / bisLen0) * bisLen;

    // Arc angles
    const arcStart = normalizeAngle(Math.atan2(t1.y - arcCy, t1.x - arcCx));
    const arcEnd = normalizeAngle(Math.atan2(t2.y - arcCy, t2.x - arcCx));

    // Trim both lines + insert arc — one atomic undo step
    ctx.project.beginCompound();
    ctx.project.batchUpdate(
      [
        { id: l1.id, changes: nearestEndChanges(l1, t1) },
        { id: l2.id, changes: nearestEndChanges(l2, t2) },
      ],
      'Fillet (trim)'
    );
    ctx.project.addEntity({
      type: 'arc',
      cx: arcCx,
      cy: arcCy,
      radius: r,
      startAngle: arcStart,
      endAngle: arcEnd,
      layerId: l1.layerId,
      color: l1.color,
      lineType: l1.lineType,
      lineWidth: l1.lineWidth,
      visible: true,
      locked: false,
      extrudeHeight: 0,
    });
    ctx.project.commitCompound('Fillet');
  }

  onPointerMove(_point: Point2D, _ctx: ToolContext): void {}
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.state = 'idle';
    this.firstId = null;
  }
}

/** Returns { x1,y1 } or { x2,y2 } changes to move the NEAREST endpoint of a line to the target point. */
function nearestEndChanges(line: LineEntity, target: Point2D): Partial<LineEntity> {
  const d1 = dist2d({ x: line.x1, y: line.y1 }, target);
  const d2 = dist2d({ x: line.x2, y: line.y2 }, target);
  return d1 <= d2 ? { x1: target.x, y1: target.y } : { x2: target.x, y2: target.y };
}
