import { PersonNode } from '../nodes/PersonNode';
import { TaskNode } from '../nodes/TaskNode';
import { ProjectNode } from '../nodes/ProjectNode';
import { EventNode } from '../nodes/EventNode';
import { ShoppingListNode } from '../nodes/ShoppingListNode';
import { MinisModuleDefNode } from '../nodes/MinisModuleDefNode';
import { MinisModuleNode } from '../nodes/MinisModuleNode';
import { MinisDeviceDefNode } from '../nodes/MinisDeviceDefNode';
import { MinisDeviceNode } from '../nodes/MinisDeviceNode';
import { MinisProjectDefNode } from '../nodes/MinisProjectDefNode';
import { MinisProjectNode } from '../nodes/MinisProjectNode';
import { UserNode } from '../nodes/UserNode';
import { ShoppingItemModel } from '../models/ShoppingModel';

export interface DataSourceStats {
  persons: number;
  tasks: number;
  projects: number;
  events: number;
  shoppingLists: number;
  minisModuleDefs: number;
  minisModules: number;
  minisDeviceDefs: number;
  minisDevices: number;
  minisProjectDefs: number;
  minisProjects: number;
  users: number;
}

export interface IDataSource {
  // Persons
  readonly persons: PersonNode[];
  getPersonById(id: string): PersonNode | undefined;
  findPersons(query: string): PersonNode[];

  // Tasks
  readonly tasks: TaskNode[];
  getTaskById(id: string): TaskNode | undefined;
  findTasks(query: string): TaskNode[];
  getTasksByProjectId(projectId: string): TaskNode[];
  getUnassignedTasks(): TaskNode[];

  // Projects
  readonly projects: ProjectNode[];
  getProjectById(id: string): ProjectNode | undefined;
  findProjects(query: string): ProjectNode[];
  findProjectByIdDeep(id: string): ProjectNode | undefined;
  getAllProjectsFlat(): ProjectNode[];

  // Shopping Lists
  readonly shoppingLists: ShoppingListNode[];
  getShoppingListById(id: string): ShoppingListNode | undefined;
  findShoppingLists(query: string): ShoppingListNode[];
  getActiveShoppingLists(): ShoppingListNode[];
  getCompletedShoppingLists(): ShoppingListNode[];
  getShoppingItemsByPersonId(personId: string): { list: ShoppingListNode; item: ShoppingItemModel }[];

  // Events
  readonly events: EventNode[];
  getEventsByDate(date: Date): EventNode[];
  findEvents(query: string): EventNode[];
  getEventsByTaskId(taskId: string): EventNode[];
  getLastEventByTaskId(taskId: string): EventNode | undefined;

  // Minis Module Defs
  readonly minisModuleDefs: MinisModuleDefNode[];
  getMinisModuleDefById(id: string): MinisModuleDefNode | undefined;
  findMinisModuleDefs(query: string): MinisModuleDefNode[];

  // Minis Modules
  readonly minisModules: MinisModuleNode[];
  getMinisModuleById(id: string): MinisModuleNode | undefined;
  findMinisModules(query: string): MinisModuleNode[];

  // Minis Device Defs
  readonly minisDeviceDefs: MinisDeviceDefNode[];
  getMinisDeviceDefById(id: string): MinisDeviceDefNode | undefined;
  findMinisDeviceDefs(query: string): MinisDeviceDefNode[];

  // Minis Devices
  readonly minisDevices: MinisDeviceNode[];
  getMinisDeviceById(id: string): MinisDeviceNode | undefined;
  findMinisDevices(query: string): MinisDeviceNode[];

  // Minis Project Defs
  readonly minisProjectDefs: MinisProjectDefNode[];
  getMinisProjectDefById(id: string): MinisProjectDefNode | undefined;
  findMinisProjectDefs(query: string): MinisProjectDefNode[];

  // Minis Projects
  readonly minisProjects: MinisProjectNode[];
  getMinisProjectById(id: string): MinisProjectNode | undefined;
  findMinisProjects(query: string): MinisProjectNode[];

  // Users
  readonly users: UserNode[];
  getUserById(id: string): UserNode | undefined;
  findUsers(query: string): UserNode[];

  // State
  readonly isLoaded: boolean;
  getStats(): DataSourceStats;
}
