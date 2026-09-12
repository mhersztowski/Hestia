# `@hestia/ui-devtools`

Developer tools that run in a browser — the counterpart of
`@hestia/node-devtools`, which does the same work on files. An umbrella over two
independent tools, each with an entry of its own:

```ts
import { … } from '@hestia/ui-devtools/diagrams';  // the diagram editor
import { … } from '@hestia/ui-devtools/codemap';   // the codemap editor
```

Entries rather than one barrel, for the usual reason: a host that wants only
diagrams must not carry the codemap editor, and the other way round.

The root exposes the two as **namespaces** (`diagrams`, `codemap`) rather than
flattening them. Both define an `emptyDiagram`, and they are different
functions — one makes a diagram document of a given kind, the other a named UML
diagram — so `export *` from both would be ambiguous. Namespacing says which
tool a name belongs to instead of hiding the question.

## `diagrams/` — the diagram editor

MyCastle's `packages/web-devtools`, moved over whole: the model, the format
adapters, and the editors built on `@xyflow/react`.

103 files, about 17 900 lines. Nothing was cut: the package depended on
`@xyflow/react` and on nothing else of MyCastle's, so the port is the source
with `@mhersztowski/…` rewritten to `@hestia/…` and a package around it.

```tsx
import { DiagramEditor } from '@hestia/ui-devtools/diagrams';
```

Two entries, as in the original: the whole toolkit, and `./diagrams` on its own
for a host that wants only that.

## Status

- ✅ Typechecks against the whole tree.
- ⚠️ **The comments are still Polish.** Everywhere else in this repository they
  are English, and these will be too — but a port that rewrites every comment on
  the way is no longer a port, and 2 900 comment lines translated in the same
  pass as the code is where mistakes hide. The translation is a separate pass,
  and it is honest to say it has not happened yet.
- The package's own tests came along and have not been run here: the offline
  check has no React and no `@xyflow/react`, and a shim for them would prove
  nothing about the code. They are what `pnpm test` will run first.

## `codemap/` — the codemap editor

MyCastle's *Programming → UML* page as a component, over a `CodemapStore` the
host supplies: the package knows nothing about where the `*.codemap.json` files
live. 15 files, about 2 600 lines. It was a package of its own, `devtools-ui`,
until the two were merged — a name that said "the UI half of devtools" while
`ui-devtools` sat beside it meaning the same thing.

From `@hestia/node-devtools` it imports only the browser-safe `/format` entry:
the parsers and the git wrapper are Node's and have no business in a page.

React, MUI and Emotion are peers, and `@xyflow/react` is external together with
the stylesheet the editors import (`@xyflow/react/dist/style.css`) — the host's
Vite loads it from `node_modules`, so there is one copy of the graph library in
a page rather than two.
