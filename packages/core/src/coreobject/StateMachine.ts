import { CoreObject } from './CoreObject';
import { Signal } from './Signal';

export type GuardFn<TEvent = void> = (event: TEvent) => boolean;
export type ActionFn<TEvent = void> = (event: TEvent) => void;

/** A single state in the machine. */
export class State extends CoreObject {
  /** Emitted when this state is entered. `from` is the previous state (null for initial). */
  readonly entered = new Signal<[from: State | null]>();
  /** Emitted when this state is exited. `to` is the next state. */
  readonly exited = new Signal<[to: State]>();

  onEnter?: (from: State | null) => void;
  onExit?: (to: State) => void;

  constructor(public readonly id: string, parent?: CoreObject) {
    super(parent, id);
  }
}

export interface TransitionDef<TEvent = void> {
  from: string;
  to: string;
  event: string;
  guard?: GuardFn<TEvent>;
  action?: ActionFn<TEvent>;
}

/**
 * Hierarchical-flat finite state machine.
 *
 * Usage:
 *   const fsm = new StateMachine(parent);
 *   fsm.addState('idle');
 *   fsm.addState('running');
 *   fsm.addTransition({ from: 'idle', to: 'running', event: 'start' });
 *   fsm.addTransition({ from: 'running', to: 'idle',    event: 'stop' });
 *   fsm.start('idle');
 *
 *   fsm.stateChanged.connect((next, prev) => console.log(prev?.id, '->', next.id));
 *   fsm.send('start');
 */
export class StateMachine extends CoreObject {
  readonly stateChanged = new Signal<[next: State, prev: State | null]>();
  readonly transitionFailed = new Signal<[event: string, from: string]>();

  #states = new Map<string, State>();
  #transitions: TransitionDef<unknown>[] = [];
  #current: State | null = null;
  #started = false;

  constructor(parent?: CoreObject) {
    super(parent, 'StateMachine');
  }

  addState(idOrState: string | State): State {
    const state =
      typeof idOrState === 'string'
        ? new State(idOrState, this)
        : idOrState;
    this.#states.set(state.id, state);
    return state;
  }

  addTransition<TEvent = void>(def: TransitionDef<TEvent>): void {
    this.#transitions.push(def as TransitionDef<unknown>);
  }

  /** Start the machine in `initialStateId`. */
  start(initialStateId: string): void {
    if (this.#started) throw new Error('StateMachine already started');
    const state = this.#states.get(initialStateId);
    if (!state) throw new Error(`Unknown state: "${initialStateId}"`);
    this.#started = true;
    this.#enter(state, null);
  }

  stop(): void {
    this.#started = false;
    this.#current = null;
  }

  /** Dispatch an event, possibly triggering a transition. */
  send<TEvent = void>(event: string, payload?: TEvent): boolean {
    if (!this.#started || !this.#current) return false;

    const match = this.#transitions.find(
      (t) =>
        t.event === event &&
        t.from === this.#current!.id &&
        (!t.guard || t.guard(payload as unknown)),
    );

    if (!match) {
      this.transitionFailed.emit(event, this.#current.id);
      return false;
    }

    const nextState = this.#states.get(match.to);
    if (!nextState) throw new Error(`Unknown target state: "${match.to}"`);

    match.action?.(payload as unknown);
    this.#exit(this.#current, nextState);
    this.#enter(nextState, this.#current);
    return true;
  }

  get currentState(): State | null {
    return this.#current;
  }

  get currentStateId(): string | null {
    return this.#current?.id ?? null;
  }

  is(stateId: string): boolean {
    return this.#current?.id === stateId;
  }

  get started(): boolean {
    return this.#started;
  }

  state(id: string): State | undefined {
    return this.#states.get(id);
  }

  get states(): readonly State[] {
    return [...this.#states.values()];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #enter(state: State, from: State | null): void {
    const prev = this.#current;
    this.#current = state;
    state.onEnter?.(from);
    state.entered.emit(from);
    this.stateChanged.emit(state, prev);
  }

  #exit(state: State, to: State): void {
    state.onExit?.(to);
    state.exited.emit(to);
  }
}
