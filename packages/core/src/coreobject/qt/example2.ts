/**
 * example2.ts — identical demo to `example.ts`, but importing the whole wrapper
 * barrel as a **namespace** (`import * as qt from './index'`) instead of named
 * imports. Every wrapper symbol is then reached through the `qt.` prefix
 * (`qt.createQt`, `qt.QtSliderNode`, `qt.wrapQt`, …).
 *
 * Trade-off: one short import line, but the `qt.` prefix repeats throughout the
 * body. Functionally equivalent to `example.ts`; pick whichever reads better.
 *
 * Running it is the same:
 *   import { runQtExamples } from './example2';
 *   console.log(runQtExamples().log.join('\n'));   // uses the in-memory demo backend
 *   // or, in a browser with Qt globals loaded: runQtExamples(globalThis);
 */

import * as qt from './index';

// ════════════════════════════════════════════════════════════════════════════
//  Example 1 — QSlider → QProgressBar (signal/slot AND property binding)
// ════════════════════════════════════════════════════════════════════════════

export interface SliderDemo {
  slider: qt.QtSliderNode;
  progress: qt.QtProgressBarNode;
}

/** Mirror a slider's value onto a progress bar — two equivalent techniques. */
export function sliderDrivesProgress(provider?: qt.QtClassProvider): SliderDemo {
  const slider = qt.createQt('QSlider', { provider }) as qt.QtSliderNode;
  const progress = qt.createQt('QProgressBar', { provider }) as qt.QtProgressBarNode;

  // (a) signal/slot — react to changes coming from the widget itself:
  slider.valueChanged.connect((v) => {
    progress.value.value = v;
  });

  // (b) equivalent one-liner via live property binding (initial value + updates):
  //     progress.value.bindTo(slider.value);

  slider.set('minimum', 0).set('maximum', 100);
  slider.value.value = 40; // programmatic set → notify → progress follows
  return { slider, progress };
}

// ════════════════════════════════════════════════════════════════════════════
//  Example 2 — a checkable QPushButton enables/disables an action button
// ════════════════════════════════════════════════════════════════════════════

export interface ButtonDemo {
  toggle: qt.QtButtonNode;
  action: qt.QtButtonNode;
  /** How many times `action` has been clicked. */
  runs: () => number;
}

export function buttonControlsPanel(provider?: qt.QtClassProvider): ButtonDemo {
  const toggle = qt.createQt('QPushButton', { provider }) as qt.QtButtonNode;
  const action = qt.createQt('QPushButton', { provider }) as qt.QtButtonNode;
  toggle.text.value = 'Enabled';
  action.text.value = 'Run';

  toggle.checkable.value = true;
  toggle.toggled.connect((on) => {
    action.enabled.value = on;
  });

  let count = 0;
  action.on('clicked', () => {
    count += 1;
  });

  toggle.checked.value = true; // → toggled(true) → action enabled
  return { toggle, action, runs: () => count };
}

// ════════════════════════════════════════════════════════════════════════════
//  Example 3 — form fields reflected live into a QLabel
// ════════════════════════════════════════════════════════════════════════════

export interface FormDemo {
  name: qt.QtLineEditNode;
  size: qt.QtSpinBoxNode;
  label: qt.QtLabelNode;
}

export function formReflectsToLabel(provider?: qt.QtClassProvider): FormDemo {
  const name = qt.createQt('QLineEdit', { provider }) as qt.QtLineEditNode;
  const size = qt.createQt('QSpinBox', { provider }) as qt.QtSpinBoxNode;
  const label = qt.createQt('QLabel', { provider }) as qt.QtLabelNode;

  const refresh = () => {
    label.text.value = `${name.text.value || '(unnamed)'} — ${size.value.value}px`;
  };
  name.textChanged.connect(refresh);
  size.valueChanged.connect(refresh);

  name.text.value = 'Widget';
  size.set('minimum', 0).set('maximum', 100);
  size.value.value = 14;
  return { name, size, label };
}

// ════════════════════════════════════════════════════════════════════════════
//  Example 4 — wrap an existing native tree and inspect it reflectively
// ════════════════════════════════════════════════════════════════════════════

export interface TreeDemo {
  root: qt.QtNode;
  summary: string[];
}

/** Wrap a native QObject tree and produce an indented listing of the wrappers. */
export function inspectTree(nativeRoot: qt.QtObjectLike): TreeDemo {
  const root = qt.wrapQt(nativeRoot, { recursive: true });
  const summary: string[] = [];
  root.traverse((n) => {
    const q = n as qt.QtNode;
    const props = q.propertyNames().join(', ');
    summary.push(`${'  '.repeat(q.depth)}• ${q.className} "${q.objectName}"  props=[${props}]`);
  });
  return { root, summary };
}

// ════════════════════════════════════════════════════════════════════════════
//  Runner — exercises every example and returns a human-readable log
// ════════════════════════════════════════════════════════════════════════════

export interface QtExampleReport {
  log: string[];
}

/**
 * Run all examples against `provider` (default: the in-memory demo backend) and
 * simulate a bit of native-side interaction (drag/click/type) so the reactive
 * wiring is observable in the returned log.
 */
export function runQtExamples(provider: qt.QtClassProvider = createDemoProvider()): QtExampleReport {
  const log: string[] = [];

  // 1) slider → progress
  const s = sliderDrivesProgress(provider);
  log.push(`slider=${s.slider.value.value} → progress=${s.progress.value.value}`);
  (s.slider.native as unknown as DemoSlider).drag(75); // simulate user dragging
  log.push(`after drag(75): progress=${s.progress.value.value}`);

  // 2) button gating
  const b = buttonControlsPanel(provider);
  log.push(`action.enabled=${b.action.enabled.value}, runs=${b.runs()}`);
  (b.action.native as unknown as DemoButton).click();
  (b.toggle.native as unknown as DemoButton).click(); // untoggle → disables action
  log.push(`after clicks: action.enabled=${b.action.enabled.value}, runs=${b.runs()}`);

  // 3) form → label
  const f = formReflectsToLabel(provider);
  log.push(`label="${f.label.text.value}"`);
  (f.name.native as unknown as DemoLineEdit).typeText('Panel');
  (f.size.native as unknown as DemoSpinBox).setNative(24);
  log.push(`after edits: label="${f.label.text.value}"`);

  // 4) tree inspection
  const root = new DemoQObject('root');
  root._children.push(b.toggle.native as unknown as DemoQObject);
  root._children.push(s.slider.native as unknown as DemoQObject);
  const t = inspectTree(root as unknown as qt.QtObjectLike);
  log.push('tree:', ...t.summary);

  return { log };
}

// ════════════════════════════════════════════════════════════════════════════
//  Demo backend — a tiny, faithful implementation of the browser-Qt meta system
//  (metaProperties/metaSignals/property/setProperty/notify + object tree), so
//  the wrappers run with zero dependency on the real canvas widgets.
// ════════════════════════════════════════════════════════════════════════════

class DemoSignal {
  #conns = new Set<(...a: unknown[]) => void>();
  constructor(private readonly _name = '') {}
  name(): string { return this._name; }
  connect(slot: (...a: unknown[]) => void) {
    this.#conns.add(slot);
    return { disconnect: () => this.#conns.delete(slot) };
  }
  disconnect(): boolean { this.#conns.clear(); return true; }
  emit(...a: unknown[]): boolean { for (const c of [...this.#conns]) c(...a); return this.#conns.size > 0; }
}

/** Base object implementing the same reflective contract as browser-Qt QObject. */
class DemoQObject {
  static properties: Record<string, unknown> = {};
  static signals: Record<string, unknown> = { destroyed: { params: [] } };

  _objectName: string;
  _parent: DemoQObject | null = null;
  _children: DemoQObject[] = [];
  _destroyed = false;
  destroyed = new DemoSignal('destroyed');

  constructor(objectName = '') { this._objectName = objectName; }

  objectName(): string { return this._objectName; }
  setObjectName(n: string): this { this._objectName = String(n); return this; }
  className(): string { return this.constructor.name.replace(/^Demo(?:Q)?/, 'Q'); }
  inherits(name: string): boolean { return this.className() === name; }
  isDestroyed(): boolean { return this._destroyed; }

  private meta(field: 'properties' | 'signals'): Record<string, any> {
    const chain: any[] = [];
    let c: any = this.constructor;
    while (c && c !== Object && c !== Function.prototype) { chain.unshift(c); c = Object.getPrototypeOf(c); }
    const out: Record<string, any> = {};
    for (const k of chain) {
      if (Object.prototype.hasOwnProperty.call(k, field)) Object.assign(out, k[field]);
    }
    return out;
  }
  metaProperties(): Record<string, any> { return this.meta('properties'); }
  metaSignals(): Record<string, any> { return this.meta('signals'); }
  propertyNames(): string[] { return Object.keys(this.metaProperties()); }
  signalNames(): string[] { return Object.keys(this.metaSignals()); }

  property(key: string): unknown {
    const m = this.metaProperties()[key];
    return m ? m.get(this) : (this as any)['_' + key];
  }
  setProperty(key: string, v: unknown): this {
    const m = this.metaProperties()[key];
    if (m && m.set) {
      m.set(this, v);
      if (m.notify && (this as any)[m.notify] instanceof DemoSignal) (this as any)[m.notify].emit(v);
    } else {
      (this as any)['_' + key] = v;
    }
    return this;
  }

  parent(): DemoQObject | null { return this._parent; }
  children(): DemoQObject[] { return this._children.slice(); }
  destroy(): void { if (this._destroyed) return; this._destroyed = true; this.destroyed.emit(this); }
}

class DemoSlider extends DemoQObject {
  static properties = {
    value: { get: (o: any) => o._value, set: (o: any, v: any) => { o._value = clampInt(v, o._min, o._max); }, notify: 'valueChanged', type: 'number' },
    minimum: { get: (o: any) => o._min, set: (o: any, v: any) => { o._min = v; }, type: 'number' },
    maximum: { get: (o: any) => o._max, set: (o: any, v: any) => { o._max = v; }, type: 'number' },
  };
  static signals = { valueChanged: { params: ['value'] } };
  _value = 0; _min = 0; _max = 100;
  valueChanged = new DemoSignal('valueChanged');
  /** Simulate the user dragging the handle (fires notify like the real widget). */
  drag(v: number): void { this._value = clampInt(v, this._min, this._max); this.valueChanged.emit(this._value); }
}

class DemoProgressBar extends DemoQObject {
  static properties = {
    value: { get: (o: any) => o._value, set: (o: any, v: any) => { o._value = v; }, type: 'number' },
    minimum: { get: (o: any) => o._min, type: 'number' },
    maximum: { get: (o: any) => o._max, type: 'number' },
  };
  _value = 0; _min = 0; _max = 100;
}

class DemoButton extends DemoQObject {
  static properties = {
    text: { get: (o: any) => o._text, set: (o: any, v: any) => { o._text = String(v); }, type: 'string' },
    checkable: { get: (o: any) => o._checkable, set: (o: any, v: any) => { o._checkable = !!v; }, type: 'bool' },
    checked: { get: (o: any) => o._checked, set: (o: any, v: any) => { o._checked = !!v; }, notify: 'toggled', type: 'bool' },
    enabled: { get: (o: any) => o._enabled, set: (o: any, v: any) => { o._enabled = !!v; }, type: 'bool' },
  };
  static signals = { clicked: { params: [] }, toggled: { params: ['checked'] } };
  _text = ''; _checkable = false; _checked = false; _enabled = true;
  clicked = new DemoSignal('clicked');
  toggled = new DemoSignal('toggled');
  override className(): string { return 'QPushButton'; }
  override inherits(n: string): boolean { return ['QPushButton', 'QAbstractButton', 'QWidget'].includes(n); }
  /** Simulate a native click: toggles when checkable, then emits `clicked`. */
  click(): void {
    if (this._checkable) { this._checked = !this._checked; this.toggled.emit(this._checked); }
    this.clicked.emit();
  }
}

class DemoLineEdit extends DemoQObject {
  static properties = {
    text: { get: (o: any) => o._text, set: (o: any, v: any) => { o._text = String(v); }, notify: 'textChanged', type: 'string' },
  };
  static signals = { textChanged: { params: ['text'] } };
  _text = '';
  textChanged = new DemoSignal('textChanged');
  override className(): string { return 'QLineEdit'; }
  override inherits(n: string): boolean { return ['QLineEdit', 'QWidget'].includes(n); }
  /** Simulate typing (fires notify). */
  typeText(t: string): void { this._text = String(t); this.textChanged.emit(this._text); }
}

class DemoSpinBox extends DemoQObject {
  static properties = {
    value: { get: (o: any) => o._value, set: (o: any, v: any) => { o._value = clampInt(v, o._min, o._max); }, notify: 'valueChanged', type: 'number' },
    minimum: { get: (o: any) => o._min, set: (o: any, v: any) => { o._min = v; }, type: 'number' },
    maximum: { get: (o: any) => o._max, set: (o: any, v: any) => { o._max = v; }, type: 'number' },
  };
  static signals = { valueChanged: { params: ['value'] } };
  _value = 0; _min = 0; _max = 100;
  valueChanged = new DemoSignal('valueChanged');
  override className(): string { return 'QSpinBox'; }
  override inherits(n: string): boolean { return ['QSpinBox', 'QWidget'].includes(n); }
  /** Simulate a native value change (fires notify). */
  setNative(v: number): void { this._value = clampInt(v, this._min, this._max); this.valueChanged.emit(this._value); }
}

class DemoLabel extends DemoQObject {
  static properties = {
    text: { get: (o: any) => o._text, set: (o: any, v: any) => { o._text = String(v); }, type: 'string' },
  };
  _text = '';
  override className(): string { return 'QLabel'; }
  override inherits(n: string): boolean { return ['QLabel', 'QWidget'].includes(n); }
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * A minimal {@link qt.QtClassProvider} implementing the browser-Qt meta contract
 * — lets {@link qt.createQt} run without the real canvas widgets.
 */
export function createDemoProvider(): qt.QtClassProvider {
  return {
    QSlider: DemoSlider,
    QProgressBar: DemoProgressBar,
    QPushButton: DemoButton,
    QLineEdit: DemoLineEdit,
    QSpinBox: DemoSpinBox,
    QLabel: DemoLabel,
  };
}
