import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

interface BuildResult { success: boolean; output?: string }

export class PygameProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Pygame'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'build-web',  label: 'Build Web',  description: 'Build for browser via pygbag', hasOutput: true, shortcut: 'F7' },
      { id: 'run-local',  label: 'Run Local',  description: 'Run sketch locally',           hasOutput: false },
    ];
  }

  async execute(actionId: string, selectedPath: string | null, onOutput: (l: string) => void, signal: AbortSignal) {
    const base = `/users/${encodeURIComponent(this.deps.userName)}/project-pygame/${encodeURIComponent(this.context.id)}`;

    if (actionId === 'build-web') {
      const sketchName = this.deriveSketchName(selectedPath);
      if (!sketchName) {
        onOutput('Error: select a file inside the sketches/ directory to determine which sketch to build.');
        return { success: false };
      }
      onOutput(`> Building ${sketchName} for web (pygbag) …`);
      // Build endpoint needs the web code — read from VFS would be ideal,
      // but without the code we send an empty string to trigger a re-build of existing files.
      const result = await this.apiPost<BuildResult>(
        `${base}/sketches/${encodeURIComponent(sketchName)}/build`,
        { code: '' },
        signal,
      );
      if (result.output) for (const line of result.output.split('\n')) onOutput(line);
      return { success: result.success };
    }

    if (actionId === 'run-local') {
      onOutput('Run Local: open the project page to run the sketch locally.');
      return { success: true };
    }

    return { success: false, error: `Unknown action: ${actionId}` };
  }
}
