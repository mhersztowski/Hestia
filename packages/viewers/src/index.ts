/**
 * `@hestia/viewers` — file formats a browser will not show on its own.
 *
 * PDF (`pdfjs-dist`) and DjVu (`djvujs-dist`), moved over from MyCastle's Drive
 * page. A package of their own for one reason: both carry several megabytes of
 * decoder, and a page that lists files must not pay for that to show a folder.
 * Whoever wants them imports this; whoever does not, does not.
 *
 * Both take the file as **bytes**, through a `read()` the caller supplies. In
 * MyCastle they fetched from that backend's REST VFS with a token out of
 * `localStorage`, which tied a viewer to one server; this way the same
 * component serves a drive, a dashboard, or a file dropped onto the page.
 */

export { PdfViewContent, loadPdfDocument, invalidatePdfCache, usePdfNumPages } from './PdfView';
export type { DocView as PdfDocView, FileBytes } from './PdfView';

export {
  DjvuViewContent,
  loadDjvuDocument,
  invalidateDjvuCache,
  useDjvuNumPages,
} from './DjvuView';
export type { DocView as DjvuDocView } from './DjvuView';

export { driveViewers, VIEWER_EXTENSIONS } from './driveViewers';
