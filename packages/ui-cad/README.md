# `@hestia/ui-cad`

The CAD pages moved over from `cad-app` in MyCastle. Three areas, one directory
each, and an entry each:

| Import | Directory | What it is |
| ------ | --------- | ---------- |
| `@hestia/ui-cad` | `src/notes/`, `src/pen/` | Handwritten notes — pen, marker, shapes, text, images, pages |
| `@hestia/ui-cad/cad2d` | `src/cad2d/` | The 2D CAD drawing and the engine under it |
| `@hestia/ui-cad/cad3d` | `src/cad3d/` | The parametric 3D modeller, over OpenCascade |

## One package, three entries

The three belong together: a sketch in the modeller **is** a 2D drawing, on the
same `Project` object, and the modeller borrows the drawing's canvas, tools and
dimensions outright. Splitting them into separate packages would put a boundary
through the middle of that.

They are still imported apart, and that is not tidiness. Everything reachable
from `cad3d` pulls in OpenCascade, a WASM kernel of several megabytes; a page
that wants notes must not carry it. So `src/index.ts` exports the notes,
`src/cad2d.ts` and `src/cad3d.ts` are doors of their own, and a host takes only
what it opens.

```tsx
import { SpenNotesView } from '@hestia/ui-cad';
import { Cad2dEditor, Project, useProject } from '@hestia/ui-cad/cad2d';
import { Cad3dEditor } from '@hestia/ui-cad/cad3d';         // loads OpenCascade
```

The package depends on nothing in Hestia. React, MUI and Emotion are peers —
the host has them anyway, and a second instance of React breaks hooks in a way
whose cause is invisible (a blank screen). `three` and `opencascade.js` are its
own, and `three` is kept external in the build so that the host and the modeller
share one copy: objects built by one are foreign to another.

# Notes (`@hestia/ui-cad`)

The handwritten notes page (pen, marker, shapes, text, images, pages).

## What had to be untangled

In `cad-app` the page was wired into the application in four places: the
cad-backend REST VFS client, the shared "File" menu context, the viewer-mode
URLs, and its own export module with a Leaflet dependency. None of those exist
in Hestia and none of them were recreated here.

## Where the files come from

From a `NoteStore` supplied by the host:

```ts
import { SpenNotesView, type NoteStore } from '@hestia/ui-cad';

const store: NoteStore = {
    startDir: 'cad/notes',
    list:  (dir) => /* … */,
    read:  (path) => /* … */,
    write: (path, content) => /* … */,
    // remove / rename / createDir — optional
};

<SpenNotesView store={store} />
```

`list`/`read`/`write` are required. The rest are optional, and the file dialog
**does not draw buttons** for operations a store lacks: a button that always
ends in an error promises something that will not happen.

Without a `store` the page works as a scratchpad — the drawing lives in the
browser's `localStorage`, and the "File" menu offers neither opening nor saving.

## The "File" menu

By default the page draws it itself (the first button on the toolbar). An
application with a menu bar of its own — which is how `cad-app` works — passes
`onFileOps` and receives the full set of entries to plug in there; the page then
does not show its own menu, so there are not two ways into the same thing.

## Theme

The page has colours written into it for a **dark** background
(`rgba(255,255,255,…)` on icons, white borders on active buttons). Embedded in a
light theme it loses half the toolbar — the buttons are there and they respond,
they just cannot be seen. The host should give it a `ThemeProvider` with
`mode: 'dark'` (see `app/web/cad`).

## The left palette

The strip of buttons over the left edge of the canvas is a `FloatingToolbar`
from `@hestia/ui-core`: the flyouts (colour, fill, style, text, arrows, point
editing) and the actions on the selection (duplicate, delete, order, link). It
floats over the drawing rather than sitting beside it, translucent and blurred,
because the page is mostly canvas and an opaque strip would hide part of it.

Entries that do not apply are hidden rather than greyed — the fill colour on a
line, the arrowheads on a rectangle — and the separator goes with them when a
whole group disappears. On a short screen the palette scrolls instead of running
off the bottom.

The bar along the top is still built by hand; it holds pickers and readouts that
are not menu entries, and moving it would be a separate piece of work.

## The page list

Hidden when the page opens, and brought back by the button beside it. The canvas
is what this page is for, and on a tablet the strip takes a fifth of its width;
pages are switched often enough that nobody loses the button for long.

## Opening a shape's label

In select mode, a **double tap (or double click) on a shape** opens its label
for editing — a rectangle, a diamond, a circle, an arrow or a pen stroke. A
*line* is the exception: it goes into point editing instead, because a line is
shaped by its vertices rather than labelled.

The rule for what counts as a double tap is in `doubleTap.ts`: two taps within
450 ms and close together. The window used to be 320 ms, which a pen on an
e-ink reader misses often, and missing it fails invisibly — the shape is
selected again and nothing says why the label never opened.

## The selection handle

A selected shape shows a round handle at its centre. Dragging it moves the
selection; **tapping it without moving writes a label inside the shape** — the
same thing a double tap does, without having to find the shape again.

It is drawn as four arrows rather than a plain cross on purpose: a cross reads
as a plus, and a plus on a selected shape looks like a button that adds
something. Now it looks like what it is, and does the thing people expected of
it anyway.

## Palm rejection

Writing with an S Pen means resting a hand on the screen, and that hand arrives
as ordinary touch pointers — so it drew, and the page filled with marks nobody
made. `palmRejection.ts` holds the rule: while the pen has been seen within the
last 1.5 seconds (hovering counts, which an S Pen reports from a centimetre
away), a finger pans and zooms but does not draw. Once the pen has been away
that long, a finger draws again.

Nothing to switch on, and nothing that stays switched on: a tablet with no pen
is never affected, and putting the pen down gives the finger its pencil back.
When the pen lands on a page a palm has already begun marking, that stroke is
dropped rather than committed — the palm usually touches first.

## The Onyx Boox pen

`useBooxPen` wires up low-latency drawing on Onyx readers (the
`window.__booxPen` bridge from the MyCastle mobile shell). Away from those
devices the bridge reports itself unavailable and the canvas handles the pen
like any other browser.

# Cad2d (`@hestia/ui-cad/cad2d`)

```tsx
import { Cad2dEditor, Project } from '@hestia/ui-cad/cad2d';

const project = useMemo(() => new Project(), []);
<Cad2dEditor project={project} />
```

Drawing with snapping to vertices, edges and the axes; 27 tools (lines, arcs,
circles, rectangles, polygons, slots, B-splines, freehand, text, images, move,
copy, rotate, offset, trim, fillet, dimensions, and boxes, cylinders and spheres
for the 3D view); layers; undo and redo; dimensions that follow the geometry
they are anchored to and, when driving, hold it to their value; a command line
for typing coordinates and angles; and import and export of JSON, DXF, SVG, OBJ,
glTF and STL.

```
src/cad2d/
  core/       the drawing itself — entities, layers, history, selection, snapping
  tools/      the tools: a click and a drag turned into an entity
  renderer/   three.js — the scene, the camera, the meshes built from entities
  io/         reading and writing files
  ui/         the canvas, the overlays, the panels, and `Cad2dEditor`
  hooks/      `useProject` — the version counter the panels redraw on
icons/        the FreeCAD icons (LGPL) the toolbar draws
```

The engine and the page live together because the page is not a view over the
engine, it *is* the engine's interface: the tools, the snapping, the history and
the selection are shared, and a boundary between them would run through the
middle of one mouse click.

## `Cad2dEditor`

| Prop | Required | What it is |
| ---- | -------- | ---------- |
| `project` | no | The drawing. Build it once (`useMemo`) and keep it, so the host's own file menu saves and loads the same object. Without one the editor makes an empty project, which is enough to try it out. |
| `viewMode` | no | `2d` is the drawing plane, `3d` an orbit view of the same drawing. `2d` by default; the switch belongs to the host. |
| `activeTool` / `onToolChange` | no | The active tool, when the host drives it. Uncontrolled otherwise. |
| `placementStamp` / `onCancelPlacement` | no | A drawing armed for stamping: it follows the cursor and each click drops a copy, until Esc. |
| `toolbarStart` | no | The host's own controls at the **start** of the action bar — where a file menu goes. |
| `actionBarExtras` | no | More controls at the end of the action bar. |
| `belowCanvas` | no | Rendered under the canvas, above the status bar. |
| `hideSidePanel` | no | Hides the layers/properties column when the host draws its own. |

Everything it is made of is exported too — `CadCanvas`, `Toolbar`, `ActionBar`,
`StatusBar`, `CommandLine`, `LayerPanel`, `PropertiesPanel`, the overlays — for
a host that wants a layout of its own. The component fills its parent, so the
parent needs a height.

## Files

The exporters produce a download in the browser; the importers take a `File`
from an `<input type="file">`. What a host needs beyond that —
`loadProjectFromText` and `mergeProjectFromText` — takes text, so a project kept
in a VFS is read and written by the host and only passed through here. STEP
export needs OpenCascade and lives in `cad3d/`.

## The toolbars

All three editors take a `toolbarStart` slot: whatever the host puts there lands
at the **start of the editor's own bar**, which is where a file menu belongs. A
host that draws its own row above instead gives the page two bars, and on a
tablet that is a fifth of the canvas gone.

The tool palette, the action bar and the modelling bar are all `Toolbar` from
`@hestia/ui-core`, built from trees of nodes rather than rows of buttons. Every
tool is a toggle in one group, so exactly one is on and the bar says which; the
tools that come in kinds — a circle by centre or by three points, a polygon of
three to eight sides, FreeCAD's particular dimensions — are split buttons: the
button turns on whichever kind was used last, the arrow beside it offers the
rest.

The gain is not tidiness. A bar made of nodes scrolls when the window is too
narrow for it (a row of buttons simply ends, and the ones past the edge are
invisible as well as unreachable), a hidden tool takes its separator with it,
and the same component behaves the same way in the application's own menus.

## The FreeCAD icons

The toolbars draw FreeCAD's icons (LGPL, in `icons/`) for the tools MUI has no
icon for. In `cad-app` Vite turned them into hashed URLs with
`import.meta.glob` — a Vite transform, not JavaScript, which tsup would leave in
the output for the host's bundler to choke on. Inlining them is worse: nearly a
megabyte that every page importing one icon would carry.

So the package ships the files and resolves them by URL. The host serves the
directory (copy it into the application's `public/`, or point a bundler plugin
at it) and says where:

```ts
configureFreecadIcons({ baseUrl: '/freecad-icons' });   // the default
```

An icon that does not resolve is not an error — every place that uses one falls
back to a MUI icon or to the tool's initials.

# Cad3d (`@hestia/ui-cad/cad3d`)

```tsx
import { Project, useProject } from '@hestia/ui-cad/cad2d';
import { Cad3dEditor } from '@hestia/ui-cad/cad3d';

const project = useMemo(() => new Project(), []);
const { version } = useProject(project);

<Cad3dEditor project={project} version={version} />
```

A feature tree — sketches, extrudes, pockets, holes, grooves, revolves, shells,
fillets, chamfers, linear and polar patterns, lofts, sweeps, helices and datums
(point, line, plane, coordinate system) — evaluated by OpenCascade into a solid.
Faces, edges and vertices can be picked in the viewport, and a face picked there
becomes a sketch plane or a datum. Sketches are drawn on the very canvas of
`cad2d/`, with constraints and driving dimensions.

```
src/cad3d/
  model/    the feature tree, its evaluation, the sketch constraint solver,
            and picking sub-elements in the viewport
  occ/      OpenCascade: loading the kernel, the geometry it builds, and
            converting its shapes into three.js meshes
  hooks/    useCad3d — the tree and everything that changes it
  io/       STEP export
  ui/       the viewport, the tree and properties panels, the sketch editor,
            and `Cad3dEditor`, which composes them
```

## The modelling bar

The sixteen operations are grouped the way FreeCAD's own icon colours already
group them — yellow adds material, red takes it away:

| Group | What is in it |
| ----- | ------------- |
| **Additive** | Extrude, Revolve, Loft, Sweep, Helix |
| **Subtractive** | Pocket, Hole, Groove, Loft cut, Sweep cut |
| **Dress-up** | Fillet, Chamfer, Shell — neither adds nor subtracts, reshapes what is there |
| **Transform** | Mirror, Linear pattern, Polar pattern — repeats what is there |

Each group's button runs the operation it is named after (Extrude, Pocket,
Fillet, Mirror), so the common ones stay a single click; the arrow beside it
holds the rest. Sixteen buttons in a row is a row nobody reads, and the two that
matter most sat among fourteen others that look alike at a glance.

**Two rows.** The first is what one builds: the file menu, the sketches and the
four groups. The second is what one works with: the datums, the selection mode
(object / vertex / edge / face), what is under the cursor in that mode, and
clearing the tree. Those used to sit at the right-hand end of the first row,
where a narrow window pushed them out of sight behind the operations — and the
selection mode is switched *between* operations rather than after them.

## `Cad3dEditor`

| Prop | Required | What it is |
| ---- | -------- | ---------- |
| `project` | yes | The drawing the sketches live in — the same one `Cad2dEditor` works on. |
| `version` | yes | The drawing's version counter — `useProject(project).version`. |
| `apiRef` | no | Filled in with a `Cad3dApi`: `getTreeJson`, `replaceTree`, `mergeFeatures`. This is how a host's file menu saves and opens a model. |
| `placementStamp` | no | A model armed for stamping: every click in the viewport adds it to the tree at the origin. |
| `toolbarStart` | no | The host's own controls at the start of the toolbar — where a file menu goes. |

It wraps itself in a light MUI theme, as it did in `cad-app` — the panels and
the viewport are built for a light background, whatever the application's own
theme is. Which is also why the notes page next door wants a dark one: see
**Theme** above.

## OpenCascade

`opencascade.js` is a WASM build of the OCC kernel and weighs several megabytes.
It loads on the first evaluation, not on import, but the bundle is large either
way, so a host with more than one page should load this entry lazily:

```tsx
const Cad3d = lazy(() => import('@hestia/ui-cad/cad3d').then(m => ({ default: m.Cad3dEditor })));
```

Under Vite, `.wasm` has to be listed in `assetsInclude` — `opencascade.js`
imports its kernel as a URL, and without that the build stops at
`[vite:wasm-fallback]`. See `app/web/cad/vite.config.ts`.

The evaluator reports what went wrong rather than returning nothing: a failed
feature emits a `cad3d:eval-error` event with the feature's name and the reason
("the sketch does not close", "the axis of revolution crosses the profile"), and
the page shows it. Everything built before the failure stays in the scene —
every feature is evaluated in its own try/catch, because one exception used to
empty the whole model.

# Status

- ✅ The 2D engine's 186 tests pass, and so do the notes' own; 235 in all.
- The components are not rendered in tests: that needs jsdom, a WebGL context
  and a great deal of scaffolding for very little, since what they are worth
  showing is what a canvas looks like.
- The 3D evaluation is covered by nothing automated. What it computes is
  geometry inside a WASM kernel, and asserting on it would mean fixing a
  tessellation in a test, which says more about OCC's version than about this
  code.
- 🚧 Fillet and chamfer handle `useAllEdges` fully; choosing edges by ref works
  through midpoint hints and can miss after large changes to the solid.
