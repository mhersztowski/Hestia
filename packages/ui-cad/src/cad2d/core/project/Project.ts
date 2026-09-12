import { EntityRegistry } from '../entity/EntityRegistry';
import type { DimensionEntity, Entity, EntityInput } from '../entity/types';
import { resolveDimAnchor } from '../entity/dimensionAnchor';
import { EventBus } from '../events/EventBus';
import { HistoryManager } from '../history/HistoryManager';
import type { Layer } from '../layer/Layer';
import { LayerSystem } from '../layer/LayerSystem';
import { SelectionManager } from '../selection/SelectionManager';
import { SnapEngine } from '../snap/SnapEngine';
import type { Units, ViewMode } from '../types';

export interface ProjectSettings {
  name: string;
  units: Units;
  gridSize: number;
  precision: number;
}

export interface ProjectData {
  version: string;
  settings: ProjectSettings;
  layers: { layers: Layer[]; activeId: string };
  entities: Entity[];
}

const DEFAULT_SETTINGS: ProjectSettings = {
  name: 'Untitled',
  units: 'mm',
  gridSize: 10,
  precision: 2,
};

export class Project {
  readonly entityRegistry = new EntityRegistry();
  readonly layerSystem = new LayerSystem();
  readonly historyManager = new HistoryManager();
  readonly selectionManager: SelectionManager;
  readonly snapEngine = new SnapEngine();
  readonly eventBus = new EventBus();

  settings: ProjectSettings = { ...DEFAULT_SETTINGS };
  viewMode: ViewMode = '2d';

  private refreshingDims = false;

  constructor() {
    this.selectionManager = new SelectionManager(this.entityRegistry);
    this.snapEngine.setGridSize(this.settings.gridSize);

    // Anchored ("intelligent") dimensions follow the shapes they reference:
    // whenever a non-dimension entity changes/disappears, re-resolve their endpoints.
    this.eventBus.on('entity:updated', (e: Entity) => {
      if (e?.type !== 'dimension') this.refreshAnchoredDimensions();
    });
    this.eventBus.on('entity:removed', () => this.refreshAnchoredDimensions());
    this.eventBus.on('project:loaded', () => this.refreshAnchoredDimensions());
  }

  /**
   * Re-resolve every anchored dimension's endpoints from its referenced
   * entities. Updates the registry directly (no history entry — this is derived
   * state) and emits `entity:updated` so the renderer rebuilds the dimension.
   */
  refreshAnchoredDimensions(): void {
    if (this.refreshingDims) return;
    this.refreshingDims = true;
    try {
      for (const dim of this.entityRegistry.getByType('dimension') as DimensionEntity[]) {
        const a1 = dim.anchor1 && !dim.anchor1.disabled ? dim.anchor1 : null;
        const a2 = dim.anchor2 && !dim.anchor2.disabled ? dim.anchor2 : null;
        if (!a1 && !a2 && !dim.axis) continue;
        const p1 = a1 ? resolveDimAnchor(a1, this.entityRegistry.get(a1.entityId)) : null;
        const p2 = a2 ? resolveDimAnchor(a2, this.entityRegistry.get(a2.entityId)) : null;
        const nx1 = p1?.x ?? dim.x1, ny1 = p1?.y ?? dim.y1;
        let nx2 = p2?.x ?? dim.x2, ny2 = p2?.y ?? dim.y2;
        // A dimension to an axis: the foot of the perpendicular is computed from the anchored vertex (x1,y1).
        if (dim.axis === 'x') { nx2 = nx1; ny2 = 0; }
        else if (dim.axis === 'y') { nx2 = 0; ny2 = ny1; }
        if (Math.abs(nx1 - dim.x1) > 1e-6 || Math.abs(ny1 - dim.y1) > 1e-6 ||
            Math.abs(nx2 - dim.x2) > 1e-6 || Math.abs(ny2 - dim.y2) > 1e-6) {
          const updated = this.entityRegistry.update(dim.id, { x1: nx1, y1: ny1, x2: nx2, y2: ny2 });
          if (updated) this.eventBus.emit('entity:updated', updated);
        }
      }
    } finally {
      this.refreshingDims = false;
    }
  }

  // --- Entity operations (go through history) ---

  addEntity(input: EntityInput): Entity {
    const layerId = input.layerId || this.layerSystem.getActiveId();
    const entity = this.entityRegistry.add({ ...input, layerId });

    this.historyManager.push({
      type: 'add-entity',
      description: `Add ${entity.type}`,
      undo: () => {
        this.entityRegistry.remove(entity.id);
        this.selectionManager.deselect(entity.id);
        this.eventBus.emit('entity:removed', { id: entity.id });
      },
      redo: () => {
        this.entityRegistry.addWithId(entity);
        this.eventBus.emit('entity:added', entity);
      },
    });

    this.eventBus.emit('entity:added', entity);
    return entity;
  }

  removeEntity(id: string): void {
    const entity = this.entityRegistry.get(id);
    if (!entity) return;

    this.entityRegistry.remove(id);
    this.selectionManager.deselect(id);

    this.historyManager.push({
      type: 'remove-entity',
      description: `Remove ${entity.type}`,
      undo: () => {
        this.entityRegistry.addWithId(entity);
        this.eventBus.emit('entity:added', entity);
      },
      redo: () => {
        this.entityRegistry.remove(id);
        this.selectionManager.deselect(id);
        this.eventBus.emit('entity:removed', { id });
      },
    });

    this.eventBus.emit('entity:removed', { id });
  }

  updateEntity(id: string, changes: Partial<Entity>): void {
    const before = this.entityRegistry.get(id);
    if (!before) return;
    const after = this.entityRegistry.update(id, changes);
    if (!after) return;

    this.historyManager.push({
      type: 'update-entity',
      description: `Update ${before.type}`,
      undo: () => {
        this.entityRegistry.update(id, before);
        this.eventBus.emit('entity:updated', before);
      },
      redo: () => {
        this.entityRegistry.update(id, after);
        this.eventBus.emit('entity:updated', after);
      },
    });

    this.eventBus.emit('entity:updated', after);
  }

  batchUpdate(operations: Array<{ id: string; changes: Partial<Entity> }>, description = 'Batch update'): void {
    const befores: Entity[] = [];
    const afters: Entity[] = [];

    for (const op of operations) {
      const before = this.entityRegistry.get(op.id);
      if (!before) continue;
      const after = this.entityRegistry.update(op.id, op.changes);
      if (!after) continue;
      befores.push(before);
      afters.push(after);
      this.eventBus.emit('entity:updated', after);
    }

    if (befores.length === 0) return;

    this.historyManager.push({
      type: 'batch-update',
      description,
      undo: () => {
        for (const before of befores) {
          this.entityRegistry.update(before.id, before);
          this.eventBus.emit('entity:updated', before);
        }
      },
      redo: () => {
        for (const after of afters) {
          this.entityRegistry.update(after.id, after);
          this.eventBus.emit('entity:updated', after);
        }
      },
    });
  }

  batchAdd(inputs: EntityInput[], description = 'Copy entities'): Entity[] {
    const entities: Entity[] = [];

    for (const input of inputs) {
      const layerId = input.layerId || this.layerSystem.getActiveId();
      const entity = this.entityRegistry.add({ ...input, layerId });
      entities.push(entity);
      this.eventBus.emit('entity:added', entity);
    }

    if (entities.length === 0) return [];

    this.historyManager.push({
      type: 'batch-add',
      description,
      undo: () => {
        for (const e of entities) {
          this.entityRegistry.remove(e.id);
          this.selectionManager.deselect(e.id);
          this.eventBus.emit('entity:removed', { id: e.id });
        }
      },
      redo: () => {
        for (const e of entities) {
          this.entityRegistry.addWithId(e);
          this.eventBus.emit('entity:added', e);
        }
      },
    });

    return entities;
  }

  removeSelected(): void {
    const ids = this.selectionManager.getSelected();
    const entities = ids.map(id => this.entityRegistry.get(id)).filter(Boolean) as Entity[];
    if (entities.length === 0) return;

    for (const e of entities) {
      this.entityRegistry.remove(e.id);
      this.selectionManager.deselect(e.id);
    }

    this.historyManager.push({
      type: 'remove-entities',
      description: `Remove ${entities.length} entity/entities`,
      undo: () => {
        for (const e of entities) {
          this.entityRegistry.addWithId(e);
          this.eventBus.emit('entity:added', e);
        }
      },
      redo: () => {
        for (const e of entities) {
          this.entityRegistry.remove(e.id);
          this.selectionManager.deselect(e.id);
          this.eventBus.emit('entity:removed', { id: e.id });
        }
      },
    });

    for (const e of entities) {
      this.eventBus.emit('entity:removed', { id: e.id });
    }
    this.eventBus.emit('selection:changed', []);
  }

  /** Begin a compound (atomic) undo/redo group. All Project mutations until
   *  commitCompound() will be collapsed into a single history entry. */
  beginCompound(): void {
    this.historyManager.beginBatch();
  }

  /** Commit the compound group with a description visible in the Undo tooltip. */
  commitCompound(description: string): void {
    this.historyManager.commitBatch(description);
    this.eventBus.emit('history:changed', this.historyManager.getDescription());
  }

  undo(): void {
    const op = this.historyManager.undo();
    if (op) this.eventBus.emit('history:changed', this.historyManager.getDescription());
  }

  redo(): void {
    const op = this.historyManager.redo();
    if (op) this.eventBus.emit('history:changed', this.historyManager.getDescription());
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.eventBus.emit('viewmode:changed', mode);
  }

  // --- Serialization ---

  toJSON(): ProjectData {
    return {
      version: '1.0.0',
      settings: { ...this.settings },
      layers: this.layerSystem.toData(),
      entities: this.entityRegistry.toData(),
    };
  }

  static fromJSON(data: ProjectData): Project {
    const project = new Project();
    project.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    project.layerSystem.fromData(data.layers);
    project.entityRegistry.fromData(data.entities);
    project.snapEngine.setGridSize(project.settings.gridSize);
    return project;
  }

  reset(): void {
    this.entityRegistry.clear();
    this.layerSystem.clear();
    this.historyManager.clear();
    this.selectionManager.clear();
    this.settings = { ...DEFAULT_SETTINGS };
    this.eventBus.emit('project:loaded', null);
  }
}
