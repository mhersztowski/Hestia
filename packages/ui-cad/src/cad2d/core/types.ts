export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type LineType = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type Units = 'mm' | 'cm' | 'm' | 'in';

export type EntityType = 'line' | 'circle' | 'polyline' | 'rect' | 'arc' | 'ellipse' | 'point' | 'text' | 'image' | 'dimension' | 'box3d' | 'cylinder3d' | 'sphere3d' | 'freehand';

export type SnapMode = 'grid' | 'endpoint' | 'midpoint' | 'center' | 'nearest' | 'intersection' | 'perpendicular' | 'tangent';

export type ViewMode = '2d' | '3d';
