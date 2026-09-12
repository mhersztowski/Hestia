import { nanoid } from '../utils/nanoid';
import type { BoundingBox2D, EntityType } from '../types';
import type { Entity, EntityInput } from './types';
import { computeBoundingBox } from './computeBoundingBox';

export class EntityRegistry {
  private entities = new Map<string, Entity>();

  add(input: EntityInput): Entity {
    const id = nanoid();
    const entity = { ...input, id, boundingBox: computeBoundingBox({ ...input, id, boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } } as Entity) } as Entity;
    this.entities.set(id, entity);
    return entity;
  }

  addWithId(entity: Entity): void {
    this.entities.set(entity.id, { ...entity, boundingBox: computeBoundingBox(entity) });
  }

  remove(id: string): Entity | undefined {
    const entity = this.entities.get(id);
    this.entities.delete(id);
    return entity;
  }

  update(id: string, changes: Partial<Entity>): Entity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;
    const updated = { ...entity, ...changes } as Entity;
    updated.boundingBox = computeBoundingBox(updated);
    this.entities.set(id, updated);
    return updated;
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getAll(): Entity[] {
    return Array.from(this.entities.values());
  }

  getByLayer(layerId: string): Entity[] {
    return this.getAll().filter(e => e.layerId === layerId);
  }

  getByType(type: EntityType): Entity[] {
    return this.getAll().filter(e => e.type === type);
  }

  getInBoundingBox(box: BoundingBox2D): Entity[] {
    return this.getAll().filter(e => {
      const b = e.boundingBox;
      return b.maxX >= box.minX && b.minX <= box.maxX && b.maxY >= box.minY && b.minY <= box.maxY;
    });
  }

  clear(): void {
    this.entities.clear();
  }

  toData(): Entity[] {
    return this.getAll();
  }

  fromData(entities: Entity[]): void {
    this.entities.clear();
    for (const e of entities) {
      this.entities.set(e.id, e);
    }
  }
}
