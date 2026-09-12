import { createProject } from './createProject';
import { ArduinoProject } from './ArduinoProject';
import { UPythonProject } from './UPythonProject';
import { PythonProject } from './PythonProject';
import { NodeJsProject } from './NodeJsProject';
import { PygameProject } from './PygameProject';
import { PicoSdkProject } from './PicoSdkProject';
import { NotesProject } from './NotesProject';
import { EditorProject } from './EditorProject';
import type { VfsProjectContext } from '../types';

const ctx = (platform: string, projectJsonPath = '/proj/project.json'): VfsProjectContext => ({
  id: 'id',
  name: 'name',
  platform,
  language: 'C++',
  projectJsonPath,
});

describe('createProject', () => {
  it('maps each platform to the right Project subclass', () => {
    expect(createProject(ctx('Arduino'))).toBeInstanceOf(ArduinoProject);
    expect(createProject(ctx('uPython'))).toBeInstanceOf(UPythonProject);
    expect(createProject(ctx('pygame'))).toBeInstanceOf(PygameProject);
    expect(createProject(ctx('PicoSdk'))).toBeInstanceOf(PicoSdkProject);
    expect(createProject(ctx('Notes'))).toBeInstanceOf(NotesProject);
    expect(createProject(ctx('Editor'))).toBeInstanceOf(EditorProject);
    expect(createProject(ctx('NodeJs'))).toBeInstanceOf(NodeJsProject);
    expect(createProject(ctx('Python'))).toBeInstanceOf(PythonProject);
  });

  it('returns null for an unknown platform', () => {
    expect(createProject(ctx('Fortran'))).toBeNull();
  });
});

describe('ArduinoProject metadata', () => {
  it('reports its type label', () => {
    const p = new ArduinoProject(ctx('Arduino'), { baseUrl: '', userName: '' });
    expect(p.getTypeLabel()).toBe('Arduino');
  });

  it('exposes the expected action ids', () => {
    const p = new ArduinoProject(ctx('Arduino'), { baseUrl: '', userName: '' });
    expect(p.getActions().map((a) => a.id)).toEqual([
      'compile', 'flash', 'compile-flash', 'clean', 'board-config',
    ]);
    const boardConfig = p.getActions().find((a) => a.id === 'board-config');
    expect(boardConfig?.hasDialog).toBe(true);
  });

  it('exposes the project context via projectContext getter', () => {
    const c = ctx('Arduino');
    const p = new ArduinoProject(c, { baseUrl: '', userName: '' });
    expect(p.projectContext).toBe(c);
  });
});

describe('Project.deriveSketchName (via ArduinoProject)', () => {
  const mk = (projectJsonPath: string) =>
    new ArduinoProject(ctx('Arduino', projectJsonPath), { baseUrl: '', userName: '' }) as unknown as {
      deriveSketchName(p: string | null): string | null;
    };

  it('returns null when no path is selected', () => {
    expect(mk('/proj/project.json').deriveSketchName(null)).toBeNull();
  });

  it('returns null when the path is outside the project root', () => {
    expect(mk('/proj/project.json').deriveSketchName('/other/sketches/foo/main.ino')).toBeNull();
  });

  it('extracts the sketch name after a "sketches/" segment', () => {
    expect(mk('/proj/project.json').deriveSketchName('/proj/sketches/basic/main.ino')).toBe('basic');
  });

  it('falls back to the first directory level for flat layouts', () => {
    expect(mk('/proj/project.json').deriveSketchName('/proj/mysketch/main.ino')).toBe('mysketch');
  });
});
