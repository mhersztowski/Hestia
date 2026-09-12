import {
  PersonNode,
  TaskNode,
  ProjectNode,
  EventNode,
  ShoppingListNode,
  MinisModuleDefNode,
  MinisModuleNode,
  MinisDeviceDefNode,
  MinisDeviceNode,
  MinisProjectDefNode,
  MinisProjectNode,
  UserNode,
} from '../nodes';
import {
  PersonsModel,
  TasksModel,
  ProjectsModel,
  ShoppingListsModel,
  ShoppingItemModel,
  MinisModuleDefsModel,
  MinisModulesModel,
  MinisDeviceDefsModel,
  MinisDevicesModel,
  MinisProjectDefsModel,
  MinisProjectsModel,
  UsersModel,
} from '../models';
import type { IDataSource, DataSourceStats } from './IDataSource';
import { CalendarItem } from './CalendarItem';

export class MemoryDataSource implements IDataSource {
  private _persons: Map<string, PersonNode> = new Map();
  private _tasks: Map<string, TaskNode> = new Map();
  private _projects: Map<string, ProjectNode> = new Map();
  private _events: EventNode[] = [];
  private _shoppingLists: Map<string, ShoppingListNode> = new Map();
  private _minisModuleDefs: Map<string, MinisModuleDefNode> = new Map();
  private _minisModules: Map<string, MinisModuleNode> = new Map();
  private _minisDeviceDefs: Map<string, MinisDeviceDefNode> = new Map();
  private _minisDevices: Map<string, MinisDeviceNode> = new Map();
  private _minisProjectDefs: Map<string, MinisProjectDefNode> = new Map();
  private _minisProjects: Map<string, MinisProjectNode> = new Map();
  private _users: Map<string, UserNode> = new Map();

  private _isLoaded: boolean = false;

  // --- Persons ---

  get persons(): PersonNode[] {
    return Array.from(this._persons.values());
  }

  getPersonById(id: string): PersonNode | undefined {
    return this._persons.get(id);
  }

  findPersons(query: string): PersonNode[] {
    if (!query.trim()) return this.persons;
    return this.persons.filter(p => p.matches(query));
  }

  // --- Tasks ---

  get tasks(): TaskNode[] {
    return Array.from(this._tasks.values());
  }

  getTaskById(id: string): TaskNode | undefined {
    return this._tasks.get(id);
  }

  findTasks(query: string): TaskNode[] {
    if (!query.trim()) return this.tasks;
    return this.tasks.filter(t => t.matches(query));
  }

  getTasksByProjectId(projectId: string): TaskNode[] {
    return this.tasks.filter(t => t.projectId === projectId);
  }

  getUnassignedTasks(): TaskNode[] {
    return this.tasks.filter(t => !t.projectId);
  }

  // --- Projects ---

  get projects(): ProjectNode[] {
    return Array.from(this._projects.values());
  }

  getProjectById(id: string): ProjectNode | undefined {
    return this._projects.get(id);
  }

  findProjects(query: string): ProjectNode[] {
    if (!query.trim()) return this.projects;
    return this.projects.filter(p => p.matches(query));
  }

  findProjectByIdDeep(id: string): ProjectNode | undefined {
    for (const project of this._projects.values()) {
      if (project.id === id) return project;
      const found = project.findChildById(id);
      if (found) return found;
    }
    return undefined;
  }

  getAllProjectsFlat(): ProjectNode[] {
    const all: ProjectNode[] = [];
    for (const project of this._projects.values()) {
      all.push(project);
      all.push(...project.getAllProjects());
    }
    return all;
  }

  // --- Shopping Lists ---

  get shoppingLists(): ShoppingListNode[] {
    return Array.from(this._shoppingLists.values());
  }

  getShoppingListById(id: string): ShoppingListNode | undefined {
    return this._shoppingLists.get(id);
  }

  findShoppingLists(query: string): ShoppingListNode[] {
    if (!query.trim()) return this.shoppingLists;
    return this.shoppingLists.filter(l => l.matches(query));
  }

  getActiveShoppingLists(): ShoppingListNode[] {
    return this.shoppingLists.filter(l => l.isActive());
  }

  getCompletedShoppingLists(): ShoppingListNode[] {
    return this.shoppingLists.filter(l => l.isCompleted());
  }

  getShoppingItemsByPersonId(personId: string): { list: ShoppingListNode; item: ShoppingItemModel }[] {
    const results: { list: ShoppingListNode; item: ShoppingItemModel }[] = [];
    for (const list of this._shoppingLists.values()) {
      for (const item of list.getItemsByPerson(personId)) {
        results.push({ list, item });
      }
    }
    return results;
  }

  // --- Events ---

  get events(): EventNode[] {
    return this._events;
  }

  getEventsByDate(date: Date): EventNode[] {
    const dateStr = date.toISOString().split('T')[0];
    return this._events.filter(e => {
      const eventDate = e.getStartDate();
      return eventDate && eventDate.toISOString().split('T')[0] === dateStr;
    });
  }

  findEvents(query: string): EventNode[] {
    if (!query.trim()) return this._events;
    return this._events.filter(e => e.matches(query));
  }

  getEventsByTaskId(taskId: string): EventNode[] {
    return this._events.filter(e => e.taskId === taskId);
  }

  getLastEventByTaskId(taskId: string): EventNode | undefined {
    const taskEvents = this.getEventsByTaskId(taskId);
    if (taskEvents.length === 0) return undefined;
    return taskEvents[taskEvents.length - 1];
  }

  // --- Minis Module Defs ---

  get minisModuleDefs(): MinisModuleDefNode[] {
    return Array.from(this._minisModuleDefs.values());
  }

  getMinisModuleDefById(id: string): MinisModuleDefNode | undefined {
    return this._minisModuleDefs.get(id);
  }

  findMinisModuleDefs(query: string): MinisModuleDefNode[] {
    if (!query.trim()) return this.minisModuleDefs;
    return this.minisModuleDefs.filter(n => n.matches(query));
  }

  // --- Minis Modules ---

  get minisModules(): MinisModuleNode[] {
    return Array.from(this._minisModules.values());
  }

  getMinisModuleById(id: string): MinisModuleNode | undefined {
    return this._minisModules.get(id);
  }

  findMinisModules(query: string): MinisModuleNode[] {
    if (!query.trim()) return this.minisModules;
    return this.minisModules.filter(n => n.matches(query));
  }

  // --- Minis Device Defs ---

  get minisDeviceDefs(): MinisDeviceDefNode[] {
    return Array.from(this._minisDeviceDefs.values());
  }

  getMinisDeviceDefById(id: string): MinisDeviceDefNode | undefined {
    return this._minisDeviceDefs.get(id);
  }

  findMinisDeviceDefs(query: string): MinisDeviceDefNode[] {
    if (!query.trim()) return this.minisDeviceDefs;
    return this.minisDeviceDefs.filter(n => n.matches(query));
  }

  // --- Minis Devices ---

  get minisDevices(): MinisDeviceNode[] {
    return Array.from(this._minisDevices.values());
  }

  getMinisDeviceById(id: string): MinisDeviceNode | undefined {
    return this._minisDevices.get(id);
  }

  findMinisDevices(query: string): MinisDeviceNode[] {
    if (!query.trim()) return this.minisDevices;
    return this.minisDevices.filter(n => n.matches(query));
  }

  // --- Minis Project Defs ---

  get minisProjectDefs(): MinisProjectDefNode[] {
    return Array.from(this._minisProjectDefs.values());
  }

  getMinisProjectDefById(id: string): MinisProjectDefNode | undefined {
    return this._minisProjectDefs.get(id);
  }

  findMinisProjectDefs(query: string): MinisProjectDefNode[] {
    if (!query.trim()) return this.minisProjectDefs;
    return this.minisProjectDefs.filter(n => n.matches(query));
  }

  // --- Minis Projects ---

  get minisProjects(): MinisProjectNode[] {
    return Array.from(this._minisProjects.values());
  }

  getMinisProjectById(id: string): MinisProjectNode | undefined {
    return this._minisProjects.get(id);
  }

  findMinisProjects(query: string): MinisProjectNode[] {
    if (!query.trim()) return this.minisProjects;
    return this.minisProjects.filter(n => n.matches(query));
  }

  // --- Users ---

  get users(): UserNode[] {
    return Array.from(this._users.values());
  }

  getUserById(id: string): UserNode | undefined {
    return this._users.get(id);
  }

  findUsers(query: string): UserNode[] {
    if (!query.trim()) return this.users;
    return this.users.filter(u => u.matches(query));
  }

  // --- Loading state ---

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  setLoaded(value: boolean): void {
    this._isLoaded = value;
  }

  // --- Load methods ---

  loadPersons(data: PersonsModel): void {
    this._persons.clear();
    if (data.items) {
      for (const model of data.items) {
        const node = PersonNode.fromModel(model);
        this._persons.set(node.id, node);
      }
    }
  }

  loadTasks(data: TasksModel): void {
    this._tasks.clear();
    if (data.tasks) {
      for (const model of data.tasks) {
        const node = TaskNode.fromModel(model);
        if (node.projectId) {
          const project = this.findProjectByIdDeep(node.projectId);
          if (project) {
            node.setProjectRef({ id: project.id, name: project.name });
          }
        }
        this._tasks.set(node.id, node);
      }
    }
  }

  loadProjects(data: ProjectsModel): void {
    this._projects.clear();
    if (data.projects) {
      for (const model of data.projects) {
        const node = ProjectNode.fromModel(model);
        this._projects.set(node.id, node);
      }
    }
    this.relinkTasksToProjects();
  }

  loadShoppingLists(data: ShoppingListsModel): void {
    this._shoppingLists.clear();
    if (data.lists) {
      for (const model of data.lists) {
        const node = ShoppingListNode.fromModel(model);
        this._shoppingLists.set(node.id, node);
      }
    }
  }

  loadEventsFromCalendar(calendarItems: CalendarItem[]): void {
    this._events = [];
    for (const item of calendarItems) {
      for (const eventModel of item.getEvents()) {
        const node = EventNode.fromModel(eventModel);
        if (node.taskId) {
          const task = this.getTaskById(node.taskId);
          if (task) {
            node.setTaskRef({ id: task.id, name: task.name });
          }
        }
        this._events.push(node);
      }
    }
    this._events = EventNode.sortByTime(this._events);
  }

  loadMinisModuleDefs(data: MinisModuleDefsModel): void {
    this._minisModuleDefs.clear();
    if (data.moduleDefs) {
      for (const model of data.moduleDefs) {
        const node = MinisModuleDefNode.fromModel(model);
        this._minisModuleDefs.set(node.id, node);
      }
    }
  }

  loadMinisModules(data: MinisModulesModel): void {
    this._minisModules.clear();
    if (data.modules) {
      for (const model of data.modules) {
        const node = MinisModuleNode.fromModel(model);
        this._minisModules.set(node.id, node);
      }
    }
  }

  loadMinisDeviceDefs(data: MinisDeviceDefsModel): void {
    this._minisDeviceDefs.clear();
    if (data.deviceDefs) {
      for (const model of data.deviceDefs) {
        const node = MinisDeviceDefNode.fromModel(model);
        this._minisDeviceDefs.set(node.id, node);
      }
    }
  }

  loadMinisDevices(data: MinisDevicesModel): void {
    this._minisDevices.clear();
    if (data.devices) {
      for (const model of data.devices) {
        const node = MinisDeviceNode.fromModel(model);
        this._minisDevices.set(node.id, node);
      }
    }
  }

  loadMinisProjectDefs(data: MinisProjectDefsModel): void {
    this._minisProjectDefs.clear();
    if (data.projectDefs) {
      for (const model of data.projectDefs) {
        const node = MinisProjectDefNode.fromModel(model);
        this._minisProjectDefs.set(node.id, node);
      }
    }
  }

  loadMinisProjects(data: MinisProjectsModel): void {
    this._minisProjects.clear();
    if (data.projects) {
      for (const model of data.projects) {
        const node = MinisProjectNode.fromModel(model);
        this._minisProjects.set(node.id, node);
      }
    }
  }

  loadUsers(data: UsersModel): void {
    this._users.clear();
    if (data.items) {
      for (const model of data.items) {
        const node = UserNode.fromModel(model);
        this._users.set(node.id, node);
      }
    }
  }

  private relinkTasksToProjects(): void {
    for (const task of this._tasks.values()) {
      if (task.projectId) {
        const project = this.findProjectByIdDeep(task.projectId);
        if (project) {
          task.setProjectRef({ id: project.id, name: project.name });
        }
      }
    }
  }

  // --- Clear ---

  clear(): void {
    this._persons.clear();
    this._tasks.clear();
    this._projects.clear();
    this._events = [];
    this._shoppingLists.clear();
    this._minisModuleDefs.clear();
    this._minisModules.clear();
    this._minisDeviceDefs.clear();
    this._minisDevices.clear();
    this._minisProjectDefs.clear();
    this._minisProjects.clear();
    this._users.clear();
    this._isLoaded = false;
  }

  // --- Statistics ---

  getStats(): DataSourceStats {
    return {
      persons: this._persons.size,
      tasks: this._tasks.size,
      projects: this._projects.size,
      events: this._events.length,
      shoppingLists: this._shoppingLists.size,
      minisModuleDefs: this._minisModuleDefs.size,
      minisModules: this._minisModules.size,
      minisDeviceDefs: this._minisDeviceDefs.size,
      minisDevices: this._minisDevices.size,
      minisProjectDefs: this._minisProjectDefs.size,
      minisProjects: this._minisProjects.size,
      users: this._users.size,
    };
  }
}
