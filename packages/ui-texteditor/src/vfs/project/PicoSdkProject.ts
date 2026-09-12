import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

/** boardProfileKey → Pico SDK board key used by build-pico endpoint */
const BOARD_KEY: Record<string, string> = {
  pico:  'pico',
  pico2: 'pico2',
};

interface DoneEvent { success: boolean; exitCode?: number; uf2Url?: string; error?: string }

export class PicoSdkProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Pico SDK'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'build', label: 'Build', description: 'Build with CMake/Ninja (SSE streaming)',        hasOutput: true, shortcut: 'F7' },
      { id: 'flash', label: 'Flash', description: 'Flash UF2 to device via picotool or OpenOCD',  hasOutput: true, shortcut: 'F8' },
      { id: 'clean', label: 'Clean', description: 'Remove build directory',                        hasOutput: false },
    ];
  }

  async execute(actionId: string, selectedPath: string | null, onOutput: (l: string) => void, signal: AbortSignal) {
    const projectName = encodeURIComponent(this.context.name);
    const base = `/users/${encodeURIComponent(this.deps.userName)}/project-upython/${projectName}`;
    const boardKey = (this.context.boardProfileKey && BOARD_KEY[this.context.boardProfileKey])
      ?? this.context.boardProfileKey
      ?? 'pico2';

    if (actionId === 'build') {
      const sketchName = this.deriveSketchName(selectedPath) ?? 'main';
      onOutput(`> Building ${this.context.name} / ${sketchName} (board: ${boardKey}) …`);
      const done = await this.apiGetSSE<DoneEvent>(
        `${base}/build-pico`,
        { sketchName, boardKey },
        onOutput,
        signal,
      );
      if (done.uf2Url) onOutput(`> UF2: ${done.uf2Url}`);
      if (done.error) return { success: false, error: done.error };
      return { success: done.success };
    }

    if (actionId === 'flash') {
      onOutput('Flash: drag-and-drop the .uf2 from the build output onto the Pico drive.');
      onOutput('(Automated flash via picotool not yet wired in this panel.)');
      return { success: true };
    }

    if (actionId === 'clean') {
      onOutput('> Clean not yet implemented server-side.');
      return { success: true };
    }

    return { success: false, error: `Unknown action: ${actionId}` };
  }
}
