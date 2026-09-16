import { describe, it, expect, vi } from 'vitest';
import {
  getBooxPen,
  isBooxPenAvailable,
  describeHost,
  areaMessage,
  normalizeStrokePressure,
  toCanvasPoints,
  fractionOutside,
  type BooxPenBridge,
  type NativeStroke,
} from './booxPen';

// The canvas rectangle in device pixels, relative to the WebView's top-left corner.
const AREA = { left: 40, top: 200, width: 800, height: 600 };

function bridge(overrides: Partial<BooxPenBridge> = {}): BooxPenBridge {
  return { available: true, send: vi.fn(), onStroke: null, ...overrides };
}

describe('wykrywanie mostka', () => {
  const win = () => ({}) as Window & { __booxPen?: BooxPenBridge };

  it('without the native shell there is no bridge', () => {
    expect(getBooxPen(win())).toBeNull();
    expect(isBooxPenAvailable(win())).toBe(false);
  });

  it('the shell on a device with no stylus reports itself unavailable', () => {
    const w = win();
    w.__booxPen = bridge({ available: false });
    // The bridge exists (the reason can be asked for), but native drawing does not.
    expect(getBooxPen(w)).not.toBeNull();
    expect(isBooxPenAvailable(w)).toBe(false);
  });

  it('on a Boox with the SDK the bridge is available', () => {
    const w = win();
    w.__booxPen = bridge();
    expect(isBooxPenAvailable(w)).toBe(true);
  });
});

describe('areaMessage — the drawing area in device pixels', () => {
  it('converts a CSS rectangle by the screen density', () => {
    const msg = areaMessage({ left: 20, top: 100, width: 400, height: 300 }, 2, {
      strokeWidth: 2.5,
      color: '#1976d2',
    });
    expect(msg).toMatchObject({
      type: 'boox:area',
      left: 40,
      top: 200,
      width: 800,
      height: 600,
      strokeWidth: 5,
    });
  });

  it('rounds to whole pixels — the EPD driver knows no fractions', () => {
    const msg = areaMessage({ left: 10.4, top: 10.6, width: 100.5, height: 100.5 }, 1.5, {
      strokeWidth: 1,
      color: '#000',
    });
    expect(Number.isInteger(msg.left)).toBe(true);
    expect(Number.isInteger(msg.top)).toBe(true);
    expect(Number.isInteger(msg.width)).toBe(true);
    expect(Number.isInteger(msg.height)).toBe(true);
  });

  it('the width never drops to zero — a zero-width pen draws nothing', () => {
    const msg = areaMessage({ left: 0, top: 0, width: 10, height: 10 }, 1, {
      strokeWidth: 0.05,
      color: '#000',
    });
    expect(msg.strokeWidth).toBeGreaterThanOrEqual(1);
  });
});

describe('normalizeStrokePressure', () => {
  it('the driver scale (0..4096) is brought down to 0..1', () => {
    const out = normalizeStrokePressure([0, 2048, 4096]);
    expect(out).toEqual([0, 0.5, 1]);
  });

  it('the scale is decided once per stroke, not per point', () => {
    // On the driver's scale 1 is almost no pressure. Were the threshold applied
    // to a single point, that point would get maximum pressure and the stroke
    // would thicken exactly where the pen barely touched the screen.
    const out = normalizeStrokePressure([1, 4096]);
    expect(out[0]).toBeCloseTo(1 / 4096, 6);
    expect(out[1]).toBe(1);
  });

  it('a device already reporting 0..1 is left unchanged', () => {
    expect(normalizeStrokePressure([0.25, 0.5, 1])).toEqual([0.25, 0.5, 1]);
  });

  it('values above the scale are clamped, not let through', () => {
    expect(normalizeStrokePressure([8192])).toEqual([1]);
  });

  it('a stroke with no pressure gets a neutral value rather than zero', () => {
    // All zeros mean "the driver does not report pressure". A zero after
    // normalisation would give a zero-width stroke, i.e. an invisible one.
    expect(normalizeStrokePressure([0, 0, 0])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('toCanvasPoints — from device pixels into canvas coordinates', () => {
  const stroke: NativeStroke = {
    erase: false,
    points: [
      { x: 40, y: 200, pressure: 2048, ts: 1 },
      { x: 240, y: 400, pressure: 4096, ts: 2 },
    ],
  };

  it('the area top-left corner is the canvas origin', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('distances are divided by the screen density', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[1]).toMatchObject({ x: 100, y: 100 });
  });

  it('nacisk przychodzi znormalizowany', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[0].pressure).toBe(0.5);
    expect(pts[1].pressure).toBe(1);
  });

  it('an empty stroke does not break the conversion', () => {
    expect(toCanvasPoints({ erase: false, points: [] }, AREA, 2)).toEqual([]);
  });
});

describe('fractionOutside — detecting a shifted coordinate frame', () => {
  it('a stroke inside the area gives zero', () => {
    const pts = [
      { x: 100, y: 300, pressure: 1, ts: 0 },
      { x: 200, y: 400, pressure: 1, ts: 0 },
    ];
    expect(fractionOutside(pts, AREA)).toBe(0);
  });

  it('a stroke entirely outside the area gives one', () => {
    // This is what an offset by the status bar height looks like: the strokes
    // land consistently beside the canvas. Without this measure the symptom is
    // "the pen does not work", with no hint.
    const pts = [
      { x: 100, y: 10, pressure: 1, ts: 0 },
      { x: 200, y: 20, pressure: 1, ts: 0 },
    ];
    expect(fractionOutside(pts, AREA)).toBe(1);
  });

  it('no points means no grounds for a conclusion', () => {
    expect(fractionOutside([], AREA)).toBe(0);
  });
});

describe('describeHost — which of the four states we are in', () => {
  const win = (ua: string, pen?: BooxPenBridge) =>
    ({ navigator: { userAgent: ua }, __booxPen: pen }) as unknown as Window & {
      __booxPen?: BooxPenBridge;
    };

  const APP_UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 MyCastleMobile/1.0';
  const BROWSER_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120';

  it('an ordinary browser', () => {
    expect(describeHost(win(BROWSER_UA))).toEqual({ kind: 'browser' });
  });

  it('the shell without the pen module — i.e. an old APK', () => {
    // The distinction that cost the most time: "no bridge" looks identical in a
    // browser and in an outdated application, yet means different things. The
    // shell's signature travels in its own `user agent` fragment.
    expect(describeHost(win(APP_UA))).toEqual({ kind: 'shell-old' });
  });

  it('the shell on a device the driver does not support', () => {
    const b = bridge({
      available: false,
      info: 'nie rozpoznano czytnika Onyx — manufacturer=samsung',
    });
    expect(describeHost(win(APP_UA, b))).toEqual({
      kind: 'unsupported',
      info: 'nie rozpoznano czytnika Onyx — manufacturer=samsung',
    });
  });

  it('wszystko na miejscu', () => {
    expect(describeHost(win(APP_UA, bridge({ info: 'ONYX Go 10.3' })))).toEqual({
      kind: 'ready',
      info: 'ONYX Go 10.3',
    });
  });

  it('the bridge outweighs the user agent', () => {
    // Should the shell ever stop adding itself to the `user agent`, the mere
    // presence of the bridge still decides — and that is what actually matters.
    expect(describeHost(win(BROWSER_UA, bridge()))).toMatchObject({ kind: 'ready' });
  });
});
