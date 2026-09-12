export interface VfsMountPreset {
  id: string;
  name: string;
  mountPoint: string;
  providerType: string;
  config: Record<string, string>;
}

const STORAGE_KEY = 'mycastle_vfs_presets';

export function loadPresets(): VfsMountPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VfsMountPreset[]) : [];
  } catch {
    return [];
  }
}

export function savePreset(preset: VfsMountPreset): void {
  const presets = loadPresets().filter((p) => p.id !== preset.id);
  presets.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function generatePresetId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
