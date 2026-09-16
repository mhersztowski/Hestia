import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CoreObject,
  Signal,
  Property,
  Timer,
  EventBus,
  StateMachine,
  CommandStack,
  FnCommand,
  ListModel,
  debounce,
  connectOnce,
} from './index';

// ── CoreObject & Signal ──────────────────────────────────────────────────────────

describe('Signal', () => {
  it('emits to connected slots', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    sig.connect((n) => received.push(n));
    sig.emit(1);
    sig.emit(2);
    expect(received).toEqual([1, 2]);
  });

  it('disconnect stops emissions', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    const conn = sig.connect((n) => received.push(n));
    sig.emit(1);
    conn.disconnect();
    sig.emit(2);
    expect(received).toEqual([1]);
  });

  it('blockSignals suppresses emissions', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    sig.connect((n) => received.push(n));
    sig.blockSignals(true);
    sig.emit(99);
    sig.blockSignals(false);
    sig.emit(1);
    expect(received).toEqual([1]);
  });

  it('re-entrant emit is queued and executed after outer emit finishes', () => {
    const sig = new Signal<[n: number]>();
    const order: number[] = [];
    sig.connect((n) => {
      order.push(n);
      if (n === 1) sig.emit(2); // re-entrant call
      order.push(n * 10); // must run before the queued emit(2)
    });
    sig.emit(1);
    // Expected: outer slot runs to completion (push 1, push 10) then queued emit(2) fires (push 2, push 20)
    expect(order).toEqual([1, 10, 2, 20]);
  });

  it('circuit breaker disconnects slot after threshold consecutive errors', () => {
    const sig = new Signal();
    const spy = vi.fn(() => {
      throw new Error('boom');
    });
    sig.connect(spy);
    // First 2 calls: error logged but slot stays connected
    sig.emit();
    sig.emit();
    expect(sig.connectionCount).toBe(1);
    // Third call: threshold reached, slot disconnected
    sig.emit();
    expect(sig.connectionCount).toBe(0);
    // Fourth call: slot is gone
    sig.emit();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('circuit breaker resets error count on success', () => {
    const sig = new Signal();
    let shouldThrow = true;
    const spy = vi.fn(() => {
      if (shouldThrow) throw new Error('boom');
    });
    sig.connect(spy);
    sig.emit(); // errorCount = 1
    sig.emit(); // errorCount = 2
    shouldThrow = false;
    sig.emit(); // success → errorCount resets to 0
    shouldThrow = true;
    sig.emit(); // errorCount = 1 (not 3, so no disconnect)
    expect(sig.connectionCount).toBe(1);
  });

  it('emitQueued defers to next microtask', async () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    sig.connect((n) => received.push(n));
    sig.emitQueued(42);
    expect(received).toEqual([]); // not yet
    await Promise.resolve();
    expect(received).toEqual([42]);
  });
});

describe('CoreObject', () => {
  it('builds parent/child tree', () => {
    const root = new CoreObject();
    const child = new CoreObject(root, 'child');
    expect(root.children).toContain(child);
    expect(child.parent).toBe(root);
  });

  it('cascade destroy removes children', () => {
    const root = new CoreObject();
    const child = new CoreObject(root);
    root.destroy();
    expect(root.isDestroyed).toBe(true);
    expect(child.isDestroyed).toBe(true);
  });

  it('auto-disconnects tracked connections on destroy', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    const ctx = new CoreObject();
    sig.connect((n) => received.push(n), ctx);
    sig.emit(1);
    ctx.destroy();
    sig.emit(2);
    expect(received).toEqual([1]);
  });

  it('findChild by name', () => {
    const root = new CoreObject(undefined, 'root');
    const a = new CoreObject(root, 'a');
    const b = new CoreObject(a, 'b');
    expect(root.findChild('b')).toBe(b);
  });

  it('emits tree signals when reparenting', () => {
    const root = new CoreObject(undefined, 'root');
    const added: string[] = [];
    const removed: string[] = [];
    const parents: (string | null)[] = [];
    root.childAdded.connect((c) => added.push(c.objectName));
    root.childRemoved.connect((c) => removed.push(c.objectName));

    // A parent passed to the constructor must not NPE: every field of
    // CoreObject exists before its own constructor body calls setParent().
    const child = new CoreObject(root, 'child');
    child.parentChanged.connect((p) => parents.push(p ? p.objectName : null));

    root.removeChild(child);
    root.addChild(child);

    expect(added).toEqual(['child', 'child']);
    expect(removed).toEqual(['child']);
    expect(parents).toEqual([null, 'root']);
  });

  it('refuses to build a cycle', () => {
    const root = new CoreObject(undefined, 'root');
    const child = new CoreObject(root, 'child');
    expect(() => root.setParent(child)).toThrow(TypeError);
    expect(() => root.setParent(root)).toThrow(TypeError);
  });

  it('generates id lazily and keeps it stable', () => {
    const obj = new CoreObject();
    const first = obj.id;
    expect(obj.id).toBe(first);

    const root = new CoreObject(undefined, 'root');
    const child = new CoreObject(root, 'child');
    const other = new CoreObject(root, 'other');
    expect(root.findById(child.id)).toBe(child);
    // `other.id` was never read, so it has no id to match against
    expect(root.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(other.objectName).toBe('other');
  });

  it('traverses depth-first, pre- and post-order', () => {
    const root = new CoreObject(undefined, 'root');
    const a = new CoreObject(root, 'a');
    const b = new CoreObject(a, 'b');
    const c = new CoreObject(root, 'c');

    const pre: string[] = [];
    root.traverse((n) => pre.push(n.objectName));
    const post: string[] = [];
    root.traversePost((n) => post.push(n.objectName));

    expect(pre).toEqual(['root', 'a', 'b', 'c']);
    expect(post).toEqual(['b', 'a', 'c', 'root']);
    expect(b.depth).toBe(2);
    expect(b.ancestors()).toEqual([a, root]);
    expect(b.root).toBe(root);
    expect(b.isDescendantOf(root)).toBe(true);
    expect(c.isDescendantOf(a)).toBe(false);
    expect(root.findDescendant((n) => n.objectName === 'b')).toBe(b);
    expect(root.findChildren((n) => n !== a)).toEqual([b, c]);
  });

  it('connect() helper tracks connection', () => {
    const sig = new Signal<[n: number]>();
    const ctx = new CoreObject();
    const received: number[] = [];
    ctx.connect(sig, (n) => received.push(n));
    sig.emit(5);
    ctx.destroy();
    sig.emit(6);
    expect(received).toEqual([5]);
  });
});

// ── Property ─────────────────────────────────────────────────────────────────

describe('Property', () => {
  it('emits changed on new value', () => {
    const p = new Property(0);
    const log: [number, number][] = [];
    p.changed.connect((n, o) => log.push([n, o]));
    p.value = 1;
    p.value = 2;
    expect(log).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('does not emit when value is the same', () => {
    const p = new Property(42);
    const fn = vi.fn();
    p.changed.connect(fn);
    p.value = 42;
    expect(fn).not.toHaveBeenCalled();
  });

  it('validator rejects invalid values', () => {
    const p = new Property(5, (v) => v >= 0 && v <= 10);
    p.value = 20;
    expect(p.value).toBe(5);
  });

  it('bindTo mirrors source', () => {
    const src = new Property(1);
    const dst = new Property(0);
    dst.bindTo(src);
    expect(dst.value).toBe(1);
    src.value = 7;
    expect(dst.value).toBe(7);
  });
});

// ── Timer ────────────────────────────────────────────────────────────────────

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('fires timeout repeatedly', () => {
    const t = new Timer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.start(100);
    vi.advanceTimersByTime(350);
    expect(fn).toHaveBeenCalledTimes(3);
    t.stop();
    t.destroy();
  });

  it('singleShot fires once', () => {
    const t = new Timer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.startSingleShot(200);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    t.destroy();
  });

  it('stops on destroy', () => {
    const t = new Timer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.start(100);
    t.destroy();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ── EventBus ─────────────────────────────────────────────────────────────────

describe('EventBus', () => {
  it('delivers messages to subscribers', () => {
    const bus = new EventBus();
    const received: number[] = [];
    bus.subscribe<number>('tick', (v) => received.push(v));
    bus.publish('tick', 1);
    bus.publish('tick', 2);
    expect(received).toEqual([1, 2]);
    bus.destroy();
  });

  it('wildcard subscribeAll receives all topics', () => {
    const bus = new EventBus();
    const log: string[] = [];
    bus.subscribeAll((topic) => log.push(topic));
    bus.publish('a', 1);
    bus.publish('b', 2);
    expect(log).toEqual(['a', 'b']);
    bus.destroy();
  });
});

// ── StateMachine ─────────────────────────────────────────────────────────────

describe('StateMachine', () => {
  it('transitions between states', () => {
    const fsm = new StateMachine();
    fsm.addState('idle');
    fsm.addState('running');
    fsm.addTransition({ from: 'idle', to: 'running', event: 'start' });
    fsm.addTransition({ from: 'running', to: 'idle', event: 'stop' });
    fsm.start('idle');

    expect(fsm.currentStateId).toBe('idle');
    fsm.send('start');
    expect(fsm.currentStateId).toBe('running');
    fsm.send('stop');
    expect(fsm.currentStateId).toBe('idle');
    fsm.destroy();
  });

  it('guard can block transition', () => {
    const fsm = new StateMachine();
    fsm.addState('off');
    fsm.addState('on');
    fsm.addTransition<boolean>({
      from: 'off',
      to: 'on',
      event: 'toggle',
      guard: (authorized) => authorized,
    });
    fsm.start('off');
    fsm.send('toggle', false);
    expect(fsm.currentStateId).toBe('off');
    fsm.send('toggle', true);
    expect(fsm.currentStateId).toBe('on');
    fsm.destroy();
  });
});

// ── CommandStack ─────────────────────────────────────────────────────────────

describe('CommandStack', () => {
  it('execute / undo / redo', () => {
    let value = 0;
    const stack = new CommandStack();
    stack.push(
      FnCommand.create(
        'set 1',
        () => {
          value = 1;
        },
        () => {
          value = 0;
        }
      )
    );
    stack.push(
      FnCommand.create(
        'set 2',
        () => {
          value = 2;
        },
        () => {
          value = 1;
        }
      )
    );
    expect(value).toBe(2);
    stack.undo();
    expect(value).toBe(1);
    stack.undo();
    expect(value).toBe(0);
    stack.redo();
    expect(value).toBe(1);
    stack.destroy();
  });

  it('canUndo / canRedo reflect stack state', () => {
    const stack = new CommandStack();
    expect(stack.canUndo).toBe(false);
    stack.push(
      FnCommand.create(
        'noop',
        () => {},
        () => {}
      )
    );
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
    stack.undo();
    expect(stack.canRedo).toBe(true);
    stack.destroy();
  });
});

// ── ListModel ────────────────────────────────────────────────────────────────

describe('ListModel', () => {
  it('append / remove / count', () => {
    const m = new ListModel<string>();
    m.append('a', 'b', 'c');
    expect(m.count).toBe(3);
    m.remove(1);
    expect(m.toArray()).toEqual(['a', 'c']);
    m.destroy();
  });

  it('emits rowsInserted signal', () => {
    const m = new ListModel<number>();
    const log: [number, number][] = [];
    m.rowsInserted.connect((idx, count) => log.push([idx, count]));
    m.append(1, 2, 3);
    expect(log).toEqual([[0, 3]]);
    m.destroy();
  });

  it('modelReset on clear', () => {
    const m = new ListModel([1, 2, 3]);
    const fn = vi.fn();
    m.modelReset.connect(fn);
    m.clear();
    expect(fn).toHaveBeenCalledOnce();
    m.destroy();
  });
});

// ── Utilities ─────────────────────────────────────────────────────────────────

describe('connectOnce', () => {
  it('fires only once then disconnects', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    connectOnce(sig, (n) => received.push(n));
    sig.emit(1);
    sig.emit(2);
    expect(received).toEqual([1]);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('batches rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledOnce();
  });
});
