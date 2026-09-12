import { HistoryManager, type Operation } from './HistoryManager';

function makeOp(log: string[], name: string): Operation {
  return {
    type: name,
    description: name,
    undo: () => log.push(`undo:${name}`),
    redo: () => log.push(`redo:${name}`),
  };
}

describe('HistoryManager', () => {
  let hm: HistoryManager;
  let log: string[];
  beforeEach(() => {
    hm = new HistoryManager();
    log = [];
  });

  it('starts empty (no undo/redo)', () => {
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
    expect(hm.undo()).toBeUndefined();
    expect(hm.redo()).toBeUndefined();
  });

  it('push then undo/redo runs the callbacks', () => {
    const op = makeOp(log, 'a');
    hm.push(op);
    expect(hm.canUndo()).toBe(true);
    expect(hm.undo()).toBe(op);
    expect(log).toEqual(['undo:a']);
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(true);
    expect(hm.redo()).toBe(op);
    expect(log).toEqual(['undo:a', 'redo:a']);
  });

  it('pushing after an undo discards the redo history', () => {
    hm.push(makeOp(log, 'a'));
    hm.push(makeOp(log, 'b'));
    hm.undo(); // undo b
    hm.push(makeOp(log, 'c')); // discards b's redo
    expect(hm.canRedo()).toBe(false);
    const labels = hm.getDescription();
    expect(labels.undoLabel).toBe('c');
  });

  it('getDescription reports undo/redo labels', () => {
    hm.push(makeOp(log, 'a'));
    hm.push(makeOp(log, 'b'));
    expect(hm.getDescription()).toEqual({ undoLabel: 'b', redoLabel: undefined });
    hm.undo();
    expect(hm.getDescription()).toEqual({ undoLabel: 'a', redoLabel: 'b' });
  });

  it('bounds the stack at maxSize (default 100), dropping the oldest', () => {
    for (let i = 0; i < 150; i++) hm.push(makeOp(log, `op${i}`));
    // Can undo at most 100 times
    let undos = 0;
    while (hm.undo()) undos++;
    expect(undos).toBe(100);
    // The oldest surviving op is op50 (0..49 dropped)
    expect(log[log.length - 1]).toBe('undo:op50');
  });

  it('respects a custom maxSize', () => {
    const small = new HistoryManager(2);
    small.push(makeOp(log, 'a'));
    small.push(makeOp(log, 'b'));
    small.push(makeOp(log, 'c')); // drops 'a'
    let count = 0;
    while (small.undo()) count++;
    expect(count).toBe(2);
    expect(log).toContain('undo:c');
    expect(log).toContain('undo:b');
    expect(log).not.toContain('undo:a');
  });

  it('clear() empties the stack', () => {
    hm.push(makeOp(log, 'a'));
    hm.clear();
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
  });

  describe('batching', () => {
    it('commits a single-op batch as one entry (with batch description)', () => {
      hm.beginBatch();
      hm.push(makeOp(log, 'a'));
      hm.commitBatch('grouped');
      expect(hm.getDescription().undoLabel).toBe('grouped');
      hm.undo();
      expect(log).toEqual(['undo:a']);
    });

    it('commits a multi-op batch as one compound entry (LIFO undo, FIFO redo)', () => {
      hm.beginBatch();
      hm.push(makeOp(log, 'a'));
      hm.push(makeOp(log, 'b'));
      hm.commitBatch('grouped');
      // one undo runs both, reverse order
      hm.undo();
      expect(log).toEqual(['undo:b', 'undo:a']);
      log.length = 0;
      hm.redo();
      expect(log).toEqual(['redo:a', 'redo:b']);
      // Only one entry on the stack
      expect(hm.canUndo()).toBe(true);
      expect(hm.canRedo()).toBe(false);
    });

    it('commitBatch with no ops is a no-op', () => {
      hm.beginBatch();
      hm.commitBatch('empty');
      expect(hm.canUndo()).toBe(false);
    });

    it('commitBatch without a batch open is a no-op', () => {
      hm.commitBatch('none');
      expect(hm.canUndo()).toBe(false);
    });

    it('nested beginBatch is ignored (ops still collected once)', () => {
      hm.beginBatch();
      hm.beginBatch(); // ignored
      hm.push(makeOp(log, 'a'));
      hm.commitBatch('grouped');
      expect(hm.getDescription().undoLabel).toBe('grouped');
    });

    it('cancelBatch discards accumulated ops', () => {
      hm.beginBatch();
      hm.push(makeOp(log, 'a'));
      hm.cancelBatch();
      hm.commitBatch('grouped');
      expect(hm.canUndo()).toBe(false);
    });
  });
});
