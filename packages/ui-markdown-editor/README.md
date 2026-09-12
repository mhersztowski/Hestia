# `@hestia/ui-markdown-editor`

MyCastle's Markdown editor, moved over from
`app/mycastle-web/src/components/mdeditor`: TipTap, the block extensions, and
the Markdown conversion in both directions. 107 files, ~30 200 lines.

**It knows nothing about the application it runs in.** Everything it used to
reach for directly — the file store, the signed-in user, the knowledge base, the
UML round trip, the form service, the plugin templates, the script runtime —
arrives through `capabilities.ts`, and each one is optional.

```tsx
<EditorFilesProvider files={files}>
  <EditorSessionProvider session={session}>
    <EditorServicesProvider services={{ scriptRunner, knowledgeRefs }}>
      <MdEditor filePath={path} />
    </EditorServicesProvider>
  </EditorSessionProvider>
</EditorFilesProvider>
```

## Capabilities

Each was written after counting what the blocked files actually call, not after
guessing what an editor might want. The rule is the one
`core-ui/src/drive/capabilities.ts` set: **a capability the host does not supply
means the feature is not there** — no button, no picker, no empty panel
explaining that something is unavailable. A button that always ends in an error
promises something that will not happen.

| capability | what it is | who needs it |
|---|---|---|
| `EditorFiles` | `readFile`, `writeFile`, `listDirectory` | the pickers, info marks, embed, file-ref, form-engine, code block, event templates |
| `EditorFileTree` | `rootDir`, `isLoaded`, `baseUrl` over `EditorDir`/`EditorFile` | the image and media pickers |
| `EditorSession` | `userName`, `token`, `isAdmin` | `WebEmbed`, `EventDialog`, the script block |
| `EditorProjectData` | `projects`, `tasks`, `persons` and six lookups | `ComponentEmbed`, `useTaskCard`, `useTaskOptions` |
| `EditorSpellChecker` | `checkSpelling(text, language)` | `SpellCheckExtension` |
| `KnowledgeRefs` | `resolve(id)` | `KnowledgeRefView` |
| `UmlCodeSync` | `syncUmlFromCode`, `generateCodeFromUml` | the diagram-code dialogs, `DiagramBlockView` |
| `EditorForms` | `loadForms`, `getFormById`, `parseInlineForm`, `render` | `UIFormEmbed` |
| `ModelWorkerFactory` | `() => Worker` | the code block's model runner |
| `EditorCommandBus` | `on(event, handler)` | formatting commands from outside |
| `EditorScriptTemplates` | `list()` | the slash menu |
| `EditorScriptHost` | Monaco setup, the scene bridge, `pluginsVersion` | the script block's editor and scenes |
| `EditorScriptRunner` | `buildContext`, `execute`, `isLive`, `renderOutput` | running a Plugin Script |

Two of them are worth a note.

**`EditorProjectData` speaks in `@hestia/core`'s nodes** — its lookups return
`ProjectNode`, `TaskNode`, `PersonNode` — while every other capability is
structural. Files, tokens and directory trees have no canonical model here and
each host may hold them differently, so an interface is the honest shape.
Projects, tasks and people do have one, and it is what `@hestia/core` exists
for. An `EditorTask` beside `TaskNode` would be a second definition of the same
thing.

**`EditorScriptRunner` is how a document runs code the user wrote**, and the
only way it does. Two members of it are not functions MyCastle had:
`result instanceof ReactiveValue` became `isLive`, because the editor must not
hold the runtime's classes, and the `<OutputRenderer>` component became
`renderOutput`, because the editor supplies no markup for somebody else's
result. `EditorScriptTemplates` reaches `SlashCommands` through a **ref** rather
than the hook — the slash menu is built inside TipTap's suggestion config, which
is not a component, and the file already used that pattern for
`insertTaskCardRef`.

## What did not come over

**Automate and Blockly**: 15 files, ~6 700 lines — the script editor, the flow
extension, the Blockly editors, `proceduralBlocks.ts` — and, less obviously, 334
lines inside `utils/markdownConverter.ts` that round-tripped a
` ```automate ` fence into `<div data-type="automate-script-block">` and back.
That half was the dangerous one: with the extension gone nothing claimed the
div, so a document opened and saved could have lost the script it carried. An
Automate fence is now an ordinary fenced code block — its text preserved,
nothing rendering or running it.

## Dependencies

TipTap, React, MUI and Emotion are **peers** — two copies of ProseMirror's
schema do not recognise each other's nodes, the same way two copies of React
break hooks. `mermaid`, `katex`, `leaflet`/`react-leaflet` and `react-router-dom`
are **optional** peers: each belongs to one block. `showdown`, `turndown`,
`react-markdown`, `remark-gfm` and `rehype-highlight` are ordinary dependencies —
they are the conversion itself. Within Hestia: `@hestia/core`,
`@hestia/ui-sci-blocks`, `@hestia/ui-devtools/diagrams`,
`@hestia/ui-scene3d/cad-viewer`.

## Tests run in jsdom, all of them

Not the component-rendering exception `sci-blocks` needed — almost nothing here
renders. It is that this is browser code throughout: `embedFraming` resolves
relative URLs against `window.location`, the block views build DOM nodes, the
converters walk an `HTMLElement`. In node those do not fail loudly. They fail
quietly: `new URL(url, undefined)` throws, the catch returns null, and a host on
the embedding blocklist comes back allowed.

**Not verified here.** `markdownConverter.ts` imports `showdown` and `turndown`,
neither installed in the environment this port was done in, so nothing in it has
been run. Every file parses, every relative import resolves and every name the
barrel re-exports resolves to a real declaration — all checked mechanically —
but `pnpm install && pnpm typecheck && pnpm test` is what settles it. The first
thing to look at is whether an info string like `automate:id:autorun:html:t=a,b`
survives a round trip as a plain fence.

## Debt

Comments, test names and a few filenames are in Polish, as in the other packages
moved over from MyCastle. Translation is a pass of its own, kept apart from
moving code because mistakes hide in a diff that does both.
