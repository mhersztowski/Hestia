// Built-in editor plugins for the Monaco multi-editor.
export * from './CommentToolsPlugin';
export * from './CppIntelliSensePlugin';
export * from './FoldingPlugin';
export * from './MarkdownLspPlugin';
export * from './MarkdownLspServerPlugin';
export * from './MarkdownPreviewPlugin';
export * from './MjdEditorPlugin';
export * from './PythonIntelliSensePlugin';
export * from './SnippetsPlugin';
export * from './TypeScriptIntelliSensePlugin';

// The signal-slot graph for `@hestia/minislib`: a visual view of an object's
// signals, slots and properties, edited in place in the source file.
export { VisualMinisLibPlugin } from './VisualMinisLibPlugin';

// The block editor: a palette built from a UML diagram, and code written back
// into a marked region of the file. Its source of diagrams is injected — see
// `TextEditorWorkspace`'s `blocklyUmlSource` — because only some hosts have one.
export {
  createBlocklyPlugin,
  createVfsUmlProjectSource,
  type UmlProjectSource,
  type UmlProjectRef,
} from './blockly';

// Kontrola źródeł (git) — panel zmian, commit, gałęzie, widok różnic.
// Host podaje nazwę użytkownika, token i ścieżkę pliku `.repo.json`, bo tylko
// on wie, który projekt jest otwarty.
export { createGitPlugin, type GitPluginOptions } from './git/GitPlugin';
export {
  GitApi,
  type GitChange,
  type GitInfo,
  type GitLogEntry,
  type GitStashEntry,
} from './git/gitApi';
export {
  diffLines,
  toHunks,
  formatPatch,
  reverseHunk,
  splitLines,
  endsWithNewline,
  type Hunk,
} from './git/hunks';
export {
  parseConflicts,
  resolveConflict,
  resolveAll,
  hasConflictMarkers,
  type Conflict,
  type Resolution,
} from './git/conflicts';
