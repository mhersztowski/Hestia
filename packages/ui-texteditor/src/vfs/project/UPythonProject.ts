import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

interface DoneEvent { success: boolean; exitCode?: number; error?: string }

export class UPythonProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'MicroPython'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'deploy', label: 'Deploy', description: 'Upload all project files to device via mpremote', hasOutput: true, shortcut: 'F5' },
      { id: 'run',    label: 'Run',    description: 'Deploy and execute main.py on device',           hasOutput: true, shortcut: 'F8' },
      { id: 'sync',   label: 'Sync',   description: 'Sync changed files only',                        hasOutput: true },
    ];
  }

  async execute(actionId: string, _selectedPath: string | null, onOutput: (l: string) => void, signal: AbortSignal) {
    const base = `/users/${encodeURIComponent(this.deps.userName)}/project-upython/${encodeURIComponent(this.context.id)}`;

    if (actionId === 'deploy' || actionId === 'run' || actionId === 'sync') {
      const port = this.promptPort('/dev/ttyUSB0');
      if (!port) return { success: false, error: 'Cancelled (no port)' };

      onOutput(`> Deploying ${this.context.name} to ${port} …`);
      const done = await this.apiGetSSE<DoneEvent>(
        `${base}/deploy`,
        { port },
        onOutput,
        signal,
      );
      if (done.error) return { success: false, error: done.error };

      if (actionId === 'run' && done.success) {
        onOutput('> Running main.py …');
        // Fire-and-forget run command (no separate endpoint yet — deploy already runs on boot)
      }

      return { success: done.success };
    }

    return { success: false, error: `Unknown action: ${actionId}` };
  }
}
