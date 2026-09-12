# `drive-web` (`app/web/drive`)

The Drive page: browsing the platform's files, and working on them in place.

Four packages meet here and none of them knows about the others:

| package | what it gives |
|---|---|
| `@hestia/ui-core` | the drive — the file list and the preview |
| `@hestia/ui-markdown-editor` | the editor for `.md` |
| `@hestia/ui-texteditor` | the Monaco editor for everything else |
| `@hestia/ui-ai` | the assistant |

What joins them is `src/capabilities.tsx`, and it is written in the shapes
`@hestia/ui-core` defines — `DriveEditor`, `DriveAssistant`, `DriveViewers`.
That is deliberate: `DrivePage` in that package takes exactly these, and when it
is finished this file is wired in unchanged instead of written again. Until
then `App.tsx` drives the same capabilities around the simpler `Drive`
component.

Every slot is optional and every absence is silent. No assistant means no
assistant button — not a button that opens an empty drawer.

## What the page has to set up itself

**Monaco's workers.** `@hestia/ui-texteditor` says plainly that the host
configures them; `main.tsx` does it with Vite's `?worker` imports. Without it
the editor loads and its language services never start — no completion, no
diagnostics, and nothing on screen that says why.

**One copy of the shared libraries.** `vite.config.ts` dedupes React, MUI,
Emotion, `monaco-editor` and TipTap. The packages declare them as peers, and two
copies of any of them break in the same quiet way: a second React breaks hooks,
a second Monaco registers a second set of languages and workers, two copies of
ProseMirror's schema do not recognise each other's nodes.

**A `FileSystemProvider`.** The code editor and the assistant's tools want one
rather than a `DriveStore`, so `src/fsProvider.ts` builds it over the same
platform endpoints. `RemoteFS` in `@hestia/core` is the same idea against a
different endpoint layout; this speaks the one the platform actually answers.

## Not there yet

- **Viewers.** The platform's VFS hands out text, so there are no bytes to give
  `@hestia/viewers`. The slot is in place and reads `null`; the day the store
  grows `readBytes` this is one line.
- **The web-fetch proxy.** The assistant is pointed at `/api/web-fetch` on this
  application's server, which does not implement it yet. Until it does, the
  agent does not reach the web and says so.
