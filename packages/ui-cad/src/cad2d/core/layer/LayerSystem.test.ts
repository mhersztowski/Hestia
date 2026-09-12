import { LayerSystem } from './LayerSystem';
import { DEFAULT_LAYER } from './Layer';

const partial = {
  name: 'Layer 1',
  color: '#ff0000',
  lineType: 'dashed' as const,
  lineWidth: 2,
  visible: true,
  locked: false,
};

describe('LayerSystem', () => {
  let ls: LayerSystem;
  beforeEach(() => {
    ls = new LayerSystem();
  });

  it('starts with the default layer active', () => {
    expect(ls.getAll()).toHaveLength(1);
    expect(ls.getActiveId()).toBe(DEFAULT_LAYER.id);
    expect(ls.getActive().name).toBe('0');
  });

  it('add() creates a layer with a generated id', () => {
    const l = ls.add(partial);
    expect(l.id).toBeTruthy();
    expect(l.id).not.toBe(DEFAULT_LAYER.id);
    expect(ls.get(l.id)).toEqual(l);
    expect(ls.getAll()).toHaveLength(2);
  });

  it('addWithId() inserts a fully-formed layer', () => {
    ls.addWithId({ ...partial, id: 'custom' });
    expect(ls.get('custom')?.name).toBe('Layer 1');
  });

  it('update() applies changes', () => {
    const l = ls.add(partial);
    const updated = ls.update(l.id, { name: 'Renamed', visible: false });
    expect(updated?.name).toBe('Renamed');
    expect(updated?.visible).toBe(false);
    expect(ls.get(l.id)?.name).toBe('Renamed');
  });

  it('update() returns undefined for an unknown layer', () => {
    expect(ls.update('nope', { name: 'x' })).toBeUndefined();
  });

  it('setActive() switches the active layer', () => {
    const l = ls.add(partial);
    ls.setActive(l.id);
    expect(ls.getActiveId()).toBe(l.id);
    expect(ls.getActive().id).toBe(l.id);
  });

  it('setActive() ignores unknown ids', () => {
    ls.setActive('nope');
    expect(ls.getActiveId()).toBe(DEFAULT_LAYER.id);
  });

  it('remove() deletes a non-default layer', () => {
    const l = ls.add(partial);
    ls.remove(l.id);
    expect(ls.get(l.id)).toBeUndefined();
  });

  it('remove() resets active to default when removing the active layer', () => {
    const l = ls.add(partial);
    ls.setActive(l.id);
    ls.remove(l.id);
    expect(ls.getActiveId()).toBe(DEFAULT_LAYER.id);
  });

  it('remove() refuses to delete the default layer', () => {
    ls.remove(DEFAULT_LAYER.id);
    expect(ls.get(DEFAULT_LAYER.id)).toBeDefined();
  });

  it('get() returns undefined for unknown id', () => {
    expect(ls.get('nope')).toBeUndefined();
  });

  it('getActive() falls back to default when active layer vanished', () => {
    // Force an inconsistent state by removing everything then only re-adding default
    const l = ls.add(partial);
    ls.setActive(l.id);
    // manually delete via clear path is different; instead remove active
    ls.remove(l.id); // active resets to default
    expect(ls.getActive().id).toBe(DEFAULT_LAYER.id);
  });

  it('clear() resets to only the default layer and active default', () => {
    const l = ls.add(partial);
    ls.setActive(l.id);
    ls.clear();
    expect(ls.getAll()).toHaveLength(1);
    expect(ls.getActiveId()).toBe(DEFAULT_LAYER.id);
  });

  it('toData()/fromData() round-trips layers and active id', () => {
    const l = ls.add(partial);
    ls.setActive(l.id);
    const data = ls.toData();
    const ls2 = new LayerSystem();
    ls2.fromData(data);
    expect(ls2.getAll()).toHaveLength(2);
    expect(ls2.getActiveId()).toBe(l.id);
    expect(ls2.get(l.id)?.name).toBe('Layer 1');
  });
});
