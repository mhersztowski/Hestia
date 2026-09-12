import {
  PART_LIBRARY,
  getPartDef,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
} from './partLibrary';

describe('partLibrary', () => {
  it('exposes a non-empty part library', () => {
    expect(PART_LIBRARY.length).toBeGreaterThan(0);
  });

  it('every part has a unique id', () => {
    const ids = PART_LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getPartDef finds a part by id', () => {
    const first = PART_LIBRARY[0];
    expect(getPartDef(first.id)).toBe(first);
  });

  it('getPartDef returns undefined for an unknown id', () => {
    expect(getPartDef('does-not-exist')).toBeUndefined();
  });

  it('every part category appears in CATEGORY_ORDER and has a label', () => {
    for (const part of PART_LIBRARY) {
      expect(CATEGORY_ORDER).toContain(part.category);
      expect(CATEGORY_LABEL[part.category]).toBeTruthy();
    }
  });

  it('CATEGORY_LABEL covers exactly the ordered categories', () => {
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual([...CATEGORY_ORDER].sort());
  });
});
