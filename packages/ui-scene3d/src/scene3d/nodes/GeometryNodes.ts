import { Vector3 } from 'three';
import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

/**
 * Geometry annotation nodes — points, segments, lines and angles meant to be
 * shown as measurement/construction overlays inside a 3D scene. Unlike meshes
 * they carry no material; the viewer renders them with camera-aware sizing
 * (constant pixel size markers, billboarded labels) so they stay readable at
 * any zoom level. Parameters are stored in the node's local space, so the base
 * transform (position/rotation/scale) still moves/orients the whole annotation.
 */

export type GeoFieldKind = 'vector3' | 'number' | 'color' | 'boolean' | 'text';

export interface GeoEditableField {
  /** Property suffix — the editor dispatches `geo.<key>` changes. */
  key: string;
  label: string;
  kind: GeoFieldKind;
  value: number | boolean | string | [number, number, number];
  step?: number;
  min?: number;
  /** vector3 fields that are a local-space point editable with a viewport gizmo. */
  gizmoEditable?: boolean;
  /** vector3 point fields that can be bound to follow another scene node. */
  bindable?: boolean;
  /** id of the node this point is currently bound to (follows its position), or null. */
  binding?: string | null;
}

export interface GeoMetric {
  label: string;
  value: string;
}

type Vec3 = [number, number, number];

const toVec3 = (v: unknown, fallback: Vec3): Vec3 => {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) {
    return [v[0], v[1], v[2]];
  }
  return [...fallback];
};

// ─── Point ───────────────────────────────────────────────────────────────────

export interface GeometryPointNodeData extends SceneNodeData {
  type: 'geometry-point';
  color: string;
  /** On-screen marker diameter in pixels (constant regardless of zoom). */
  pixelSize: number;
  showLabel: boolean;
  /** Custom label text; empty → shows world coordinates. */
  label: string;
}

export class GeometryPointNode extends SceneNode {
  color: string;
  pixelSize: number;
  showLabel: boolean;
  label: string;

  constructor(data?: Partial<GeometryPointNodeData>) {
    super({ ...data, type: 'geometry-point' });
    this.color = data?.color ?? '#ffd54f';
    this.pixelSize = data?.pixelSize ?? 9;
    this.showLabel = data?.showLabel ?? true;
    this.label = data?.label ?? '';
  }

  getEditableFields(): GeoEditableField[] {
    return [
      { key: 'color', label: 'Color', kind: 'color', value: this.color },
      { key: 'pixelSize', label: 'Size (px)', kind: 'number', value: this.pixelSize, step: 1, min: 1 },
      { key: 'showLabel', label: 'Show Label', kind: 'boolean', value: this.showLabel },
      { key: 'label', label: 'Label', kind: 'text', value: this.label },
    ];
  }

  getMetrics(): GeoMetric[] {
    return [];
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'geo.color': this.color = value as string; this.notifyChange(); return true;
      case 'geo.pixelSize': this.pixelSize = value as number; this.notifyChange(); return true;
      case 'geo.showLabel': this.showLabel = value as boolean; this.notifyChange(); return true;
      case 'geo.label': this.label = value as string; this.notifyChange(); return true;
      default: return super.setProperty(property, value);
    }
  }

  override toData(): GeometryPointNodeData {
    return { ...super.toData(), type: 'geometry-point', color: this.color, pixelSize: this.pixelSize, showLabel: this.showLabel, label: this.label };
  }
}

// ─── Segment ─────────────────────────────────────────────────────────────────

export interface GeometrySegmentNodeData extends SceneNodeData {
  type: 'geometry-segment';
  start: Vec3;
  end: Vec3;
  color: string;
  pixelSize: number;
  /** Show the measured length at the midpoint. */
  showLength: boolean;
  /** Node id whose world position drives `start` live (binding). null = free. */
  startBinding?: string | null;
  endBinding?: string | null;
}

export class GeometrySegmentNode extends SceneNode {
  start: Vec3;
  end: Vec3;
  color: string;
  pixelSize: number;
  showLength: boolean;
  startBinding: string | null;
  endBinding: string | null;

  constructor(data?: Partial<GeometrySegmentNodeData>) {
    super({ ...data, type: 'geometry-segment' });
    this.start = toVec3(data?.start, [0, 0, 0]);
    this.end = toVec3(data?.end, [1, 0, 0]);
    this.color = data?.color ?? '#4fc3f7';
    this.pixelSize = data?.pixelSize ?? 7;
    this.showLength = data?.showLength ?? true;
    this.startBinding = data?.startBinding ?? null;
    this.endBinding = data?.endBinding ?? null;
  }

  getEditableFields(): GeoEditableField[] {
    return [
      { key: 'start', label: 'Start', kind: 'vector3', value: this.start, step: 0.1, gizmoEditable: true, bindable: true, binding: this.startBinding },
      { key: 'end', label: 'End', kind: 'vector3', value: this.end, step: 0.1, gizmoEditable: true, bindable: true, binding: this.endBinding },
      { key: 'color', label: 'Color', kind: 'color', value: this.color },
      { key: 'pixelSize', label: 'Endpoint (px)', kind: 'number', value: this.pixelSize, step: 1, min: 0 },
      { key: 'showLength', label: 'Show Length', kind: 'boolean', value: this.showLength },
    ];
  }

  getMetrics(): GeoMetric[] {
    const len = new Vector3(...this.start).distanceTo(new Vector3(...this.end));
    return [{ label: 'Length', value: len.toFixed(3) }];
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'geo.start': this.start = toVec3(value, this.start); this.notifyChange(); return true;
      case 'geo.end': this.end = toVec3(value, this.end); this.notifyChange(); return true;
      case 'geo.color': this.color = value as string; this.notifyChange(); return true;
      case 'geo.pixelSize': this.pixelSize = value as number; this.notifyChange(); return true;
      case 'geo.showLength': this.showLength = value as boolean; this.notifyChange(); return true;
      case 'geo.bindStart': this.startBinding = (value as string) || null; this.notifyChange(); return true;
      case 'geo.bindEnd': this.endBinding = (value as string) || null; this.notifyChange(); return true;
      default: return super.setProperty(property, value);
    }
  }

  override toData(): GeometrySegmentNodeData {
    return { ...super.toData(), type: 'geometry-segment', start: [...this.start], end: [...this.end], color: this.color, pixelSize: this.pixelSize, showLength: this.showLength, startBinding: this.startBinding, endBinding: this.endBinding };
  }
}

// ─── Line (infinite) ──────────────────────────────────────────────────────────

export interface GeometryLineNodeData extends SceneNodeData {
  type: 'geometry-line';
  origin: Vec3;
  direction: Vec3;
  color: string;
  showLabel: boolean;
  label: string;
  originBinding?: string | null;
}

export class GeometryLineNode extends SceneNode {
  origin: Vec3;
  direction: Vec3;
  color: string;
  showLabel: boolean;
  label: string;
  originBinding: string | null;

  constructor(data?: Partial<GeometryLineNodeData>) {
    super({ ...data, type: 'geometry-line' });
    this.origin = toVec3(data?.origin, [0, 0, 0]);
    this.direction = toVec3(data?.direction, [1, 0, 0]);
    this.color = data?.color ?? '#81c784';
    this.showLabel = data?.showLabel ?? false;
    this.label = data?.label ?? '';
    this.originBinding = data?.originBinding ?? null;
  }

  getEditableFields(): GeoEditableField[] {
    return [
      { key: 'origin', label: 'Origin', kind: 'vector3', value: this.origin, step: 0.1, gizmoEditable: true, bindable: true, binding: this.originBinding },
      { key: 'direction', label: 'Direction', kind: 'vector3', value: this.direction, step: 0.1 },
      { key: 'color', label: 'Color', kind: 'color', value: this.color },
      { key: 'showLabel', label: 'Show Label', kind: 'boolean', value: this.showLabel },
      { key: 'label', label: 'Label', kind: 'text', value: this.label },
    ];
  }

  getMetrics(): GeoMetric[] {
    const d = new Vector3(...this.direction);
    return d.lengthSq() > 1e-9 ? [{ label: 'Direction', value: d.normalize().toArray().map((n) => n.toFixed(2)).join(', ') }] : [];
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'geo.origin': this.origin = toVec3(value, this.origin); this.notifyChange(); return true;
      case 'geo.direction': this.direction = toVec3(value, this.direction); this.notifyChange(); return true;
      case 'geo.color': this.color = value as string; this.notifyChange(); return true;
      case 'geo.showLabel': this.showLabel = value as boolean; this.notifyChange(); return true;
      case 'geo.label': this.label = value as string; this.notifyChange(); return true;
      case 'geo.bindOrigin': this.originBinding = (value as string) || null; this.notifyChange(); return true;
      default: return super.setProperty(property, value);
    }
  }

  override toData(): GeometryLineNodeData {
    return { ...super.toData(), type: 'geometry-line', origin: [...this.origin], direction: [...this.direction], color: this.color, showLabel: this.showLabel, label: this.label, originBinding: this.originBinding };
  }
}

// ─── Angle ───────────────────────────────────────────────────────────────────

export interface GeometryAngleNodeData extends SceneNodeData {
  type: 'geometry-angle';
  vertex: Vec3;
  /** First arm endpoint. */
  p1: Vec3;
  /** Second arm endpoint. */
  p2: Vec3;
  color: string;
  /** On-screen arc radius in pixels (constant regardless of zoom). */
  arcPixelRadius: number;
  showLabel: boolean;
  vertexBinding?: string | null;
  p1Binding?: string | null;
  p2Binding?: string | null;
}

export class GeometryAngleNode extends SceneNode {
  vertex: Vec3;
  p1: Vec3;
  p2: Vec3;
  color: string;
  arcPixelRadius: number;
  showLabel: boolean;
  vertexBinding: string | null;
  p1Binding: string | null;
  p2Binding: string | null;

  constructor(data?: Partial<GeometryAngleNodeData>) {
    super({ ...data, type: 'geometry-angle' });
    this.vertex = toVec3(data?.vertex, [0, 0, 0]);
    this.p1 = toVec3(data?.p1, [1, 0, 0]);
    this.p2 = toVec3(data?.p2, [0, 1, 0]);
    this.color = data?.color ?? '#ba68c8';
    this.arcPixelRadius = data?.arcPixelRadius ?? 44;
    this.showLabel = data?.showLabel ?? true;
    this.vertexBinding = data?.vertexBinding ?? null;
    this.p1Binding = data?.p1Binding ?? null;
    this.p2Binding = data?.p2Binding ?? null;
  }

  /** Angle at the vertex in degrees. */
  getDegrees(): number {
    const a = new Vector3(...this.p1).sub(new Vector3(...this.vertex));
    const b = new Vector3(...this.p2).sub(new Vector3(...this.vertex));
    if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return 0;
    const cos = Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  getEditableFields(): GeoEditableField[] {
    return [
      { key: 'vertex', label: 'Vertex', kind: 'vector3', value: this.vertex, step: 0.1, gizmoEditable: true, bindable: true, binding: this.vertexBinding },
      { key: 'p1', label: 'Arm A', kind: 'vector3', value: this.p1, step: 0.1, gizmoEditable: true, bindable: true, binding: this.p1Binding },
      { key: 'p2', label: 'Arm B', kind: 'vector3', value: this.p2, step: 0.1, gizmoEditable: true, bindable: true, binding: this.p2Binding },
      { key: 'color', label: 'Color', kind: 'color', value: this.color },
      { key: 'arcPixelRadius', label: 'Arc (px)', kind: 'number', value: this.arcPixelRadius, step: 2, min: 8 },
      { key: 'showLabel', label: 'Show Angle', kind: 'boolean', value: this.showLabel },
    ];
  }

  getMetrics(): GeoMetric[] {
    return [{ label: 'Angle', value: `${this.getDegrees().toFixed(1)}°` }];
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'geo.vertex': this.vertex = toVec3(value, this.vertex); this.notifyChange(); return true;
      case 'geo.p1': this.p1 = toVec3(value, this.p1); this.notifyChange(); return true;
      case 'geo.p2': this.p2 = toVec3(value, this.p2); this.notifyChange(); return true;
      case 'geo.color': this.color = value as string; this.notifyChange(); return true;
      case 'geo.arcPixelRadius': this.arcPixelRadius = value as number; this.notifyChange(); return true;
      case 'geo.showLabel': this.showLabel = value as boolean; this.notifyChange(); return true;
      case 'geo.bindVertex': this.vertexBinding = (value as string) || null; this.notifyChange(); return true;
      case 'geo.bindP1': this.p1Binding = (value as string) || null; this.notifyChange(); return true;
      case 'geo.bindP2': this.p2Binding = (value as string) || null; this.notifyChange(); return true;
      default: return super.setProperty(property, value);
    }
  }

  override toData(): GeometryAngleNodeData {
    return { ...super.toData(), type: 'geometry-angle', vertex: [...this.vertex], p1: [...this.p1], p2: [...this.p2], color: this.color, arcPixelRadius: this.arcPixelRadius, showLabel: this.showLabel, vertexBinding: this.vertexBinding, p1Binding: this.p1Binding, p2Binding: this.p2Binding };
  }
}

export type GeometryPrimitiveNode =
  | GeometryPointNode
  | GeometrySegmentNode
  | GeometryLineNode
  | GeometryAngleNode;

export const GEOMETRY_PRIMITIVE_TYPES = [
  'geometry-point',
  'geometry-segment',
  'geometry-line',
  'geometry-angle',
] as const;

export function isGeometryPrimitiveNode(node: SceneNode): node is GeometryPrimitiveNode {
  return (GEOMETRY_PRIMITIVE_TYPES as readonly string[]).includes(node.type);
}
