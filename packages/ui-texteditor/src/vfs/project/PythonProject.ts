import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

interface DoneEvent {
  success: boolean;
  exitCode?: number;
  error?: string;
}

export class PythonProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Python'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'run',     label: 'Run',     description: 'python3 main.py',              hasOutput: true },
      { id: 'install', label: 'Install', description: 'pip install -r requirements.txt', hasOutput: true },
      { id: 'test',    label: 'Test',    description: 'python3 -m pytest',            hasOutput: true },
    ];
  }

  async execute(
    actionId: string,
    selectedPath: string | null,
    onOutput: (l: string) => void,
    signal: AbortSignal,
  ) {
    // Derive subpath relative to the user's home directory — same logic as NodeJsProject.
    const projectDir = this.context.projectJsonPath.replace(/\/pyproject\.toml$/, '');
    const prefixes = [
      '/home/' + this.deps.userName + '/',
      '/home/',
    ];
    let subpath = projectDir.replace(/^\//, '');
    for (const p of prefixes) {
      if (projectDir.startsWith(p)) {
        subpath = projectDir.slice(p.length);
        break;
      }
    }

    // For 'run', pass the selected .py file relative to the project root (if any).
    let script = actionId;
    let selectedFile: string | undefined;
    if (actionId === 'run' && selectedPath) {
      // Strip the project root prefix to get a file relative to the project dir.
      const normalized = selectedPath.replace(/^\/+/, '');
      const projectPrefix = projectDir.replace(/^\/+/, '') + '/';
      if (normalized.startsWith(projectPrefix)) {
        const rel = normalized.slice(projectPrefix.length);
        if (rel.endsWith('.py')) selectedFile = rel;
      }
    }

    const label = selectedFile
      ? `> python3 ${selectedFile}`
      : `> python3 ${{ run: 'main.py', install: '-m pip install -r requirements.txt', test: '-m pytest' }[script] ?? script}`;
    onOutput(label);

    const params: Record<string, string> = { subpath, script };
    if (selectedFile) params['file'] = selectedFile;

    const done = await this.apiGetSSE<DoneEvent>(
      `/users/${encodeURIComponent(this.deps.userName)}/python/run`,
      params,
      onOutput,
      signal,
    );

    if (done.error) return { success: false, error: done.error };
    return { success: done.success };
  }
}
