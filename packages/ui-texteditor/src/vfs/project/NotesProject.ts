import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

export class NotesProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Notes'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'new-note',  label: 'New Note',  description: 'Create a new markdown note', hasOutput: false },
      { id: 'open-all',  label: 'Open All',  description: 'Open all notes',             hasOutput: false },
    ];
  }

  async execute(actionId: string, _selectedPath: string | null, onOutput: (l: string) => void, _signal: AbortSignal) {
    onOutput(`Action "${actionId}" is handled by the Notes editor.`);
    return { success: true };
  }
}
