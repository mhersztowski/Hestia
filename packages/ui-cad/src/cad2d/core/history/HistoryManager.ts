export interface Operation {
  type: string;
  description: string;
  undo: () => void;
  redo: () => void;
}

export class HistoryManager {
  private stack: Operation[] = [];
  private pointer = -1;
  private maxSize: number;
  private _batchOps: Operation[] | null = null;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /** Start accumulating operations into a single compound entry. */
  beginBatch(): void {
    if (this._batchOps !== null) return; // nested — ignore
    this._batchOps = [];
  }

  /** Commit accumulated operations as one atomic entry on the stack. */
  commitBatch(description: string): void {
    const ops = this._batchOps;
    this._batchOps = null;
    if (!ops || ops.length === 0) return;
    const compound: Operation = ops.length === 1
      ? { ...ops[0], description }
      : {
          type: 'compound',
          description,
          undo: () => { for (let i = ops.length - 1; i >= 0; i--) ops[i].undo(); },
          redo: () => { for (const op of ops) op.redo(); },
        };
    this._pushToStack(compound);
  }

  /** Discard accumulated operations without committing (use on error paths). */
  cancelBatch(): void {
    this._batchOps = null;
  }

  push(op: Operation): void {
    if (this._batchOps !== null) {
      this._batchOps.push(op);
      return;
    }
    this._pushToStack(op);
  }

  private _pushToStack(op: Operation): void {
    // Remove everything after current pointer (discard redo history)
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(op);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
    this.pointer = this.stack.length - 1;
  }

  undo(): Operation | undefined {
    if (this.pointer < 0) return undefined;
    const op = this.stack[this.pointer];
    op.undo();
    this.pointer--;
    return op;
  }

  redo(): Operation | undefined {
    if (this.pointer >= this.stack.length - 1) return undefined;
    this.pointer++;
    const op = this.stack[this.pointer];
    op.redo();
    return op;
  }

  canUndo(): boolean {
    return this.pointer >= 0;
  }

  canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  clear(): void {
    this.stack = [];
    this.pointer = -1;
  }

  getDescription(): { undoLabel?: string; redoLabel?: string } {
    return {
      undoLabel: this.canUndo() ? this.stack[this.pointer].description : undefined,
      redoLabel: this.canRedo() ? this.stack[this.pointer + 1].description : undefined,
    };
  }
}
