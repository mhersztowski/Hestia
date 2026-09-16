/**
 * Priority in order of importance. The names are ClickUp's, because there the
 * colour and the flag icon are attached to exactly these four levels — a scale
 * of our own would need translating both ways on every import.
 */
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

/**
 * One stretch of work on a task. A missing `end` means the clock is running —
 * which is why time is not kept as a sum of minutes: a sum cannot say whether
 * somebody is working right now, and a running measurement would be lost on a
 * page refresh.
 */
export interface TaskTimeEntry {
  id: string;
  /** ISO 8601. */
  start: string;
  /** ISO 8601; absent = the entry is open. */
  end?: string;
  /** Id of a person from PIM/Persons. */
  who?: string;
  note?: string;
}

/**
 * A status definition. Statuses are data rather than an enumeration in code,
 * because ClickUp defines them per list — and even without that, "To do" means
 * one thing in a renovation project and another in a programming one.
 *
 * `kind` carries the meaning the name does not: from it a view knows what to
 * treat as closed (strike-through, excluded from the count of open tasks), no
 * matter what the user called the status.
 */
export interface TaskStatusDef {
  id: string;
  name: string;
  /** Colour in CSS notation — it goes straight into the dot and the column background. */
  color: string;
  kind: 'open' | 'active' | 'done';
}

/**
 * The default set, used when a project defines none of its own. Three levels
 * are enough to start with and match ClickUp's default "Space".
 */
export const DEFAULT_TASK_STATUSES: TaskStatusDef[] = [
  { id: 'todo', name: 'To do', color: '#87909e', kind: 'open' },
  { id: 'in_progress', name: 'In progress', color: '#4194f6', kind: 'active' },
  { id: 'done', name: 'Done', color: '#6bc950', kind: 'done' },
];

export interface TaskModel {
  type: 'task';
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  /**
   * The estimate in **hours**, fractional (0.25 = a quarter of an hour).
   *
   * This field is the estimate in the planning view as well — a separate
   * `estimateMinutes` would be a second field for one notion, and the old
   * PIM/Projects page has always edited `duration` (through `parseFloat`).
   * Time actually worked goes elsewhere, in `timeEntries`.
   */
  duration?: number;
  cost?: number;
  components?: TaskComponentModel[];

  /*
   * The fields below are what the planning view (PIM/Projects2) adds. All of
   * them are optional, because a `tasks.json` written before they existed has
   * to load without a migration, and a task with no status and no dates is
   * still a valid task.
   */

  /** Id of a status from `TaskStatusDef`, not its name — a name may change. */
  status?: string;
  priority?: TaskPriority;
  /** ISO: a date, or a date with a time. */
  startDate?: string;
  dueDate?: string;
  /** Ids of people from PIM/Persons. */
  assignees?: string[];
  tags?: string[];
  timeEntries?: TaskTimeEntry[];
  /** Subtasks: the child points at the parent, so the tree has one source. */
  parentTaskId?: string;
  /** Manual ordering within a group; absent = at the end. */
  order?: number;
  /**
   * The task's note — the path of a Markdown file **relative to the user's
   * `drive/` directory**, e.g. `notes/project/spec.md`.
   *
   * Relative rather than absolute: a full path carries the user's name and
   * where the drive is mounted, so it would survive exactly until the first
   * change of either. The file need not exist at the moment it is linked —
   * a note may be created later, and opening one that does not exist gives an
   * empty document rather than an error.
   */
  docPath?: string;
  /**
   * The tasks that have to finish before this one — its predecessors.
   *
   * **Only** this side of the relation is stored. "Tasks after this one" is
   * its inverse, computed from the whole set: two lists in one file drift
   * apart at the first deletion of a task, and there is then no way to decide
   * which of them is lying.
   */
  dependsOn?: string[];
}

export interface TasksModel {
  type: 'tasks';
  tasks: TaskModel[];
}

export interface TaskComponentModel {
  type: string;
}

export interface TaskTestComponentModel extends TaskComponentModel {
  type: 'task_test';
  name: string;
  description: string;
}

export interface TaskIntervalComponentModel extends TaskComponentModel {
  type: 'task_interval';
  daysInterval: number;
}

export interface TaskSequenceComponentModel extends TaskComponentModel {
  type: 'task_sequence';
  tasks?: TaskModel[];
}
