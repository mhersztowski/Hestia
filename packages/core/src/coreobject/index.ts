// ── Core ─────────────────────────────────────────────────────────────────────
export { Connection } from './Connection';
export { Signal } from './Signal';
export type { Slot, IConnectionOwner } from './Signal';
export { CoreObject } from './CoreObject';

// ── Qt wrappers (browser-Qt QObject/widget → CoreObject bridge) ──────────────────
export {
  QtNode,
  QtProperty,
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
  wrapQt,
  createQt,
  registerQtWrapper,
  isQtSignal,
} from './qt';
export type {
  QtWrapOptions,
  QtNodeCtor,
  QtClassProvider,
  CreateQtOptions,
  QtObjectLike,
  QtSignalLike,
  QtConnectionLike,
  QtPropertyMeta,
  QtSignalMeta,
} from './qt';

// ── Properties ────────────────────────────────────────────────────────────────
export { Property } from './Property';

// ── Timers ────────────────────────────────────────────────────────────────────
export { Timer } from './Timer';
export type { TimerMode } from './Timer';

// ── Event Bus ─────────────────────────────────────────────────────────────────
export { EventBus } from './EventBus';

// ── State Machine ─────────────────────────────────────────────────────────────
export { State, StateMachine } from './StateMachine';
export type { GuardFn, ActionFn, TransitionDef } from './StateMachine';

// ── Command Stack (undo/redo) ─────────────────────────────────────────────────
export { Command, FnCommand, CommandStack } from './CommandStack';

// ── List Model ────────────────────────────────────────────────────────────────
export { ListModel } from './ListModel';

// ── Logger ────────────────────────────────────────────────────────────────────
export { Logger } from './Logger';
export type { LogLevel, LogRecord } from './Logger';

// ── Network nodes ─────────────────────────────────────────────────────────────
// The MQTT objects are **not** exported here: they pull in an MQTT client, and
// this module is the base of everything — a page that wants a `Timer` has no
// business downloading a broker client. They live under `mqtt/` and reach the
// outside through `@hestia/core/coreobject-mqtt`.
export { HttpReq } from './HttpReq';
export type { HttpMethod, HttpResponse } from './HttpReq';

// ── User-interface objects ────────────────────────────────────────────────────
//
// Toolbars, menus and the commands behind them, as objects rather than as React
// props. Nothing here draws anything — the components live in `@hestia/ui-core`.
export {
  UiObject,
  ItemHost,
  MenuItem,
  Action,
  Separator,
  CustomItem,
  ActionGroup,
  ActionCollection,
  Toolbar,
  Menu,
  MenuBar,
  Tab,
  TabBar,
  Panel,
  Workspace,
  addModel,
  normalizeShortcut,
} from './ui/index';
export type {
  MenuItemKind,
  MenuItemInit,
  ActionInit,
  CustomItemInit,
  ExclusiveGroup,
  ActionCollectionLike,
  ToolbarInit,
  MenuInit,
  MenuBarInit,
  TabInit,
  TabBarInit,
  PanelInit,
  WorkspaceInit,
  ActionCollectionInit,
  ItemTarget,
} from './ui/index';

// ── Utilities ─────────────────────────────────────────────────────────────────
export { debounce, throttle, promiseToSignals, connectOnce } from './utils';
