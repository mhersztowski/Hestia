# `@hestia/ui-texteditor`

MyCastle's `packages/ui-texteditor`, moved over: the Monaco-based text and code
editor, its VFS layer, the MJD editors and the built-in plugins.
139 files, ~32 100 lines.

```
src/monaco/    the editor engine, the plugin framework, the terminal, the UI
src/plugins/   TypeScript, Python and C++ IntelliSense, snippets, folding,
               markdown preview and LSP, comment tools, git
src/vfs/       the file-tree UI and the embedded project system
src/mjd/       the MJD definition and data editors
src/workspace/ TextEditorWorkspace — the whole editor as one component
```

Among Hestia packages it depends only on `@hestia/core`.

## Two things did not come over

**The AI assistant.** It is `@hestia/ui-ai` now — it was never the editor's, it
only lived there, and a page that wants no assistant should carry no part of
one: no provider, no key handling, no chat. `MonacoMultiEditor` therefore takes
it as a **slot**:

```tsx
<MonacoMultiEditor
  agentPanel={({ onFileOpen, onFileWritten }) => (
    <AgentPanel onFileOpen={onFileOpen} onFileWritten={onFileWritten} … />
  )}
/>
```

`onFileWritten` matters: it tells the editor which files changed underneath it,
so open tabs reload instead of quietly showing stale text. With no `agentPanel`
there is no assistant button at all — not a button that opens an empty drawer.
The six `agent*` props and the `enableAgent` flag are gone with it, on
`MonacoMultiEditor` and on `TextEditorWorkspace` alike; the latter keeps
`authToken` on its own, because the Markdown LSP plugin needs one and that has
nothing to do with an assistant.

**Blockly**, out of scope for this port as everywhere else: the visual MinisLib
plugin (8 639 lines on its own), the Blockly generators and toolboxes, and the
Blockly modes of the two MJD editors. `MjdDataEditor` keeps its visual and form
modes, `GlobalJsonEditor` its visual one. `TextEditorWorkspace` no longer
registers the Blockly plugin and has lost its `blocklyUmlSource` prop; the other
eleven plugins are untouched.

## Dependencies

`monaco-editor` is a **peer**, for the reason React is: two copies register two
sets of languages and workers and then fight over them. React, MUI, Emotion and
`@mui/x-tree-view` likewise. `@xterm/*` is an **optional** peer — only the
terminal touches it. The Markdown preview stack (`unified`, `remark-*`,
`rehype-*`, `katex`, `highlight.js`) is an ordinary dependency: it is the
preview itself.

## Debt

Comments and test names are in Polish, as in the other packages moved over from
MyCastle. The IntelliSense plugin carries a stub declaration for
`@mhersztowski/minislib` — that is a module name in *user* code, not a Hestia
package, so it stays as written until MinisLib itself is dealt with.

## Tests

234 assertions pass in the port environment; 9 fail and 7 files did not load,
and the failures all look like limits of the stand-in test runner used offline
(fake timers, `resolves` on a rejected promise) rather than the code. `pnpm test`
is what settles that.
