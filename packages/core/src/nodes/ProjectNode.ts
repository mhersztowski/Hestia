import { NodeBase } from './NodeBase';
import { ProjectModel, ProjectComponentModel } from '../models/ProjectModel';
import { TaskStatusDef } from '../models/TaskModel';
import { TaskNode } from './TaskNode';

/**
 * ProjectNode extends ProjectModel with UI state, relationships, and utility functions
 * Supports hierarchical project structure
 */
export class ProjectNode extends NodeBase<ProjectModel> {
  readonly type = 'project' as const;
  id: string;
  name: string;
  description?: string;
  cost?: number;
  components?: ProjectComponentModel[];

  // Fields of the planning view (PIM/Projects2)
  color?: string;
  statuses?: TaskStatusDef[];
  archived?: boolean;

  // Child nodes
  private _children: ProjectNode[] = [];
  private _tasks: TaskNode[] = [];

  // Parent reference
  private _parent: ProjectNode | null = null;

  // Path cache
  private _pathCache: string[] | null = null;

  constructor(model: ProjectModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.cost = model.cost;
    this.components = model.components;
    this.color = model.color;
    this.statuses = model.statuses;
    this.archived = model.archived;

    // Build child nodes
    if (model.projects) {
      this._children = model.projects.map((p) => {
        const child = new ProjectNode(p);
        child._parent = this;
        return child;
      });
    }

    if (model.tasks) {
      this._tasks = model.tasks.map((t) => {
        const taskNode = TaskNode.fromModel(t);
        taskNode.setProjectRef({ id: this.id, name: this.name });
        return taskNode;
      });
    }
  }

  static fromModel(model: ProjectModel): ProjectNode {
    return new ProjectNode(model);
  }
  static fromModels(models: ProjectModel[]): ProjectNode[] {
    return models.map((m) => new ProjectNode(m));
  }

  // Children accessors
  get children(): ProjectNode[] {
    return this._children;
  }

  get tasks(): TaskNode[] {
    return this._tasks;
  }

  get parent(): ProjectNode | null {
    return this._parent;
  }

  // Display name
  getDisplayName(): string {
    return this.name;
  }

  // Check if has sub-projects
  hasChildren(): boolean {
    return this._children.length > 0;
  }

  // Check if has tasks
  hasTasks(): boolean {
    return this._tasks.length > 0;
  }

  // Check if is root project (no parent)
  isRoot(): boolean {
    return this._parent === null;
  }

  // Get depth in hierarchy
  getDepth(): number {
    let depth = 0;
    let current: ProjectNode | null = this._parent;
    while (current) {
      depth++;
      current = current._parent;
    }
    return depth;
  }

  // Get path from root to this node
  getPath(): string[] {
    if (this._pathCache) return this._pathCache;

    const path: string[] = [];
    let current: ProjectNode | null = this;
    while (current) {
      path.unshift(current.name);
      current = current._parent;
    }
    this._pathCache = path;
    return path;
  }

  // Get path as string
  getPathString(separator: string = ' / '): string {
    return this.getPath().join(separator);
  }

  // Find child by id (recursive)
  findChildById(id: string): ProjectNode | null {
    for (const child of this._children) {
      if (child.id === id) return child;
      const found = child.findChildById(id);
      if (found) return found;
    }
    return null;
  }

  // Find task by id (recursive)
  findTaskById(id: string): TaskNode | null {
    for (const task of this._tasks) {
      if (task.id === id) return task;
    }
    for (const child of this._children) {
      const found = child.findTaskById(id);
      if (found) return found;
    }
    return null;
  }

  // Get total task count (recursive)
  getTaskCount(recursive: boolean = true): number {
    let count = this._tasks.length;
    if (recursive) {
      for (const child of this._children) {
        count += child.getTaskCount(true);
      }
    }
    return count;
  }

  // Get total cost (recursive, includes tasks)
  getTotalCost(recursive: boolean = true): number {
    let total = this.cost ?? 0;

    // Add task costs
    for (const task of this._tasks) {
      total += task.cost ?? 0;
    }

    if (recursive) {
      for (const child of this._children) {
        total += child.getTotalCost(true);
      }
    }

    return total;
  }

  // Format cost as currency
  getCostFormatted(currency: string = 'PLN', recursive: boolean = false): string {
    const cost = recursive ? this.getTotalCost(true) : (this.cost ?? 0);
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(cost);
  }

  // Get total duration from tasks (recursive)
  getTotalDuration(recursive: boolean = true): number {
    let total = 0;

    for (const task of this._tasks) {
      total += task.duration ?? 0;
    }

    if (recursive) {
      for (const child of this._children) {
        total += child.getTotalDuration(true);
      }
    }

    return total;
  }

  // Get all tasks flattened (recursive)
  getAllTasks(): TaskNode[] {
    const tasks: TaskNode[] = [...this._tasks];
    for (const child of this._children) {
      tasks.push(...child.getAllTasks());
    }
    return tasks;
  }

  // Get all projects flattened (recursive)
  getAllProjects(): ProjectNode[] {
    const projects: ProjectNode[] = [];
    for (const child of this._children) {
      projects.push(child);
      projects.push(...child.getAllProjects());
    }
    return projects;
  }

  // Add child project
  addChild(child: ProjectNode): this {
    child._parent = this;
    child._pathCache = null;
    this._children.push(child);
    this.markDirty();
    return this;
  }

  // Remove child project
  removeChild(id: string): ProjectNode | null {
    const index = this._children.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const removed = this._children.splice(index, 1)[0];
    removed._parent = null;
    this.markDirty();
    return removed;
  }

  // Add task
  addTask(task: TaskNode): this {
    task.setProjectRef({ id: this.id, name: this.name });
    this._tasks.push(task);
    this.markDirty();
    return this;
  }

  // Remove task
  removeTask(id: string): TaskNode | null {
    const index = this._tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const removed = this._tasks.splice(index, 1)[0];
    removed.setProjectRef(null);
    this.markDirty();
    return removed;
  }

  // Check if has components
  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  // Search helper
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Search including children and tasks
  matchesDeep(query: string): boolean {
    if (this.matches(query)) return true;

    for (const task of this._tasks) {
      if (task.matches(query)) return true;
    }

    for (const child of this._children) {
      if (child.matchesDeep(query)) return true;
    }

    return false;
  }

  // Expand all nodes in hierarchy
  expandAll(): this {
    this.setExpanded(true);
    for (const child of this._children) {
      child.expandAll();
    }
    return this;
  }

  // Collapse all nodes in hierarchy
  collapseAll(): this {
    this.setExpanded(false);
    for (const child of this._children) {
      child.collapseAll();
    }
    return this;
  }

  // Convert back to model
  toModel(): ProjectModel {
    return {
      type: 'project',
      id: this.id,
      name: this.name,
      description: this.description,
      cost: this.cost,
      projects: this._children.length > 0 ? this._children.map((c) => c.toModel()) : undefined,
      tasks: this._tasks.length > 0 ? this._tasks.map((t) => t.toModel()) : undefined,
      components: this.components,
      color: this.color,
      statuses: this.statuses,
      archived: this.archived,
    };
  }

  clone(): ProjectNode {
    return this.copyBaseStateTo(new ProjectNode(this.toModel()));
  }

  // Compare
  equals(other: ProjectNode | ProjectModel): boolean {
    return this.id === other.id;
  }
}
