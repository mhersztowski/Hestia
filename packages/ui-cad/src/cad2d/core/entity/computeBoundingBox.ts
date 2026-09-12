import type { BoundingBox2D, Point2D } from '../types';
import type { ArcEntity, Box3dEntity, CircleEntity, Cylinder3dEntity, DimensionEntity, Entity, FreehandEntity, ImageEntity, LineEntity, PointEntity, PolylineEntity, RectEntity, Sphere3dEntity, TextEntity } from './types';

function boundsFromPoints(points: Point2D[]): BoundingBox2D {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function lineBox(e: LineEntity): BoundingBox2D {
  return boundsFromPoints([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
}

function circleBox(e: CircleEntity): BoundingBox2D {
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

function pointBox(e: PointEntity): BoundingBox2D {
  return { minX: e.x, minY: e.y, maxX: e.x, maxY: e.y };
}

function polylineBox(e: PolylineEntity): BoundingBox2D {
  return boundsFromPoints(e.points);
}

function rectBox(e: RectEntity): BoundingBox2D {
  return { minX: e.x, minY: e.y, maxX: e.x + e.width, maxY: e.y + e.height };
}

function arcBox(e: ArcEntity): BoundingBox2D {
  // Approximate: use center ± radius
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

function dimensionBox(e: DimensionEntity): BoundingBox2D {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * e.offset;
  const ny = (dx / len) * e.offset;
  return boundsFromPoints([
    { x: e.x1, y: e.y1 },
    { x: e.x2, y: e.y2 },
    { x: e.x1 + nx, y: e.y1 + ny },
    { x: e.x2 + nx, y: e.y2 + ny },
  ]);
}

function box3dBox(e: Box3dEntity): BoundingBox2D {
  return { minX: e.cx - e.width / 2, minY: e.cy - e.depth / 2, maxX: e.cx + e.width / 2, maxY: e.cy + e.depth / 2 };
}

function cylinder3dBox(e: Cylinder3dEntity): BoundingBox2D {
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

function sphere3dBox(e: Sphere3dEntity): BoundingBox2D {
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

function textBox(e: TextEntity): BoundingBox2D {
  const w = e.content.length * e.fontSize * 0.6;
  const h = e.fontSize * 1.4;
  return { minX: e.x, minY: e.y, maxX: e.x + w, maxY: e.y + h };
}

function imageBox(e: ImageEntity): BoundingBox2D {
  return { minX: e.x, minY: e.y, maxX: e.x + e.width, maxY: e.y + e.height };
}

function freehandBox(e: FreehandEntity): BoundingBox2D {
  if (e.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return boundsFromPoints(e.points);
}

export function computeBoundingBox(entity: Entity): BoundingBox2D {
  switch (entity.type) {
    case 'line': return lineBox(entity);
    case 'circle': return circleBox(entity);
    case 'point': return pointBox(entity);
    case 'polyline': return polylineBox(entity);
    case 'rect': return rectBox(entity);
    case 'arc': return arcBox(entity);
    case 'text': return textBox(entity);
    case 'image': return imageBox(entity);
    case 'freehand': return freehandBox(entity);
    case 'dimension': return dimensionBox(entity);
    case 'box3d': return box3dBox(entity);
    case 'cylinder3d': return cylinder3dBox(entity);
    case 'sphere3d': return sphere3dBox(entity);
  }
}
