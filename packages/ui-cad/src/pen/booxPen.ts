/**
 * booxPen — the bridge to low-latency drawing on Onyx Boox readers.
 *
 * ## Why this exists at all
 *
 * On an E Ink screen a stroke drawn in an HTML canvas appears with a delay of
 * 150–300 ms, and that is not the page code's fault. The route is long: pointer
 * event → JS handler → `canvas 2d` → WebView composition → SurfaceFlinger → a
 * panel refresh request. At the end the panel gets an ordinary refresh wave
 * (GC16/GU16), because the system has no reason to think this is writing.
 *
 * Onyx solves it with the `TouchHelper` from the `onyxsdk-pen` package: the
 * driver draws the stroke **straight onto the panel**, bypassing the whole
 * Android pipeline. The price is that the pen stops reaching the WebView — while
 * the mode is on, the page will not see a single `pointerdown` from the stylus.
 *
 * Hence the shape of this module: the page **hands over** the canvas area to the
 * native layer and **receives** finished strokes once the pen is lifted. The
 * drawing appears on screen at once (the driver draws it), and the document
 * model gets the same trace a moment later, taking it over on the next redraw.
 *
 * ## The division of labour between JS and Kotlin
 *
 * All the coordinate arithmetic sits here rather than in the native module —
 * because here it can be checked by a test. The native layer receives a ready
 * rectangle in device pixels and returns points in the same coordinates; the
 * only thing it contributes is the position of the WebView itself on screen.
 *
 * In an ordinary browser `window.__booxPen` does not exist and nothing in this
 * file runs — the canvas handles the pen exactly as before.
 */

/** A point as the driver reports it: device pixels, pressure on the driver's scale. */
export interface NativePenPoint {
  x: number;
  y: number;
  pressure: number;
  ts: number;
}

/** A stroke closed by lifting the pen (or the eraser). */
export interface NativeStroke {
  points: NativePenPoint[];
  /** `true` when the user used the eraser (the side button or the pen's other end). */
  erase: boolean;
}

/** A rectangle in device pixels, relative to the WebView's top-left corner. */
export interface DeviceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rectangle in CSS pixels, as `getBoundingClientRect` returns it. */
export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AreaOptions {
  /** Stroke width in CSS pixels. */
  strokeWidth: number;
  /** Stroke colour — the driver draws on a black-and-white panel anyway, but the SDK accepts it. */
  color: string;
}

export interface AreaMessage extends DeviceRect {
  type: 'boox:area';
  strokeWidth: number;
  color: string;
}

export interface EnableMessage {
  type: 'boox:enabled';
  enabled: boolean;
}

export interface ReleaseMessage {
  type: 'boox:release';
}

export type BooxPenMessage = AreaMessage | EnableMessage | ReleaseMessage;

/**
 * The contract injected by the React Native shell (`app/mycastle-mobile`).
 *
 * `available` speaks about the **device**, not about the bridge existing: the
 * application running on an ordinary phone injects a bridge with
 * `available: false` and a reason, so the page can tell the user why nothing
 * changed instead of staying silent.
 */
/**
 * The driver's actual state, reported by the native layer.
 *
 * `engaged` means "the driver **took** the pen", not "we asked it to". The
 * difference matters, because every failure path on the native side runs inside
 * `runOnUiThread`, after the promise has already resolved — without this channel
 * a failure looks exactly like a success.
 */
export interface NativeStatus {
  engaged: boolean;
  error: string | null;
  /**
   * The driver's geometry and call counters, on one line.
   *
   * On a reader there is no way to look at the logs, and without these numbers
   * "it does not work" means five different things at once. `begin=0` says the
   * driver does not see the pen inside the given rectangle; `begin>0 list=0`
   * that it sees it but hands over no points.
   */
  debug?: string | null;
}

export interface BooxPenBridge {
  available: boolean;
  /** A short state description — the device name, or the reason it is unavailable. */
  info?: string;
  send(message: BooxPenMessage): void;
  onStroke: ((stroke: NativeStroke) => void) | null;
  onStatus?: ((status: NativeStatus) => void) | null;
}

type MaybeHost = (Window & { __booxPen?: BooxPenBridge }) | undefined;

/** The bridge, if the page runs inside the native shell — otherwise `null`. */
export function getBooxPen(win: MaybeHost = typeof window === 'undefined' ? undefined : window): BooxPenBridge | null {
  return win?.__booxPen ?? null;
}

/** `true` only when native drawing will actually work. */
export function isBooxPenAvailable(win?: MaybeHost): boolean {
  return getBooxPen(win)?.available === true;
}

/**
 * Which of the four states we are in.
 *
 * The reason this exists is practical: "it does not work" has four different
 * causes here, and they all look the same — the pen simply draws with a delay.
 * Telling them apart by the symptom is impossible, so the page has to name them
 * itself. The costliest distinction is between **a browser** and **an outdated
 * application**: in both `window.__booxPen` is absent, yet it means different
 * things — in the first case everything is fine, in the second a new package has
 * to be installed. The shell's signature travels in its own `user agent` fragment
 * (`applicationNameForUserAgent` w `App.tsx`).
 */
export type PenHostState =
  | { kind: 'browser' }
  | { kind: 'shell-old' }
  | { kind: 'unsupported'; info?: string }
  | { kind: 'ready'; info?: string };

/** The `user agent` fragment by which the React Native shell marks itself on the page. */
const SHELL_UA_MARKER = 'MyCastleMobile';

export function describeHost(win?: MaybeHost): PenHostState {
  const w = win ?? (typeof window === 'undefined' ? undefined : window);
  const bridge = getBooxPen(w);
  if (bridge) {
    return bridge.available
      ? { kind: 'ready', info: bridge.info }
      : { kind: 'unsupported', info: bridge.info };
  }
  const ua = w?.navigator?.userAgent ?? '';
  return ua.includes(SHELL_UA_MARKER) ? { kind: 'shell-old' } : { kind: 'browser' };
}

/**
 * The canvas rectangle converted into device pixels.
 *
 * Rounding to whole pixels is not cosmetic: `setLimitRect` takes an
 * `android.graphics.Rect`, i.e. integers, and truncating the fraction on the
 * Java side would shift the area's boundary by half a pixel in an unpredictable
 * direction.
 */
export function areaMessage(rect: CssRect, dpr: number, opts: AreaOptions): AreaMessage {
  const scale = dpr > 0 ? dpr : 1;
  return {
    type: 'boox:area',
    left: Math.round(rect.left * scale),
    top: Math.round(rect.top * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
    // A zero-width stroke is valid for the driver, and invisible.
    strokeWidth: Math.max(1, Math.round(opts.strokeWidth * scale)),
    color: opts.color,
  };
}

/** The largest pressure value the Onyx driver reports. */
const DRIVER_PRESSURE_MAX = 4096;

/** The pressure used when the driver does not report one — mid-range, an even stroke. */
const NEUTRAL_PRESSURE = 0.5;

/**
 * Brings a whole stroke's pressure into the 0..1 range.
 *
 * The scale is decided **once per stroke**, not separately for each point. A
 * single point with the value 1 is ambiguous — on the driver's scale that is
 * almost no pressure, on the normalised scale the maximum — and a threshold
 * applied point by point would thicken the stroke exactly where the pen barely
 * touched the screen.
 */
export function normalizeStrokePressure(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const max = Math.max(...raw);
  if (max <= 0) return raw.map(() => NEUTRAL_PRESSURE);
  const scale = max <= 1 ? 1 : DRIVER_PRESSURE_MAX;
  return raw.map((p) => Math.min(1, Math.max(0, p / scale)));
}

/** A point ready to feed into the canvas: CSS pixels relative to the canvas, pressure 0..1. */
export interface CanvasPenPoint {
  x: number;
  y: number;
  pressure: number;
}

/** Converts a stroke from device pixels into canvas coordinates. */
export function toCanvasPoints(stroke: NativeStroke, area: DeviceRect, dpr: number): CanvasPenPoint[] {
  const scale = dpr > 0 ? dpr : 1;
  const pressure = normalizeStrokePressure(stroke.points.map((p) => p.pressure));
  return stroke.points.map((p, i) => ({
    x: (p.x - area.left) / scale,
    y: (p.y - area.top) / scale,
    pressure: pressure[i],
  }));
}

/**
 * How many of a stroke's points fell outside the declared area.
 *
 * The measure exists for one specific bug: were the native layer to return
 * coordinates in a different frame than assumed (the screen instead of the
 * WebView), every stroke would land consistently beside the canvas, offset by
 * the height of the status bar. Without this the symptom reads "the pen does
 * not work" and carries no hint about where to look.
 */
export function fractionOutside(points: NativePenPoint[], area: DeviceRect): number {
  if (points.length === 0) return 0;
  const outside = points.filter(
    (p) =>
      p.x < area.left ||
      p.y < area.top ||
      p.x > area.left + area.width ||
      p.y > area.top + area.height,
  ).length;
  return outside / points.length;
}
