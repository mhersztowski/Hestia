/**
 * useBooxPen — hands the canvas area over to the Onyx pen driver and receives
 * finished strokes back from it.
 *
 * `booxPen.ts` explains why this exists. Here there is only the lifecycle: when
 * to take the pen, when to give it back, and what to do when the canvas resizes.
 *
 * Four things that are easy to miss and that this hook takes care of:
 *
 *  • **Order.** The area first, then the enabling. Raw mode without an area
 *    restriction takes the pen across the whole screen — including the toolbar
 *    buttons, which stop responding.
 *
 *  • **Releasing on unmount.** The driver does not know the dialog has closed.
 *    A missed release leaves the reader in a state where the pen works nowhere
 *    in the application until it is killed.
 *
 *  • **Late strokes.** The driver can deliver the last trace after the tool has
 *    already been switched. Without filtering, the stroke shows up in the mode
 *    in which the user was panning the view.
 *
 *  • **The area before enabling.** While the dialog's opening animation runs the
 *    canvas has zero size. Raw mode enabled without an area takes the pen across
 *    the **whole screen** — including the toolbar and the rest of the
 *    application — so we wait for the canvas to get its dimensions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  areaMessage,
  fractionOutside,
  getBooxPen,
  toCanvasPoints,
  type CanvasPenPoint,
  type DeviceRect,
  type NativeStroke,
  type NativeStatus,
} from './booxPen';

export interface UseBooxPenOptions {
  /** The element whose rectangle we hand to the driver. */
  target: React.RefObject<HTMLElement | null>;
  /** Whether the driver should take the pen right now. */
  active: boolean;
  strokeWidth: number;
  color: string;
  onStroke: (points: CanvasPenPoint[], erase: boolean) => void;
}

export interface BooxPenStatus {
  /** Whether native drawing is possible on this device at all. */
  available: boolean;
  /** The device name, or the reason it is unavailable — to show the user. */
  info?: string;
  /**
   * Whether the driver **really** holds the pen.
   *
   * The value comes from the native layer's report, not from the fact that a
   * request was sent. It used to be the other way round, and the interface
   * showed "working" even when `TouchHelper` had never been created at all.
   */
  engaged: boolean;
  /** Why the driver refused — `null` until it refuses. */
  error: string | null;
  /** The raw geometry and counter description from the native layer. */
  debug: string | null;
  /**
   * How many strokes have arrived from the driver since the page opened.
   *
   * It settles a case that is otherwise invisible: the driver reports that it
   * took the pen, and yet nothing gets faster. That means raw mode applies to
   * the **wrong rectangle** — the drawing happens elsewhere on the screen while
   * the canvas receives the ordinary, slow pointer events. A counter stuck at
   * zero despite drawing says so outright.
   */
  strokes: number;
  /**
   * What fraction of the last stroke's points fell outside the canvas area.
   *
   * A value close to one is the signature of a coordinate mistake — the strokes
   * land consistently beside it, usually by the height of the status bar.
   */
  lastOutside: number | null;
}

/** The share of out-of-area points above which we call the coordinates broken. */
const OFFSET_ALARM = 0.5;

export function useBooxPen(opts: UseBooxPenOptions): BooxPenStatus {
  const { target, active, strokeWidth, color, onStroke } = opts;

  const bridge = getBooxPen();
  const available = bridge?.available === true;

  // The state reported by the native layer. Kept apart from "we asked", because
  // it was exactly the gap between the two that was invisible.
  const [native, setNative] = useState<NativeStatus>({ engaged: false, error: null });
  // Whether the driver has been given a sensible area yet. Kept apart from
  // `active`, because the canvas is sometimes ready only a few frames after the
  // page wants to start drawing.
  const [areaReady, setAreaReady] = useState(false);

  // The last declared area — needed when converting points back into canvas
  // coordinates. Kept in a ref, because the driver's callback reads it, and that
  // callback has nothing to do with React's render cycle.
  const areaRef = useRef<DeviceRect | null>(null);
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const requestedRef = useRef(false);
  const warnedRef = useRef(false);
  const [received, setReceived] = useState<{ strokes: number; lastOutside: number | null }>({
    strokes: 0,
    lastOutside: null,
  });

  const publishArea = useCallback((): boolean => {
    if (!bridge?.available) return false;
    const el = target.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const msg = areaMessage(rect, dpr, { strokeWidth, color });
    areaRef.current = { left: msg.left, top: msg.top, width: msg.width, height: msg.height };
    bridge.send(msg);
    setAreaReady(true);
    return true;
  }, [bridge, target, strokeWidth, color]);

  // Receiving strokes. A separate effect from the enabling, because the callback
  // has to be attached even while the mode is still turning on — the driver is
  // sometimes faster than the next pass of effects.
  useEffect(() => {
    if (!bridge?.available) return;
    const handler = (stroke: NativeStroke) => {
      if (!requestedRef.current) return;
      const area = areaRef.current;
      if (!area) return;
      const outside = fractionOutside(stroke.points, area);
      setReceived(prev => ({ strokes: prev.strokes + 1, lastOutside: outside }));
      if (!warnedRef.current && outside > OFFSET_ALARM) {
        warnedRef.current = true;
        // Konsekwentne trafianie obok kanwy znaczy jedno: warstwa natywna
        // computes coordinates in a different frame than the one assumed here.
        console.warn(
          '[booxPen] strokes are landing outside the declared area — ' +
            'check the WebView offset in the native module',
          { area, first: stroke.points[0] },
        );
      }
      const dpr = window.devicePixelRatio || 1;
      onStrokeRef.current(toCanvasPoints(stroke, area, dpr), stroke.erase);
    };
    bridge.onStroke = handler;
    const status = (s: NativeStatus) => setNative(s);
    bridge.onStatus = status;
    return () => {
      if (bridge.onStatus === status) bridge.onStatus = null;
      // Only our own callback — the bridge has a single slot, and clearing it
      // unconditionally would take it from whoever attached later.
      if (bridge.onStroke === handler) bridge.onStroke = null;
    };
  }, [bridge]);

  // Geometry — declared **before** enabling, so that the first area is sent
  // przed pierwszym `enabled: true`.
  useEffect(() => {
    if (!bridge?.available || !active) {
      setAreaReady(false);
      return;
    }
    const el = target.current;
    if (!el) return;

    const refresh = () => { publishArea(); };
    refresh();

    // Two extra attempts on the following frames: the MUI dialog opens with an
    // animation, and while it runs the canvas still has zero size.
    const frames = [
      requestAnimationFrame(refresh),
      requestAnimationFrame(() => requestAnimationFrame(refresh)),
    ];

    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      frames.forEach(cancelAnimationFrame);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [bridge, active, target, publishArea]);

  // Turning raw mode on and off.
  useEffect(() => {
    if (!bridge?.available) return;
    // Without an area the driver would take the pen across the whole screen — see the header.
    if (!active || !areaReady) return;

    bridge.send({ type: 'boox:enabled', enabled: true });
    requestedRef.current = true;

    return () => {
      requestedRef.current = false;
      bridge.send({ type: 'boox:enabled', enabled: false });
    };
  }, [bridge, active, areaReady]);

  // Releasing the driver on unmount — see the file header.
  useEffect(() => {
    if (!bridge?.available) return;
    return () => {
      bridge.send({ type: 'boox:release' });
    };
  }, [bridge]);

  return {
    available,
    info: bridge?.info,
    engaged: native.engaged,
    error: native.error,
    debug: native.debug ?? null,
    strokes: received.strokes,
    lastOutside: received.lastOutside,
  };
}
