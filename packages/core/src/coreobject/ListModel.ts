import { CoreObject } from './CoreObject';
import { Signal } from './Signal';

/**
 * Observable list model (analogous to QAbstractListModel).
 * Signals fire on every structural change so views can stay in sync.
 *
 * Usage:
 *   const items = new ListModel<string>(parent);
 *   items.rowsInserted.connect((idx, count) => render());
 *   items.append('hello');
 *   items.insert(0, 'world');
 *   items.remove(1);
 */
export class ListModel<T> extends CoreObject {
  readonly rowsInserted = new Signal<[index: number, count: number]>();
  readonly rowsRemoved  = new Signal<[index: number, count: number]>();
  readonly rowsMoved    = new Signal<[from: number, to: number, count: number]>();
  readonly dataChanged  = new Signal<[index: number, item: T]>();
  readonly modelReset   = new Signal();

  #items: T[];

  constructor(initialItems: T[] = [], parent?: CoreObject) {
    super(parent, 'ListModel');
    this.#items = [...initialItems];
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get(index: number): T {
    if (index < 0 || index >= this.#items.length) {
      throw new RangeError(`Index ${index} out of bounds (length ${this.#items.length})`);
    }
    return this.#items[index];
  }

  getOrUndefined(index: number): T | undefined {
    return this.#items[index];
  }

  get count(): number {
    return this.#items.length;
  }

  get isEmpty(): boolean {
    return this.#items.length === 0;
  }

  indexOf(item: T): number {
    return this.#items.indexOf(item);
  }

  contains(item: T): boolean {
    return this.#items.includes(item);
  }

  /** Snapshot — returns a new array, safe to iterate while mutating. */
  toArray(): T[] {
    return [...this.#items];
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.#items.find(predicate);
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.#items.filter(predicate);
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  append(...items: T[]): void {
    if (items.length === 0) return;
    const idx = this.#items.length;
    this.#items.push(...items);
    this.rowsInserted.emit(idx, items.length);
  }

  prepend(...items: T[]): void {
    if (items.length === 0) return;
    this.#items.unshift(...items);
    this.rowsInserted.emit(0, items.length);
  }

  insert(index: number, ...items: T[]): void {
    if (items.length === 0) return;
    this.#items.splice(index, 0, ...items);
    this.rowsInserted.emit(index, items.length);
  }

  set(index: number, item: T): void {
    if (index < 0 || index >= this.#items.length) {
      throw new RangeError(`Index ${index} out of bounds`);
    }
    this.#items[index] = item;
    this.dataChanged.emit(index, item);
  }

  remove(index: number, count = 1): void {
    if (count <= 0) return;
    this.#items.splice(index, count);
    this.rowsRemoved.emit(index, count);
  }

  removeItem(item: T): boolean {
    const idx = this.#items.indexOf(item);
    if (idx === -1) return false;
    this.remove(idx);
    return true;
  }

  move(fromIndex: number, toIndex: number, count = 1): void {
    const moved = this.#items.splice(fromIndex, count);
    const insertAt = toIndex > fromIndex ? toIndex - count + 1 : toIndex;
    this.#items.splice(insertAt, 0, ...moved);
    this.rowsMoved.emit(fromIndex, toIndex, count);
  }

  clear(): void {
    if (this.#items.length === 0) return;
    this.#items = [];
    this.modelReset.emit();
  }

  /** Replace all items atomically — emits modelReset. */
  reset(items: T[]): void {
    this.#items = [...items];
    this.modelReset.emit();
  }

  sort(compareFn?: (a: T, b: T) => number): void {
    this.#items.sort(compareFn);
    this.modelReset.emit();
  }

  // ── Iteration ─────────────────────────────────────────────────────────────

  [Symbol.iterator](): Iterator<T> {
    return this.#items[Symbol.iterator]();
  }

  forEach(cb: (item: T, index: number) => void): void {
    this.#items.forEach(cb);
  }

  map<U>(cb: (item: T, index: number) => U): U[] {
    return this.#items.map(cb);
  }
}
