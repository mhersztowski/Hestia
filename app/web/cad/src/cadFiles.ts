/**
 * Where the drawings and the models are kept.
 *
 * Both pages keep their work in the user's files on the platform, next to the
 * notes: `cad/drawings/*.cad.json` for the 2D drawing, `cad/models/*.model.json`
 * for the feature tree. The contents are what the packages themselves produce —
 * a `ProjectData` for the drawing, the tree JSON from `Cad3dApi.getTreeJson()`
 * for the model — so nothing here interprets them.
 *
 * Two directories rather than one, because the two files are not
 * interchangeable: opening a drawing as a model gives an empty tree and no
 * explanation. The extension says the same thing twice on purpose — the platform
 * has no notion of a file type, and the directory alone would not survive
 * somebody moving a file.
 */

import { platform, PlatformError } from './platform';

export const DRAWINGS_DIR = 'cad/drawings';
export const MODELS_DIR = 'cad/models';

export const DRAWING_EXTENSION = '.cad.json';
export const MODEL_EXTENSION = '.model.json';

export type CadKind = 'drawing' | 'model';

export function dirFor(kind: CadKind): string {
    return kind === 'drawing' ? DRAWINGS_DIR : MODELS_DIR;
}

export function extensionFor(kind: CadKind): string {
    return kind === 'drawing' ? DRAWING_EXTENSION : MODEL_EXTENSION;
}

/**
 * A file name from a name typed by a person: slashes flattened, the extension
 * added once. `drawing.cad.json` and `drawing` give the same result, and so does
 * `drawing.json` — a stray `.json` is dropped rather than doubled.
 */
export function fileNameFor(kind: CadKind, raw: string): string {
    const extension = extensionFor(kind);
    let name = raw.trim().replace(/[\\/]+/g, '-');
    if (!name) name = kind;
    if (name.toLowerCase().endsWith(extension)) return name;
    return name.replace(/\.json$/i, '').replace(/\.(cad|model)$/i, '') + extension;
}

/** The name shown to the user: the file name without the extension. */
export function displayName(kind: CadKind, file: string): string {
    const extension = extensionFor(kind);
    return file.toLowerCase().endsWith(extension) ? file.slice(0, -extension.length) : file;
}

/** The files of one kind, sorted by name. A directory that does not exist yet is empty, not an error. */
export async function listFiles(kind: CadKind): Promise<string[]> {
    const extension = extensionFor(kind);
    let entries;
    try {
        entries = await platform.dir(dirFor(kind));
    } catch (e) {
        // Before the first save the directory is not there, and that is a normal
        // state. An expired token is not: shown as an empty list it would look
        // like "you have nothing saved", when everything is there.
        if (e instanceof PlatformError && (e.status === 401 || e.status === 403)) throw e;
        return [];
    }
    return entries
        .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith(extension))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
}

export function readFile(kind: CadKind, file: string): Promise<string> {
    return platform.read(`${dirFor(kind)}/${file}`);
}

export function writeFile(kind: CadKind, file: string, content: string): Promise<void> {
    return platform.write(`${dirFor(kind)}/${file}`, content);
}

export function removeFile(kind: CadKind, file: string): Promise<void> {
    return platform.remove(`${dirFor(kind)}/${file}`);
}
