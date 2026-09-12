# `@hestia/viewers`

PDF and DjVu, moved over from MyCastle's Drive page
(`app/mycastle-web/src/pages/drive/{PdfView,DjvuView}.tsx`). The rendering, the
region mode (pan and zoom inside a block) and the navigation bar are as they
were.

A package of its own for one reason: `pdfjs-dist` and `djvujs-dist` carry
several megabytes of decoder between them, and a page that lists files must not
pay for that to show a folder. Whoever wants them imports this; whoever does
not, does not.

## The file arrives as bytes

In MyCastle both viewers fetched from that backend's REST VFS, with a token read
out of `localStorage` — which tied a viewer to one server. Here the caller reads
the file and hands the bytes over:

```tsx
<PdfViewContent fileKey={path} read={() => store.readBytes(path)} page={1} showNavigation />
```

`fileKey` is what makes two requests the same file; the loaded document is
cached under it and shared between every view of it. The viewer does not know
what a path means, so the same component serves a drive, a dashboard, or a file
dropped onto the page.

## In a drive

`driveViewers()` is the `DriveViewers` capability that `@hestia/ui-core`
describes:

```tsx
import { driveViewers } from '@hestia/viewers';

<Drive store={store} viewers={driveViewers({ readBytes })} />
```

The implementation lives here rather than in `ui-core`, which is the whole point
of the seam: the drive package never mentions `pdfjs-dist`. A host that wants
PDFs imports this one function; a host that does not passes `null` and the drive
offers nothing it cannot do.

`readBytes` is given separately from the drive's own store because that store
hands out text — and a PDF read as text is a PDF destroyed.

## Status

- ✅ Typechecks. Nothing is tested: what these do is draw a decoded page onto a
  canvas, and asserting on that would pin the decoder's version rather than this
  code.
- 🚧 DjVu decodes on the main thread (djvu.js has no worker here), so a large
  scan stops the page for as long as a page takes to decode.
