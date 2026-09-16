import type { Entity, EntityInput, Point2D, DimensionEntity, DimAnchor } from '../core';

/** An anchor that is present and not disabled actively pins its endpoint to a shape. */
function isAnchored(a: DimAnchor | undefined): boolean {
  return !!a && !a.disabled;
}

// ── Translation ───────────────────────────────────────────────────────────────

export function translateEntity(entity: Entity, dx: number, dy: number): Partial<Entity> {
  switch (entity.type) {
    case 'line':
      return { x1: entity.x1 + dx, y1: entity.y1 + dy, x2: entity.x2 + dx, y2: entity.y2 + dy };
    case 'circle':
      return { cx: entity.cx + dx, cy: entity.cy + dy };
    case 'point':
      return { x: entity.x + dx, y: entity.y + dy };
    case 'rect':
      return { x: entity.x + dx, y: entity.y + dy };
    case 'polyline':
      return { points: entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'freehand':
      return { points: entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'text':
      return { x: entity.x + dx, y: entity.y + dy };
    case 'image':
      return { x: entity.x + dx, y: entity.y + dy };
    case 'arc':
      return { cx: entity.cx + dx, cy: entity.cy + dy };
    case 'dimension': {
      // Actively-anchored endpoints follow their shape — don't translate them.
      const ch: Partial<DimensionEntity> = {};
      if (!isAnchored(entity.anchor1)) {
        ch.x1 = entity.x1 + dx;
        ch.y1 = entity.y1 + dy;
      }
      if (!isAnchored(entity.anchor2)) {
        ch.x2 = entity.x2 + dx;
        ch.y2 = entity.y2 + dy;
      }
      return ch;
    }
    default:
      return {};
  }
}

// ── Rotation ──────────────────────────────────────────────────────────────────

function rotatePoint(p: Point2D, cx: number, cy: number, angle: number): Point2D {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const rx = p.x - cx,
    ry = p.y - cy;
  return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos };
}

export function rotateEntity(
  entity: Entity,
  cx: number,
  cy: number,
  angle: number
): Partial<Entity> {
  switch (entity.type) {
    case 'line': {
      const a = rotatePoint({ x: entity.x1, y: entity.y1 }, cx, cy, angle);
      const b = rotatePoint({ x: entity.x2, y: entity.y2 }, cx, cy, angle);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case 'circle': {
      const c = rotatePoint({ x: entity.cx, y: entity.cy }, cx, cy, angle);
      return { cx: c.x, cy: c.y };
    }
    case 'rect': {
      // Rect stays axis-aligned; only origin corner is rotated (Phase 2 limitation)
      const origin = rotatePoint({ x: entity.x, y: entity.y }, cx, cy, angle);
      return { x: origin.x, y: origin.y };
    }
    case 'polyline': {
      return { points: entity.points.map((p) => rotatePoint(p, cx, cy, angle)) };
    }
    case 'freehand': {
      return { points: entity.points.map((p) => rotatePoint(p, cx, cy, angle)) };
    }
    case 'text': {
      const np = rotatePoint({ x: entity.x, y: entity.y }, cx, cy, angle);
      return { x: np.x, y: np.y, angle: entity.angle + angle };
    }
    case 'image': {
      const np = rotatePoint(
        { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 },
        cx,
        cy,
        angle
      );
      return { x: np.x - entity.width / 2, y: np.y - entity.height / 2 };
    }
    case 'arc': {
      const c = rotatePoint({ x: entity.cx, y: entity.cy }, cx, cy, angle);
      return {
        cx: c.x,
        cy: c.y,
        startAngle: entity.startAngle + angle,
        endAngle: entity.endAngle + angle,
      };
    }
    case 'dimension': {
      // Actively-anchored endpoints follow their shape — don't rotate them.
      const ch: Partial<DimensionEntity> = {};
      if (!isAnchored(entity.anchor1)) {
        const p1 = rotatePoint({ x: entity.x1, y: entity.y1 }, cx, cy, angle);
        ch.x1 = p1.x;
        ch.y1 = p1.y;
      }
      if (!isAnchored(entity.anchor2)) {
        const p2 = rotatePoint({ x: entity.x2, y: entity.y2 }, cx, cy, angle);
        ch.x2 = p2.x;
        ch.y2 = p2.y;
      }
      return ch;
    }
    default:
      return {};
  }
}

// ── Clone (for Copy tool) ─────────────────────────────────────────────────────

export function cloneEntityAsInput(entity: Entity, dx: number, dy: number): EntityInput {
  const base = {
    layerId: entity.layerId,
    color: entity.color,
    lineType: entity.lineType,
    lineWidth: entity.lineWidth,
    visible: entity.visible,
    locked: entity.locked,
    extrudeHeight: entity.extrudeHeight,
  };
  switch (entity.type) {
    case 'line':
      return {
        ...base,
        type: 'line',
        x1: entity.x1 + dx,
        y1: entity.y1 + dy,
        x2: entity.x2 + dx,
        y2: entity.y2 + dy,
      };
    case 'circle':
      return {
        ...base,
        type: 'circle',
        cx: entity.cx + dx,
        cy: entity.cy + dy,
        radius: entity.radius,
      };
    case 'rect':
      return {
        ...base,
        type: 'rect',
        x: entity.x + dx,
        y: entity.y + dy,
        width: entity.width,
        height: entity.height,
      };
    case 'polyline':
      return {
        ...base,
        type: 'polyline',
        points: entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        closed: entity.closed,
      };
    case 'freehand':
      return {
        ...base,
        type: 'freehand',
        points: entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        strokeWidth: entity.strokeWidth,
        smooth: entity.smooth,
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        x: entity.x + dx,
        y: entity.y + dy,
        content: entity.content,
        fontSize: entity.fontSize,
        fontFamily: entity.fontFamily,
        angle: entity.angle,
      };
    case 'image':
      return {
        ...base,
        type: 'image',
        x: entity.x + dx,
        y: entity.y + dy,
        width: entity.width,
        height: entity.height,
        src: entity.src,
      };
    case 'arc':
      return {
        ...base,
        type: 'arc',
        cx: entity.cx + dx,
        cy: entity.cy + dy,
        radius: entity.radius,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      };
    case 'dimension':
      return {
        ...base,
        type: 'dimension',
        x1: entity.x1 + dx,
        y1: entity.y1 + dy,
        x2: entity.x2 + dx,
        y2: entity.y2 + dy,
        offset: entity.offset,
      };
    default:
      return base as EntityInput;
  }
}

// ── Ghost segments (for Move/Copy/Rotate preview) ─────────────────────────────

export function entityToSegments(entity: Entity): Array<{ a: Point2D; b: Point2D }> {
  switch (entity.type) {
    case 'line':
      return [{ a: { x: entity.x1, y: entity.y1 }, b: { x: entity.x2, y: entity.y2 } }];

    case 'circle': {
      const N = 32;
      const segs: Array<{ a: Point2D; b: Point2D }> = [];
      for (let i = 0; i < N; i++) {
        const a1 = (i / N) * Math.PI * 2;
        const a2 = ((i + 1) / N) * Math.PI * 2;
        segs.push({
          a: {
            x: entity.cx + entity.radius * Math.cos(a1),
            y: entity.cy + entity.radius * Math.sin(a1),
          },
          b: {
            x: entity.cx + entity.radius * Math.cos(a2),
            y: entity.cy + entity.radius * Math.sin(a2),
          },
        });
      }
      return segs;
    }

    case 'rect': {
      const { x, y, width: w, height: h } = entity;
      const corners: Point2D[] = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
      return corners.map((c, i) => ({ a: c, b: corners[(i + 1) % 4] }));
    }

    case 'polyline': {
      const segs: Array<{ a: Point2D; b: Point2D }> = [];
      for (let i = 0; i < entity.points.length - 1; i++) {
        segs.push({ a: entity.points[i], b: entity.points[i + 1] });
      }
      if (entity.closed && entity.points.length > 1) {
        segs.push({ a: entity.points[entity.points.length - 1], b: entity.points[0] });
      }
      return segs;
    }

    case 'freehand': {
      const segs: Array<{ a: Point2D; b: Point2D }> = [];
      for (let i = 0; i < entity.points.length - 1; i++) {
        segs.push({ a: entity.points[i], b: entity.points[i + 1] });
      }
      return segs;
    }

    case 'text': {
      const s = entity.fontSize * 0.5;
      return [
        { a: { x: entity.x - s, y: entity.y }, b: { x: entity.x + s, y: entity.y } },
        { a: { x: entity.x, y: entity.y - s }, b: { x: entity.x, y: entity.y + s } },
      ];
    }

    case 'image': {
      const { x, y, width: w, height: h } = entity;
      const corners: Point2D[] = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
      return corners.map((c, i) => ({ a: c, b: corners[(i + 1) % 4] }));
    }

    case 'arc': {
      const N = Math.max(
        8,
        Math.ceil(Math.abs(entity.endAngle - entity.startAngle) / (Math.PI / 16))
      );
      const segs: Array<{ a: Point2D; b: Point2D }> = [];
      for (let i = 0; i < N; i++) {
        const a1 = entity.startAngle + (i / N) * (entity.endAngle - entity.startAngle);
        const a2 = entity.startAngle + ((i + 1) / N) * (entity.endAngle - entity.startAngle);
        segs.push({
          a: {
            x: entity.cx + entity.radius * Math.cos(a1),
            y: entity.cy + entity.radius * Math.sin(a1),
          },
          b: {
            x: entity.cx + entity.radius * Math.cos(a2),
            y: entity.cy + entity.radius * Math.sin(a2),
          },
        });
      }
      return segs;
    }

    case 'dimension': {
      // Extension lines + dimension line as segments
      const { x1, y1, x2, y2, offset } = entity;
      const dx = x2 - x1,
        dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = (-dy / len) * offset;
      const ny = (dx / len) * offset;
      return [
        { a: { x: x1, y: y1 }, b: { x: x1 + nx, y: y1 + ny } },
        { a: { x: x2, y: y2 }, b: { x: x2 + nx, y: y2 + ny } },
        { a: { x: x1 + nx, y: y1 + ny }, b: { x: x2 + nx, y: y2 + ny } },
      ];
    }

    default:
      return [];
  }
}

/** Build ghost segments for all selected entities, translated by (dx, dy) */
export function buildGhostSegmentsTranslated(
  project: import('../core').Project,
  dx: number,
  dy: number
): Array<{ a: Point2D; b: Point2D }> {
  return project.selectionManager.getSelected().flatMap((id) => {
    const e = project.entityRegistry.get(id);
    if (!e) return [];
    return entityToSegments(e).map((seg) => ({
      a: { x: seg.a.x + dx, y: seg.a.y + dy },
      b: { x: seg.b.x + dx, y: seg.b.y + dy },
    }));
  });
}

/** Build ghost segments for all selected entities, rotated around (cx, cy) by angle */
export function buildGhostSegmentsRotated(
  project: import('../core').Project,
  cx: number,
  cy: number,
  angle: number
): Array<{ a: Point2D; b: Point2D }> {
  const rot = (p: Point2D): Point2D => {
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const rx = p.x - cx,
      ry = p.y - cy;
    return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos };
  };
  return project.selectionManager.getSelected().flatMap((id) => {
    const e = project.entityRegistry.get(id);
    if (!e) return [];
    return entityToSegments(e).map((seg) => ({ a: rot(seg.a), b: rot(seg.b) }));
  });
}
