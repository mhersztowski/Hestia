import {
  loadPresets,
  savePreset,
  deletePreset,
  generatePresetId,
  type VfsMountPreset,
} from './vfsMountPresets';

const preset = (id: string): VfsMountPreset => ({
  id,
  name: `preset-${id}`,
  mountPoint: `/mnt/${id}`,
  providerType: 'memory',
  config: {},
});

describe('vfsMountPresets', () => {
  beforeEach(() => localStorage.clear());

  it('returns [] when nothing is stored', () => {
    expect(loadPresets()).toEqual([]);
  });

  it('returns [] when the stored value is corrupt JSON', () => {
    localStorage.setItem('mycastle_vfs_presets', '{not json');
    expect(loadPresets()).toEqual([]);
  });

  it('saves and reloads a preset', () => {
    savePreset(preset('a'));
    expect(loadPresets()).toEqual([preset('a')]);
  });

  it('replaces an existing preset with the same id (upsert)', () => {
    savePreset(preset('a'));
    const updated = { ...preset('a'), name: 'renamed' };
    savePreset(updated);
    const all = loadPresets();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('renamed');
  });

  it('deletes a preset by id', () => {
    savePreset(preset('a'));
    savePreset(preset('b'));
    deletePreset('a');
    expect(loadPresets().map((p) => p.id)).toEqual(['b']);
  });

  it('generatePresetId produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePresetId()));
    expect(ids.size).toBe(50);
  });
});
