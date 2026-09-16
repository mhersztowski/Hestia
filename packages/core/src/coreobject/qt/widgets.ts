import { QtNode } from './QtNode';
import type { Signal } from '../Signal';
import type { QtProperty } from './QtProperty';

/**
 * Typed convenience wrappers over {@link QtNode}. Each getter narrows the
 * generic reflective bridge (`prop`/`signal`) to the concrete property/signal
 * types of that widget family, so consumers get autocomplete + type-safety:
 *
 * ```ts
 * const btn = wrapQt(nativeButton) as QtButtonNode;
 * btn.text.value = 'OK';
 * btn.clicked.connect(() => console.log('clicked'));
 * ```
 *
 * All property getters return a live {@link QtProperty} (non-null: the widget
 * is expected to declare it); use the base `prop(name)` for optional access.
 */

/** Common `QWidget` geometry/state (base for every visual widget). */
export class QtWidgetNode extends QtNode {
  static override readonly qtClass: string = 'QWidget';
  get visible(): QtProperty<boolean> {
    return this.prop<boolean>('visible')!;
  }
  get enabled(): QtProperty<boolean> {
    return this.prop<boolean>('enabled')!;
  }
  get toolTip(): QtProperty<string> {
    return this.prop<string>('toolTip')!;
  }
  get x(): QtProperty<number> {
    return this.prop<number>('x')!;
  }
  get y(): QtProperty<number> {
    return this.prop<number>('y')!;
  }
  get width(): QtProperty<number> {
    return this.prop<number>('width')!;
  }
  get height(): QtProperty<number> {
    return this.prop<number>('height')!;
  }
  /** `QRect` geometry (opaque native value). */
  get geometry(): QtProperty<unknown> {
    return this.prop('geometry')!;
  }
  get pos(): QtProperty<unknown> {
    return this.prop('pos')!;
  }
  get size(): QtProperty<unknown> {
    return this.prop('size')!;
  }
}

/** `QAbstractButton` — QPushButton / QToolButton / QCheckBox / QRadioButton. */
export class QtAbstractButtonNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QAbstractButton';
  get text(): QtProperty<string> {
    return this.prop<string>('text')!;
  }
  get checkable(): QtProperty<boolean> {
    return this.prop<boolean>('checkable')!;
  }
  get checked(): QtProperty<boolean> {
    return this.prop<boolean>('checked')!;
  }
  get down(): QtProperty<boolean> {
    return this.prop<boolean>('down')!;
  }

  get clicked(): Signal<[checked?: boolean]> {
    return this.signal<[checked?: boolean]>('clicked');
  }
  get toggled(): Signal<[checked: boolean]> {
    return this.signal<[checked: boolean]>('toggled');
  }
  get pressed(): Signal<[]> {
    return this.signal<[]>('pressed');
  }
  get released(): Signal<[]> {
    return this.signal<[]>('released');
  }
}

/** `QPushButton` / `QToolButton`. */
export class QtButtonNode extends QtAbstractButtonNode {
  static override readonly qtClass: string = 'QPushButton';
  get flat(): QtProperty<boolean> {
    return this.prop<boolean>('flat')!;
  }
  get default(): QtProperty<boolean> {
    return this.prop<boolean>('default')!;
  }
}

/** `QCheckBox`. */
export class QtCheckBoxNode extends QtAbstractButtonNode {
  static override readonly qtClass: string = 'QCheckBox';
  get tristate(): QtProperty<boolean> {
    return this.prop<boolean>('tristate')!;
  }
}

/** `QRadioButton`. */
export class QtRadioButtonNode extends QtAbstractButtonNode {
  static override readonly qtClass: string = 'QRadioButton';
}

/** `QAbstractSlider` — QSlider / QScrollBar / QDial. */
export class QtSliderNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QSlider';
  get value(): QtProperty<number> {
    return this.prop<number>('value')!;
  }
  get minimum(): QtProperty<number> {
    return this.prop<number>('minimum')!;
  }
  get maximum(): QtProperty<number> {
    return this.prop<number>('maximum')!;
  }
  get singleStep(): QtProperty<number> {
    return this.prop<number>('singleStep')!;
  }
  get pageStep(): QtProperty<number> {
    return this.prop<number>('pageStep')!;
  }
  get orientation(): QtProperty<number> {
    return this.prop<number>('orientation')!;
  }

  get valueChanged(): Signal<[value: number]> {
    return this.signal<[value: number]>('valueChanged');
  }
  get sliderMoved(): Signal<[value: number]> {
    return this.signal<[value: number]>('sliderMoved');
  }
}

/** `QProgressBar`. */
export class QtProgressBarNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QProgressBar';
  get value(): QtProperty<number> {
    return this.prop<number>('value')!;
  }
  get minimum(): QtProperty<number> {
    return this.prop<number>('minimum')!;
  }
  get maximum(): QtProperty<number> {
    return this.prop<number>('maximum')!;
  }
}

/** `QSpinBox` / `QDoubleSpinBox`. */
export class QtSpinBoxNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QSpinBox';
  get value(): QtProperty<number> {
    return this.prop<number>('value')!;
  }
  get minimum(): QtProperty<number> {
    return this.prop<number>('minimum')!;
  }
  get maximum(): QtProperty<number> {
    return this.prop<number>('maximum')!;
  }
  get singleStep(): QtProperty<number> {
    return this.prop<number>('singleStep')!;
  }
  get prefix(): QtProperty<string> {
    return this.prop<string>('prefix')!;
  }
  get suffix(): QtProperty<string> {
    return this.prop<string>('suffix')!;
  }

  get valueChanged(): Signal<[value: number]> {
    return this.signal<[value: number]>('valueChanged');
  }
}

/** `QLineEdit`. */
export class QtLineEditNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QLineEdit';
  get text(): QtProperty<string> {
    return this.prop<string>('text')!;
  }
  get placeholderText(): QtProperty<string> {
    return this.prop<string>('placeholderText')!;
  }
  get readOnly(): QtProperty<boolean> {
    return this.prop<boolean>('readOnly')!;
  }
  get maxLength(): QtProperty<number> {
    return this.prop<number>('maxLength')!;
  }
  get echoMode(): QtProperty<number> {
    return this.prop<number>('echoMode')!;
  }

  get textChanged(): Signal<[text: string]> {
    return this.signal<[text: string]>('textChanged');
  }
  get textEdited(): Signal<[text: string]> {
    return this.signal<[text: string]>('textEdited');
  }
  get returnPressed(): Signal<[]> {
    return this.signal<[]>('returnPressed');
  }
  get editingFinished(): Signal<[]> {
    return this.signal<[]>('editingFinished');
  }
}

/** `QLabel`. */
export class QtLabelNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QLabel';
  get text(): QtProperty<string> {
    return this.prop<string>('text')!;
  }
}

/** `QComboBox`. */
export class QtComboBoxNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QComboBox';
  get currentIndex(): QtProperty<number> {
    return this.prop<number>('currentIndex')!;
  }
  get currentText(): QtProperty<string> {
    return this.prop<string>('currentText')!;
  }
  get count(): QtProperty<number> {
    return this.prop<number>('count')!;
  }

  get currentIndexChanged(): Signal<[index: number]> {
    return this.signal<[index: number]>('currentIndexChanged');
  }
  get activated(): Signal<[index: number]> {
    return this.signal<[index: number]>('activated');
  }
}

/** `QListWidget`. */
export class QtListWidgetNode extends QtWidgetNode {
  static override readonly qtClass: string = 'QListWidget';
  get currentRow(): QtProperty<number> {
    return this.prop<number>('currentRow')!;
  }
  get count(): QtProperty<number> {
    return this.prop<number>('count')!;
  }

  get currentRowChanged(): Signal<[row: number]> {
    return this.signal<[row: number]>('currentRowChanged');
  }
  get itemClicked(): Signal<[item: unknown]> {
    return this.signal<[item: unknown]>('itemClicked');
  }
  get itemDoubleClicked(): Signal<[item: unknown]> {
    return this.signal<[item: unknown]>('itemDoubleClicked');
  }
}
