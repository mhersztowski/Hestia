import { TaskModel, TaskStatusDef } from "./TaskModel";

export interface ProjectModel {
    type: "project";
    id: string;
    name: string;
    description?: string;
    cost?: number;
    projects?: ProjectModel[];
    tasks?: TaskModel[];
    components?: ProjectComponentModel[];

    /*
     * Fields of the planning view (PIM/Projects2) — optional for the same
     * reason as in TaskModel: an older `projects.json` has to load without a
     * migration.
     */

    /** Colour of the dot beside the name in the project list. CSS notation. */
    color?: string;
    /**
     * A status set of its own. Absent = the default set (`DEFAULT_TASK_STATUSES`).
     * Statuses sit on the project rather than globally, because the columns of
     * a board belong to the task list — the same as in ClickUp.
     */
    statuses?: TaskStatusDef[];
    /** Project hidden from the list but not deleted (its tasks stay). */
    archived?: boolean;
}

export interface ProjectsModel {
    type: "projects";
    projects: ProjectModel[];
}

export interface ProjectComponentModel {
    type: string;
}

export interface ProjectTestComponentModel extends ProjectComponentModel {
    type: "project_test";
    name: string;
    description: string;
}
