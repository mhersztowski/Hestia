# `app/web/cad` — the CAD pages

Three subpages, one package each:

| Subpage | Address | Package | What it is |
| ------- | ------- | ------- | ---------- |
| Notes | `#/notes` | `@hestia/ui-cad` | Handwritten notes — pen, marker, shapes, pages |
| Cad2d | `#/cad2d` | `@hestia/ui-cad/cad2d` | The CAD drawing: tools, layers, dimensions, snapping |
| Cad3d | `#/cad3d` | `@hestia/ui-cad/cad3d` | The parametric modeller — a feature tree over OpenCascade |

The address lives in the fragment (`#/cad2d`) rather than the path, so a link to
a subpage survives a refresh without the server having to rewrite anything — see
`pages.ts`.

## One kind of menu

Every bar in this application is a `Toolbar` from `@hestia/ui-core`, built from
a tree of nodes: the subpage switcher at the top (the three pages as toggles in
one group), and the file menu each subpage carries. They behave the same way,
they scroll the same way when the window is narrow, and adding an entry
anywhere means adding a node rather than a button.

The notes page is the one that had a menu of its own. It still draws one when
nobody takes it over — a page that can be neither opened nor saved would be
worse — but here the application takes it over through `onFileOps`, so there
are not two ways into the same thing.

## What the application adds to the packages

The packages hold no files and no file menu; where things are kept is the host's
business, and here they are kept in the user's files on the platform:

- `notesStore.ts` — the notes' `NoteStore`, on the platform's VFS.
- `cadFiles.ts` — `cad/drawings/*.cad.json` for the drawing,
  `cad/models/*.model.json` for the model.
- `CadFileBar.tsx` — one file menu for both CAD subpages: new, open (a submenu
  of what is saved), save, save as, delete. What differs between a drawing and a
  model is the text it reads and writes.
- `NotesPage.tsx` — the notes page with the same menu, filled from the
  `onFileOps` the package reports.

**The file menu goes inside the page's own bar**, through the `toolbarStart`
slot each of the three editors takes, rather than into a row above it. Two bars
stacked cost a fifth of the canvas on a tablet, and there is nothing in a file
menu that needs a row to itself.

**One drawing for both CAD subpages.** The `Project` is built once, in the
shell, because a sketch in the 3D modeller **is** a 2D drawing on that very
project. Were either subpage to own it, switching tabs would throw the work
away.

**The 3D subpage is loaded lazily.** OpenCascade is a WASM kernel of several
megabytes; nobody opening the notes should wait for it. That is also why the
package keeps three entries rather than one: `@hestia/ui-cad/cad3d` is the only one
that pulls the kernel in.

**`.wasm` is listed in `assetsInclude`.** `opencascade.js` imports its kernel as
a URL and hands that to Emscripten; without the line, `vite build` stops at
`[vite:wasm-fallback] "ESM integration proposal for Wasm" is not supported`.
`optimizeDeps.exclude` covers the other half of the same problem in development,
where pre-bundling rewrites the paths the kernel looks for.

**The FreeCAD icons** ship as files with `@hestia/ui-cad` and are served under
`/freecad-icons` by a small plugin in `vite.config.ts` — in development straight
from the package, in the build copied next to the rest. Without them the
toolbars still work: they fall back to MUI icons.

## The drive

A `Drive` from `@hestia/ui-core` sits **under every subpage**, in a panel that
the "Drive" switch in the top bar opens and shuts, and that is dragged taller or
shorter by its top edge. It starts shut: the page is what one comes here for.

It lives in the shell rather than in each subpage, so the folder it is showing
survives switching between Notes, Cad2d and Cad3d — one drive, not three. While
the panel is shut the component is unmounted, because an unseen drive that keeps
listing folders costs requests nobody asked for.

`driveStore.ts` points it at the platform's files (the whole of the user's
space, not just `cad/` — a drive that shows one directory is a file picker).
Images and PDFs are listed but not drawn: the platform's VFS hands out text, so
the panel says so rather than showing a broken picture.

## Two servers

The page talks to its own server (`app/cad`) at `/api/*`, and reaches the
platform through `/platform/*`, which that server forwards. In development the
Vite proxy sends both to `app/cad`; once built there is no proxy, because that
server serves the page as well.

## The dark theme

Deliberate, and explained in `main.tsx`: the pages came from `cad-app`, where
the whole application is dark, and they have colours written into them directly.
On a light background half of each toolbar becomes invisible while still
working. The 3D modeller is the exception and handles itself — its panels wrap
in a light theme, because its viewport is built for one.
