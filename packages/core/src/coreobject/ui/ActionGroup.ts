import { CoreObject } from '../CoreObject';
import { Property } from '../Property';
import { Signal } from '../Signal';
import { Action, type ExclusiveGroup } from './items';

/**
 * Checkable actions that belong together — Qt's `QActionGroup`.
 *
 * Exclusive by default: turning one on turns the others off. Turning the checked
 * one *off* leaves the group with nothing checked, which is a state a radio group
 * is allowed to be in and the plain model's `applyToggle` allows too.
 *
 * A group is a `CoreObject`, so it is parented to the toolbar (or to the action
 * holding the submenu) and dies with it. It is not a `MenuItem`, so it never
 * appears among `items` — the same filter that keeps a `Timer` out of a menu.
 */
export class ActionGroup extends CoreObject implements ExclusiveGroup {
  /** Off means the members merely share a name — useful for reading the model back out. */
  readonly exclusive = new Property<boolean>(true);

  /**
   * Whether the group may end up with nothing checked.
   *
   * On (the default) a second click on the checked member turns it off, as the
   * plain model's `applyToggle` allows. Off is for a set of pages or a tool
   * palette, where something is always chosen: clicking the current one again
   * leaves it on rather than leaving the application showing nothing. Qt calls
   * the two `ExclusiveOptional` and `Exclusive`.
   */
  readonly allowNone = new Property<boolean>(true);

  /** The checked member changed; `null` when the group was emptied of checks. */
  readonly checkedChanged = new Signal<[checked: Action | null]>();

  readonly #members: Action[] = [];
  #applying = false;

  constructor(groupName: string, parent?: CoreObject) {
    super(parent, groupName);
  }

  get groupName(): string {
    return this.objectName;
  }

  get actions(): readonly Action[] {
    return this.#members;
  }

  get checkedAction(): Action | null {
    return this.#members.find((a) => a.checked.value) ?? null;
  }

  /**
   * Take an action into the group. It becomes checkable — an action in a radio
   * group that cannot be checked is a bug waiting for someone to notice.
   */
  add(action: Action): Action {
    if (this.#members.includes(action)) return action;
    this.#members.push(action);
    action.checkable.value = true;
    action._setGroup(this);
    // Joining already checked: apply the rule now rather than at the next click.
    if (action.checked.value) this._memberChecked(action, true);
    return action;
  }

  remove(action: Action): void {
    this._memberRemoved(action);
    action._setGroup(null);
  }

  /** Check one member by identity, or clear the group with `null`. */
  setChecked(action: Action | null): void {
    if (action && !this.#members.includes(action)) return;
    for (const member of this.#members) member.setChecked(member === action);
  }

  /** @internal Called by `Action` when its checked state changed. */
  _memberChecked(action: Action, checked: boolean): void {
    // Unchecking the siblings makes each of them call back in here; without the
    // guard the first click walks the group once per member.
    if (this.#applying) return;

    // Refusing to be emptied: the member that just went off goes back on, and
    // the guard keeps that second change from walking in here again.
    if (!checked && !this.allowNone.value && this.checkedAction === null) {
      this.#applying = true;
      try {
        action.checked.value = true;
      } finally {
        this.#applying = false;
      }
      return;
    }

    if (checked && this.exclusive.value) {
      this.#applying = true;
      try {
        for (const member of this.#members) {
          if (member !== action) member.setChecked(false);
        }
      } finally {
        this.#applying = false;
      }
    }
    this.checkedChanged.emit(this.checkedAction);
  }

  /** @internal */
  _memberRemoved(action: Action): void {
    const idx = this.#members.indexOf(action);
    if (idx !== -1) this.#members.splice(idx, 1);
  }
}
