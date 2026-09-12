import { nanoid } from '../utils/nanoid';
import type { Layer } from './Layer';
import { DEFAULT_LAYER } from './Layer';

export class LayerSystem {
  private layers = new Map<string, Layer>();
  private activeId = DEFAULT_LAYER.id;

  constructor() {
    this.layers.set(DEFAULT_LAYER.id, { ...DEFAULT_LAYER });
  }

  add(partial: Omit<Layer, 'id'>): Layer {
    const layer: Layer = { ...partial, id: nanoid() };
    this.layers.set(layer.id, layer);
    return layer;
  }

  addWithId(layer: Layer): void {
    this.layers.set(layer.id, layer);
  }

  remove(id: string): void {
    if (id === DEFAULT_LAYER.id) return; // cannot remove default layer
    this.layers.delete(id);
    if (this.activeId === id) {
      this.activeId = DEFAULT_LAYER.id;
    }
  }

  update(id: string, changes: Partial<Omit<Layer, 'id'>>): Layer | undefined {
    const layer = this.layers.get(id);
    if (!layer) return undefined;
    const updated = { ...layer, ...changes };
    this.layers.set(id, updated);
    return updated;
  }

  get(id: string): Layer | undefined {
    return this.layers.get(id);
  }

  getActive(): Layer {
    return this.layers.get(this.activeId) ?? this.layers.get(DEFAULT_LAYER.id)!;
  }

  setActive(id: string): void {
    if (this.layers.has(id)) {
      this.activeId = id;
    }
  }

  getActiveId(): string {
    return this.activeId;
  }

  getAll(): Layer[] {
    return Array.from(this.layers.values());
  }

  clear(): void {
    this.layers.clear();
    this.layers.set(DEFAULT_LAYER.id, { ...DEFAULT_LAYER });
    this.activeId = DEFAULT_LAYER.id;
  }

  toData(): { layers: Layer[]; activeId: string } {
    return { layers: this.getAll(), activeId: this.activeId };
  }

  fromData(data: { layers: Layer[]; activeId: string }): void {
    this.layers.clear();
    for (const l of data.layers) {
      this.layers.set(l.id, l);
    }
    this.activeId = data.activeId;
  }
}
