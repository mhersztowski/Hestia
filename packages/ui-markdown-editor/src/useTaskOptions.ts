/**
 * Shared task-picker data — used by both `EventDialog` (single-event mode) and
 * `EventTemplateManager` (template items). Pulls tasks from the filesystem
 * DataSource and builds a projectId→name lookup so the picker can show
 * "Task (Project)" labels without re-walking the project array per row.
 *
 * Lives outside both consumers because the wrapping shapes are identical and
 * the DataSource access pattern is fragile enough (defensive try/catch around
 * possibly-missing collections) that I'd rather maintain it in one place.
 */

import { useMemo } from 'react';
import { useEditorProjectData } from './capabilities';

export interface TaskOption {
  id: string;
  name: string;
  projectId?: string;
  /** Cached project name when the option is synthesised (e.g. preloaded for
   *  an already-linked event whose project lookup may not be live). */
  projectName?: string;
  description?: string;
}

export interface TaskOptionsResult {
  tasks: TaskOption[];
  projectName: (id?: string) => string | undefined;
}

/** Build the task list + project lookup. Pass `enabled=false` to short-circuit
 *  the DataSource read when the host (e.g. closed dialog) doesn't need it —
 *  avoids re-materialising the array on every parent render. */
export function useTaskOptions(enabled: boolean = true): TaskOptionsResult {
  const dataSource = useEditorProjectData();

  const tasks: TaskOption[] = useMemo(() => {
    if (!enabled) return [];
    try {
      const ts = dataSource?.tasks ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ts.map((t: any) => ({
        id: String(t.id ?? t.model?.id ?? ''),
        name: String(t.name ?? t.model?.name ?? '(unnamed)'),
        projectId: t.projectId ?? t.model?.projectId,
        description: t.description ?? t.model?.description,
      })).filter(t => t.id);
    } catch {
      return [];
    }
  }, [enabled, dataSource]);

  const projectName: (id?: string) => string | undefined = useMemo(() => {
    if (!enabled) return () => undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projects: any[] = dataSource?.projects ?? [];
      const byId = new Map<string, string>();
      for (const p of projects) {
        const id = String(p.id ?? p.model?.id ?? '');
        const name = String(p.name ?? p.model?.name ?? '');
        if (id) byId.set(id, name);
      }
      return (id?: string) => id ? byId.get(id) : undefined;
    } catch {
      return () => undefined;
    }
  }, [enabled, dataSource]);

  return { tasks, projectName };
}
