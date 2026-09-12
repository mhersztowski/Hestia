import { EventBus, globalEventBus } from './EventBus';

describe('EventBus', () => {
  it('publishes payloads to subscribers and returns an unsubscribe fn', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    const off = bus.on<number>('n', (v) => seen.push(v));
    bus.emit('n', 1);
    off();
    bus.emit('n', 2);
    expect(seen).toEqual([1]);
  });

  it('supports multiple subscribers for one event', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('e', a);
    bus.on('e', b);
    bus.emit('e', 'x');
    expect(a).toHaveBeenCalledWith('x');
    expect(b).toHaveBeenCalledWith('x');
  });

  it('once() unsubscribes after the first emission', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('e', fn);
    bus.emit('e', 1);
    bus.emit('e', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clear(event) removes only that event, clear() removes all', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('a', a);
    bus.on('b', b);
    bus.clear('a');
    bus.emit('a', 1);
    bus.emit('b', 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    bus.clear();
    bus.emit('b', 1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('catches errors thrown by handlers', () => {
    const bus = new EventBus();
    const good = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('e', () => { throw new Error('x'); });
    bus.on('e', good);
    expect(() => bus.emit('e', 1)).not.toThrow();
    expect(good).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('exposes a shared singleton instance', () => {
    expect(globalEventBus).toBeInstanceOf(EventBus);
  });
});
