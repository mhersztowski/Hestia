import { describe, it, expect, vi } from 'vitest';
import {
  wrapQt,
  createQt,
  QtNode,
  QtButtonNode,
  QtSliderNode,
  QtWidgetNode,
  type QtObjectLike,
} from '../index';

// ── Minimal fake of the browser-Qt meta-object system ────────────────────────
// Mirrors packages/core/browser/qt (metaProperties/metaSignals/property/…)
// so the wrappers can be tested hermetically in a plain Node environment.

class FakeSignal {
  #name: string;
  #conns = new Set<(...a: unknown[]) => void>();
  constructor(name = '') {
    this.#name = name;
  }
  name() {
    return this.#name;
  }
  connect(slot: (...a: unknown[]) => void) {
    this.#conns.add(slot);
    return { disconnect: () => this.#conns.delete(slot) };
  }
  disconnect() {
    this.#conns.clear();
    return true;
  }
  emit(...a: unknown[]) {
    for (const c of [...this.#conns]) c(...a);
    return this.#conns.size > 0;
  }
}

class FakeQObject {
  static properties: Record<string, unknown> = {};
  static signals: Record<string, unknown> = { destroyed: { params: [] } };
  _objectName = '';
  _parent: FakeQObject | null = null;
  _children: FakeQObject[] = [];
  _destroyed = false;
  destroyed = new FakeSignal('destroyed');

  objectName() {
    return this._objectName;
  }
  setObjectName(n: string) {
    this._objectName = String(n);
    return this;
  }
  className() {
    return this.constructor.name;
  }
  inherits(name: string) {
    let c: unknown = this.constructor;
    while (c && (c as { name?: string }).name) {
      if ((c as { name: string }).name === name) return true;
      c = Object.getPrototypeOf(c);
    }
    return false;
  }
  isDestroyed() {
    return this._destroyed;
  }

  #metaOf(field: 'properties' | 'signals'): Record<string, any> {
    const chain: any[] = [];
    let c: any = this.constructor;
    while (c && c !== Object && c !== Function.prototype) {
      chain.unshift(c);
      c = Object.getPrototypeOf(c);
    }
    const out: Record<string, any> = {};
    for (const k of chain) {
      if (Object.prototype.hasOwnProperty.call(k, field)) Object.assign(out, k[field]);
    }
    return out;
  }
  metaProperties() {
    return this.#metaOf('properties');
  }
  metaSignals() {
    return this.#metaOf('signals');
  }
  propertyNames() {
    return Object.keys(this.metaProperties());
  }
  signalNames() {
    return Object.keys(this.metaSignals());
  }

  property(key: string): unknown {
    const m = this.metaProperties()[key];
    return m ? m.get(this) : (this as any)['_' + key];
  }
  setProperty(key: string, v: unknown) {
    const m = this.metaProperties()[key];
    if (m && m.set) {
      m.set(this, v);
      if (m.notify && (this as any)[m.notify] instanceof FakeSignal)
        (this as any)[m.notify].emit(v);
    } else {
      (this as any)['_' + key] = v;
    }
    return this;
  }

  parent() {
    return this._parent;
  }
  children() {
    return this._children.slice();
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.destroyed.emit(this);
  }
}

class FakePushButton extends FakeQObject {
  static properties = {
    text: {
      get: (o: any) => o._text,
      set: (o: any, v: any) => {
        o._text = String(v);
      },
      type: 'string',
    },
    checked: {
      get: (o: any) => o._checked,
      set: (o: any, v: any) => {
        o._checked = !!v;
      },
      notify: 'toggled',
      type: 'bool',
    },
  };
  static signals = { clicked: { params: [] }, toggled: { params: ['checked'] } };
  _text = '';
  _checked = false;
  clicked = new FakeSignal('clicked');
  toggled = new FakeSignal('toggled');
  override className() {
    return 'QPushButton';
  }
  override inherits(n: string) {
    return ['QPushButton', 'QAbstractButton', 'QWidget'].includes(n) || super.inherits(n);
  }
  click() {
    this.clicked.emit();
  }
}

class FakeSlider extends FakeQObject {
  static properties = {
    value: {
      get: (o: any) => o._value,
      set: (o: any, v: any) => {
        o._value = v;
      },
      notify: 'valueChanged',
      type: 'number',
    },
    minimum: { get: (o: any) => o._min, type: 'number' },
  };
  static signals = { valueChanged: { params: ['value'] } };
  _value = 0;
  _min = 0;
  valueChanged = new FakeSignal('valueChanged');
  override className() {
    return 'QSlider';
  }
  override inherits(n: string) {
    return ['QSlider', 'QAbstractSlider', 'QWidget'].includes(n) || super.inherits(n);
  }
  /** Native-side change (e.g. user drag) — fires notify like the real widget. */
  drag(v: number) {
    this._value = v;
    this.valueChanged.emit(v);
  }
}

const asQt = (o: FakeQObject) => o as unknown as QtObjectLike;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('wrapQt', () => {
  it('picks a typed subclass by className', () => {
    expect(wrapQt(asQt(new FakePushButton()))).toBeInstanceOf(QtButtonNode);
    expect(wrapQt(asQt(new FakeSlider()))).toBeInstanceOf(QtSliderNode);
  });

  it('falls back to the closest ancestor via inherits()', () => {
    class FancyButton extends FakePushButton {
      override className() {
        return 'FancyButton';
      }
    }
    const node = wrapQt(asQt(new FancyButton()));
    expect(node).toBeInstanceOf(QtButtonNode); // inherits QPushButton
  });

  it('falls back to base QtNode for unknown objects', () => {
    const node = wrapQt(asQt(new FakeQObject()));
    expect(node).toBeInstanceOf(QtNode);
    expect(node).not.toBeInstanceOf(QtWidgetNode);
  });
});

describe('QtProperty binding', () => {
  it('reads and writes through the native object', () => {
    const native = new FakePushButton();
    const btn = wrapQt(asQt(native)) as QtButtonNode;
    btn.text.value = 'Save';
    expect(native._text).toBe('Save');
    expect(btn.text.value).toBe('Save');
    expect(btn.get('text')).toBe('Save');
  });

  it('emits changed when the native notify signal fires', () => {
    const native = new FakePushButton();
    const btn = wrapQt(asQt(native)) as QtButtonNode;
    const spy = vi.fn();
    btn.checked.changed.connect(spy);
    btn.checked.value = true; // write → notify → changed
    expect(spy).toHaveBeenCalledWith(true, false);
    expect(native._checked).toBe(true);
  });

  it('reflects native-side changes (e.g. user drag)', () => {
    const native = new FakeSlider();
    const slider = wrapQt(asQt(native)) as QtSliderNode;
    const spy = vi.fn();
    slider.value.changed.connect(spy);
    native.drag(42);
    expect(spy).toHaveBeenCalledWith(42, 0);
    expect(slider.value.value).toBe(42);
  });

  it('setSilent does not emit changed', () => {
    const native = new FakeSlider();
    const slider = wrapQt(asQt(native)) as QtSliderNode;
    const spy = vi.fn();
    slider.value.changed.connect(spy);
    slider.value.setSilent(7);
    expect(spy).not.toHaveBeenCalled();
    expect(native._value).toBe(7);
  });

  it('read-only properties refuse writes', () => {
    const native = new FakeSlider();
    const slider = wrapQt(asQt(native)) as QtSliderNode;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    slider.minimum.value = 5;
    expect(native._min).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('signal bridging', () => {
  it('bridges native signals into minislib Signals', () => {
    const native = new FakePushButton();
    const btn = wrapQt(asQt(native)) as QtButtonNode;
    const spy = vi.fn();
    btn.clicked.connect(spy);
    native.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('on() connects a slot with the node as context', () => {
    const native = new FakeSlider();
    const slider = wrapQt(asQt(native)) as QtSliderNode;
    const seen: number[] = [];
    slider.on<[number]>('valueChanged', (v) => seen.push(v));
    native.drag(3);
    native.drag(9);
    expect(seen).toEqual([3, 9]);
  });
});

describe('lifecycle', () => {
  it('tears down bridges on destroy — native emissions stop reaching slots', () => {
    const native = new FakePushButton();
    const btn = wrapQt(asQt(native)) as QtButtonNode;
    const spy = vi.fn();
    btn.clicked.connect(spy);
    btn.destroy();
    native.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('destroying the native object destroys the wrapper', () => {
    const native = new FakeSlider();
    const slider = wrapQt(asQt(native));
    native.destroy();
    expect(slider.isDestroyed).toBe(true);
  });

  it('createQt owns and destroys the native object', () => {
    const provider = { QSlider: FakeSlider };
    const slider = createQt('QSlider', { provider }) as QtSliderNode;
    expect(slider).toBeInstanceOf(QtSliderNode);
    const native = slider.native as unknown as FakeSlider;
    expect(native.isDestroyed()).toBe(false);
    slider.destroy();
    expect(native.isDestroyed()).toBe(true);
  });

  it('createQt throws for an unknown native class', () => {
    expect(() => createQt('QNope', { provider: {} })).toThrow(/not found/);
  });
});

describe('recursive tree wrapping', () => {
  it('wraps the native child tree as typed child nodes', () => {
    const root = new FakeQObject();
    const btn = new FakePushButton();
    const slider = new FakeSlider();
    root._children = [btn, slider];

    const node = wrapQt(asQt(root), { recursive: true });
    expect(node.children.length).toBe(2);
    expect(node.children[0]).toBeInstanceOf(QtButtonNode);
    expect(node.children[1]).toBeInstanceOf(QtSliderNode);
    expect((node.children[0] as QtButtonNode).parent).toBe(node);
  });
});
