import type { BoundingBox2D } from '../types';
import type { EntityRegistry } from '../entity/EntityRegistry';

export class SelectionManager {
  private selected = new Set<string>();
  private registry: EntityRegistry;

  constructor(registry: EntityRegistry) {
    this.registry = registry;
  }

  select(id: string, multi = false): void {
    if (!multi) this.selected.clear();
    this.selected.add(id);
  }

  deselect(id: string): void {
    this.selected.delete(id);
  }

  toggle(id: string, multi = false): void {
    if (this.selected.has(id)) {
      this.deselect(id);
    } else {
      this.select(id, multi);
    }
  }

  selectAll(): void {
    for (const e of this.registry.getAll()) {
      this.selected.add(e.id);
    }
  }

  clear(): void {
    this.selected.clear();
  }

  getSelected(): string[] {
    return Array.from(this.selected);
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  count(): number {
    return this.selected.size;
  }

  selectInBox(box: BoundingBox2D): void {
    this.selected.clear();
    for (const e of this.registry.getInBoundingBox(box)) {
      this.selected.add(e.id);
    }
  }
}
