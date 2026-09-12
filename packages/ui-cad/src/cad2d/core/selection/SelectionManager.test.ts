import { SelectionManager } from './SelectionManager';
import { EntityRegistry } from '../entity/EntityRegistry';
import type { EntityInput } from '../entity/types';

const base = {
  layerId: '0',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
};

function line(x: number): EntityInput {
  return { ...base, type: 'line', x1: x, y1: 0, x2: x + 5, y2: 5 } as EntityInput;
}

describe('SelectionManager', () => {
  let reg: EntityRegistry;
  let sel: SelectionManager;
  beforeEach(() => {
    reg = new EntityRegistry();
    sel = new SelectionManager(reg);
  });

  it('starts empty', () => {
    expect(sel.count()).toBe(0);
    expect(sel.getSelected()).toEqual([]);
  });

  it('select() single-selects (clears others by default)', () => {
    sel.select('a');
    sel.select('b');
    expect(sel.getSelected()).toEqual(['b']);
  });

  it('select() with multi adds to the selection', () => {
    sel.select('a');
    sel.select('b', true);
    expect(new Set(sel.getSelected())).toEqual(new Set(['a', 'b']));
    expect(sel.count()).toBe(2);
  });

  it('isSelected() reports membership', () => {
    sel.select('a');
    expect(sel.isSelected('a')).toBe(true);
    expect(sel.isSelected('z')).toBe(false);
  });

  it('deselect() removes an id', () => {
    sel.select('a', true);
    sel.select('b', true);
    sel.deselect('a');
    expect(sel.getSelected()).toEqual(['b']);
  });

  it('toggle() adds then removes', () => {
    sel.toggle('a');
    expect(sel.isSelected('a')).toBe(true);
    sel.toggle('a');
    expect(sel.isSelected('a')).toBe(false);
  });

  it('toggle() with multi keeps existing selection when adding', () => {
    sel.select('a');
    sel.toggle('b', true);
    expect(new Set(sel.getSelected())).toEqual(new Set(['a', 'b']));
  });

  it('toggle() without multi replaces when adding a new id', () => {
    sel.select('a');
    sel.toggle('b'); // not selected → select(b, false) clears a
    expect(sel.getSelected()).toEqual(['b']);
  });

  it('selectAll() selects every entity in the registry', () => {
    const a = reg.add(line(0));
    const b = reg.add(line(10));
    sel.selectAll();
    expect(new Set(sel.getSelected())).toEqual(new Set([a.id, b.id]));
  });

  it('clear() empties the selection', () => {
    sel.select('a');
    sel.clear();
    expect(sel.count()).toBe(0);
  });

  it('selectInBox() selects entities overlapping the box', () => {
    const a = reg.add(line(0)); // bbox 0..5
    reg.add(line(100)); // bbox 100..105
    sel.select('preexisting'); // should be cleared by selectInBox
    sel.selectInBox({ minX: -1, minY: -1, maxX: 6, maxY: 6 });
    expect(sel.getSelected()).toEqual([a.id]);
  });
});
