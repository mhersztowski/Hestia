import { CoreObject } from '../CoreObject';
import { Property } from '../Property';
import { Signal } from '../Signal';
import { Action, type ActionCollectionLike, type ActionInit, type ItemTarget } from './items';

export interface ActionCollectionInit {
  /** The name to show when the collection is drawn as a menu. Defaults to the collection's name. */
  title?: string;
  enabled?: boolean;
}

/**
 * The commands of one kind: the clipboard ones, the file ones, the view ones.
 *
 * This is the other way of grouping actions, and the two are about different
 * things. {@link ActionGroup} is about **state** — of these, one is on, and
 * turning one on turns the others off. An `ActionCollection` is about **kind** —
 * these belong together, and something that concerns the kind concerns all of
 * them. "Cut", "Copy" and "Paste" are a collection, never a group: they are not
 * alternatives, and no two of them exclude each other.
 *
 * It matters because where a command is *drawn* is not what it *is*. "Paste"
 * belongs with the clipboard whether it sits in the Edit menu, in a context menu
 * or on a toolbar, and an editor that loses focus wants all three greyed at
 * once. The tree cannot say that — a node is in one place — so the collection
 * holds references, exactly as `ActionGroup` does, and the actions stay where
 * they are drawn.
 *
 * ```ts
 * const clipboard = new ActionCollection('clipboard', editor, { title: 'Clipboard' });
 * clipboard.add(edit.addAction({ id: 'cut',   text: 'Cut',   shortcut: 'Ctrl+X' }));
 * clipboard.add(edit.addAction({ id: 'copy',  text: 'Copy',  shortcut: 'Ctrl+C' }));
 * clipboard.add(edit.addAction({ id: 'paste', text: 'Paste', shortcut: 'Ctrl+V' }));
 *
 * clipboard.setEnabled(hasSelection);   // all three, wherever they are drawn
 * clipboard.triggerShortcut('Ctrl+C');  // and the shortcuts of the kind
 * ```
 */
export class ActionCollection extends CoreObject implements ActionCollectionLike {
  readonly title = new Property<string>('');

  /**
   * Whether the commands of this kind can be used at all.
   *
   * Setting it writes every member's `enabled`, so a rule about one action in
   * particular ("Delete needs a file open") has to be applied *after* the
   * collection, not before — the collection speaks for the kind and does not
   * know about the exceptions.
   */
  readonly enabled = new Property<boolean>(true);

  /** Any command of this kind was performed. */
  readonly triggered = new Signal<[action: Action]>();

  readonly #members: Action[] = [];

  constructor(name: string, parent?: CoreObject, init: ActionCollectionInit = {}) {
    super(parent, name);
    this.title.setSilent(init.title ?? name);
    if (init.enabled !== undefined) this.enabled.setSilent(init.enabled);

    this.enabled.changed.connect((on) => {
      for (const action of this.#members) action.enabled.value = on;
    }, this);
  }

  get name(): string {
    return this.objectName;
  }

  get actions(): readonly Action[] {
    return this.#members;
  }

  /**
   * Take an action into the collection. It keeps its place in the tree — the
   * collection says what a command is, not where it is drawn.
   */
  add(action: Action): Action {
    if (this.#members.includes(action)) return action;
    this.#members.push(action);
    action._setCollection(this);
    if (!this.enabled.value) action.enabled.value = false;
    return action;
  }

  /** Take several at once — the shape a menu is usually built in. */
  addAll(actions: readonly Action[]): Action[] {
    return actions.map((a) => this.add(a));
  }

  /**
   * Create an action that belongs to this collection and to nothing else yet.
   *
   * For a command that exists before it is drawn — bound to a shortcut, put in
   * a menu later. The collection is its parent until a menu takes it.
   */
  addAction(init: ActionInit = {}): Action {
    const action = new Action(init);
    action.setParent(this);
    return this.add(action);
  }

  remove(action: Action): void {
    this._memberRemoved(action);
    action._setCollection(null);
  }

  byId(id: string): Action | null {
    return this.#members.find((a) => a.id === id) ?? null;
  }

  /** Grey the whole kind out, or bring it back. */
  setEnabled(enabled: boolean): void {
    this.enabled.value = enabled;
  }

  /**
   * Put the members into a menu or a toolbar, in the order they were added.
   * They move: an action is drawn in one place, and this is how it gets there.
   */
  appendTo(host: ItemTarget): Action[] {
    for (const action of this.#members) host.addItem(action);
    return [...this.#members];
  }

  /** A submenu of this collection's commands, named after it. */
  buildMenu(host: ItemTarget, id = this.name): Action {
    const menu = host.addMenu({ id, text: this.title.value });
    this.appendTo(menu);
    return menu;
  }

  /** The command of this kind bound to a shortcut, however either was spelled. */
  actionForShortcut(shortcut: string): Action | null {
    return this.#members.find((a) => a.matchesShortcut(shortcut)) ?? null;
  }

  /**
   * Perform the command a shortcut stands for.
   *
   * Worth binding at the collection rather than at a toolbar: a shortcut is a
   * property of the command, and the command is not always on a toolbar.
   */
  triggerShortcut(shortcut: string): boolean {
    return this.actionForShortcut(shortcut)?.trigger() ?? false;
  }

  /** @internal Called by `Action.trigger()`, not through a signal — see the note there. */
  _memberTriggered(action: Action): void {
    this.triggered.emit(action);
  }

  /** @internal */
  _memberRemoved(action: Action): void {
    const idx = this.#members.indexOf(action);
    if (idx !== -1) this.#members.splice(idx, 1);
  }
}
