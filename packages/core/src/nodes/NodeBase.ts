/**
 * Base class for all Node classes providing common state and functionality
 */
export abstract class NodeBase<TModel> {
  protected _isSelected: boolean = false;
  protected _isExpanded: boolean = false;
  protected _isEditing: boolean = false;
  protected _isDirty: boolean = false;

  // Selection state
  get isSelected(): boolean {
    return this._isSelected;
  }

  setSelected(value: boolean): this {
    this._isSelected = value;
    return this;
  }

  toggleSelected(): this {
    this._isSelected = !this._isSelected;
    return this;
  }

  // Expansion state (for tree views)
  get isExpanded(): boolean {
    return this._isExpanded;
  }

  setExpanded(value: boolean): this {
    this._isExpanded = value;
    return this;
  }

  toggleExpanded(): this {
    this._isExpanded = !this._isExpanded;
    return this;
  }

  // Edit mode state
  get isEditing(): boolean {
    return this._isEditing;
  }

  setEditing(value: boolean): this {
    this._isEditing = value;
    return this;
  }

  // Dirty state (has unsaved changes)
  get isDirty(): boolean {
    return this._isDirty;
  }

  setDirty(value: boolean): this {
    this._isDirty = value;
    return this;
  }

  markDirty(): this {
    this._isDirty = true;
    return this;
  }

  markClean(): this {
    this._isDirty = false;
    return this;
  }

  // Reset all UI states
  resetState(): this {
    this._isSelected = false;
    this._isExpanded = false;
    this._isEditing = false;
    this._isDirty = false;
    return this;
  }

  // Copy base UI state to another node (for use in clone())
  protected copyBaseStateTo<T extends NodeBase<TModel>>(target: T): T {
    target._isSelected = this._isSelected;
    target._isExpanded = this._isExpanded;
    target._isEditing = this._isEditing;
    target._isDirty = this._isDirty;
    return target;
  }

  // Abstract methods to be implemented by subclasses
  abstract getDisplayName(): string;
  abstract toModel(): TModel;
  abstract clone(): NodeBase<TModel>;

  // Search/filter helper
  abstract matches(query: string): boolean;
}
