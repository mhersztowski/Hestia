import { EventBus } from './EventBus';

describe('EventBus', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });

  it('invokes registered handlers with the payload', () => {
    let received: unknown;
    bus.on('entity:added', p => { received = p; });
    bus.emit('entity:added', { id: 'a' });
    expect(received).toEqual({ id: 'a' });
  });

  it('supports multiple handlers on the same event', () => {
    let count = 0;
    bus.on('layer:added', () => { count++; });
    bus.on('layer:added', () => { count++; });
    bus.emit('layer:added');
    expect(count).toBe(2);
  });

  it('returns an unsubscribe function from on()', () => {
    let count = 0;
    const off = bus.on('selection:changed', () => { count++; });
    bus.emit('selection:changed');
    off();
    bus.emit('selection:changed');
    expect(count).toBe(1);
  });

  it('off() removes a specific handler', () => {
    let count = 0;
    const h = () => { count++; };
    bus.on('history:changed', h);
    bus.off('history:changed', h);
    bus.emit('history:changed');
    expect(count).toBe(0);
  });

  it('off() on an unregistered event type is a no-op', () => {
    expect(() => bus.off('project:loaded', () => {})).not.toThrow();
  });

  it('emit on an event with no handlers is a no-op', () => {
    expect(() => bus.emit('viewmode:changed', '3d')).not.toThrow();
  });

  it('emit works with no payload', () => {
    let called = false;
    bus.on('entity:removed', () => { called = true; });
    bus.emit('entity:removed');
    expect(called).toBe(true);
  });

  it('clear() removes all handlers', () => {
    let count = 0;
    bus.on('entity:added', () => { count++; });
    bus.clear();
    bus.emit('entity:added');
    expect(count).toBe(0);
  });
});
