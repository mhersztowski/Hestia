import { drawPage, CANVAS_W, CANVAS_H, DEFAULT_BG } from './renderNotes';
import type { NotePage } from './renderNotes';

function mockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

describe('renderNotes constants', () => {
  it('exposes canvas dimensions and default background', () => {
    expect(CANVAS_W).toBe(1400);
    expect(CANVAS_H).toBe(900);
    expect(DEFAULT_BG).toBe('#1a1a1a');
  });
});

describe('drawPage', () => {
  it('fills the background using the page bgColor when provided', () => {
    const ctx = mockCtx();
    const page: NotePage = { id: 'p', elements: [], bgColor: '#123456' };
    drawPage(ctx, page, new Map(), () => {});
    expect((ctx as any).fillRect).toHaveBeenCalledWith(0, 0, CANVAS_W, CANVAS_H);
    expect(ctx.fillStyle).toBeDefined();
  });

  it('draws text elements via fillText', () => {
    const ctx = mockCtx();
    const page: NotePage = {
      id: 'p',
      elements: [{ id: 't', kind: 'text', x: 10, y: 20, text: 'hi', fontSize: 16, color: '#fff' }],
    };
    drawPage(ctx, page, new Map(), () => {});
    expect((ctx as any).fillText).toHaveBeenCalledWith('hi', 10, 20);
  });

  it('draws marker strokes with a single path', () => {
    const ctx = mockCtx();
    const page: NotePage = {
      id: 'p',
      elements: [{
        id: 's', kind: 'stroke', tool: 'marker', color: '#f00', width: 3,
        points: [{ x: 0, y: 0, p: 0.5 }, { x: 5, y: 5, p: 0.5 }, { x: 10, y: 0, p: 0.5 }],
      }],
    };
    drawPage(ctx, page, new Map(), () => {});
    expect((ctx as any).stroke).toHaveBeenCalledTimes(1);
    expect((ctx as any).save).toHaveBeenCalled();
    expect((ctx as any).restore).toHaveBeenCalled();
  });

  it('draws pencil strokes as one stroke per segment', () => {
    const ctx = mockCtx();
    const page: NotePage = {
      id: 'p',
      elements: [{
        id: 's', kind: 'stroke', tool: 'pencil', color: '#0f0', width: 2,
        points: [{ x: 0, y: 0, p: 1 }, { x: 1, y: 1, p: 1 }, { x: 2, y: 2, p: 1 }],
      }],
    };
    drawPage(ctx, page, new Map(), () => {});
    // 3 points => 2 segments => 2 strokes
    expect((ctx as any).stroke).toHaveBeenCalledTimes(2);
  });

  it('skips strokes with fewer than 2 points', () => {
    const ctx = mockCtx();
    const page: NotePage = {
      id: 'p',
      elements: [{ id: 's', kind: 'stroke', tool: 'pencil', color: '#0f0', width: 2, points: [{ x: 0, y: 0, p: 1 }] }],
    };
    drawPage(ctx, page, new Map(), () => {});
    expect((ctx as any).stroke).not.toHaveBeenCalled();
  });

  it('caches images by src across calls', () => {
    const ctx = mockCtx();
    const cache = new Map();
    const page: NotePage = {
      id: 'p',
      elements: [{ id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'http://img/a.png' }],
    };
    drawPage(ctx, page, cache, () => {});
    expect(cache.has('http://img/a.png')).toBe(true);
    const img = cache.get('http://img/a.png');
    drawPage(ctx, page, cache, () => {});
    expect(cache.get('http://img/a.png')).toBe(img); // reused, not recreated
  });
});
