/** Pixels per grid unit (one hole pitch = 2.54 mm real, displayed as GRID px). */
export const GRID = 20;

/** Pin snap radius in grid units. ≥ √2/2 (≈0.707) so the cursor anywhere
 *  inside a pin's cell reliably snaps to that pin. */
export const SNAP_RADIUS = 0.75;

export type PartCategory =
  | 'board'
  | 'microcontroller'
  | 'passive'
  | 'active'
  | 'sensor'
  | 'power'
  | 'display';

export interface Pin {
  id: string;
  /** X offset from component top-left anchor, in grid units */
  x: number;
  /** Y offset from component top-left anchor, in grid units */
  y: number;
  label?: string;
}

export type BodyShape =
  | 'breadboard'
  | 'ic'
  | 'resistor'
  | 'led'
  | 'button'
  | 'capacitor'
  | 'transistor'
  | 'dip'
  | 'buzzer'
  | 'joystick'
  | 'symbol';   // osadzony symbol schematyczny (z PcbView) — geometria w `symbolShapes`

/**
 * Prymityw rysunkowy osadzonego symbolu. Współrzędne w jednostkach siatki
 * (jak `Pin.x/y`), mnożone przez GRID przy renderowaniu. `lead` to „schodki".
 */
export type SymShape =
  | { k: 'poly'; pts: WirePoint[]; closed?: boolean; color?: string; width?: number; fill?: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; color?: string; width?: number; fill?: string }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color?: string; width?: number; fill?: string }
  | { k: 'text'; x: number; y: number; text: string; size: number; color?: string; anchor?: 'start' | 'middle' | 'end' }
  | { k: 'lead'; pts: WirePoint[]; color?: string };

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  description?: string;
  /** Size in grid units */
  width: number;
  height: number;
  pins: Pin[];
  bodyColor: string;
  bodyShape: BodyShape;
  /** Short text shown on the body */
  label?: string;
  /** LED/indicator color (for led shape) */
  indicatorColor?: string;
  /** Geometria osadzonego symbolu (tylko dla bodyShape === 'symbol'). */
  symbolShapes?: SymShape[];
}

export interface ComponentPlacement {
  id: string;
  partId: string;
  /** Top-left anchor, in grid units */
  x: number;
  y: number;
  /** Placement rotation in degrees — any angle (positive = clockwise, SVG y-down). */
  rotation: number;
  /** When true, the component's pin labels are drawn on the canvas. */
  showPinLabels?: boolean;
  /** Free-text annotation rendered above the component (e.g. `R 330 [Ω]`, `U1`). */
  userLabel?: string;
}

export interface WirePoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  /** Ordered list of grid-unit waypoints */
  points: WirePoint[];
  color: string;
}

export interface ElectronicsSchema {
  version: 1;
  components: ComponentPlacement[];
  wires: Wire[];
  /** Definicje osadzonych symboli, do których odwołują się komponenty przez partId. */
  embeddedParts?: PartDef[];
}

export const WIRE_COLORS = [
  '#ef5350', // red
  '#42a5f5', // blue
  '#66bb6a', // green
  '#ffa726', // orange
  '#ffffff',  // white
  '#000000',  // black
  '#ab47bc', // purple
  '#26c6da', // cyan
  '#ffee58', // yellow
];

export type InteractionMode = 'select' | 'place' | 'wire';

// ── Rotation geometry ─────────────────────────────────────────────────────────
// Components rotate by an arbitrary angle. The math below keeps a rotated
// component's axis-aligned bounding box anchored at its (x, y) grid cell, and
// computes pin centres in world space so wires still snap to rotated parts.

/** Rotate a local point (grid units) by a placement angle in degrees — SVG y-down frame. */
export function rotateLocal(lx: number, ly: number, rotation: number): { x: number; y: number } {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

/**
 * Translation (grid units) that re-anchors a rotated w×h box back to its
 * top-left: shifts the box so the min corner of its rotated bounding box
 * lands at the origin.
 */
export function rotationOffset(w: number, h: number, rotation: number): { x: number; y: number } {
  let minX = Infinity, minY = Infinity;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const r = rotateLocal(cx, cy, rotation);
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
  }
  return { x: -minX, y: -minY };
}

/** World-space centre of a component pin (grid units), accounting for rotation. */
export function pinWorldCenter(comp: ComponentPlacement, part: PartDef, pin: Pin): { x: number; y: number } {
  const off = rotationOffset(part.width, part.height, comp.rotation);
  const r = rotateLocal(pin.x + 0.5, pin.y + 0.5, comp.rotation);
  return { x: comp.x + off.x + r.x, y: comp.y + off.y + r.y };
}
