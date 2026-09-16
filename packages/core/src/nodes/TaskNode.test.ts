import { describe, it, expect } from 'vitest';
import { TaskNode } from './TaskNode';
import type { TaskModel } from '../models/TaskModel';

const make = (o?: Partial<TaskModel>): TaskModel => ({
  type: 'task',
  id: 't1',
  name: 'Do thing',
  ...o,
});

describe('TaskNode', () => {
  it('round-trips via toModel', () => {
    const model = make({ projectId: 'p1', description: 'd', duration: 5, cost: 100 });
    expect(new TaskNode(model).toModel()).toEqual(model);
  });

  describe('completion & progress', () => {
    it('setCompleted(true) forces progress to 100', () => {
      const t = new TaskNode(make());
      t.setCompleted(true);
      expect(t.isCompleted).toBe(true);
      expect(t.progress).toBe(100);
    });

    it('toggleCompleted flips state', () => {
      const t = new TaskNode(make());
      t.toggleCompleted();
      expect(t.isCompleted).toBe(true);
      t.toggleCompleted();
      expect(t.isCompleted).toBe(false);
    });

    it('setProgress clamps to 0..100 and syncs completion', () => {
      const t = new TaskNode(make());
      t.setProgress(150);
      expect(t.progress).toBe(100);
      expect(t.isCompleted).toBe(true);
      t.setProgress(-10);
      expect(t.progress).toBe(0);
      expect(t.isCompleted).toBe(false);
    });
  });

  describe('project relationship', () => {
    it('hasProject reflects projectId', () => {
      expect(new TaskNode(make({ projectId: 'p' })).hasProject()).toBe(true);
      expect(new TaskNode(make()).hasProject()).toBe(false);
    });
    it('setProjectRef exposes project name', () => {
      const t = new TaskNode(make());
      t.setProjectRef({ id: 'p', name: 'Proj' });
      expect(t.getProjectName()).toBe('Proj');
    });
    it('getProjectName is null without a ref', () => {
      expect(new TaskNode(make()).getProjectName()).toBeNull();
    });
  });

  describe('duration formatting (hours)', () => {
    it('formats sub-day durations in hours', () => {
      expect(new TaskNode(make({ duration: 5 })).getDurationFormatted()).toBe('5h');
    });
    it('formats multi-day durations', () => {
      expect(new TaskNode(make({ duration: 50 })).getDurationFormatted()).toBe('2d 2h');
      expect(new TaskNode(make({ duration: 48 })).getDurationFormatted()).toBe('2d');
    });
    it('is null when unset', () => {
      expect(new TaskNode(make()).getDurationFormatted()).toBeNull();
      expect(new TaskNode(make()).getDurationHours()).toBeNull();
    });
  });

  describe('cost', () => {
    it('formats as PLN currency', () => {
      const s = new TaskNode(make({ cost: 100 })).getCostFormatted();
      expect(s).toContain('100');
    });
    it('hasCost only for positive values', () => {
      expect(new TaskNode(make({ cost: 5 })).hasCost()).toBe(true);
      expect(new TaskNode(make({ cost: 0 })).hasCost()).toBe(false);
      expect(new TaskNode(make()).hasCost()).toBe(false);
    });
  });

  describe('components & interval', () => {
    it('finds a component by type', () => {
      const t = new TaskNode(
        make({ components: [{ type: 'task_interval', daysInterval: 7 } as any] })
      );
      expect(t.hasComponents()).toBe(true);
      expect(t.getComponentByType('task_interval')).toBeDefined();
    });

    it('reads days interval and formats it', () => {
      const t = new TaskNode(
        make({ components: [{ type: 'task_interval', daysInterval: 14 } as any] })
      );
      expect(t.hasInterval()).toBe(true);
      expect(t.getDaysInterval()).toBe(14);
      expect(t.getDaysIntervalFormatted()).toBe('2 weeks');
    });

    it('formats singular/plural day and week intervals', () => {
      const mk = (d: number) =>
        new TaskNode(make({ components: [{ type: 'task_interval', daysInterval: d } as any] }));
      expect(mk(1).getDaysIntervalFormatted()).toBe('1 day');
      expect(mk(3).getDaysIntervalFormatted()).toBe('3 days');
      expect(mk(7).getDaysIntervalFormatted()).toBe('1 week');
      expect(mk(10).getDaysIntervalFormatted()).toBe('10 days');
    });

    it('interval helpers return null/false when absent', () => {
      const t = new TaskNode(make());
      expect(t.hasInterval()).toBe(false);
      expect(t.getDaysInterval()).toBeNull();
      expect(t.getDaysIntervalFormatted()).toBeNull();
    });
  });

  it('matches across fields', () => {
    const t = new TaskNode(make({ description: 'important', projectId: 'proj-9' }));
    expect(t.matches('DO thing')).toBe(true);
    expect(t.matches('important')).toBe(true);
    expect(t.matches('proj-9')).toBe(true);
    expect(t.matches('nope')).toBe(false);
  });

  it('resetState clears task-specific state too', () => {
    const t = new TaskNode(make()).setCompleted(true);
    t.setSelected(true);
    t.resetState();
    expect(t.isCompleted).toBe(false);
    expect(t.progress).toBe(0);
    expect(t.isSelected).toBe(false);
  });

  it('clone preserves completion/progress/projectRef and base state', () => {
    const t = new TaskNode(make());
    t.setProgress(50).setProjectRef({ id: 'p', name: 'P' }).markDirty();
    const c = t.clone();
    expect(c.progress).toBe(50);
    expect(c.getProjectName()).toBe('P');
    expect(c.isDirty).toBe(true);
  });

  it('equals compares by id', () => {
    expect(new TaskNode(make({ id: 'x' })).equals(make({ id: 'x' }))).toBe(true);
  });

  /**
   * The planning fields (status, priority, dates, assignees, tags, time,
   * subtasks, dependencies) are what the ClickUp-like view adds. The round trip
   * matters more here than usual: the older PIM/Projects page writes the
   * **whole** file through toModel(), so a field lost in the conversion does
   * not end up empty — it is erased on disk at the first save from that page.
   */
  describe('planning fields', () => {
    const planned = make({
      status: 'in_progress',
      priority: 'high',
      startDate: '2026-08-01',
      dueDate: '2026-08-20',
      assignees: ['person-1', 'person-2'],
      tags: ['backend', 'urgent'],
      // The estimate is `duration` — hours, fractional.
      duration: 2.5,
      timeEntries: [
        { id: 'e1', start: '2026-08-01T08:00:00.000Z', end: '2026-08-01T09:30:00.000Z' },
      ],
      parentTaskId: 'parent-1',
      order: 3,
      dependsOn: ['t0'],
    });

    it('round-trips every new field', () => {
      expect(new TaskNode(planned).toModel()).toEqual(planned);
    });

    it('updateFrom overwrites the new fields', () => {
      const t = new TaskNode(make());
      t.updateFrom(planned);
      expect(t.toModel()).toEqual(planned);
    });

    it('clone keeps the new fields', () => {
      expect(new TaskNode(planned).clone().toModel()).toEqual(planned);
    });

    it('adds no keys when the fields are absent', () => {
      // Writing empty arrays and undefined would litter the file on every edit
      // of a task that knows nothing about the new fields.
      expect(new TaskNode(make()).toModel()).toEqual(make());
    });
  });

  describe('time tracking', () => {
    it('sums closed entries in minutes', () => {
      const t = new TaskNode(
        make({
          timeEntries: [
            { id: 'e1', start: '2026-08-01T08:00:00.000Z', end: '2026-08-01T09:30:00.000Z' },
            { id: 'e2', start: '2026-08-02T10:00:00.000Z', end: '2026-08-02T10:15:00.000Z' },
          ],
        })
      );
      expect(t.trackedMinutes()).toBe(105);
    });

    it('counts a running entry against the moment given', () => {
      // "Now" comes in as a parameter, or the test would depend on the clock.
      const t = new TaskNode(
        make({
          timeEntries: [{ id: 'e1', start: '2026-08-01T08:00:00.000Z' }],
        })
      );
      expect(t.isTracking()).toBe(true);
      expect(t.trackedMinutes(new Date('2026-08-01T08:45:00.000Z'))).toBe(45);
    });

    it('startTracking adds an entry, stopTracking closes it', () => {
      const t = new TaskNode(make());
      t.startTracking({ id: 'e1', at: new Date('2026-08-01T08:00:00.000Z'), who: 'person-1' });
      expect(t.isTracking()).toBe(true);
      t.stopTracking(new Date('2026-08-01T08:30:00.000Z'));
      expect(t.isTracking()).toBe(false);
      expect(t.trackedMinutes()).toBe(30);
      expect(t.timeEntries?.[0]?.who).toBe('person-1');
    });

    it('startTracking opens no second entry while one is running', () => {
      const t = new TaskNode(make());
      t.startTracking({ id: 'e1', at: new Date('2026-08-01T08:00:00.000Z') });
      t.startTracking({ id: 'e2', at: new Date('2026-08-01T09:00:00.000Z') });
      expect(t.timeEntries).toHaveLength(1);
    });
  });

  describe('dependencies', () => {
    it('dependsOn holds predecessors only', () => {
      // One side of the relation on purpose: "blocks" is its inverse, computed
      // from the whole set. Two lists in one file drift apart at the first
      // deletion of a task.
      const t = new TaskNode(make({ dependsOn: ['a', 'b'] }));
      expect(t.dependsOn).toEqual(['a', 'b']);
    });

    it('addDependency neither duplicates nor allows depending on itself', () => {
      const t = new TaskNode(make({ id: 't1' }));
      t.addDependency('a');
      t.addDependency('a');
      t.addDependency('t1');
      expect(t.dependsOn).toEqual(['a']);
    });

    it('removeDependency drops the field when the list empties', () => {
      const t = new TaskNode(make({ dependsOn: ['a'] }));
      t.removeDependency('a');
      expect(t.toModel().dependsOn).toBeUndefined();
    });
  });
});
