import type { VfsProjectContext } from '../types';
import type { ProjectDeps } from './types';
import { Project } from './Project';
import { ArduinoProject } from './ArduinoProject';
import { UPythonProject } from './UPythonProject';
import { PygameProject } from './PygameProject';
import { PicoSdkProject } from './PicoSdkProject';
import { NotesProject } from './NotesProject';
import { EditorProject } from './EditorProject';
import { NodeJsProject } from './NodeJsProject';
import { PythonProject } from './PythonProject';

const FALLBACK_DEPS: ProjectDeps = { baseUrl: '', userName: '' };

export function createProject(context: VfsProjectContext, deps: ProjectDeps = FALLBACK_DEPS): Project | null {
  switch (context.platform) {
    case 'Arduino':  return new ArduinoProject(context, deps);
    case 'uPython':  return new UPythonProject(context, deps);
    case 'pygame':   return new PygameProject(context, deps);
    case 'PicoSdk':  return new PicoSdkProject(context, deps);
    case 'Notes':    return new NotesProject(context, deps);
    case 'Editor':   return new EditorProject(context, deps);
    case 'NodeJs':   return new NodeJsProject(context, deps);
    case 'Python':   return new PythonProject(context, deps);
    default:         return null;
  }
}
