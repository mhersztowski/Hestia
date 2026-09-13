/**
 * example.ts — how to drive the browser-Qt widgets through the minislib TreeNode
 * wrappers (`QtNode` / `QtProperty` / typed widget nodes).
 *
 * Two ways to run it:
 *
 *  1. **In a browser**, after `qobject.module.js` + `qt.module.js` have populated
 *     `globalThis` with the real Qt classes — pass `globalThis` as the provider:
 *
 *       import { runQtExamples } from '@mhersztowski/minislib/.../qt/example';
 *       const { log } = runQtExamples(globalThis);
 *       // …then add the returned native widgets to a QtCanvas layout.
 *
 *  2. **Anywhere (TreeNode/tests/docs)** with no Qt globals — call it with no args and
 *     it uses the tiny in-memory {@link createDemoProvider} below, which implements
 *     the same meta-object contract so the wrappers behave identically:
 *
 *       import { runQtExamples } from './example';
 *       console.log(runQtExamples().log.join('\n'));
 *
 * The example functions themselves are provider-agnostic: they only touch the
 * wrapper API (`.value`, `.changed`, `.clicked`, `.on()`, `wrapQt`, …), so the
 * exact same code works against real Qt widgets and against the demo backend.
 */

import {
  createQt,
  wrapQt,
  QtNode,
  QtSliderNode,
  QtProgressBarNode,
  QtButtonNode,
  QtLineEditNode,
  QtSpinBoxNode,
  QtLabelNode,
  type QtClassProvider,
  type QtObjectLike,
} from './index';

// ════════════════════════════════════════════════════════════════════════════
//  Example 1 — QSlider → QProgressBar (signal/slot AND property binding)
// ════════════════════════════════════════════════════════════════════════════

export interface SliderDemo {
  slider: QtSliderNode;
  progress: QtProgressBarNode;
}

/** Mirror a slider's value onto a progress bar — two equivalent techniques. */
export function sliderDrivesProgress(provider?: QtClassProvider): SliderDemo {
  const slider = createQt('QSlider', { provider }) as QtSliderNode;
  const progress = createQt('QProgressBar', { provider }) as QtProgressBarNode;

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
  toggle: QtButtonNode;
  action: QtButtonNode;
  /** How many times `action` has been clicked. */
  runs: () => number;
}

export function buttonControlsPanel(provider?: QtClassProvider): ButtonDemo {
  const toggle = createQt('QPushButton', { provider }) as QtButtonNode;
  const action = createQt('QPushButton', { provider }) as QtButtonNode;
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
  name: QtLineEditNode;
  size: QtSpinBoxNode;
  label: QtLabelNode;
}

export function formReflectsToLabel(provider?: QtClassProvider): FormDemo {
  const name = createQt('QLineEdit', { provider }) as QtLineEditNode;
  const size = createQt('QSpinBox', { provider }) as QtSpinBoxNode;
  const label = createQt('QLabel', { provider }) as QtLabelNode;

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
  root: QtNode;
  summary: string[];
}

/** Wrap a native QObject tree and produce an indented listing of the wrappers. */
export function inspectTree(nativeRoot: QtObjectLike): TreeDemo {
  const root = wrapQt(nativeRoot, { recursive: true });
  const summary: string[] = [];
  root.traverse((n) => {
    const q = n as QtNode;
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
export function runQtExamples(provider: QtClassProvider = createDemoProvider()): QtExampleReport {
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
  const t = inspectTree(root as unknown as QtObjectLike);
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
 * A minimal {@link QtClassProvider} implementing the browser-Qt meta contract —
 * lets {@link createQt} run without the real canvas widgets (TreeNode, tests, docs).
 */
export function createDemoProvider(): QtClassProvider {
  return {
    QSlider: DemoSlider,
    QProgressBar: DemoProgressBar,
    QPushButton: DemoButton,
    QLineEdit: DemoLineEdit,
    QSpinBox: DemoSpinBox,
    QLabel: DemoLabel,
  };
}
