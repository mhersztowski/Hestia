// @vitest-environment jsdom
import { useRef } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBooxPen } from './useBooxPen';
import type { BooxPenBridge, BooxPenMessage, CanvasPenPoint } from './booxPen';

// jsdom has no ResizeObserver, and the hook uses it to watch the canvas size.
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  callback: () => void;
  constructor(cb: () => void) { this.callback = cb; FakeResizeObserver.last = this; }
  observe() {}
  disconnect() {}
}

const AREA_CSS = { left: 10, top: 20, width: 400, height: 300 };

// getBoundingClientRect w jsdom zawsze zwraca zera — podstawiamy rozmiar,
// because without one the hook (rightly) treats the canvas as not laid out yet.
// A variable, so the dialog's opening animation can be replayed: zero first.
let currentRect = { ...AREA_CSS };

function mountCanvas() {
  currentRect = { ...AREA_CSS };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...currentRect,
      right: currentRect.left + currentRect.width,
      bottom: currentRect.top + currentRect.height,
      x: currentRect.left,
      y: currentRect.top,
      toJSON: () => ({}),
    }),
  });
}

interface HarnessProps {
  active: boolean;
  onStroke: (points: CanvasPenPoint[], erase: boolean) => void;
}

function Harness({ active, onStroke }: HarnessProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const status = useBooxPen({ target: ref, active, strokeWidth: 2, color: '#000', onStroke });
  return (
    <>
      <canvas ref={ref} data-testid="canvas" />
      <span data-testid="engaged">{String(status.engaged)}</span>
      <span data-testid="available">{String(status.available)}</span>
      <span data-testid="error">{status.error ?? ''}</span>
      <span data-testid="strokes">{String(status.strokes)}</span>
      <span data-testid="outside">{status.lastOutside === null ? '-' : String(status.lastOutside)}</span>
    </>
  );
}

function installBridge(available = true): { bridge: BooxPenBridge; sent: BooxPenMessage[] } {
  const sent: BooxPenMessage[] = [];
  const bridge: BooxPenBridge = {
    available,
    info: available ? 'Boox Go 10.3' : 'this is not an Onyx device',
    send: (m) => { sent.push(m); },
    onStroke: null,
    onStatus: null,
  };
  (window as Window & { __booxPen?: BooxPenBridge }).__booxPen = bridge;
  return { bridge, sent };
}

describe('useBooxPen', () => {
  beforeEach(() => {
    mountCanvas();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    delete (window as Window & { __booxPen?: BooxPenBridge }).__booxPen;
    vi.unstubAllGlobals();
  });

  it('without the native shell it does nothing and says it is unavailable', () => {
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(getByTestId('available').textContent).toBe('false');
    expect(getByTestId('engaged').textContent).toBe('false');
  });

  it('on an ordinary phone the bridge is there but does not take the pen', () => {
    const { sent } = installBridge(false);
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(getByTestId('available').textContent).toBe('false');
    expect(sent).toEqual([]);
  });

  it('enabling hands the area to the driver and only then turns on raw mode', () => {
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);

    // The order matters: `setRawDrawingEnabled` without a prior `setLimitRect`
    // takes the pen across the whole screen, so touch stops working everywhere,
    // including on the toolbar buttons.
    expect(sent.map((m) => m.type)).toEqual(['boox:area', 'boox:enabled']);
    expect(sent[0]).toMatchObject({ left: 20, top: 40, width: 800, height: 600, strokeWidth: 4 });
    expect(sent[1]).toMatchObject({ enabled: true });
  });

  it('disabling gives the pen back to the page', () => {
    const { sent } = installBridge();
    const { rerender } = render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    rerender(<Harness active={false} onStroke={vi.fn()} />);
    expect(sent).toContainEqual({ type: 'boox:enabled', enabled: false });
  });

  it('"engaged" means a report from the driver, not the request we sent', () => {
    // This is the heart of it: every failure path on the native side runs inside
    // `runOnUiThread`, after the promise has already resolved. Were `engaged` to
    // come from merely sending the message, the interface would show "working"
    // even when `TouchHelper` had never been created at all.
    const { bridge, sent } = installBridge();
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(sent).toContainEqual({ type: 'boox:enabled', enabled: true });
    expect(getByTestId('engaged').textContent).toBe('false');

    act(() => { bridge.onStatus?.({ engaged: true, error: null }); });
    expect(getByTestId('engaged').textContent).toBe('true');
  });

  it('the driver refusing reaches the page together with the reason', () => {
    const { bridge } = installBridge();
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    act(() => { bridge.onStatus?.({ engaged: false, error: 'brak obszaru rysowania' }); });
    expect(getByTestId('engaged').textContent).toBe('false');
    expect(getByTestId('error').textContent).toBe('brak obszaru rysowania');
  });

  it('unmounting releases the driver, even when nobody turned drawing off', () => {
    const { sent, bridge } = installBridge();
    const { unmount } = render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    unmount();
    expect(sent.map((m) => m.type)).toContain('boox:release');
    expect(bridge.onStroke).toBeNull();
    expect(bridge.onStatus).toBeNull();
  });

  it('a finished stroke reaches the page in canvas coordinates', () => {
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    render(<Harness active onStroke={onStroke} />);

    act(() => {
      bridge.onStroke?.({
        erase: false,
        points: [
          { x: 20, y: 40, pressure: 4096, ts: 1 },
          { x: 220, y: 240, pressure: 2048, ts: 2 },
        ],
      });
    });

    expect(onStroke).toHaveBeenCalledTimes(1);
    const [points, erase] = onStroke.mock.calls[0];
    expect(erase).toBe(false);
    expect(points[0]).toMatchObject({ x: 0, y: 0, pressure: 1 });
    expect(points[1]).toMatchObject({ x: 100, y: 100, pressure: 0.5 });
  });

  it('the eraser arrives through the same channel, flagged', () => {
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    render(<Harness active onStroke={onStroke} />);
    act(() => {
      bridge.onStroke?.({ erase: true, points: [{ x: 20, y: 40, pressure: 1, ts: 1 }] });
    });
    expect(onStroke.mock.calls[0][1]).toBe(true);
  });

  it('a stroke arriving after disabling is rejected', () => {
    // The driver can deliver the last stroke after the page has switched tools —
    // without this the stroke would appear in the mode in which the user was
    // panning the view, not drawing.
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    const { rerender } = render(<Harness active onStroke={onStroke} />);
    rerender(<Harness active={false} onStroke={onStroke} />);
    act(() => {
      bridge.onStroke?.({ erase: false, points: [{ x: 20, y: 40, pressure: 1, ts: 1 }] });
    });
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('does not turn on raw mode until the canvas has a size', () => {
    // Raw mode with no area given takes the pen across the whole screen — along
    // with the toolbar and the rest of the application. Zero size is not an edge
    // case but the normal state for the first frames of the animation
    // otwierania dialogu MUI.
    currentRect = { left: 0, top: 0, width: 0, height: 0 };
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    expect(sent).toEqual([]);
  });

  it('once the canvas gets a size, raw mode turns itself on', () => {
    currentRect = { left: 0, top: 0, width: 0, height: 0 };
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    currentRect = { ...AREA_CSS };
    act(() => { FakeResizeObserver.last?.callback(); });
    expect(sent.map((m) => m.type)).toEqual(['boox:area', 'boox:enabled']);
  });

  it('counts strokes and the share of points outside the area', () => {
    // Zero strokes despite a report of "I took the pen" means raw mode applies
    // to the wrong rectangle — and that looks exactly like nothing happening at
    // all. The counter is the only thing that tells those two cases apart
    // without plugging the reader into a computer.
    const { bridge } = installBridge();
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(getByTestId('strokes').textContent).toBe('0');
    expect(getByTestId('outside').textContent).toBe('-');

    act(() => {
      bridge.onStroke?.({ erase: false, points: [{ x: 20, y: 40, pressure: 1, ts: 1 }] });
    });
    expect(getByTestId('strokes').textContent).toBe('1');
    expect(getByTestId('outside').textContent).toBe('0');

    act(() => {
      // A point far above the canvas — the signature of a status-bar-height mistake.
      bridge.onStroke?.({ erase: false, points: [{ x: 20, y: 0, pressure: 1, ts: 2 }] });
    });
    expect(getByTestId('strokes').textContent).toBe('2');
    expect(getByTestId('outside').textContent).toBe('1');
  });

  it('resizing the canvas refreshes the area at the driver', () => {
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    act(() => { FakeResizeObserver.last?.callback(); });
    expect(sent.map((m) => m.type)).toContain('boox:area');
  });
});
