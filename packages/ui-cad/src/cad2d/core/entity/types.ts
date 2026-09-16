import type { BoundingBox2D, EntityType, LineType, Point2D } from '../types';

export interface EntityBase {
  id: string;
  type: EntityType;
  layerId: string;
  color: string | 'bylayer';
  lineType: LineType | 'bylayer';
  lineWidth: number | 'bylayer';
  visible: boolean;
  locked: boolean;
  extrudeHeight: number; // 0 = flat 2D
  boundingBox: BoundingBox2D;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
}

export interface PointEntity extends EntityBase {
  type: 'point';
  x: number;
  y: number;
}

export interface PolylineEntity extends EntityBase {
  type: 'polyline';
  points: Point2D[];
  closed: boolean;
  /**
   * The parameters of a shape that is built rather than drawn (slot, arc slot,
   * B-spline). When present, the editor shows grips for the control points in
   * `ctrl` and rebuilds `points` from these parameters as one is dragged.
   */
  construction?: {
    kind: 'slot' | 'arcSlot' | 'bspline';
    ctrl: Point2D[]; // punkty kontrolne (grips)
    radius?: number; // slot / arcSlot — radius (half the width)
    interpolating?: boolean; // bspline — przez punkty (by knots)
    periodic?: boolean; // bspline — closed
  };
}

export interface RectEntity extends EntityBase {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArcEntity extends EntityBase {
  type: 'arc';
  cx: number;
  cy: number;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians
}

export interface TextEntity extends EntityBase {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number; // world units
  fontFamily: string;
  angle: number; // radians
}

export interface ImageEntity extends EntityBase {
  type: 'image';
  x: number; // bottom-left
  y: number;
  width: number;
  height: number;
  src: string; // data URL or external URL
}

export interface FreehandEntity extends EntityBase {
  type: 'freehand';
  points: Point2D[];
  strokeWidth: number;
  smooth: boolean;
}

/**
 * Anchors a dimension endpoint to a feature of another entity so it follows
 * that entity when the shape moves or is reshaped ("intelligent dimension").
 * `point-on` lets the endpoint ride any point along an edge (param t / angle).
 */
export interface DimAnchor {
  entityId: string;
  kind: 'endpoint' | 'midpoint' | 'center' | 'point-on';
  /** endpoint/midpoint index, or polyline segment, or rect edge (0..3). */
  index?: number;
  /** parameter [0..1] along a segment/edge (point-on line/polyline/rect). */
  t?: number;
  /** radians on a circle/arc (point-on circle/arc). */
  angle?: number;
  /** When true the anchor is kept but ignored — the endpoint behaves as a literal point. */
  disabled?: boolean;
}

export interface DimensionEntity extends EntityBase {
  type: 'dimension';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number; // signed perpendicular distance from p1-p2 line to dimension line
  /**
   * The kind of dimension. 'diameter' is drawn inside the circle as a
   * double-headed arrow through its centre (p1 and p2 are the ends of the
   * diameter), with the ⌀ label along that line, `labelDist` away from the
   * centre. Absent = an ordinary linear dimension.
   */
  dimType?: 'diameter';
  /** For `dimType: 'diameter'` — how far the ⌀ label sits from the centre along the dimension line. */
  labelDist?: number;
  /** When set, x1,y1 are resolved live from this anchor (follows the shape). */
  anchor1?: DimAnchor;
  /** When set, x2,y2 are resolved live from this anchor (follows the shape). */
  anchor2?: DimAnchor;
  /** A driving constraint: the geometry is kept so that the dimension equals `value`. */
  driving?: boolean;
  /** The value a driving dimension holds the geometry to (mm). */
  value?: number;
  /**
   * A dimension to one of the axes: 'x' measures to the X axis (y = 0), 'y' to
   * the Y axis (x = 0). The foot of the perpendicular (x2,y2) is computed from
   * the anchored end (x1,y1), so it follows that vertex — the distance is to
   * the whole axis, not to a point on it.
   */
  axis?: 'x' | 'y';
}

// 3D primitive entities — placed in XY plane, extruding along +Z
export interface Box3dEntity extends EntityBase {
  type: 'box3d';
  cx: number; // center X
  cy: number; // center Y
  width: number;
  depth: number; // Y dimension (footprint depth)
  height: number; // Z extrusion height
}

export interface Cylinder3dEntity extends EntityBase {
  type: 'cylinder3d';
  cx: number;
  cy: number;
  radius: number;
  height: number; // Z extrusion height
}

export interface Sphere3dEntity extends EntityBase {
  type: 'sphere3d';
  cx: number;
  cy: number;
  radius: number;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | PointEntity
  | PolylineEntity
  | RectEntity
  | ArcEntity
  | TextEntity
  | ImageEntity
  | FreehandEntity
  | DimensionEntity
  | Box3dEntity
  | Cylinder3dEntity
  | Sphere3dEntity;

// Input types for creating entities (id and boundingBox auto-generated)
export type EntityInput =
  | Omit<LineEntity, 'id' | 'boundingBox'>
  | Omit<CircleEntity, 'id' | 'boundingBox'>
  | Omit<PointEntity, 'id' | 'boundingBox'>
  | Omit<PolylineEntity, 'id' | 'boundingBox'>
  | Omit<RectEntity, 'id' | 'boundingBox'>
  | Omit<ArcEntity, 'id' | 'boundingBox'>
  | Omit<TextEntity, 'id' | 'boundingBox'>
  | Omit<ImageEntity, 'id' | 'boundingBox'>
  | Omit<FreehandEntity, 'id' | 'boundingBox'>
  | Omit<DimensionEntity, 'id' | 'boundingBox'>
  | Omit<Box3dEntity, 'id' | 'boundingBox'>
  | Omit<Cylinder3dEntity, 'id' | 'boundingBox'>
  | Omit<Sphere3dEntity, 'id' | 'boundingBox'>;
