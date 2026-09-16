// ── CoreObject wrappers for the browser-Qt library (packages/core/browser/qt) ───────
//
// Bridge the vanilla-JS Qt-clone objects (QObject + widgets) into minislib's
// reactive world: properties become live QtProperty bindings, signals become
// minislib Signals, and the QObject tree maps onto minislib Nodes.

export { QtNode } from './QtNode';
export type { QtWrapOptions } from './QtNode';

export { QtProperty } from './QtProperty';

export {
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

export { wrapQt, createQt, registerQtWrapper } from './QtRegistry';
export type { QtNodeCtor, QtClassProvider, CreateQtOptions } from './QtRegistry';

export { isQtSignal } from './types';
export type {
  QtObjectLike,
  QtSignalLike,
  QtConnectionLike,
  QtPropertyMeta,
  QtSignalMeta,
} from './types';
