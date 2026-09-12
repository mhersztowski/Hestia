import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

export class EditorProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Editor'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'new-file', label: 'New File', description: 'Create a new file in this project', hasOutput: false },
    ];
  }

  async execute(actionId: string, _selectedPath: string | null, onOutput: (l: string) => void, _signal: AbortSignal) {
    onOutput(`Action "${actionId}" is handled by the editor.`);
    return { success: true };
  }
}
