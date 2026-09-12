# `@hestia/node-devtools`

Tools that work on source code, moved over from `packages/node-devtools` in MyCastle
(`@mhersztowski/devtools`). Two independent layers — neither imports the other:

```
src/
  codemap/   what is known about source code — parsers, the code model,
             the *.codemap.json document, its UML view and history, codegen
  git/       a wrapper around the `git` CLI for `.repo.json` clones
  index.ts   the main entry (Node) — both layers
  format.ts  the browser entry, `@hestia/node-devtools/format` — the document,
             its history, the UML view types and the diff; nothing Node-only
```

The editor for codemaps is a separate package, `@hestia/ui-devtools`.

## `codemap/` — knowledge about source code

A **codemap** is what the package knows about a body of source code: its
symbols (classes, interfaces, structs, modules), their members and TSDoc
documentation, the relations between them and the files they come from — kept
in a `*.codemap.json` file with a git-like history of how that picture changed.

The name is deliberately not "UML": a UML diagram is one **view** of that
knowledge, and the parsers are not tied to one language. In MyCastle the same
file was a `uml-project` (`*.umlproj.json`); `parseCodemap` still reads those.

```
codemap/
  document.ts          the file: Codemap type, create / commit / parse / stringify
  CodemapService.ts    the orchestrator: scan → parse → create / update a codemap
  model/               the language-agnostic IR (CodeModel), ids, member text
  parsers/             TypeScript/JS, Python, C/C++
  uml/                 the UML view: diagram types, layout, diff, UML → model
  codegen/             source skeletons from a model (TS, Python, C++)
```

```
source files ──▶ CodeModel (IR) ──▶ codemap (.codemap.json)
                     ▲                     │  diff → history commit
                     └──── source code ◀───┘  (round-trip skeletons)
```

### Parsers

| Language        | Library                                 | Notes                           |
| --------------- | --------------------------------------- | ------------------------------- |
| TypeScript / JS | `typescript` Compiler API               | pure JS, semantic-grade         |
| Python          | `web-tree-sitter` + `tree-sitter-wasms` | WASM grammar, no native build   |
| C / C++         | `web-tree-sitter` + `tree-sitter-wasms` | WASM grammar, no native build   |

The tree-sitter grammars load lazily, and the TS/JS path works even when they
cannot be loaded. `typescript` is a **runtime** dependency here, not just a
build tool — the TS parser is the Compiler API.

A new language is a new `LanguageParser` in `parsers/` producing the same
`CodeSymbol[]`; nothing downstream (UML, diff, the file) needs to change.

### Quick start

```ts
import { promises as fs } from 'node:fs';
import { CodemapService, parseCodemap, stringifyCodemap } from '@hestia/node-devtools';

const svc = new CodemapService();

// 1. Build a codemap from a code directory
const codemap = await svc.createFromDir('/path/to/src', 'MyApp', { relativeTo: '/path/to' });
await fs.writeFile('myapp.codemap.json', stringifyCodemap(codemap));

// 2. Re-sync later — layout is preserved, changes become a history commit
const saved = parseCodemap(await fs.readFile('myapp.codemap.json', 'utf8'));
const { codemap: updated, changes, summary } =
  await svc.updateFromDir(saved, '/path/to/src', { relativeTo: '/path/to' });
//    summary e.g. "+2 -1 ~3" (added, removed, modified); `changes` lists each one

// 3. Round-trip: generate source skeletons from the UML view
const files = svc.toSourceFiles(updated, 'typescript');
await svc.writeSourceFiles(files, '/path/to/generated');
```

`createFromFiles` / `updateFromFiles` do the same for a chosen list of files
instead of a whole directory. Lower-level building blocks (`buildModel`,
`createCodemap`, `commitCodemap`, `modelToDiagram`, `diffDiagrams`,
`generateCode`, `diagramToModel`, …) are all exported.

### Diff / history

`diffDiagrams(old, new)` returns component-level `ModelChange[]`
(`added | removed | modified` × `class | field | method | relation`).
`CodemapService.applyModel()` records the summary as a commit on the codemap's
current branch, so the history shows exactly what each sync changed.

The history operations live next to the document, in `document.ts`:
`commitCodemap`, `createBranch`, `checkoutBranch`, `restoreCommit`,
`headCommit`, `branchLog` and `hasUncommittedChanges`. Restoring an old commit
does not rewrite the history — the restored state is an uncommitted change until
it is committed.

### In the browser — `@hestia/node-devtools/format`

The main entry is Node-only (parsers, `node:fs`, `git`). The document, its
history, the UML view types and `diffDiagrams` are plain TypeScript, and they
are exported a second time from a separate entry that a web page can import:

```ts
import { parseCodemap, commitCodemap, type Codemap } from '@hestia/node-devtools/format';
```

The codemap editor in `@hestia/ui-devtools` uses exactly this, so the server
and the page commit and diff with the same code. `format.test.ts` walks the
import graph from `src/format.ts` and fails if anything Node-only becomes
reachable — that kind of break would otherwise surface only in a web build.

## `git/` — repository clones

`GitRepoService` runs the installed `git` (no library, no credential helpers,
no interactive prompts) in a directory holding a `.repo.json` — the remote URL,
the current branch/tag and optionally an HTTPS token, which is injected into the
URL only for the duration of an operation. `parseRepoJson` / `stringifyRepoJson`
read and write that file.

## Why a package of its own

It depends on nothing in Hestia, and nothing in Hestia depends on it: its only
dependencies are the parsers themselves. That keeps the rule from the main
README intact — `core` does not learn about parsers, and whichever application
starts using this does so by depending on the package, not on another app.

The main entry is **Node-only** (`node:fs`, `node:child_process`), the same
kind as `node-core`. The one exception is the `/format` entry described
above.

## What changed in the move

- The package name, `@mhersztowski/devtools` → `@hestia/node-devtools`.
- The two layers, `codemap/` and `git/`, each with its own barrel.
- `uml-project` → **codemap**, and with it the API:

  | MyCastle                                       | Hestia                                  |
  | ---------------------------------------------- | --------------------------------------- |
  | `*.umlproj.json`, `type: 'uml-project'`, v2    | `*.codemap.json`, `type: 'codemap'`, v1 |
  | `UmlProject`, `ProjectSnapshot`, `UmlCommit`, `UmlHistory` | `Codemap`, `CodemapSnapshot`, `CodemapCommit`, `CodemapHistory` |
  | `UmlSyncService`                               | `CodemapService`                        |
  | `generateProjectFromDir` / `…FromFiles`        | `createFromDir` / `createFromFiles`     |
  | `updateProjectFromDir` / `…FromFiles`          | `updateFromDir` / `updateFromFiles`     |
  | `generateProject`, `commitProject`             | `createCodemap`, `commitCodemap`        |
  | `SyncResult.project`                           | `SyncResult.codemap`                    |
  | —                                              | `parseCodemap`, `stringifyCodemap`, `CODEMAP_EXTENSION` |
  | — (in the MyCastle page)                       | `codemapFromDiagrams`, `createBranch`, `checkoutBranch`, `restoreCommit`, `headCommit`, `branchLog`, `hasUncommittedChanges` |

  The shape of the data did not change, so a MyCastle file converts by
  `parseCodemap` alone, `outputs` (the editor's generated files) included. The
  other way — back into MyCastle's UML editor — does not work: that editor
  expects `type: 'uml-project'`.
- `SyncResult` is defined in `document.ts` rather than next to the service, so
  that a browser can name the type without reaching Node-only code.
- `UmlNodeData` and `UmlEdgeData` are type aliases rather than interfaces: React
  Flow requires node data to satisfy `Record<string, unknown>`, which only a
  type alias does.
- Comments, test names and fixtures in English, and so are the strings the
  package produces: commit messages (`Generated from source code`,
  `Sync from code (…)`), `summarizeChanges` (`no changes`), `describeChanges`
  (`added class Foo: …`), the diff truncation note and the validation errors.
- `GitRepoService.commit()` falls back to the author `Hestia <hestia@localhost>`
  when the server has no git identity configured.

## Status

- ✅ TS/JS parsing (full), Python & C/C++ parsing (classes/structs, members,
  inheritance, module-level functions and variables), UML view with
  inheritance-aware layout, component diff, history commits, TS/Python/C++
  skeleton generation, TSDoc carried into the codemap.
- 🚧 Roadmap: the code model itself in the file (today the knowledge lives in
  the UML nodes), non-destructive in-place code editing, branch merge, richer
  C/C++ template & namespace handling.
