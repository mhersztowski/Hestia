import { Project, type ProjectData } from './Project';
import type { Entity, EntityInput } from '../entity/types';

const base = {
  layerId: '',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
};

function line(over: Partial<EntityInput> = {}): EntityInput {
  return { ...base, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, ...over } as EntityInput;
}

describe('Project — entity operations & history', () => {
  let p: Project;
  beforeEach(() => {
    p = new Project();
  });

  it('addEntity assigns the active layer when none given and emits entity:added', () => {
    const events: Entity[] = [];
    p.eventBus.on('entity:added', e => events.push(e));
    const e = p.addEntity(line());
    expect(e.layerId).toBe(p.layerSystem.getActiveId());
    expect(p.entityRegistry.get(e.id)).toBeTruthy();
    expect(events).toHaveLength(1);
  });

  it('addEntity keeps an explicit layerId', () => {
    const l = p.layerSystem.add({ name: 'x', color: '#fff', lineType: 'solid', lineWidth: 1, visible: true, locked: false });
    const e = p.addEntity(line({ layerId: l.id }));
    expect(e.layerId).toBe(l.id);
  });

  it('undo/redo an addEntity', () => {
    const e = p.addEntity(line());
    expect(p.historyManager.canUndo()).toBe(true);
    p.undo();
    expect(p.entityRegistry.get(e.id)).toBeUndefined();
    p.redo();
    expect(p.entityRegistry.get(e.id)).toBeTruthy();
  });

  it('undo emits history:changed', () => {
    let called = 0;
    p.eventBus.on('history:changed', () => called++);
    p.addEntity(line());
    p.undo();
    expect(called).toBe(1);
  });

  it('undo with empty history does not emit history:changed', () => {
    let called = 0;
    p.eventBus.on('history:changed', () => called++);
    p.undo();
    p.redo();
    expect(called).toBe(0);
  });

  it('removeEntity removes and can be undone', () => {
    const e = p.addEntity(line());
    p.selectionManager.select(e.id);
    p.removeEntity(e.id);
    expect(p.entityRegistry.get(e.id)).toBeUndefined();
    expect(p.selectionManager.isSelected(e.id)).toBe(false);
    p.undo();
    expect(p.entityRegistry.get(e.id)).toBeTruthy();
    p.redo();
    expect(p.entityRegistry.get(e.id)).toBeUndefined();
  });

  it('removeEntity on unknown id is a no-op (no history)', () => {
    p.removeEntity('nope');
    expect(p.historyManager.canUndo()).toBe(false);
  });

  it('updateEntity changes fields and can be undone/redone', () => {
    const e = p.addEntity(line());
    p.updateEntity(e.id, { x2: 99 } as Partial<Entity>);
    expect((p.entityRegistry.get(e.id) as any).x2).toBe(99);
    p.undo();
    expect((p.entityRegistry.get(e.id) as any).x2).toBe(10);
    p.redo();
    expect((p.entityRegistry.get(e.id) as any).x2).toBe(99);
  });

  it('updateEntity on unknown id is a no-op', () => {
    p.updateEntity('nope', { x2: 1 } as Partial<Entity>);
    expect(p.historyManager.canUndo()).toBe(false);
  });

  it('batchUpdate updates many entities atomically', () => {
    const a = p.addEntity(line());
    const b = p.addEntity(line({ x1: 5 }));
    p.historyManager.clear();
    p.batchUpdate([
      { id: a.id, changes: { x2: 20 } as Partial<Entity> },
      { id: b.id, changes: { x2: 30 } as Partial<Entity> },
      { id: 'missing', changes: { x2: 0 } as Partial<Entity> },
    ], 'move');
    expect((p.entityRegistry.get(a.id) as any).x2).toBe(20);
    expect((p.entityRegistry.get(b.id) as any).x2).toBe(30);
    p.undo();
    expect((p.entityRegistry.get(a.id) as any).x2).toBe(10);
    expect((p.entityRegistry.get(b.id) as any).x2).toBe(10);
    p.redo();
    expect((p.entityRegistry.get(a.id) as any).x2).toBe(20);
  });

  it('batchUpdate with no valid operations pushes no history', () => {
    p.batchUpdate([{ id: 'missing', changes: {} }]);
    expect(p.historyManager.canUndo()).toBe(false);
  });

  it('batchAdd adds several entities and can undo/redo', () => {
    const added = p.batchAdd([line(), line({ x1: 5 })], 'copy');
    expect(added).toHaveLength(2);
    expect(p.entityRegistry.getAll()).toHaveLength(2);
    p.undo();
    expect(p.entityRegistry.getAll()).toHaveLength(0);
    p.redo();
    expect(p.entityRegistry.getAll()).toHaveLength(2);
  });

  it('batchAdd with empty input returns [] and no history', () => {
    expect(p.batchAdd([])).toEqual([]);
    expect(p.historyManager.canUndo()).toBe(false);
  });

  it('removeSelected removes all selected entities and can undo/redo', () => {
    const a = p.addEntity(line());
    const b = p.addEntity(line({ x1: 5 }));
    p.selectionManager.select(a.id, true);
    p.selectionManager.select(b.id, true);
    p.historyManager.clear();
    let selChanged = 0;
    p.eventBus.on('selection:changed', () => selChanged++);
    p.removeSelected();
    expect(p.entityRegistry.getAll()).toHaveLength(0);
    expect(selChanged).toBe(1);
    p.undo();
    expect(p.entityRegistry.getAll()).toHaveLength(2);
    p.redo();
    expect(p.entityRegistry.getAll()).toHaveLength(0);
  });

  it('removeSelected with empty selection is a no-op', () => {
    p.removeSelected();
    expect(p.historyManager.canUndo()).toBe(false);
  });

  it('beginCompound/commitCompound collapses to a single undo entry', () => {
    p.beginCompound();
    const a = p.addEntity(line());
    const b = p.addEntity(line({ x1: 5 }));
    p.commitCompound('add two');
    expect(p.entityRegistry.getAll()).toHaveLength(2);
    p.undo(); // one undo removes both
    expect(p.entityRegistry.getAll()).toHaveLength(0);
    expect(void a).toBeUndefined();
    expect(void b).toBeUndefined();
  });

  it('commitCompound emits history:changed', () => {
    let called = 0;
    p.eventBus.on('history:changed', () => called++);
    p.beginCompound();
    p.addEntity(line());
    p.commitCompound('x');
    expect(called).toBe(1);
  });

  it('setViewMode updates and emits viewmode:changed', () => {
    let mode: unknown;
    p.eventBus.on('viewmode:changed', m => { mode = m; });
    p.setViewMode('3d');
    expect(p.viewMode).toBe('3d');
    expect(mode).toBe('3d');
  });
});

describe('Project — serialization', () => {
  it('toJSON captures version, settings, layers, entities', () => {
    const p = new Project();
    p.settings.name = 'My Drawing';
    p.addEntity(line());
    const json = p.toJSON();
    expect(json.version).toBe('1.0.0');
    expect(json.settings.name).toBe('My Drawing');
    expect(json.entities).toHaveLength(1);
    expect(json.layers.layers.length).toBeGreaterThanOrEqual(1);
  });

  it('fromJSON round-trips a project', () => {
    const p = new Project();
    p.settings.name = 'RoundTrip';
    p.settings.gridSize = 42;
    const l = p.layerSystem.add({ name: 'walls', color: '#abc', lineType: 'solid', lineWidth: 2, visible: true, locked: false });
    p.layerSystem.setActive(l.id);
    p.addEntity(line({ layerId: l.id }));
    const json = p.toJSON();

    const p2 = Project.fromJSON(json);
    expect(p2.settings.name).toBe('RoundTrip');
    expect(p2.settings.gridSize).toBe(42);
    expect(p2.snapEngine.getGridSize()).toBe(42);
    expect(p2.entityRegistry.getAll()).toHaveLength(1);
    expect(p2.layerSystem.getActiveId()).toBe(l.id);
    // Deep equality of re-serialized data
    expect(p2.toJSON()).toEqual(json);
  });

  it('fromJSON fills defaults for partial settings', () => {
    const data: ProjectData = {
      version: '1.0.0',
      settings: { name: 'Partial' } as any,
      layers: { layers: [], activeId: '0' },
      entities: [],
    };
    const p = Project.fromJSON(data);
    expect(p.settings.name).toBe('Partial');
    expect(p.settings.units).toBe('mm'); // default
    expect(p.settings.gridSize).toBe(10);
  });

  it('reset clears everything and emits project:loaded', () => {
    const p = new Project();
    p.addEntity(line());
    p.settings.name = 'Dirty';
    let loaded = false;
    p.eventBus.on('project:loaded', () => { loaded = true; });
    p.reset();
    expect(p.entityRegistry.getAll()).toHaveLength(0);
    expect(p.settings.name).toBe('Untitled');
    expect(p.historyManager.canUndo()).toBe(false);
    expect(loaded).toBe(true);
  });
});

describe('Project — anchored (intelligent) dimensions', () => {
  function makeProjectWithAnchoredDim() {
    const p = new Project();
    const l = p.addEntity(line({ x1: 0, y1: 0, x2: 100, y2: 0 }));
    const dimInput = {
      ...base,
      type: 'dimension',
      x1: 0, y1: 0, x2: 100, y2: 0,
      offset: 20,
      anchor1: { entityId: l.id, kind: 'endpoint', index: 0 },
      anchor2: { entityId: l.id, kind: 'endpoint', index: 1 },
    } as EntityInput;
    const dim = p.addEntity(dimInput);
    return { p, l, dim };
  }

  it('re-resolves anchored dimension endpoints when the referenced entity moves', () => {
    const { p, l, dim } = makeProjectWithAnchoredDim();
    // Move the line's second endpoint; dimension x2 should follow.
    p.updateEntity(l.id, { x2: 150 } as Partial<Entity>);
    const updated = p.entityRegistry.get(dim.id) as any;
    expect(updated.x2).toBeCloseTo(150);
  });

  it('refreshAnchoredDimensions skips dims with only disabled anchors', () => {
    const p = new Project();
    const l = p.addEntity(line({ x1: 0, y1: 0, x2: 100, y2: 0 }));
    const dim = p.addEntity({
      ...base,
      type: 'dimension',
      x1: 0, y1: 0, x2: 100, y2: 0, offset: 10,
      anchor1: { entityId: l.id, kind: 'endpoint', index: 0, disabled: true },
    } as EntityInput);
    p.updateEntity(l.id, { x1: -50 } as Partial<Entity>);
    const d = p.entityRegistry.get(dim.id) as any;
    expect(d.x1).toBe(0); // unchanged because anchor disabled
  });

  it('refreshAnchoredDimensions handles a vanished referenced entity (keeps literal coords)', () => {
    const { p, l, dim } = makeProjectWithAnchoredDim();
    p.removeEntity(l.id); // triggers refresh; anchors now resolve to null → keep old coords
    const d = p.entityRegistry.get(dim.id) as any;
    expect(d.x1).toBe(0);
    expect(d.x2).toBe(100);
  });

  it('project:loaded triggers a dimension refresh', () => {
    const { p, l } = makeProjectWithAnchoredDim();
    // Directly mutate the line in the registry (no event), then fire project:loaded.
    p.entityRegistry.update(l.id, { x2: 200 } as Partial<Entity>);
    p.eventBus.emit('project:loaded', null);
    const dims = p.entityRegistry.getByType('dimension');
    expect((dims[0] as any).x2).toBeCloseTo(200);
  });
});
