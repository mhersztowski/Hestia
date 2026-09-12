import { describe, it, expect } from 'vitest';
import { ProjectNode } from './ProjectNode';
import { TaskNode } from './TaskNode';
import type { ProjectModel } from '../models/ProjectModel';

const model: ProjectModel = {
  type: 'project',
  id: 'root',
  name: 'Root',
  cost: 100,
  tasks: [
    { type: 'task', id: 't1', name: 'T1', cost: 10, duration: 2 },
    { type: 'task', id: 't2', name: 'T2', cost: 20, duration: 3 },
  ],
  projects: [
    {
      type: 'project',
      id: 'child',
      name: 'Child',
      cost: 50,
      tasks: [{ type: 'task', id: 't3', name: 'T3', cost: 5, duration: 1 }],
    },
  ],
};

describe('ProjectNode', () => {
  it('builds a hierarchy of children and tasks', () => {
    const p = new ProjectNode(model);
    expect(p.hasChildren()).toBe(true);
    expect(p.hasTasks()).toBe(true);
    expect(p.children).toHaveLength(1);
    expect(p.tasks).toHaveLength(2);
    expect(p.tasks[0]).toBeInstanceOf(TaskNode);
  });

  it('wires parent references and root detection', () => {
    const p = new ProjectNode(model);
    expect(p.isRoot()).toBe(true);
    expect(p.children[0].parent).toBe(p);
    expect(p.children[0].isRoot()).toBe(false);
    expect(p.children[0].getDepth()).toBe(1);
    expect(p.getDepth()).toBe(0);
  });

  it('sets task project refs from parent project', () => {
    const p = new ProjectNode(model);
    expect(p.tasks[0].getProjectName()).toBe('Root');
  });

  describe('paths', () => {
    it('builds a path from root and caches it', () => {
      const p = new ProjectNode(model);
      expect(p.children[0].getPath()).toEqual(['Root', 'Child']);
      expect(p.children[0].getPathString()).toBe('Root / Child');
    });
  });

  describe('find helpers', () => {
    it('findChildById recurses', () => {
      const p = new ProjectNode(model);
      expect(p.findChildById('child')?.name).toBe('Child');
      expect(p.findChildById('missing')).toBeNull();
    });
    it('findTaskById searches tasks then children', () => {
      const p = new ProjectNode(model);
      expect(p.findTaskById('t3')?.name).toBe('T3');
      expect(p.findTaskById('nope')).toBeNull();
    });
  });

  describe('aggregates', () => {
    it('counts tasks recursively and non-recursively', () => {
      const p = new ProjectNode(model);
      expect(p.getTaskCount()).toBe(3);
      expect(p.getTaskCount(false)).toBe(2);
    });
    it('sums cost including tasks and children', () => {
      const p = new ProjectNode(model);
      // root cost 100 + tasks 10+20 + child(50 + task 5)=55  => 185
      expect(p.getTotalCost()).toBe(185);
      expect(p.getTotalCost(false)).toBe(130); // 100 + 10 + 20
    });
    it('sums durations from tasks recursively', () => {
      const p = new ProjectNode(model);
      expect(p.getTotalDuration()).toBe(6); // 2+3+1
      expect(p.getTotalDuration(false)).toBe(5);
    });
    it('flattens all tasks and projects', () => {
      const p = new ProjectNode(model);
      expect(p.getAllTasks().map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);
      expect(p.getAllProjects().map((c) => c.id)).toEqual(['child']);
    });
    it('formats cost', () => {
      const p = new ProjectNode(model);
      expect(p.getCostFormatted()).toContain('100');
      expect(p.getCostFormatted('PLN', true)).toContain('185');
    });
  });

  describe('mutation', () => {
    it('addChild wires parent and marks dirty', () => {
      const p = new ProjectNode(model);
      const extra = new ProjectNode({ type: 'project', id: 'extra', name: 'Extra' });
      p.addChild(extra);
      expect(extra.parent).toBe(p);
      expect(p.hasChildren()).toBe(true);
      expect(p.isDirty).toBe(true);
    });
    it('removeChild detaches and returns it', () => {
      const p = new ProjectNode(model);
      const removed = p.removeChild('child');
      expect(removed?.id).toBe('child');
      expect(removed?.parent).toBeNull();
      expect(p.removeChild('missing')).toBeNull();
    });
    it('addTask/removeTask maintain project refs', () => {
      const p = new ProjectNode({ type: 'project', id: 'x', name: 'X' });
      const t = new TaskNode({ type: 'task', id: 'tt', name: 'TT' });
      p.addTask(t);
      expect(t.getProjectName()).toBe('X');
      const removed = p.removeTask('tt');
      expect(removed?.getProjectName()).toBeNull();
      expect(p.removeTask('missing')).toBeNull();
    });
  });

  describe('search & expansion', () => {
    it('matches shallow and deep', () => {
      const p = new ProjectNode(model);
      expect(p.matches('root')).toBe(true);
      expect(p.matches('t3')).toBe(false);
      expect(p.matchesDeep('T3')).toBe(true);
      expect(p.matchesDeep('zzz')).toBe(false);
    });
    it('expandAll / collapseAll cascade', () => {
      const p = new ProjectNode(model);
      p.expandAll();
      expect(p.isExpanded).toBe(true);
      expect(p.children[0].isExpanded).toBe(true);
      p.collapseAll();
      expect(p.isExpanded).toBe(false);
      expect(p.children[0].isExpanded).toBe(false);
    });
  });

  it('toModel omits empty children/tasks and round-trips', () => {
    const leaf = new ProjectNode({ type: 'project', id: 'l', name: 'Leaf' });
    const m = leaf.toModel();
    expect(m.projects).toBeUndefined();
    expect(m.tasks).toBeUndefined();

    const p = new ProjectNode(model);
    const rebuilt = new ProjectNode(p.toModel());
    expect(rebuilt.getTaskCount()).toBe(3);
  });

  it('clone preserves base state', () => {
    const p = new ProjectNode(model).setSelected(true);
    expect(p.clone().isSelected).toBe(true);
  });

  it('round-trips the planning-view fields', () => {
    // The same reason as with TaskNode: the older PIM/Projects page writes the
    // whole file through toModel(), so a field lost in the conversion vanishes
    // from disk.
    const planned = {
      type: 'project' as const,
      id: 'p9',
      name: 'Renovation',
      color: '#ff7a59',
      archived: true,
      statuses: [
        { id: 'todo', name: 'To do', color: '#87909e', kind: 'open' as const },
        { id: 'done', name: 'Done', color: '#6bc950', kind: 'done' as const },
      ],
    };
    expect(new ProjectNode(planned).toModel()).toEqual(planned);
  });
});
