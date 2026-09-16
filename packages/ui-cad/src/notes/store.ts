/**
 * The note store — the package's only door to the world of files.
 *
 * The notes page comes from `cad-app`, where it talked directly to the
 * cad-backend REST VFS (`/api/vfs/...`, contents in base64, `stat`/`mkdir`/
 * `rename`). That contract does not exist here and should not: Hestia's
 * platform exposes a VFS of a different shape (contents verbatim, no `stat`, no
 * `rename`), and the package has to be embeddable where there is no backend at
 * all — notes kept in `localStorage`, or in a test's memory, are just as good a
 * store.
 *
 * So the package **describes** what it needs and the host supplies the
 * implementation. The required operations are `list`/`read`/`write` — without
 * them the file dialog has nothing to show. The rest are optional and the file
 * browser **hides** the buttons a store cannot serve: a button that always ends
 * in an error is worse than no button, because it promises it will work.
 *
 * Paths are complete (`projects/meetings/tuesday.notes.json`) and always
 * relative to the store's root. The extension is added by the page
 * (`NOTE_EXTENSION`), because it is the page that decides what its own file
 * looks like.
 */

/** The note file extension. Shared with `cad-app`, so files can be moved across. */
export const NOTE_EXTENSION = '.notes.json';

/** A directory entry as the file dialog shows it. */
export interface DirEntry {
  /** The entry's name including the extension, without the path. */
  name: string;
  directory: boolean;
  /**
   * Modification time in milliseconds. `0` means "the store does not report
   * it" — the list then shows a dash and sorts alphabetically. Hestia's
   * platform returns a tree of names only, and forcing an extra `stat` per
   * file on it would be a hundred requests to fill in one column.
   */
  modified?: number;
  /** Size in bytes; omitted when the store does not know it. */
  size?: number;
}

/**
 * The store contract. A host implements as much as its backend can do.
 *
 * Every method may throw — the file dialog catches the exception and shows its
 * message, so the message of a throw lands in front of the user.
 */
export interface NoteStore {
  /** The directory the file dialog opens in (e.g. `projects`). */
  startDir: string;
  /**
   * The root — the dialog will not go above it. Empty means "the top of the
   * store". Separate from `startDir`, because it is convenient to start in a
   * subdirectory while still being able to step into its siblings.
   */
  rootDir?: string;

  /** Contents of a directory. A missing directory is an empty list, not an error — the host may only create it on write. */
  list(dir: string): Promise<DirEntry[]>;
  /** Contents of a text file. */
  read(path: string): Promise<string>;
  /** Writes a file; overwrites an existing one and creates missing directories along the way. */
  write(path: string, content: string): Promise<void>;

  /** Deleting a file. Absent = the browser shows no bin. */
  remove?(path: string): Promise<void>;
  /** Renaming a file. Absent = the browser shows no pencil. */
  rename?(from: string, to: string): Promise<void>;
  /**
   * Creating an empty directory. Absent = the browser shows no "new folder".
   * A store where directories come into being only when a file is written
   * (which is how Hestia's platform works) does not have this method, and
   * that is correct — an empty directory would have nowhere to exist.
   */
  createDir?(path: string): Promise<void>;

  /**
   * A viewer address for a saved note — `null` when there is no viewer for
   * that file. No method at all = the host has no viewer mode and the page
   * does not mention one.
   */
  viewerUrl?(path: string): string | null;
  /**
   * Called after a file is opened successfully. The host may, for example,
   * put the path into the browser's address bar, so the note can be refreshed
   * or sent as a link.
   */
  onOpened?(path: string): void;
}

/** Joining a directory and a name into a store path (with no double slashes). */
export function pathIn(dir: string, name: string): string {
  const d = dir.replace(/^\/+|\/+$/g, '');
  return d ? `${d}/${name}` : name;
}

/** The parent directory, or `null` when we are at `root`. */
export function parentDir(dir: string, root: string): string | null {
  const d = dir.replace(/^\/+|\/+$/g, '');
  const r = root.replace(/^\/+|\/+$/g, '');
  if (d === r) return null;
  const i = d.lastIndexOf('/');
  const above = i < 0 ? '' : d.slice(0, i);
  // We do not descend below the root even when the path looks shorter.
  return above.startsWith(r) || r === '' ? above : null;
}

/** Characters we do not want in a file name, whatever the backend would tolerate. */
export function sanitiseName(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'untitled';
}
