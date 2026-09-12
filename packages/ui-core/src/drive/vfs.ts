/**
 * The file operations the ported Drive page performs, as one contract.
 *
 * MyCastle's Drive page talked to its backend through a handful of helpers —
 * `vfsListDir`, `vfsMkdir`, `vfsDelete`, `vfsRename`, `vfsWriteFile`,
 * `vfsCopy`, `vfsStat` and a `readFile` fetch it wrote out at each site. Those
 * helpers built URLs of the shape `/api/users/{user}/vfs/{op}` and read a token
 * out of `localStorage`, which tied the page to one server and one layout on
 * disk.
 *
 * The names and the shapes are kept exactly, because the page calls them in
 * forty-five places and a port that rewrites forty-five call sites is a port
 * that introduces forty-five chances to be wrong. What changed is that they
 * arrive from the host instead of being hard-coded: `userName` is gone from the
 * signatures (the host knows whose files these are) and the transport is the
 * host's business.
 *
 * Paths are relative to the root the host chose, `/` between segments, no
 * leading slash — the same convention `DriveStore` uses.
 */

/** What a directory listing returns. `FILE` and `DIRECTORY` keep MyCastle's numbering. */
export const FILE_TYPE = 1;
export const DIR_TYPE = 2;

export interface VfsEntry {
    name: string;
    type: typeof FILE_TYPE | typeof DIR_TYPE;
    size?: number;
    mtime?: number;
}

/**
 * Everything the page does to files.
 *
 * Only `list`, `readFile` and `writeFile` are required. The rest are optional
 * in the same sense they are in `DriveStore`: **an operation the host cannot
 * perform gets no button**, rather than a button that ends in an error.
 */
export interface DriveVfs {
    list(path: string): Promise<VfsEntry[]>;
    /** A file's bytes. Text is decoded by the caller — an image or a PDF is not text. */
    readFile(path: string): Promise<Uint8Array>;
    /**
     * Writes a file. `onProgress` is called as the bytes go up, for the upload
     * dialog's per-file bar; a host that cannot report progress simply never
     * calls it, and the bar stays at nothing until the write finishes.
     */
    writeFile(path: string, data: Uint8Array, onProgress?: (pct: number) => void): Promise<void>;
    mkdir?(path: string): Promise<void>;
    /** `recursive` deletes a directory with what is in it. */
    delete?(path: string, recursive: boolean): Promise<void>;
    rename?(from: string, to: string): Promise<void>;
    copy?(from: string, to: string): Promise<void>;
    /** `null` when there is nothing there — the page uses this to avoid overwriting. */
    stat?(path: string): Promise<{ type: number } | null>;
    /**
     * A public address for a file, when the host serves one. MyCastle published
     * anything under `public/` at a URL with no auth; whether that is true here
     * is the host's business, and `null` means the page offers no such link.
     */
    publicUrl?(path: string): string | null;
    /** An address to open a file at in a new tab (with auth, if the host needs it). */
    downloadUrl?(path: string): string | null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

/** Text out of what `readFile` returned. */
export function asText(data: Uint8Array): string {
    return decoder.decode(data);
}

/** Bytes for `writeFile`, from text. */
export function fromText(text: string): Uint8Array {
    return encoder.encode(text);
}

/**
 * Reads a file as text; `null` when it is not there.
 *
 * The page reads small JSON files all over the place (favourites, per-file
 * properties, the view settings) and each site handled "missing" itself. One
 * function, so a missing file means the same thing everywhere.
 */
export async function readTextOrNull(vfs: DriveVfs, path: string): Promise<string | null> {
    try {
        return asText(await vfs.readFile(path));
    } catch {
        return null;
    }
}

/** Reads and parses a JSON file; the fallback when it is missing **or** unreadable. */
export async function readJson<T>(vfs: DriveVfs, path: string, fallback: T): Promise<T> {
    const text = await readTextOrNull(vfs, path);
    if (text === null) return fallback;
    try {
        return JSON.parse(text) as T;
    } catch {
        // A JSON file somebody edited by hand should not take the page down with
        // it; the caller gets the default and the file stays as it is.
        return fallback;
    }
}

/** Directories first, then by name — the order MyCastle's listing used. */
export function sortVfsEntries(entries: VfsEntry[]): VfsEntry[] {
    return [...entries].sort((a, b) => (
        a.type !== b.type ? (a.type === DIR_TYPE ? -1 : 1) : a.name.localeCompare(b.name)
    ));
}

/**
 * A name that does not exist yet in `taken`, by adding ` (copy)`, ` (copy 2)`…
 * before the extension. Pasting into the folder something was copied from has to
 * land somewhere, and silently overwriting is the one thing it must not do.
 */
export function freeName(name: string, taken: Set<string>): string {
    if (!taken.has(name)) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; ; i++) {
        const candidate = `${stem} (copy${i > 1 ? ` ${i}` : ''})${ext}`;
        if (!taken.has(candidate)) return candidate;
    }
}
