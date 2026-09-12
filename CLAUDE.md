# Project: Hestia

## How to talk to me

Write replies, explanations and questions to the user **in Polish**. Everything
that lands in the repository — code, comments, commit messages, READMEs, user
interface text — is **in English**. Technical terms and identifiers from the
code stay as they are in both.

## Overview

A pnpm monorepo: shared code in `packages/` (scope `@hestia/`), runnable
applications in `app/`. Same stack as MyCastle, from which most of this code was
moved over:

- **Node 20**, TypeScript 5.9, ESM (`"type": "module"`) throughout
- **tsup** for packages, **tsx watch** for servers in development
- **Vitest 4** for tests; jsdom where a test touches the DOM
- **React 18 + MUI 6 + Emotion**, built by **Vite 6**
- **three.js** for anything 3D, **opencascade.js** (WASM) for solid modelling
- No framework on the server: `node:http` with a small router in
  `@hestia/node-core`

This file holds the architecture and the conventions. For the details of an API
— class names, props, fields — read the code: it is the source of truth, and a
description of it here would be the second one, and wrong within a month.

## The rules that matter

### 1. Tests

**Write unit tests, and run them.** Not as a formality: the rule is that
anything worth being sure of gets pulled out of the component or the handler and
tested on its own. That is why there is a `palmRejection.ts`, a `doubleTap.ts`,
a `cadFiles.ts` and a `model.ts` next to the toolbar — each is a rule somebody
would otherwise have to verify by hand, on a tablet, every time.

What is **not** tested, on purpose, and why:

- React components are not rendered in tests. What they are worth showing is
  what a canvas or a menu looks like, and asserting on the DOM around it says
  more about MUI than about this code.
- The OpenCascade evaluation is not tested. It computes geometry inside a WASM
  kernel; fixing a tessellation in a test would pin OCC's version, not the
  behaviour.

`pnpm test` runs everything. A change that touches a pure module without
touching its test is suspicious.

### 2. Interfaces stand on `@hestia/ui-core`

Any bar, menu or palette is a `Toolbar` from `@hestia/ui-core`, built from a
tree of nodes (`item`, `toggle`, `splitToggle`, `separator`, `custom`) — not a
row of `IconButton`s. This is not tidiness: a toolbar made of nodes scrolls when
the window is narrow (a hand-rolled row simply ends, and the buttons past the
edge are invisible as well as unreachable), a hidden entry takes its separator
with it, and every bar in every application behaves the same way.

A component belongs in `ui-core` when a second place needs it, or when it is
plainly general from the start — not in the hope that one day something might.
If what you need is close to the toolbar but not quite it, **extend the model**
rather than building a second one beside it (that is how `toggle` came to accept
`children` and became a split button).

### 3. `@hestia/core` is where the model lives

Domain models, MQTT topics and packets, RPC contracts, the VFS abstraction, data
sources — the things both a server and a browser have to agree about. Both sides
import the same types, so a change to the model stops **both** from compiling,
rather than being discovered at run time on one of them.

Nothing about any one application goes in there, and nothing about the
interface. `node-core` is its counterpart for the server (HTTP, MQTT broker,
auth, file system).

### 4. Packages depend on nothing they cannot justify

React, MUI and Emotion are always `peerDependencies`: the host has them anyway,
and a second instance of React breaks hooks in a way whose symptom (a blank
screen) says nothing about the cause. The same goes for `three` — objects built
by one copy are foreign to another.

A package describes what it needs from the host rather than reaching for it: a
`NoteStore`, a `CodemapStore`, a `syncFromCode` callback, a `toolbarStart` slot.
No package knows where the files are or which backend it is talking to.

Something heavy gets an **entry of its own** rather than a place in the barrel:
`@hestia/ui-cad/cad3d` pulls in a WASM kernel of several megabytes, and a page that
wants notes must not carry it.

### 5. Comments say *why*

The code says what it does. A comment earns its place by recording what was
tried, what broke, or what a reader would otherwise have to rediscover — the
symptom that is indistinguishable from something else, the ordering that matters,
the value that is not arbitrary. No comment restates the line below it.

### 6. The platform owns accounts and files

Domain applications (`app/iot`, `app/finances`, `app/cad`) have no users and no
store of their own. They ask the platform (`app/backend`), passing **the user's
own token** rather than a service account, so the platform sees the real owner
and guards the boundaries in one place. The browser talks only to its own
server: `/api/*` is that application's, `/platform/*` is forwarded on.

## Packages (`packages/`)

Two prefixes carry meaning. A `node-` prefix means the package runs on Node only
and must never be imported by a page: `node-core` (the server) and
`node-devtools` (tools that read source files). A `ui-` prefix means the
opposite — React, and a browser: `ui-core`, `ui-ai`, `ui-cad`, `ui-scene3d`,
`ui-devtools`, `ui-markdown-editor`. What has neither runs in both, like
`core` — the model a server and a browser have to agree about.

- **core** (`@hestia/core`) — the shared model: domain models, nodes, the MQTT
  topic and packet registry, the RPC registry, the VFS abstraction, data
  sources, MJD, and `finance/` (accounts, transactions, categories, budgets).
  The MyCastle base, copied verbatim, plus what Hestia added.
- **node-core** (`@hestia/node-core`) — the server-side counterpart:
  `HttpServer` (`node:http` + a router + static files), the MQTT broker, JWT,
  passwords, API keys, the file system, data sources. `simple/` is Hestia's own
  minimal layer (`HttpServer`, `JsonStore`).
- **ui-core** (`@hestia/ui-core`) — React components used in more than one
  place. Today: the `Toolbar` (menu bar, floating palette, any orientation,
  submenus, split buttons, scrolling) and its node model, and the drive.
It has no dependency beyond its peers.
- **ui-cad** (`@hestia/ui-cad`) — the CAD pages moved over from MyCastle's `cad-app`,
  in three areas with an entry each: `notes/` (handwritten notes — pen, marker,
  shapes, pages; `@hestia/ui-cad`), `cad2d/` (the 2D drawing and its engine —
  entities, layers, history, snapping, dimensions; `@hestia/ui-cad/cad2d`) and
  `cad3d/` (the parametric modeller over OpenCascade; `@hestia/ui-cad/cad3d`).
- **node-devtools** (`@hestia/node-devtools`, Node only) — tools that work on
  source code: `codemap/` (parsers for TS/JS, Python and C/C++, the
  language-agnostic code model, the `*.codemap.json` document with its UML
  view and git-like history, code generation) and `git/` (a wrapper around the
  `git` CLI for `.repo.json` clones). `@hestia/node-devtools/format` is the
  browser-safe part.
- **ui-scene3d** (`@hestia/ui-scene3d`) — the 3D scene graph moved over from
  MyCastle: nodes, geometry, serialisation, import/export, animation, prefabs
  and `SimpleViewer` over `@react-three/fiber`. `src/layout/` is the constraint
  solver it uses, with no entry of its own until a second place needs it, and
  `@hestia/ui-scene3d/cad-viewer` the read-only viewers built on it (CAD, 3D,
  electronics, PCB, map, notes) — behind their own entry because they carry
  Leaflet. `three` and its React bindings are peers, for the reason in rule 4.
  This is deliberately **not** in `ui-core`: a package of React components used
  across applications is the wrong place for a renderer.
- **ui-markdown-editor** (`@hestia/ui-markdown-editor`) — MyCastle's Markdown
  editor, whole. It knows nothing about the application it runs in: the file
  store, the session, the knowledge base, the form service, the script runtime
  and the rest arrive through thirteen capabilities in `capabilities.ts`, each
  optional, and an absent one means the feature is not there. TipTap is a peer,
  for the reason React is: two copies of ProseMirror's schema do not recognise
  each other's nodes.
- **core-sci** (`@hestia/core-sci`) — MyCastle's scientific core: solvers,
  units, the formula graph, linear algebra, PDE grids, the knowledge base. No
  React and no DOM — it runs headless and in a worker, which is why it has no
  `ui-` prefix. It carries mathjs and a computer-algebra engine, so nothing
  imports it that does not need them.
- **ui-sci-blocks** (`@hestia/ui-sci-blocks`) — the React blocks over
  `core-sci` (formula, sim, plot, linalg, exercise, the reader), plus KaTeX and
  MathLive. This is the one place where React components **are** rendered in
  tests (see rule 1): those tests load a real knowledge document from
  `packages/ui-sci-blocks/documents/` and check the document pipeline, not the
  markup.
- **text** (`@hestia/ui-texteditor`) — MyCastle's `texteditor`: the Monaco-based text
  and code editor, its VFS layer, the MJD editors and the built-in plugins
  (TypeScript, Python and C++ IntelliSense, snippets, folding, markdown
  preview, git). `monaco-editor` is a peer for the reason React is — two copies
  register two sets of languages and workers and fight over them. The AI
  assistant is not here: it is `@hestia/ui-ai`, and `MonacoMultiEditor` takes
  it as an `agentPanel` slot.
- **ui-devtools** (`@hestia/ui-devtools`) — the browser counterpart of
  `node-devtools`, an umbrella over two tools with an entry each:
  `@hestia/ui-devtools/diagrams` (the graphical diagram editor — model, format
  adapters, editors over `@xyflow/react`) and `@hestia/ui-devtools/codemap`
  (MyCastle's Programming → UML page, over a `CodemapStore` the host supplies).
  A host that wants only diagrams must not carry the codemap editor, which is
  why they are separate entries rather than one barrel. From `node-devtools`
  only the browser-safe `/format` entry is imported.

`packages/finances/` is **not a package**: eight loose files (a PKO statement
parser, budget and planning sketches, a CSV) with no `package.json`, so pnpm
does not see it and nothing imports it. Either it becomes `@hestia/finances`
with the parser moved out of `app/finances`, or it goes. Leaving it is the one
option that keeps costing something: it looks like a package in the listing and
is not one.

## Applications (`app/`)

| application | what it is | port |
|---|---|---|
| **backend** (`hestia-backend`) | The **platform**: files (VFS), MQTT, accounts. The only place holding either. | 4990 |
| **iot** (`iot-backend`) + **web/iot** | Devices and readings: the registry, telemetry, control. | 4992 / 4993 |
| **finances** (`finances-backend`) + **web/finances** | Household finances: accounts, transactions, categories, budgets, monthly summaries. Its own `JsonStore`, because the data is the application's own rather than the user's files. | 4894 / 4895 |
| **cad** (`cad-backend`) + **web/cad** | The CAD pages: Notes, Cad2d, Cad3d as three subpages of one application. The server serves the page, answers `/api/health` and `/api/me`, and forwards `/platform/*`. | 4994 / 4996 |

## Commands

| command | what it does |
|---|---|
| `pnpm test` | every suite |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm build` | a full build, in dependency order |
| `pnpm dev:platform` / `pnpm dev:finances` / `pnpm dev:cad` | one application, with its page |
| `pnpm docs` | the API and the full documentation (typedoc), Markdown + JSON |

Every application reads its own `.env` (copy from `.env.example`); ports live
there and the Vite configs read the same file, so a port is changed in one
place.

## Things worth knowing before they cost an afternoon

- **The notes page needs a dark theme.** Colours are written into it directly;
  on a light background half the toolbar becomes invisible while still working.
  The 3D modeller is the opposite and wraps itself in a light one.
- **`.wasm` must be in Vite's `assetsInclude`.** `opencascade.js` imports its
  kernel as a URL; without the line the production build stops at
  `[vite:wasm-fallback]`, while the dev server is fine.
- **The FreeCAD icons are files, not imports.** They ship in
  `packages/ui-cad/icons/` and the host serves them; `configureFreecadIcons` says
  where. Roughly a megabyte, so inlining them is not an option.
- **One `Project` for Cad2d and Cad3d.** A sketch in the modeller *is* a 2D
  drawing on the same object; the shell owns it, or switching tabs throws the
  work away.
- **A store's missing operation means no button.** A button that always ends in
  an error promises something that will not happen.
