import { QtNode } from './QtNode';
import type { QtWrapOptions } from './QtNode';
import type { QtObjectLike } from './types';
import {
  QtWidgetNode,
  QtAbstractButtonNode,
  QtButtonNode,
  QtCheckBoxNode,
  QtRadioButtonNode,
  QtSliderNode,
  QtProgressBarNode,
  QtSpinBoxNode,
  QtLineEditNode,
  QtLabelNode,
  QtComboBoxNode,
  QtListWidgetNode,
} from './widgets';

/** Constructor shape shared by {@link QtNode} and its typed subclasses. */
export type QtNodeCtor = new (native: QtObjectLike, parent?: QtNode, opts?: QtWrapOptions) => QtNode;

/**
 * `className` → wrapper subclass. Ordered most-specific → least-specific so the
 * `inherits()` fallback (for unregistered subclasses) resolves to the closest
 * known ancestor. Exact class-name matches are tried first regardless of order.
 */
const REGISTRY = new Map<string, QtNodeCtor>([
  ['QPushButton', QtButtonNode],
  ['QToolButton', QtButtonNode],
  ['QCheckBox', QtCheckBoxNode],
  ['QRadioButton', QtRadioButtonNode],
  ['QAbstractButton', QtAbstractButtonNode],
  ['QSlider', QtSliderNode],
  ['QScrollBar', QtSliderNode],
  ['QDial', QtSliderNode],
  ['QAbstractSlider', QtSliderNode],
  ['QProgressBar', QtProgressBarNode],
  ['QDoubleSpinBox', QtSpinBoxNode],
  ['QSpinBox', QtSpinBoxNode],
  ['QLineEdit', QtLineEditNode],
  ['QLabel', QtLabelNode],
  ['QComboBox', QtComboBoxNode],
  ['QListWidget', QtListWidgetNode],
  ['QFrame', QtWidgetNode],
  ['QWidget', QtWidgetNode],
]);

/** Register (or override) the wrapper class used for a native `className`. */
export function registerQtWrapper(className: string, ctor: QtNodeCtor): void {
  REGISTRY.set(className, ctor);
}

/** Pick the most specific registered wrapper for a native object. */
function pickCtor(native: QtObjectLike): QtNodeCtor {
  const direct = REGISTRY.get(native.className());
  if (direct) return direct;
  for (const [name, ctor] of REGISTRY) {
    try {
      if (native.inherits(name)) return ctor;
    } catch {
      /* inherits may be missing on exotic objects */
    }
  }
  return QtNode;
}

/**
 * Wrap an existing native browser-Qt object in the best-matching typed
 * {@link QtNode}. With `recursive: true` the whole child tree is wrapped too,
 * each child getting its own typed wrapper.
 */
export function wrapQt(native: QtObjectLike, opts: QtWrapOptions = {}): QtNode {
  const options: QtWrapOptions = { ...opts };
  options.wrapChild =
    opts.wrapChild ??
    ((n, parent) => {
      const Ctor = pickCtor(n);
      return new Ctor(n, parent, options);
    });
  const Ctor = pickCtor(native);
  return new Ctor(native, opts.parent, options);
}

/** Object that resolves native browser-Qt class constructors by name. */
export type QtClassProvider = Record<string, unknown>;

function defaultProvider(): QtClassProvider {
  return (typeof globalThis !== 'undefined' ? globalThis : {}) as QtClassProvider;
}

export interface CreateQtOptions extends QtWrapOptions {
  /** Where to resolve the native class from. Defaults to `globalThis`. */
  provider?: QtClassProvider;
  /** Constructor args forwarded to the native class. */
  args?: unknown[];
}

/**
 * Instantiate a native browser-Qt class *by name* (resolved from `globalThis`
 * by default) and return a typed wrapper that owns it. Throws if the class is
 * not available in the current runtime.
 *
 * ```ts
 * const slider = createQt('QSlider') as QtSliderNode;   // needs globals loaded
 * slider.valueChanged.connect(v => …);
 * ```
 */
export function createQt(className: string, opts: CreateQtOptions = {}): QtNode {
  const provider = opts.provider ?? defaultProvider();
  const Ctor = provider[className] as (new (...a: unknown[]) => QtObjectLike) | undefined;
  if (typeof Ctor !== 'function') {
    throw new Error(`createQt: native Qt class '${className}' not found in provider`);
  }
  const native = new Ctor(...(opts.args ?? []));
  return wrapQt(native, { ...opts, ownsNative: opts.ownsNative ?? true });
}
