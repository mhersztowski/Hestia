# The Drive page, mid-port

`DrivePage.tsx` here is MyCastle's
`app/mycastle-web/src/pages/drive/DrivePage.tsx` part-way through being moved
into this package. It is **outside `src/`** on purpose: it does not compile yet,
and a file that does not compile inside `src/` would take the package's
`typecheck` and `build` down with it.

## Done

- The 30 imports that stay behind are gone: react-router, MyCastle's auth, MQTT
  and layout modules, TipTap, JSZip, Monaco, the texteditor package.
- **The VFS layer is swapped.** MyCastle's helpers built
  `/api/users/{user}/vfs/{op}` URLs and read a token out of `localStorage`;
  they now call the `DriveVfs` the host supplies (`src/drive/vfs.ts`), with the
  same names and shapes, because the page calls them in forty-odd places.
- **The page takes props.** `vfs`, `startDir`, and the three capabilities —
  `editor`, `assistant`, `viewers` — each optional, each `null` meaning the page
  does not offer that at all. It read a router parameter and an auth context
  before; now it is told everything it cannot know.
- Cut, each because it is a package of its own here or does not exist in Hestia:
  the embedded Monaco workspace with its plugins, the in-browser script runner,
  the scene and Qt panels (→ `@hestia/ui-texteditor`, through `DriveEditor`); the
  AI agent (→ `@hestia/ui-ai`, through `DriveAssistant`); the MJD editor and the
  JSON-schema form editor.
- The syntax is sound again — the file parses.
- **Download and public links go through the host.** `vfs.downloadUrl` is an
  address to navigate to (MyCastle put the token in the query string, because an
  Android WebView carries no Authorization header through a navigation); without
  one the page reads the bytes and hands the browser a blob. `vfs.publicUrl`
  decides what is public, because the host is what serves it.
- Favourites, the per-file properties and the view settings read and write
  through the façade instead of MyCastle's per-user JSON helpers.
- Cut as well: the render branches of every removed editor, the AI agent panel,
  the in-browser script runner's toolbar, the router deep-link, and the
  server-side script and log endpoints, which were MyCastle's own.
- Cut further: restarting a script and reloading the cron schedule (MyCastle's
  own endpoints — the page writes the schedule file and a host that acts on it
  watches the file), the embedded workspace element and the account menu, which
  is the host application's chrome.
- The drive-wide text search was kept and rewired: it walks the `DriveVfs` like
  everything else, and its result types (which lived in a file beside the page)
  came along.
- **The PDF/DjVu preview now goes through the `viewers` capability.** It drew
  the viewer components directly before; `@hestia/viewers` supplies them, and a
  host that passes none gets "no viewer for this kind of file" rather than a
  blank panel.
- The Markdown editor's handlers are cut — it is not part of this package.
- **One way into an editor.** MyCastle had a handler per editor — Markdown, MJD,
  JSON schema, dashboard, Qt — each with its own state and its own panel. There
  is one `openInEditor` now, and whether a given file opens is the editor's own
  answer (`canEdit`). With no editor passed it does nothing, and the entries
  that call it are not drawn.
- The JSON-schema binding dialog went with the schema editor.
- **The writes take bytes**, the way `DriveVfs` describes them — the base64
  dance was MyCastle's REST contract, not the page's business.
- **The capabilities get a `DriveStore` built from the `DriveVfs`.** The page
  keeps MyCastle's operations as they were; an editor, an assistant or a viewer
  is handed the smaller contract `core-ui` describes. One object derived from
  the other, rather than two for the host to supply and keep in step.
- The drive-wide search dialog walks the `vfs` like the walker it calls.
- **One panel state.** MyCastle kept eight — `repoViewing`, `dashEditing`,
  `jsonFormEditing`, `mdEditing`, `mjdEditing`, `globalEditing`, `qtuiEditing`,
  `schemaDialog` — with a `resetPanels` that had to clear all of them or two
  panels would show side by side. There are two now: what is being previewed,
  and what is open in the host's editor.
- Cut as well: the MJD and Qt providers, zipping and unzipping folders in the
  browser (JSZip is a dependency a file list should not carry), the Markdown
  bundle import and export, following a Markdown link, the console stream, the
  npm install and the daily journal — MyCastle's own endpoints, every one.
- **One dispatcher when a file is opened**, in both places the page had one.
  MyCastle branched on the extension — `.myschema.json` → the schema editor,
  `.mjd` → MJD, `.md` → Markdown, `.dash.json` → the dashboard, `.repo.json` →
  the git panel, `.qtui.json` → the Qt designer, otherwise Monaco — each opening
  a panel of its own. The editor answers for itself now (`canEdit`), and
  whatever it will not take is previewed.
- Cut with them: the daily journal, the log stream, zipping a folder in the
  browser, the Markdown link handler, and the absolute-path helper the old
  editors needed (`/data/Minis/Users/{u}/…`), which has no meaning here — the
  host's VFS decides where the root is.
- The search dialog and the schema picker, both separate components in MyCastle
  and neither of them ported.

### A note on how these cuts are made

One pass deleted JSX by counting braces from the first `{` on a line — which on
`<IconButton onClick={…}>` is the attribute, not the element. That left seven
elements without their opening tag and the file would not parse. The repair was
mechanical (drop the orphaned children and the closing tag), but the lesson is
in the method: a JSX element is cut from its `<` to its matching `</`, never
from a brace.
- 4774 lines → about 3780.

## Left

41 compiler errors (plus the declarations the cuts left unused), all of them in render branches of the editors that are gone.

| what | how many | what it means |
| ---- | -------- | ------------- |
| `mdView`, `setMdSetting`, `mdSettingsAnchor` | 12 | the Markdown editor's settings menu, in the render |
| `triggerMdImport`, `exportZip`, `userName` | 6 | menu entries pointing at what is gone |
| the rest | ~23 | one render branch each |

After that: route the PDF/DjVu preview through `DriveViewers` (the
implementation is ready in `@hestia/viewers`), and translate the interface text,
which is Polish, as everywhere else in this repository.
