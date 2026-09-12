# `@hestia/ui-scene3d`

The 3D scene graph and the viewers built on it, moved over from MyCastle's
`core-scene3d`, `layout` and `core-cad-viewer`.

```
src/scene3d/     the scene graph          @hestia/ui-scene3d
src/cad-viewer/  the viewer pages         @hestia/ui-scene3d/cad-viewer
src/layout/      the constraint solver    (no entry — see below)
```

## `src/scene3d/` — the scene graph

62 files, ~9 600 lines: nodes, geometry and geometry nodes, serialisation,
import and export (GLTF, FBX, OBJ, STL), animation, prefabs, and `SimpleViewer`
over `@react-three/fiber`.

## `src/cad-viewer/` — the viewers

37 files, ~5 600 lines: read-only pages for what the other packages produce —
`CadViewerPage` and `Cad3dViewerPage` over a `@hestia/ui-cad/cad2d` project,
`Scene3dViewerPage`, `ElectronicsViewerPage`, `PcbViewerPage` (with a 3D board
build), `MapViewerPage` and `NotesViewerPage`. `scene-api/` is the common way of
talking about every kind of scene, `cad/` the conversion from a CAD project to a
scene and to SVG.

Behind an entry of its own, because it carries Leaflet and the page shells and a
page that wants only a scene graph must not.

## `src/layout/` — the constraint solver

19 files, ~1 900 lines, from MyCastle's `packages/layout`. One layout model and
four ways of computing it. `scene3d/nodes/uiLayout.ts` uses it to turn a node's
description of a layout into positions; nothing in Hestia does this otherwise,
and the solver is self-contained — no React, no dependencies at all.

**No export entry.** Its only consumer is `scene3d`, and an entry is a promise
about an interface. If a second place needs it, that is when it earns one.

## Dependencies

`three`, `@react-three/fiber` and `@react-three/drei` are **peers**, and so are
React, MUI and Emotion: an object built by one copy of three is foreign to
another, exactly as a second instance of React breaks hooks. `leaflet` and
`react-leaflet` are **optional** peers — only `MapViewerPage` touches them.
`@hestia/ui-cad` is an ordinary dependency: the CAD pages read a `Project` from
`@hestia/ui-cad/cad2d`.

## What came from where, and what did not

- `@mhersztowski/core-scene3d` -> `src/scene3d/`, whole.
- `@mhersztowski/layout` -> `src/layout/`, whole.
- `@mhersztowski/core-cad-viewer` -> `src/cad-viewer/`, whole. Its imports of
  `@mhersztowski/core-cad` now point at `@hestia/ui-cad/cad2d`, which carries the
  same `Project`, `Entity`, `Layer`, `ProjectData` and `EntityInput` — the CAD
  port into Hestia was 1:1, so this is a rename and nothing more.
- `@mhersztowski/ui-core` was **not** ported. `scene3d` used three declarations
  out of it, all types, and they are now `scene3d/sceneTypes.ts`. The rest is
  prop interfaces for an editor Hestia does not have.
- MyCastle declared MUI 7 for the viewer; here it is MUI 6, as everywhere else
  in this repository.

## Debt

Comments, test names and some filenames are in Polish. Debt, not the intended
state — translation is a pass of its own, kept apart from moving code because
mistakes hide inside a diff that does both.

## Tests

`pnpm test` runs them. The viewer components are not rendered: what they are
worth showing is what a canvas looks like. What is tested is the model — the
scene graph, the layout solver, the CAD-to-scene and CAD-to-SVG conversion.

The suite is split in two, as MyCastle had it: `scene3d` runs in node, and
`scene3d/cad-viewer` in jsdom. The DOM is not there for components — it is for
the browser objects the drawing code uses directly. `renderNotes` builds an
`Image` per source and caches it, and node has no `Image`.
