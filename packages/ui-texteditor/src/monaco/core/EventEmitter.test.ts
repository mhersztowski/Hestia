import { EventEmitter } from './EventEmitter';

interface Events {
  greet: { name: string };
  count: number;
}

describe('EventEmitter', () => {
  it('delivers emitted events to subscribers', () => {
    const ee = new EventEmitter<Events>();
    const seen: string[] = [];
    ee.on('greet', (d) => seen.push(d.name));
    ee.emit('greet', { name: 'ada' });
    ee.emit('greet', { name: 'bob' });
    expect(seen).toEqual(['ada', 'bob']);
  });

  it('dispose() from on() removes the listener', () => {
    const ee = new EventEmitter<Events>();
    const fn = vi.fn();
    const sub = ee.on('count', fn);
    ee.emit('count', 1);
    sub.dispose();
    ee.emit('count', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once() fires exactly one time', () => {
    const ee = new EventEmitter<Events>();
    const fn = vi.fn();
    ee.once('count', fn);
    ee.emit('count', 1);
    ee.emit('count', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('listenerCount reflects add/remove', () => {
    const ee = new EventEmitter<Events>();
    expect(ee.listenerCount('count')).toBe(0);
    const s = ee.on('count', () => {});
    expect(ee.listenerCount('count')).toBe(1);
    s.dispose();
    expect(ee.listenerCount('count')).toBe(0);
  });

  it('removeAllListeners clears a single event or everything', () => {
    const ee = new EventEmitter<Events>();
    ee.on('count', () => {});
    ee.on('greet', () => {});
    ee.removeAllListeners('count');
    expect(ee.listenerCount('count')).toBe(0);
    expect(ee.listenerCount('greet')).toBe(1);
    ee.removeAllListeners();
    expect(ee.listenerCount('greet')).toBe(0);
  });

  it('isolates errors thrown by one listener from the others', () => {
    const ee = new EventEmitter<Events>();
    const good = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ee.on('count', () => { throw new Error('boom'); });
    ee.on('count', good);
    ee.emit('count', 1);
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('after dispose(), on() returns a no-op and emit() does nothing', () => {
    const ee = new EventEmitter<Events>();
    const fn = vi.fn();
    ee.dispose();
    const sub = ee.on('count', fn);
    ee.emit('count', 1);
    expect(fn).not.toHaveBeenCalled();
    expect(() => sub.dispose()).not.toThrow();
  });
});
