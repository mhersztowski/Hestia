/**
 * `@hestia/ui-cad` — the CAD pages moved over from `cad-app` in MyCastle.
 *
 * Three areas, one directory each, and an entry each:
 *
 * | Import | Area | What it is |
 * | ------ | ---- | ---------- |
 * | `@hestia/ui-cad`       | `notes/`, `pen/` | Handwritten notes — pen, marker, shapes, pages |
 * | `@hestia/ui-cad/cad2d` | `cad2d/`         | The CAD drawing and the engine under it |
 * | `@hestia/ui-cad/cad3d` | `cad3d/`         | The parametric modeller, over OpenCascade |
 *
 * **This file exports the notes only.** Not an oversight: everything reachable
 * from `cad3d` pulls in OpenCascade, a WASM kernel of several megabytes, and a
 * page that wants notes must not carry it. One package because the three belong
 * to one another — a sketch in the modeller *is* a 2D drawing, on the same
 * `Project` — and three entries so that belonging costs nothing at the door.
 *
 * The package is self-contained: apart from React and MUI (peers, because the
 * host has them anyway) it depends on nothing in Hestia. File access is
 * described by `NoteStore`, which the embedding application supplies.
 */

export { SpenNotesView } from './notes/SpenNotesView';
export type { SpenNotesViewProps, FileOps, FileMenuItem } from './notes/SpenNotesView';

export { FileBrowser } from './notes/FileBrowser';
export type { FileBrowserProps } from './notes/FileBrowser';

export {
    NOTE_EXTENSION, parentDir, sanitiseName, pathIn,
} from './notes/store';
export type { NoteStore, DirEntry } from './notes/store';

export { defaultInkFor, isLightColor, needsInkSwitch } from './notes/notesInk';
export { renderMarkdown } from './notes/markdown';
export {
    exportCanvasPdf, exportCanvasPng, exportCanvasSvg,
} from './notes/exportGraphics';

// The Onyx Boox pen — away from those readers the bridge reports itself as
// unavailable and the page handles the pen like any other browser.
export { useBooxPen } from './pen/useBooxPen';
export type { BooxPenStatus, UseBooxPenOptions } from './pen/useBooxPen';
export { describeHost, isBooxPenAvailable } from './pen/booxPen';
export type { CanvasPenPoint, PenHostState } from './pen/booxPen';
